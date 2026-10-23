# dsh-archive-manager

[中文](README.zh.md) | English

An archived-session manager for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Desktop and Web. Open "Settings → Archived" to view, restore, and delete sessions grouped by workspace.

DSH 0.2.1-rc.2 already provides archive filtering and restoration. This plugin provides a settings page and adds log deletion for sessions no longer owned by the host.

## Features

- **Settings header** — plugin version beside the title, a short subtitle, and compact release-check, GitHub and issue buttons, right-aligned with tooltips below and stable positioning when the page scrolls; bulk deletion stays below the title row. Release checks compare the current version with this repository's latest stable `vX.Y.Z` GitHub Release and link to its notes; an unpublished release or failed query is reported explicitly. Checking never installs a package.
- **Archive list** — a Settings page with search and filters, workspace cards, titles and update times, using native DSH controls and theme tokens
- **Restore and open** — clicking a session restores it before opening its history and conversation, following DSH archive admission
- **Unarchive** — put a session back into its workspace with one click, original position preserved
- **Delete logs** — after confirmation, remove an unused session's records before clearing workspace and archive accounting; failures stay visible
- **Search** — instant filtering by title or workspace, plus message search (your prompts and the assistant's replies); behaves like the official search
- **Filters** — combine update time (all / last 7 days / last 30 days) and workspace filters; each group lists recently updated chats first
- **Bulk management** — group menus restore or delete their displayed chats; the header deletes all chats, or only matching chats when filters are active; deletion confirms the count
- **Bilingual UI** — English and Chinese, following the system language automatically

## Compatibility

This **1.3.0** version supports `@deepseek-ai/dsh` **0.2.1-rc.2**. Restoration uses the official Workspace API; the client uses the current Session and Workspace Controllers. Deletion also uses this version's JSONL path lookup, write lease, and Workspace operation queue, so DSH peer versions are pinned exactly.

## Install

Source and issue tracker: [laoqiu/dsh-archive-manager](https://github.com/laoqiu/dsh-archive-manager). This fork is distributed through GitHub; the upstream npm package does not contain these changes.

In Desktop, open **Plugins → Add plugin** and enter:

```text
https://github.com/laoqiu/dsh-archive-manager/archive/refs/heads/main.tar.gz
```

For Web, use the installed DSH CLI:

```powershell
dsh plugin --profile web add https://github.com/laoqiu/dsh-archive-manager/archive/refs/heads/main.tar.gz
```

Restart the corresponding application, then open **Settings → Archived**. Web and Desktop profiles are independent. When upgrading from an old scoped package, remove that dependency before installing `dsh-archive-manager`.

The committed `lib/*.js` files are the plugin entries; no build is required. To develop or create a local package:

```powershell
git clone https://github.com/laoqiu/dsh-archive-manager.git
cd dsh-archive-manager
npm run check
npm test
npm pack
```

### Updating

Reinstall the GitHub archive URL, then restart DSH. `main` follows the latest commits; use a specific commit's GitHub archive to pin the source. Updating through the upstream npm package name does not fetch this fork.

## Uninstall

```sh
dsh plugin --profile web remove dsh-archive-manager
```

For Desktop, remove it through the plugin page. Restart the corresponding DSH application afterwards.

## Known limitations

- Sessions with a live Agent or Session instance cannot be deleted. Restart DSH and delete them before reopening them; the plugin does not take another plugin's agent-disposal capability.
- Deletion supports this version's JSONL backend. It holds the backend write lease and refuses deletion while another process owns that lease. Unsupported storage layouts produce an error.
- Empty session directories and the `session.lock` coordination file remain. If archive-accounting cleanup fails after log removal, retry deletion to finish cleanup.
- Bulk operations run sequentially and stop at the first failure without rolling back completed operations. The delete dialog retains failed and unprocessed chats for retry. Closing Settings does not cancel an admitted operation; a global toast reports the result.
- Message search is bounded and asks you to narrow the query when more matches exist. On search failure, title and workspace matches remain visible.

## Validation

```sh
npm run check
npm test
```

Tests cover the Settings entry, combined filters and deletion scope, batch failure and retry, global notices, and independent temporary directories for restoration, physical deletion, live-session protection, writer refusal, path checks, concurrency, and unload draining.

## License

MIT


## Private registry distribution

This build is distributed as `dsh-archive-manager` through `https://registry.antistudio.cn/`. Update checks use `https://registry.antistudio.cn/index.json`; package downloads use the npm credentials configured in the active DSH profile. GitHub hosts source code and issue reports.

