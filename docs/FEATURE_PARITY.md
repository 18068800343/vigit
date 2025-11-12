# ViGit ↔ IntelliJ IDEA Git 功能对照

> 更新时间：2025-11-10  
> 目标：持续跟踪 IntelliJ IDEA Git/Commit 体验与 ViGit 的差异，指导航向式迭代。

## 1. 总览导航

| 区域 | IDEA 体验摘要 | ViGit 现状 | 备注 |
| --- | --- | --- | --- |
| 活动栏入口 | Alt+9 打开 Version Control，整合 Local Changes / Log / Shelf / Repository / Console 等页签 | 活动栏提供 Local Changes / Log / Shelf / Stash / Branches 五个视图 | ⏳ Console / Repository 仍待实现 |
| Commit 工具窗口 | 单面板汇总更改、Diff、Before Commit 任务、消息输入 | 仍以命令 + 输入框进行提交，暂无专用面板 | ⏳ 需要 Webview 重构 |

## 2. Local Changes / Changelists

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| 默认 & 自定义 Changelist | 创建/描述/激活/移动/合并 | 全量支持；新增“编辑 Changelist”命令可改名与描述 | ✅ |
| Changelist 描述展示 | 面板直接显示长描述与上下文 | Tooltip 展示 + 可编辑，仍缺少面板内展示 | ⚠️ |
| 任务上下文 (Tasks & Contexts) | 切换 changelist 恢复上下文 | 暂未实现 | ⏳ |
| 未版本控制文件分类 | 展开列表，可直接 Add to VCS | 「Unversioned Files」节点支持按目录展开，并提供 Commit/补丁/删除等命令 | ✅ |
| 按目录/模块分组 | 目录树视图 | Local Changes 现以 Changelist → 目录 → 文件树展示，folder 节点具备命令 | ✅ |
| 逐块暂存/提交 | Per-hunk stage/unstage | 仍为文件级操作 | ⏳ |

## 3. 提交体验

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| 提交面板实时 diff | 单面板左右布局 | 通过 Show Diff/Show Diff in New Tab 打开 diff 文档 | ⚠️ |
| Before Commit 检查 | 代码分析/测试/格式化/大文件警告 | 暂未集成 | ⏳ |
| Commit message 模板 & 历史 | 模板 + 历史下拉 | Commit 对话框自带模板，新增历史按钮，可回填历史记录 | ✅ |
| Commit & Push | 同一面板完成 | CommitDialog 支持 commit/commit & push，Commit File... 支持单文件提交 | ✅ |
| Amend Commit | 面板操作 | 命令支持且复用历史提示 | ✅ |

## 4. Shelf / Stash

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| Shelf 视图 | diff/导入导出/重命名 | 基础能力 + 新增 “Show Shelf Diff” 命令 | ✅ |
| Shelf 设置 | 可选基准版本等 | 暂未提供 | ⏳ |
| Shelf diff 预览 | 双击即 diff | 右键 Show Shelf Diff 打开 patch 预览 | ✅ |
| Stash 集成 | Commit 面板内切换 | 提供独立 Stash 视图 + show/apply/pop/drop 命令 | ✅ |
| Unshelve 到指定 changelist | 选择目标 changelist | Unshelve 时将 patch 中的文件重新分配到选中 changelist，支持导入 patch | ✅ |

## 5. Log / History

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| 提交图 | 图形化分支 | 仍为列表，logGraph 配置暂未生效 | ⏳ |
| 多条件筛选 | 作者/路径/分支/时间 | 暂缺 | ⏳ |
| Commit 详情面板 | 显示消息、文件、父子关系 | 通过命令打开 diff 文档 | ⚠️ |
| 文件历史 | 专属窗口 | QuickPick 选择 commit 后打开 diff | ⚠️ |

## 6. Branch Management

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| Branch Popup | Alt+ 弹框 | TreeView 呈现 | ⚠️ |
| 新建/合并/变基/删除 | 完整支持 | 命令已覆盖 | ✅ |
| Incoming/Outgoing 指示 | 显示 ahead/behind 数 | Branches 视图显示 ↑/↓ 计数及 tooltip | ✅ |
| Checkout + 上下文恢复 | 切换时恢复上下文 | 暂未实现 | ⏳ |

## 7. 其他

| 功能 | IDEA | ViGit | 状态 |
| --- | --- | --- | --- |
| Git Console | 内置 Console & Git 日志 | 暂缺 | ⏳ |
| 预置快捷键 | Alt+9 / Alt+0 等 | 文档说明 + 新命令可映射，尚未预置 | ⚠️ |
| 多仓库/多根 | 支持多个 VCS Root | 仍默认首个 workspace folder | ⏳ |
| 外部工具/任务跟踪 | 深度集成 | 暂缺 | ⏳ |

## 8. 后续优先级
1. 提交体验面板化（Before Commit 钩子、Diff 集成）。
2. 日志图形化 + 过滤器。
3. 多仓库支持与任务上下文同步。
4. Git Console / Repository 视图补齐。

> 更新说明：本次迭代重点完成 Local Changes 结构化展示、命令菜单对齐 IDEA、提交历史按钮、Shelf diff 与 Branch ahead/behind 指示。
