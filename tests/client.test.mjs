import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

function fixture(t, overrides = {}) {
  const entries = new Map(), effects = [], calls = [], states = []
  let plugin, cursor = 0, dictionaries, styleRemoved = false
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity).filter(value => value !== false && value != null) } }),
    useState: initial => {
      const i = cursor++
      if (!(i in states)) states[i] = initial
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }]
    },
    useRef: initial => {
      const i = cursor++
      return states[i] ??= { current: initial }
    },
    useEffect: () => {},
  }
  const primitives = new Proxy({}, { get: (_, name) => name })
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: definition => { plugin = definition.factory(name => name === 'react' ? react : primitives) } } },
    document: { createElement: () => ({ remove() { styleRemoved = true } }), head: { appendChild() {} } },
    setTimeout, clearTimeout, AbortController, Intl,
  })
  const translate = (key, args = {}) => {
    let text = dictionaries.en[key] ?? key
    for (const [name, value] of Object.entries(args)) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }
  const ctx = {
    effect: register => effects.push(register()),
    slots: {
      inject: (_, register) => register(),
      register: (options, Component) => { entries.set(options.name, { options, Component }); return () => entries.delete(options.name) },
    },
    locale: { bind: () => translate, register: (_, values) => { dictionaries = values; return () => {} }, getSnapshot: () => ({ active: 'en' }) },
    sessions: { refresh: async () => calls.push('refresh'), search: async () => ({ ok: true, value: { items: [], hasMore: false } }), ...overrides.sessions },
    uiWorkspace: { unarchiveSession: async id => calls.push(`restore:${id}`), openSession: id => calls.push(`open:${id}`), ...overrides.navigation },
    connection: { rpc: { call: async (...args) => { calls.push(args); return overrides.rpc ? overrides.rpc(...args) : { ok: true, value: { ok: true } } } } },
  }
  plugin.apply(ctx)
  const page = entries.get('settings.section')
  const actions = page.options.inject()
  const workspaces = { phase: 'ready', state: 'idle', archivedSessionIds: ['a', 'b', 'c'], items: [
    { workspaceId: 'one', title: 'Workspace One', sessionIds: ['a', 'b'] },
  ] }
  const sessions = { phase: 'ready', byId: {
    a: { title: 'First chat', updatedAt: Date.now() },
    b: { title: 'Older chat', updatedAt: Date.now() - 40 * 86400000 },
    c: { title: 'Unassigned chat', updatedAt: Date.now() - 1000 },
  } }
  const props = { ...actions, t: translate, close: () => calls.push('close'), useWorkspaces: selector => selector(workspaces),
    useSessions: selector => selector(sessions), useArchive: selector => selector(actions.hooks.archive.getSnapshot()) }
  const render = () => { cursor = 0; return page.Component(props) }
  const dispose = () => { for (const effect of effects.splice(0).toReversed()) effect?.() }
  t.after(dispose)
  return { entries, page, actions, calls, render, props, dispose, get styleRemoved() { return styleRemoved } }
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  for (const child of node.props?.children ?? []) { const match = find(child, predicate); if (match) return match }
}
const named = (tree, name) => find(tree, node => node.props['aria-label'] === name)
const labelled = (tree, text) => find(tree, node => node.type === 'Button' && node.props.children.includes(text))

test('archive entry lives in Settings and disposal removes its registrations and stylesheet', t => {
  const f = fixture(t)
  assert.deepEqual([...f.entries.keys()], ['settings.section', 'shell.overlay'])
  assert.equal(f.page.options.id, 'archived-sessions')
  assert.equal(f.page.options.label(), 'Archived')
  f.dispose()
  assert.equal(f.entries.size, 0)
  assert.equal(f.styleRemoved, true)
})

test('search and period filters limit the rows captured by bulk delete', async t => {
  const f = fixture(t)
  named(f.render(), 'Search archived chats').props.onChange({ target: { value: 'First' } })
  let tree = f.render()
  assert.equal(named(tree, 'Restore and open: Older chat'), undefined)
  labelled(tree, 'Delete filtered chats').props.onClick()
  tree = f.render()
  const modal = find(tree, node => node.type === 'Modal')
  assert.match(modal.props.description, /1 chats/)
  await modal.props.footer.props.children[1].props.onClick()
  assert.equal(f.calls.filter(Array.isArray).length, 1)
  assert.equal(f.calls[0][2].sessionId, 'a')
})

test('workspace and date filters combine without deleting hidden chats', t => {
  const f = fixture(t)
  let tree = f.render()
  find(tree, node => node.type === 'Menu' && node.props.key === 'period').props.onSelect('week')
  tree = f.render()
  find(tree, node => node.type === 'Menu' && node.props.key === 'workspace').props.onSelect('one')
  tree = f.render()
  assert.ok(named(tree, 'Restore and open: First chat'))
  assert.equal(named(tree, 'Restore and open: Older chat'), undefined)
  assert.equal(named(tree, 'Restore and open: Unassigned chat'), undefined)
})

test('batch deletion stops at the first failure and leaves remaining chats retryable', async t => {
  const f = fixture(t, { rpc: async (_, __, { sessionId }) => ({ ok: true, value: sessionId === 'b' ? { ok: false, code: 'still-live' } : { ok: true } }) })
  const result = await f.actions.remove([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  assert.equal(result.completed, 1)
  assert.deepEqual(Array.from(result.remaining, row => row.id), ['b', 'c'])
  assert.equal(f.calls.filter(Array.isArray).length, 2)
  assert.equal(f.calls.at(-1), 'refresh')
  assert.match(f.actions.hooks.archive.getSnapshot().notice.text, /Completed 1\/3.*still in use/)
})

test('a pending operation blocks duplicate mutations and reports through the shell overlay', async t => {
  let finish
  const f = fixture(t, { navigation: { unarchiveSession: () => new Promise(resolve => { finish = resolve }) } })
  const pending = f.actions.restore([{ id: 'a' }])
  const duplicate = await f.actions.remove([{ id: 'a' }])
  assert.equal(duplicate.error, 'delete-pending')
  finish()
  await pending
  const overlay = f.entries.get('shell.overlay')
  const injected = overlay.options.inject()
  const toast = overlay.Component({ ...injected, useArchive: selector => selector(injected.hooks.archive.getSnapshot()) })
  assert.equal(toast.type, 'Toast')
  assert.equal(toast.props.text, 'Unarchived 1 chats')
  toast.props.onDone()
  assert.equal(f.actions.hooks.archive.getSnapshot().notice, null)
})

test('a refresh failure reports completed deletion without suggesting deletion failed', async t => {
  const f = fixture(t, { sessions: { refresh: async () => { throw Error('offline') } } })
  const result = await f.actions.remove([{ id: 'a' }])
  assert.equal(result.completed, 1)
  assert.equal(result.error, undefined)
  assert.match(f.actions.hooks.archive.getSnapshot().notice.text, /Operation completed, but refreshing failed/)
})

test('unloading stops a batch before admitting its next mutation', async t => {
  let finish
  const f = fixture(t, { navigation: { unarchiveSession: () => new Promise(resolve => { finish = resolve }) } })
  const pending = f.actions.restore([{ id: 'a' }, { id: 'b' }])
  f.dispose()
  finish()
  const result = await pending
  assert.equal(result.completed, 1)
  assert.equal(result.error, 'unloading')
})
