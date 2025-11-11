# Change Log

All notable changes to the "vigit" extension will be documented in this file.

## [1.1.0] - 2025-11-10

### Added
- Local Changes 树支持按目录/文件夹分组，并在「未版本控制文件」节点中展开所有未跟踪文件
- 新增文件/文件夹/Changelist 上下文命令：Commit File、Show Diff in New Tab、Jump to Source、Delete、Create/Copy Patch、Show as UML
- 提供 changelist 重命名与描述编辑命令，右键即可操作
- 提交对话框支持历史记录按钮与任意文件列表（Commit File...）的快速提交
- Shelf 视图新增 diff 预览，Unshelve 时可将补丁重新分配到指定 changelist
- Stash/Shelf 文件可导出为 patch，命令可直接拷贝到剪贴板
- Branches 视图显示 ahead/behind（Incoming/Outgoing）计数
- 新增命令 `vigit.showDiffNewTab`、`vigit.showShelvedDiff` 等多项 JetBrains 风格交互

### Fixed
- 修复未跟踪文件无法展开的问题，并在目录级别正确统计文件数量
- 提升 Shelf 恢复文件时的可靠性，确保即便导入 patch 也能识别受影响文件

## [1.0.0] - 2024-11-03

### Added
- Initial release
- Local Changes view with changelist support
- Git Log view with commit history
- Shelf/Unshelve functionality
- Branches management
- Commit dialog with changelist integration
- File diff viewer
- Git annotate (blame) feature
- Branch operations (create, checkout, merge, rebase, delete)
- Git operations (pull, push, fetch, cherry-pick, reset)
- File operations (stage, unstage, revert)
- Changelist management (create, delete, move files, set active)
- Auto-refresh on file changes
- Configurable settings

### Features Inspired by JetBrains IDEA
- Changelist-based workflow
- IDEA-style commit dialog
- Shelf for temporary change storage
- Rich visual Git log
- Comprehensive branch management
- Context menus for quick actions
- Activity bar integration


