/** Archive operations for DSH 0.2.1-rc.2 and its JSONL persistence backend. */
import { lstat, readdir, realpath, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export const name = 'archive-manager'
export const inject = ['connection', 'agents', 'sessionPersistence', 'workspaceRegistry', 'sessions']

class ArchiveError extends Error {
  constructor(code, options) {
    super(code, options)
    this.code = code
  }
}

/** Register authenticated routes; deletion completes before its response and unload drains admitted operations. */
export function apply(ctx) {
  const registry = ctx.workspaceRegistry
  const persistence = ctx.sessionPersistence
  const pending = new Map()
  const active = new Set()
  let closing = false

  function requireArchived(id) {
    if (typeof id !== 'string' || id.length === 0) throw new ArchiveError('bad-session-id')
    if (!registry.archivedSessionIds.includes(id)) throw new ArchiveError('not-archived')
  }

  function requireCold(id) {
    if (ctx.agents.get(id) !== undefined || ctx.sessions.get(id) !== undefined) {
      throw new ArchiveError('still-live')
    }
  }

  async function removeLog(id) {
    // These two JSONL implementation methods are version-specific; the peer range is exact.
    if (typeof persistence.findLog !== 'function' || typeof persistence.acquireLease !== 'function'
      || typeof persistence.config?.root !== 'string') throw new ArchiveError('persistence-unavailable')
    const selected = await persistence.findLog(id)
    if (selected === undefined) return
    if (typeof selected.sourcePath !== 'string' || typeof selected.currentPath !== 'string') {
      throw new ArchiveError('persistence-unavailable')
    }
    const root = await realpath(resolve(persistence.config.root))
    const directory = resolve(dirname(selected.sourcePath))
    const local = relative(root, await realpath(directory))
    if (isAbsolute(local) || local.startsWith('..') || local.split(sep).length !== 2
      || dirname(selected.currentPath) !== directory || (await lstat(directory)).isSymbolicLink()) {
      throw new ArchiveError('persistence-unavailable')
    }
    // The backend's kernel lease also refuses a writer in another DSH process.
    let lease
    try { lease = await persistence.acquireLease(id, undefined, directory) }
    catch (cause) {
      if (cause instanceof Error && cause.name === 'SessionAlreadyOwnedError') throw new ArchiveError('still-live', { cause })
      throw cause
    }
    try {
      requireArchived(id)
      requireCold(id)
      const entries = await readdir(directory, { withFileTypes: true })
      if (entries.some(entry => !entry.isFile() || entry.isSymbolicLink())) throw new ArchiveError('persistence-unavailable')
      // Keep the locked coordination file and its directory; remove every stored generation.
      for (const entry of entries) {
        if (entry.name === 'session.lock') continue
        const target = resolve(directory, entry.name)
        try { await unlink(target) }
        catch (cause) {
          if (cause?.code !== 'ENOENT') throw new ArchiveError('log-removal-failed', { cause })
        }
      }
    } finally {
      await lease.release()
    }
  }

  async function deleteArchived(id) {
    requireArchived(id)
    requireCold(id)
    if (typeof registry.enqueueOperation !== 'function') throw new ArchiveError('persistence-unavailable')
    // Serialize physical deletion with native archive/unarchive mutations.
    await registry.enqueueOperation(async () => {
      requireArchived(id)
      requireCold(id)
      await removeLog(id)
      try {
        for (const workspace of registry.list()) await workspace.detachSession(id)
      } catch (cause) { throw new ArchiveError('finalize-failed', { cause }) }
    })
    try { await registry.unarchiveSession(id) }
    catch (cause) { throw new ArchiveError('finalize-failed', { cause }) }
    ctx.emit('api-session/removed', id)
  }

  const operations = {
    async unarchive(id) {
      requireArchived(id)
      if (pending.has(id)) throw new ArchiveError('delete-pending')
      await registry.unarchiveSession(id)
    },
    async delete(id) {
      if (pending.has(id)) throw new ArchiveError('delete-pending')
      const task = deleteArchived(id)
      pending.set(id, task)
      try { await task } finally { pending.delete(id) }
    },
  }

  for (const method of Object.keys(operations)) {
    ctx.effect(() => ctx.connection.fetch.register({
      path: `/api/archive-manager/${method}`, methods: ['POST'], requestBody: 'buffered',
      async fetch(request) {
        if (request.headers.get('content-type')?.split(';', 1)[0]?.trim() !== 'application/json') {
          return new Response('Expected application/json', { status: 415 })
        }
        let input
        try { input = await request.json() }
        catch (error) { return new Response('Invalid JSON', { status: 400 }) }
        if (input?.type !== 'client-request' || typeof input.rpcId !== 'string' || input.method !== `archive-manager/${method}`
          || typeof input.payload !== 'object' || input.payload === null || Array.isArray(input.payload)) {
          return new Response('Invalid archive request', { status: 400 })
        }
        let value
        try {
          if (closing) throw new ArchiveError('unloading')
          const task = operations[method](input.payload.sessionId)
          active.add(task)
          try { await task } finally { active.delete(task) }
          value = { ok: true }
        } catch (error) {
          if (!(error instanceof ArchiveError)) ctx.logger.warn('Archive operation failed: %s', error)
          value = { ok: false, code: error instanceof ArchiveError ? error.code : 'unknown' }
        }
        return Response.json({ type: 'server-response', rpcId: input.rpcId, result: { ok: true, value } })
      },
    }))
  }
  ctx.effect(() => async () => {
    closing = true
    await Promise.allSettled([...active])
  })
}

export default { name, inject, apply }
