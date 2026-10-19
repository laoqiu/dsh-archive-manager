import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from '../lib/index.js'

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-archive-test-'))
  const effects = []
  t.after(async () => {
    for (const dispose of effects.toReversed()) await dispose()
    await rm(root, { recursive: true, force: true })
  })
  const directory = join(root, 'project', 'session-archived')
  await mkdir(directory, { recursive: true })
  for (const name of ['session.v3.jsonl', 'session.v4.jsonl.zstd', 'session.lock']) await writeFile(join(directory, name), name)
  const routes = new Map(), events = [], logs = []
  const archived = new Set(['session-archived'])
  const members = new Set(archived)
  let released = 0
  const persistence = {
    config: { root },
    async findLog() {
      try { await access(join(directory, 'session.v4.jsonl.zstd')) }
      catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
      return { sourcePath: join(directory, 'session.v4.jsonl.zstd'), currentPath: join(directory, 'session.v4.jsonl.zstd') }
    },
    async acquireLease() { return { async release() { released++ } } },
    ...overrides.persistence,
  }
  const workspace = { async detachSession(id) { members.delete(id) } }
  const registry = {
    get archivedSessionIds() { return [...archived] },
    async unarchiveSession(id) { archived.delete(id) },
    async enqueueOperation(operation) { return operation() },
    list: () => [workspace],
  }
  const agents = { get: () => undefined, create: () => {}, resume: () => {}, ...overrides.agents }
  const ctx = {
    workspaceRegistry: registry, sessionPersistence: persistence, agents,
    sessions: { get: () => undefined, ...overrides.sessions },
    logger: { warn: (...args) => logs.push(args) }, emit: (...args) => events.push(args),
    effect(register) { effects.push(register()) },
    connection: { fetch: { register(route) { routes.set(route.path, route); return () => { routes.delete(route.path) } } } },
  }
  const create = agents.create, resume = agents.resume
  apply(ctx)
  assert.equal(agents.create, create)
  assert.equal(agents.resume, resume)
  async function call(method, sessionId = 'session-archived') {
    const response = await routes.get(`/api/archive-manager/${method}`).fetch(new Request(`http://localhost/api/archive-manager/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'archive-test', method: `archive-manager/${method}`, payload: { sessionId } }),
    }))
    assert.equal(response.status, 200)
    return (await response.json()).result.value
  }
  return { root, directory, call, archived, members, registry, persistence, workspace, effects, routes, events, logs, get released() { return released } }
}

test('restore delegates to the registry and keeps the persisted generations and workspace position', async t => {
  const f = await fixture(t)
  assert.deepEqual(await f.call('unarchive'), { ok: true })
  assert.equal(f.archived.size, 0)
  assert.equal(f.members.size, 1)
  assert.equal(await readFile(join(f.directory, 'session.v4.jsonl.zstd'), 'utf8'), 'session.v4.jsonl.zstd')
})

test('cold deletion removes every stored generation before clearing archive accounting', async t => {
  const f = await fixture(t)
  assert.deepEqual(await f.call('delete'), { ok: true })
  await assert.rejects(access(join(f.directory, 'session.v3.jsonl')))
  await assert.rejects(access(join(f.directory, 'session.v4.jsonl.zstd')))
  await access(join(f.directory, 'session.lock'))
  assert.equal(f.released, 1)
  assert.equal(f.archived.size, 0)
  assert.equal(f.members.size, 0)
  assert.deepEqual(f.events, [['api-session/removed', 'session-archived']])
})

for (const service of ['agents', 'sessions']) {
  test(`a live ${service} entry prevents deletion without changing its owner`, async t => {
    const f = await fixture(t, { [service]: { get: () => ({ id: 'session-archived' }) } })
    assert.deepEqual(await f.call('delete'), { ok: false, code: 'still-live' })
    await access(join(f.directory, 'session.v4.jsonl.zstd'))
    assert.equal(f.archived.size, 1)
    assert.equal(f.released, 0)
  })
}

test('a writer in another process prevents physical deletion', async t => {
  const f = await fixture(t, { persistence: { async acquireLease() { const error = new Error('held'); error.name = 'SessionAlreadyOwnedError'; throw error } } })
  assert.deepEqual(await f.call('delete'), { ok: false, code: 'still-live' })
  await access(join(f.directory, 'session.v4.jsonl.zstd'))
  assert.equal(f.archived.size, 1)
})

test('requests cannot delete a session outside the archive set', async t => {
  const f = await fixture(t)
  assert.deepEqual(await f.call('delete', 'session-normal'), { ok: false, code: 'not-archived' })
  assert.deepEqual(await f.call('delete', ''), { ok: false, code: 'bad-session-id' })
  await access(join(f.directory, 'session.v4.jsonl.zstd'))
})

test('an old backend path response is refused instead of being treated as a missing log', async t => {
  const f = await fixture(t, { persistence: { async findLog() { return 'old/path/session.jsonl' } } })
  assert.deepEqual(await f.call('delete'), { ok: false, code: 'persistence-unavailable' })
  assert.equal(f.archived.size, 1)
  await access(join(f.directory, 'session.v4.jsonl.zstd'))
})

test('a path outside the configured session root is refused', async t => {
  const f = await fixture(t)
  f.persistence.config.root = f.directory
  assert.deepEqual(await f.call('delete'), { ok: false, code: 'persistence-unavailable' })
  await access(join(f.directory, 'session.v4.jsonl.zstd'))
})

test('unexpected nested data prevents partial deletion', async t => {
  const f = await fixture(t)
  await mkdir(join(f.directory, 'unexpected-directory'))
  assert.deepEqual(await f.call('delete'), { ok: false, code: 'persistence-unavailable' })
  await access(join(f.directory, 'session.v4.jsonl.zstd'))
  assert.equal(f.released, 1)
})

test('failed metadata cleanup keeps the archive marker and a retry finishes cleanup', async t => {
  const f = await fixture(t)
  const detach = f.workspace.detachSession
  f.workspace.detachSession = async () => { throw new Error('disk full') }
  assert.deepEqual(await f.call('delete'), { ok: false, code: 'finalize-failed' })
  assert.equal(f.archived.size, 1)
  f.workspace.detachSession = detach
  assert.deepEqual(await f.call('delete'), { ok: true })
  assert.equal(f.archived.size, 0)
})

test('unload drains a deletion and restore cannot overlap it', async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  t.after(() => release.resolve())
  const f = await fixture(t, { persistence: { async acquireLease() { entered.resolve(); await release.promise; return { async release() {} } } } })
  const deletion = f.call('delete')
  await entered.promise
  assert.deepEqual(await f.call('unarchive'), { ok: false, code: 'delete-pending' })
  const dispose = f.effects.at(-1)
  let stopped = false
  const stopping = dispose().then(() => { stopped = true })
  await Promise.resolve()
  assert.equal(stopped, false)
  assert.deepEqual(await f.call('delete'), { ok: false, code: 'unloading' })
  release.resolve()
  assert.deepEqual(await deletion, { ok: true })
  await stopping
})

test('malformed wire requests are rejected before archive operations', async t => {
  const f = await fixture(t)
  const fetch = f.routes.get('/api/archive-manager/delete').fetch
  assert.equal((await fetch(new Request('http://localhost', { method: 'POST', body: '{}' }))).status, 415)
  for (const body of ['{', '{}', JSON.stringify({ type: 'client-request', rpcId: 'x', method: 'wrong', payload: {} })]) {
    assert.equal((await fetch(new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }))).status, 400)
  }
  await access(join(f.directory, 'session.v4.jsonl.zstd'))
})
