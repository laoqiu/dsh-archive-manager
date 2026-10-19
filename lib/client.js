/** Settings-based archive management; business operations outlive the settings page. */
window.__ModuleLoader__.load({
  id: 'dsh-archive-manager',
  factory: require => {
    const { createElement: h, useEffect, useRef, useState } = require('react')
    const ui = require('@deepseek-ai/dsh-client-ui-primitives')
    const { Button, Input, Menu, Modal, Tooltip, Toast, StateDot } = ui
    const NS = 'archive-manager'
    const dictionaries = {
      zh: {
        nav: '已归档会话', title: '已归档会话', search: '搜索已归档的会话',
        all: '全部会话', week: '最近 7 天', month: '最近 30 天', period: '更新时间',
        workspaces: '所有工作区', workspace: '工作区', unassigned: '无工作区', untitled: '无标题会话',
        count: '{count} 个会话', restore: '取消归档', restoreGroup: '取消归档此组',
        delete: '删除', deleteAll: '全部删除', deleteFiltered: '删除筛选结果', deleteGroup: '删除此组',
        more: '{title}的操作', open: '恢复并打开：{title}', deleteRow: '删除：{title}',
        empty: '没有已归档的会话', noResults: '没有匹配的会话', reset: '清除筛选',
        loading: '正在加载归档', loadError: '无法加载会话列表，请重新打开设置',
        searchError: '消息搜索失败，当前仅显示标题和工作区匹配的结果',
        searchMore: '消息搜索结果较多，请缩小搜索范围',
        confirm: '删除已归档的会话？', description: '将永久删除 {count} 个会话及其记录，无法撤销',
        cancel: '取消', close: '关闭', deleting: '正在删除 {done}/{total}', retry: '重试剩余会话',
        restored: '已取消归档 {count} 个会话', deleted: '已删除 {count} 个会话',
        partial: '已完成 {done}/{total}。{reason}', refreshError: '操作已完成，但列表刷新失败，请重新打开设置',
        network: '连接失败，请检查连接后重试', unknown: '操作失败，请重试或查看 DSH 日志',
        'still-live': '此会话仍被使用，请重启 DSH 后在打开它之前删除',
        'not-archived': '此会话已不在归档中，请重新打开设置查看',
        'persistence-unavailable': '当前存储不支持删除，请检查 JSONL 存储配置',
        'log-removal-failed': '记录删除失败，请检查文件权限后重试',
        'finalize-failed': '记录已移除，但归档信息清理失败，请重试完成清理',
        'delete-pending': '此会话正在删除，请稍后重试', unloading: '插件正在关闭，请重新打开 DSH',
      },
      en: {
        nav: 'Archived', title: 'Archived chats', search: 'Search archived chats',
        all: 'All chats', week: 'Last 7 days', month: 'Last 30 days', period: 'Last updated',
        workspaces: 'All workspaces', workspace: 'Workspace', unassigned: 'No workspace', untitled: 'Untitled chat',
        count: '{count} chats', restore: 'Unarchive', restoreGroup: 'Unarchive this group',
        delete: 'Delete', deleteAll: 'Delete all', deleteFiltered: 'Delete filtered chats', deleteGroup: 'Delete this group',
        more: 'Actions for {title}', open: 'Restore and open: {title}', deleteRow: 'Delete: {title}',
        empty: 'No archived chats', noResults: 'No matching chats', reset: 'Clear filters',
        loading: 'Loading archived chats', loadError: 'Could not load chats. Reopen Settings to retry.',
        searchError: 'Message search failed. Showing title and workspace matches only.',
        searchMore: 'There are more message matches. Narrow your search.',
        confirm: 'Delete archived chats?', description: 'Permanently delete {count} chats and their records? This cannot be undone.',
        cancel: 'Cancel', close: 'Close', deleting: 'Deleting {done}/{total}', retry: 'Retry remaining chats',
        restored: 'Unarchived {count} chats', deleted: 'Deleted {count} chats',
        partial: 'Completed {done}/{total}. {reason}', refreshError: 'Operation completed, but refreshing failed. Reopen Settings.',
        network: 'Connection failed. Check your connection and retry.', unknown: 'Operation failed. Retry or check DSH logs.',
        'still-live': 'This chat is still in use. Restart DSH and delete it before opening it.',
        'not-archived': 'This chat is no longer archived. Reopen Settings to refresh.',
        'persistence-unavailable': 'Deletion is unavailable. Check your JSONL storage configuration.',
        'log-removal-failed': 'Could not remove records. Check file permissions and retry.',
        'finalize-failed': 'Records were removed, but archive cleanup failed. Retry to finish cleanup.',
        'delete-pending': 'This chat is being deleted. Retry shortly.', unloading: 'The plugin is closing. Reopen DSH.',
      },
    }
    const css = `
.arcv-page{container-type:inline-size;display:flex;flex-direction:column;gap:24px;max-width:760px;min-width:0;color:var(--dsw-alias-label-primary);font-size:13px}
.arcv-header,.arcv-group-header,.arcv-actions{display:flex;align-items:center;gap:8px}
.arcv-header{justify-content:space-between;flex-wrap:wrap}.arcv-header h2{margin:0;font-size:18px;font-weight:500;line-height:28px}
.arcv-danger{color:var(--dsw-alias-state-error-primary)!important}.arcv-toolbar{display:flex;gap:8px;flex-wrap:wrap}
.arcv-search{flex:1 1 220px;min-width:0}.arcv-filter{flex:1 1 130px;min-width:0}.arcv-filter>button{width:100%;justify-content:space-between}
.arcv-truncate{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.arcv-group{display:flex;flex-direction:column;gap:10px}.arcv-group-header{min-height:28px;color:var(--dsw-alias-label-secondary)}
.arcv-group-header h3{flex:1;margin:0;font-size:13px;font-weight:500}.arcv-count{flex:none;color:var(--dsw-alias-label-tertiary);font-size:12px}
.arcv-card{border:0.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill);padding:0 14px}
.arcv-row{display:flex;align-items:center;gap:12px;padding:12px 0;min-width:0}.arcv-row+.arcv-row{border-top:0.5px solid var(--dsw-alias-border-l2)}
.arcv-chat{display:flex;flex:1;flex-direction:column;align-items:flex-start;gap:4px;min-width:0}
.arcv-title{max-width:100%;text-align:left;border:0;background:transparent;padding:0;color:inherit;font:inherit;font-size:14px;cursor:pointer}
.arcv-title:hover{color:var(--dsw-alias-state-business-primary)}.arcv-title:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:3px}
.arcv-date{font-size:12px;color:var(--dsw-alias-label-tertiary)}.arcv-actions{flex:none;gap:4px}
.arcv-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-height:180px;color:var(--dsw-alias-label-secondary);text-align:center}
.arcv-notice{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}.arcv-error{color:var(--dsw-alias-state-error-primary)}
@container(max-width:480px){.arcv-search{flex-basis:100%}.arcv-filter{flex-basis:120px}.arcv-row{gap:6px}.arcv-card{padding-inline:10px}.arcv-actions{gap:0}}
`
    const icon = name => h(ui[name], { size: 16 })

    function ArchivePage(props) {
      const { t } = props
      const workspaces = props.useWorkspaces(value => value)
      const sessions = props.useSessions(value => value)
      const state = props.useArchive(value => value)
      const [query, setQuery] = useState('')
      const [period, setPeriod] = useState('all')
      const [workspaceId, setWorkspace] = useState('*')
      const [menu, setMenu] = useState(null)
      const [confirmation, setConfirmation] = useState(null)
      const [search, setSearch] = useState({ query: '', ids: [], error: false, more: false })
      const mounted = useRef(false)
      useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
      const needle = query.trim().toLocaleLowerCase()
      useEffect(() => {
        if (!needle) return
        const controller = new AbortController()
        const timer = setTimeout(async () => {
          try {
            const result = await props.search(needle, controller.signal)
            if (!controller.signal.aborted) setSearch({ query: needle,
              ids: result.ok ? result.value.items.map(item => item.sessionId) : [],
              error: !result.ok, more: result.ok && result.value.hasMore })
          } catch (error) {
            if (!controller.signal.aborted) setSearch({ query: needle, ids: [], error: true, more: false })
          }
        }, 250)
        return () => { clearTimeout(timer); controller.abort() }
      }, [needle, props.search])

      const archived = new Set(workspaces.archivedSessionIds)
      const owners = new Map()
      for (const workspace of workspaces.items) for (const id of workspace.sessionIds) {
        if (!owners.has(id)) owners.set(id, workspace.workspaceId)
      }
      const rows = [...archived].map(id => ({ id, workspaceId: owners.get(id) ?? '',
        title: sessions.byId[id]?.title?.trim() || t('untitled'), updatedAt: sessions.byId[id]?.updatedAt ?? 0 }))
      const groups = [...workspaces.items.map(workspace => ({ id: workspace.workspaceId, title: workspace.title })),
        { id: '', title: t('unassigned') }].map(group => ({ ...group, rows: rows.filter(row => row.workspaceId === group.id) }))
        .filter(group => group.rows.length)
      const effectiveWorkspace = workspaceId === '*' || groups.some(group => group.id === workspaceId) ? workspaceId : '*'
      const since = period === 'all' ? 0 : Date.now() - (period === 'week' ? 7 : 30) * 86400000
      const matches = new Set(search.query === needle ? search.ids : [])
      const visible = groups.filter(group => effectiveWorkspace === '*' || group.id === effectiveWorkspace)
        .map(group => ({ ...group, rows: group.rows.filter(row => row.updatedAt >= since && (!needle ||
          row.title.toLocaleLowerCase().includes(needle) || group.title.toLocaleLowerCase().includes(needle) || matches.has(row.id)))
          .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)) })).filter(group => group.rows.length)
      const filtered = !!needle || period !== 'all' || effectiveWorkspace !== '*'
      const visibleRows = visible.flatMap(group => group.rows)
      const date = new Intl.DateTimeFormat(props.language(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      const button = (label, onClick, options = {}) => h(Button, { size: 'sm', variant: 'ghost', disabled: state.busy, onClick, ...options }, label)
      const iconButton = (label, name, onClick, danger = false) => h(Tooltip, { label, portal: true },
        button(null, onClick, { icon: icon(name), 'aria-label': label, className: danger ? 'arcv-danger' : undefined }))
      const dropdown = (id, label, aria, items, selectedId, onSelect) => h(Menu, {
        key: id, className: 'arcv-filter', open: menu === id, portal: true, autoFocus: true, items, selectedId,
        onClose: () => setMenu(null), onSelect: value => { setMenu(null); onSelect(value) },
        anchor: h(Button, { variant: 'outline', size: 'md', disabled: state.busy,
          onClick: () => setMenu(menu === id ? null : id),
          'aria-label': aria, 'aria-haspopup': 'menu', 'aria-expanded': menu === id,
        }, h('span', { className: 'arcv-truncate' }, label), icon('IconChevronDownOutlineRegular')),
      })
      const restore = async (items, open = false) => {
        const result = await props.restore(items)
        if (open && result.completed === 1 && mounted.current) { props.close(); props.openSession(items[0].id) }
      }
      const remove = async () => {
        const result = await props.remove(confirmation.rows)
        if (!mounted.current) return
        setConfirmation(result.error ? { rows: result.remaining, error: props.failure(result.error) } : null)
      }
      const ready = workspaces.phase === 'ready' && sessions.phase === 'ready'
      return h('section', { className: 'arcv-page', 'aria-busy': state.busy },
        h('header', { className: 'arcv-header' }, h('h2', null, t('title')),
          button(t(filtered ? 'deleteFiltered' : 'deleteAll'), () => setConfirmation({ rows: visibleRows }), {
            className: 'arcv-danger', icon: icon('IconTrashOutlineRegular'), disabled: state.busy || !ready || !visibleRows.length })),
        h('div', { className: 'arcv-toolbar' },
          h(Input, { className: 'arcv-search', icon: icon('IconSearchOutlineRegular'), value: query,
            placeholder: t('search'), 'aria-label': t('search'), onChange: event => setQuery(event.target.value) }),
          dropdown('period', t(period), t('period'), ['all', 'week', 'month'].map(id => ({ id, label: t(id) })), period, setPeriod),
          dropdown('workspace', effectiveWorkspace === '*' ? t('workspaces') : groups.find(group => group.id === effectiveWorkspace)?.title,
            t('workspace'), [{ id: '*', label: t('workspaces') }, ...groups.map(group => ({ id: group.id, label: group.title }))], effectiveWorkspace, setWorkspace)),
        needle && search.query === needle && (search.error || search.more) && h('p', { className: 'arcv-notice', role: 'status' }, t(search.error ? 'searchError' : 'searchMore')),
        workspaces.state === 'error' && h('p', { className: 'arcv-notice arcv-error', role: 'alert' }, t('loadError')),
        !ready ? h('div', { className: 'arcv-empty', role: 'status', 'aria-label': t('loading') }, h(StateDot, { state: 'ongoing' })) :
          !visible.length ? h('div', { className: 'arcv-empty' }, icon('IconArchiveOutlineRegular'), t(filtered ? 'noResults' : 'empty'),
            filtered && button(t('reset'), () => { setQuery(''); setPeriod('all'); setWorkspace('*') })) :
            visible.map(group => h('section', { className: 'arcv-group', key: group.id, 'aria-label': group.title },
              h('div', { className: 'arcv-group-header' }, icon('IconFolderCloseRegular'), h('h3', { className: 'arcv-truncate' }, group.title),
                h('span', { className: 'arcv-count' }, t('count', { count: group.rows.length })),
                h(Menu, { open: menu === `group:${group.id}`, portal: true, autoFocus: true, align: 'end', onClose: () => setMenu(null),
                  anchor: iconButton(t('more', { title: group.title }), 'IconEllipsisOutlineRegular', () => setMenu(menu === `group:${group.id}` ? null : `group:${group.id}`)),
                  items: [{ id: 'restore', label: t('restoreGroup'), icon: icon('IconArchiveOffOutlineRegular') }, { id: 'delete', label: t('deleteGroup'), danger: true, icon: icon('IconTrashOutlineRegular') }],
                  onSelect: action => { setMenu(null); if (action === 'delete') setConfirmation({ rows: group.rows }); else void restore(group.rows) } })),
              h('div', { className: 'arcv-card' }, group.rows.map(row => h('div', { className: 'arcv-row', key: row.id },
                h('div', { className: 'arcv-chat' }, h('button', { type: 'button', className: 'arcv-title arcv-truncate', disabled: state.busy,
                  'aria-label': t('open', { title: row.title }), onClick: () => void restore([row], true) }, row.title),
                  row.updatedAt > 0 && h('time', { className: 'arcv-date', dateTime: new Date(row.updatedAt).toISOString() }, date.format(row.updatedAt))),
                h('div', { className: 'arcv-actions' }, iconButton(t('deleteRow', { title: row.title }), 'IconTrashOutlineRegular', () => setConfirmation({ rows: [row] }), true),
                  button(t('restore'), () => void restore([row]), { variant: 'outline' }))))))),
        h(Modal, { open: confirmation !== null, title: t('confirm'), closeLabel: t('close'),
          description: confirmation ? t('description', { count: confirmation.rows.length }) : '', onClose: () => { if (!state.busy) setConfirmation(null) },
          footer: h('div', { className: 'arcv-actions' }, button(t('cancel'), () => setConfirmation(null), { variant: 'outline', 'data-modal-autofocus': true }),
            button(state.busy ? t('deleting', { done: state.done, total: state.total }) : t(confirmation?.error ? 'retry' : 'delete'), () => void remove(), { className: 'arcv-danger', variant: 'outline' })) },
          confirmation?.error && h('p', { className: 'arcv-notice arcv-error', role: 'alert' }, confirmation.error)))
    }

    function ArchiveNotice({ useArchive, dismiss }) {
      const notice = useArchive(value => value.notice)
      return notice ? h(Toast, { key: notice.id, text: notice.text, tone: notice.error ? undefined : 'success', holdMs: notice.error ? 6000 : 3000, onDone: () => dismiss(notice.id) }) : null
    }

    return {
      name: 'archive-manager',
      inject: ['slots', 'sessions', 'workspaces', 'uiWorkspace', 'locale', 'connection'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, dictionaries))
        ctx.effect(() => {
          const style = document.createElement('style')
          style.textContent = css
          document.head.appendChild(style)
          return () => style.remove()
        })
        let state = { busy: false, done: 0, total: 0, notice: null }
        let disposed = false, sequence = 0
        const listeners = new Set()
        const store = { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
        const update = value => { state = { ...state, ...value }; for (const listener of listeners) listener() }
        const failure = code => t(Object.hasOwn(dictionaries.en, code) ? code : 'unknown')
        const notify = (text, error = false) => { if (!disposed) update({ notice: { id: ++sequence, text, error } }) }
        const run = async (rows, deleting) => {
          if (state.busy || disposed) return { completed: 0, remaining: rows, error: disposed ? 'unloading' : 'delete-pending' }
          update({ busy: true, done: 0, total: rows.length })
          let completed = 0, error
          for (const row of rows) {
            if (disposed) { error = 'unloading'; break }
            try {
              if (deleting) {
                const response = await ctx.connection.rpc.call('/api', 'archive-manager/delete', { sessionId: row.id })
                if (!response.ok || !response.value.ok) { error = response.ok ? response.value.code : 'network'; break }
              } else await ctx.uiWorkspace.unarchiveSession(row.id)
              completed++
              update({ done: completed })
            } catch (cause) { error = deleting ? 'network' : 'unknown'; break }
          }
          let refreshFailed = false
          if (deleting && completed && !disposed) {
            try { await ctx.sessions.refresh() } catch (cause) { refreshFailed = true }
          }
          update({ busy: false })
          if (error) notify(t('partial', { done: completed, total: rows.length, reason: failure(error) }), true)
          else if (refreshFailed) notify(t('refreshError'), true)
          else notify(t(deleting ? 'deleted' : 'restored', { count: completed }))
          return { completed, remaining: rows.slice(completed), error }
        }
        const actions = {
          hooks: { archive: store }, failure,
          restore: rows => run(rows, false), remove: rows => run(rows, true),
          search: (query, signal) => ctx.sessions.search(query, signal),
          language: () => ctx.locale.getSnapshot().active,
          openSession: id => {
            try { ctx.uiWorkspace.openSession(id) }
            catch (cause) { notify(failure('unknown'), true) }
          },
        }
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'archived-sessions', order: 25, label: () => t('nav'), locale: NS, inject: () => actions,
        }, ArchivePage)))
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'archive-manager-notice', inject: () => ({ hooks: { archive: store },
            dismiss: id => { if (state.notice?.id === id) update({ notice: null }) } }),
        }, ArchiveNotice)))
        ctx.effect(() => () => { disposed = true; listeners.clear() })
      },
    }
  },
})
