# dsh-archive-manager

[English](README.md) | 中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Desktop / Web 的归档会话管理插件：从“设置 → 已归档”进入，按工作区分组浏览，支持查看、恢复和删除已归档会话。

DSH 0.2.1-alpha.2 已提供归档筛选和恢复操作；此插件提供设置中的归档管理页，并补充未被宿主使用的会话日志删除功能。

## 功能

- **归档列表**——设置中的“已归档”页面，顶部搜索与筛选、工作区分组卡片、标题与更新时间，使用 DSH 原生控件和主题
- **恢复并打开**——点击会话会先恢复、再打开历史并继续对话，遵循 DSH 的归档限制
- **恢复（取消归档）**——一键把会话放回原工作区，位置不变
- **删除日志**——确认后删除未被宿主使用的会话记录，再清理工作区和归档信息；失败时显示错误
- **搜索**——按标题、工作区名即时过滤，还能搜索对话消息（你的提问和助手回复）；与官方搜索行为一致
- **筛选**——按更新时间（全部 / 最近 7 天 / 最近 30 天）和工作区组合筛选，各组按最近更新排序
- **批量管理**——组菜单支持取消归档和删除；顶部删除全部会话，筛选时改为“删除筛选结果”，仅处理当前匹配的会话；删除前确认数量
- **双语界面**——中英文自动跟随系统语言

## 兼容性

当前版本为 **1.3.0**，支持 `@deepseek-ai/dsh` **0.2.1-alpha.2**。恢复操作使用官方 Workspace 接口；客户端使用当前的 Session / Workspace Controller。删除还依赖该版本 JSONL 后端的路径查询和写锁，以及 Workspace 操作队列，因此 DSH 依赖固定为这个版本。

## 安装

源码与问题反馈：[laoqiu/dsh-archive-manager](https://github.com/laoqiu/dsh-archive-manager)。本分支通过 GitHub 分发，上游 npm 包不包含这些修改。

在 Desktop 的「插件 → 添加插件」中输入：

```text
https://github.com/laoqiu/dsh-archive-manager/archive/refs/heads/main.tar.gz
```

Web 使用已安装的 DSH CLI：

```powershell
dsh plugin --profile web add https://github.com/laoqiu/dsh-archive-manager/archive/refs/heads/main.tar.gz
```

安装后重启对应应用，从「设置 → 已归档」进入。Web 与 Desktop 的 profile 独立；从旧作用域包升级时，先移除旧依赖，再安装 `dsh-archive-manager`。

仓库提交的 `lib/*.js` 即插件入口，无需构建。从源码开发或生成本地安装包：

```powershell
git clone https://github.com/laoqiu/dsh-archive-manager.git
cd dsh-archive-manager
npm run check
npm test
npm pack
```

### 更新

重新安装 GitHub 归档地址，再重启 DSH。`main` 跟随最新提交，需要固定版本时使用具体提交的 GitHub 归档地址。通过上游 npm 包名更新不会获取本分支修改。

## 卸载

```sh
dsh plugin --profile web remove dsh-archive-manager
```

Desktop 在插件页移除；完成后重启对应的 DSH 应用。

## 已知限制

- 仍有 Agent 或 Session 实例的会话不能删除。请重启 DSH，并在重新打开目标会话之前删除；插件不会接管其他插件的 Agent 销毁权限。
- 删除仅支持此版本的 JSONL 后端。删除期间持有后端写锁，其他进程持有写锁时会拒绝；不支持的存储布局会明确报错。
- 日志移除后，保留空的会话目录及 `session.lock` 协调文件。若归档信息清理失败，重试删除可以完成清理。
- 批量操作逐个执行，遇到失败立即停止，不会回滚已完成的操作；删除确认框保留失败和未处理的会话供重试。关闭设置不取消已开始的操作，结果通过全局提示显示。
- 消息搜索有结果数量上限，达到上限会提示缩小搜索范围；搜索失败时仍保留标题和工作区匹配结果。

## 验证

```sh
npm run check
npm test
```

测试验证设置入口、组合筛选和删除范围、批量失败与重试、全局提示，以及独立临时目录中的恢复、物理删除、活动会话保护、写锁拒绝、路径检查、并发操作和卸载等待。

## License

MIT
