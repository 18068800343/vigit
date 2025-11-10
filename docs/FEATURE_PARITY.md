# ViGit ↔ IntelliJ IDEA Git 功能对照

> 更新时间：2025 年 11 月 5 日  
> 目标：列出 IntelliJ IDEA Git / Commit 工具窗口的核心体验，并评估 ViGit 当前实现状态，指导后续迭代。

## 1. 总览导航

| 区域 | IDEA 体验摘要 | ViGit 现状 | 备注 |
| --- | --- | --- | --- |
| 活动栏入口 | `Alt+9` 打开 Version Control 工具窗口，含 Local Changes / Log / Shelf / Repository / Incoming / Console 等多标签 | 仅提供 Local Changes、Log、Shelf、Branches 四个 TreeView（`extension.ts`） | 缺失 Console、Repository/Incoming、Stash、Commit 工具窗口整合 |
| Commit 工具窗口 | 集成更改列表、提交信息输入、检查列表、Diff 预览、Before Commit 任务 | 提交流程走自定义 QuickPick + InputBox（`CommitDialog`），未聚合 Diff/检查 | 需要重构为专用 Webview/Panel |

## 2. Local Changes / Changelists

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| 默认 & 自定义 Changelist | 支持创建、描述、激活、移动文件、合并 | `ChangelistManager` 实现全部基础操作 | ✅ |
| Changelist 共享描述 & 注释 | 支持长描述显示、上下文追踪 | ViGit 仅在 tooltip 展示 description | ⚠️ 建议改进 UI |
| 追踪上下文 (Tasks & Contexts) | 切换 changelist 触发上下文切换 | 未实现 | ❌ |
| 未版本控制文件分类 | IDEA 在 Local Changes 底部展示可展开列表 | ViGit 显示计数但 `getChildren` 缺展开 | 🛠️ 待修复 |
| 按目录/模块分组 | IDEA 支持按目录或模块树展示 | ViGit 以 changelist 平铺文件 | ❌ |
| 逐块暂存/提交 | IDEA 支持 per-hunk stage/unstage | ViGit 仅文件级别 | ❌ |

## 3. 提交体验

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| 提交面板实时 diff | 左侧文件列表，右侧 diff | 通过命令打开 `vscode.diff`，缺乏联合 UI | ❌ |
| Before Commit 检查 | Code Analysis、运行测试、格式化、扫描大文件等 | 无 | ❌ |
| Commit message 模板 & 历史 | IDEA 有历史下拉、模板 | ViGit 支持模板，但缺历史 | ⚠️ |
| Commit & Push | 同一对话框内 | `CommitDialog` 支持 Commit and Push | ✅ |
| Amend Commit | IDEA 在面板中操作 | `CommitDialog.showAmendDialog` 支持 | ✅ |

## 4. Shelf / Stash

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| Shelf 视图 | 列出 shelves，支持 diff、重命名、导入导出 | `ShelfManager` / `ShelfProvider` 提供列表、导入导出 | ✅（基础） |
| Shelf 设置（自动 shelve base revision） | 可配置 | 未实现 | ❌ |
| Shelf diff 预览 | 双击显示 diff | ViGit 仅保存 patch，未集成 diff 命令 | ⚠️ |
| Stash 集成 | IDEA Commit 窗口带 Stash tab | 无 stash UI，仅 `GitService.stash*` | ❌ |
| Unshelve 到特定 changelist | IDEA 可选择目标 changelist | ViGit unshelve 时默认恢复到工作树 | ⚠️ 需增强 |

## 5. Log / History

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| 提交图（branch graph） | 图形化分支可视化，支持过滤 | ViGit 纯列表，无 graph (`logGraph` 配置未实现) | ❌ |
| 多条件筛选 | 作者、路径、分支、日期过滤 | 无筛选 UI | ❌ |
| Commit 详情 | 面板展示消息、文件列表、父子关系 | ViGit 打开 diff 文档，缺文件列表 | ⚠️ |
| 文件历史 | IDEA 以专属窗口显示 | ViGit 通过 QuickPick 选择 commit，随后开 diff | ⚠️ |

## 6. Branch Management

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| Branch Popup (Alt+`) | 分支树、操作集中在弹窗 | ViGit 以 TreeView 呈现 | ⚠️（交互差异） |
| New/Merge/Rebase/Delete | 支持 | ViGit 提供命令 | ✅ |
| Incoming/Outgoing 指示 | IDEA 显示 ahead/behind | ViGit 未显示 | ❌ |
| Checkout with context restore | IDEA 记忆工作空间 | 无 | ❌ |

## 7. 其他

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| Git Console/日志 | IDEA Console 标签 & Git Console | 无 | ❌ |
| Predefined 快捷键 | IDEA 有 Alt+9 打开，Alt+0 等 | ViGit 仅文档推荐自定义 | ⚠️ |
| 集成任务追踪 (Tasks & Contexts) | IDEA 与 Issue tracker 集成 | 无 | ❌ |
| 多仓库/多根支持 | IDEA 支持多 VCS Root | ViGit 仅取第一个 workspaceRoot | ❌ |
| Plugins/Extensions 互操作 | IDEA 支持外部工具 | 无 | ❌ |

## 8. 优先级建议

1. **功能缺陷修复**：修复未版本控制文件展开、补充 stash UI、完善 unshelve 流程。  
2. **提交体验重构**：实现面板化提交界面（Webview），支持 diff/检查/历史。  
3. **日志可视化**：实现 commit graph、过滤器。  
4. **多仓库 & 上下文能力**：支持多 workspace folder、任务上下文。  
5. **高级检查与自动化**：Before Commit 钩子、pre-commit 检查、禁大文件提交等。  
6. **补齐文档 & 测试**：加 README、自动化测试、端到端验证脚本。

---

后续迭代请基于此表更新状态，并在 PR 中注明对应功能编号。
