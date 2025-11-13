# ViGit Quick Start Guide

Welcome to ViGit! This guide will help you get started with IDEA-style Git integration in VSCode.

## 🎯 Core Concepts

### Changelists

Changelists let you group related changes together, just like in JetBrains IDEA:

- **Default Changelist**: Created automatically, holds all new changes
- **Custom Changelists**: Create your own to organize different tasks
- **Active Changelist**: New changes go here automatically

### Shelf

Temporarily store changes without committing:

- Save work-in-progress without cluttering commit history
- Switch contexts quickly
- Share changes as patches

## 🚀 Getting Started

### 1. Open Your Repository

Open any Git repository in VSCode. ViGit will activate automatically.

### 2. Access ViGit

Click the **ViGit icon** in the Activity Bar (left sidebar) to see:

```
📋 Local Changes    - Your modifications organized by changelists
📊 Log              - Commit history with branch graphs
📦 Shelf            - Shelved changes
🌲 Branches         - Branch management
```

### 3. View Your Changes

In the **Local Changes** view:

- See all modified files
- Grouped by changelist
- Icons show status (modified, deleted, untracked)
- Green checkmark = staged

### 4. Make Your First Commit

1. Modify some files
2. They appear in the active changelist
3. Click the **commit icon** in Local Changes toolbar
4. Enter your commit message
5. Hit Enter ✓

## 📝 Common Workflows

### Workflow 1: Working on Multiple Features

```
1. Create a changelist for Feature A
   - Right-click in Local Changes → New Changelist
   - Name it "Feature A"

2. Create another for Feature B
   - Name it "Feature B"

3. Set "Feature A" as active
   - Right-click "Feature A" → Set Active Changelist

4. Make changes - they go to Feature A automatically

5. Switch to Feature B
   - Set it as active
   - Continue working on Feature B

6. Commit each feature separately
   - Select the changelist
   - Click commit
```

### Workflow 2: Using Shelf for Context Switching

```
1. Working on a feature
2. Need to switch to urgent bugfix
3. Shelve your current work:
   - Click shelf icon in Local Changes
   - Name it "Feature WIP"
   - Changes are saved and reverted

4. Work on the bugfix
5. Commit the bugfix

6. Unshelve your feature work:
   - Go to Shelf view
   - Right-click your shelf
   - Choose "Unshelve and Keep"
   - Continue where you left off
```

### Workflow 3: Reviewing History

```
1. 在 Branches 视图中选择任意分支
2. VIGIT BRANCH DETAILS 面板会列出最近的提交
3. 单击提交以查看文件树，双击或右键执行操作
4. 常见操作：
   - Cherry-pick
   - Reset to this commit
   - Copy commit hash
```

### Workflow 4: Branch Management

```
1. Go to Branches view
2. See local and remote branches
3. Create new branch:
   - Click + icon
   - Enter branch name
   - Automatically checks out

4. Merge branches:
   - Right-click source branch
   - Select "Merge Branch"

5. Delete old branches:
   - Right-click branch
   - Select "Delete Branch"
```

## 🎨 Visual Indicators

### File Status Icons

- 📝 **Blue Edit**: Modified file
- ✅ **Green Check**: Staged file
- ➕ **Yellow Plus**: Untracked file
- 🗑️ **Red Trash**: Deleted file

### Changelist Indicators

- 🟢 **Green Folder**: Active changelist
- 📁 **Gray Folder**: Inactive changelist
- **[N]**: Number of files in changelist

## ⌨️ Quick Actions

### In Local Changes:

- **Click file**: Show diff
- **Right-click file**:
  - Show Diff
  - Revert File
  - Add to Index (stage)
  - Remove from Index (unstage)
  - Move to Changelist

### In Log:

- **Click commit**: Show commit details and diff
- **Right-click commit**: Cherry-pick, Reset

### In Branches:

- **Click branch**: Checkout
- **Right-click branch**: Merge, Rebase, Delete

## 💡 Pro Tips

### Tip 1: Stage Before Commit
```
Stage files manually for more control:
1. Right-click files in changelist
2. Select "Add to Index"
3. Green checkmark appears
4. Only staged files commit
```

### Tip 2: Commit Message Templates
```
Set a template for consistent commits:
1. Settings → vigit.commitMessageTemplate
2. Set to: "[TASK-ID] "
3. Every commit starts with this
```

### Tip 3: Keyboard Workflow
```
1. Ctrl+Shift+P → "ViGit: Commit Changes"
2. Type message
3. Enter to commit
4. No mouse needed!
```

### Tip 4: Compare with Branches
```
1. Open a file
2. Right-click in editor
3. "ViGit: Compare with Branch"
4. Select branch
5. See side-by-side diff
```

### Tip 5: Git Blame/Annotate
```
1. Open any file
2. Right-click in editor
3. "ViGit: Annotate (Git Blame)"
4. See who changed each line
5. Click again to toggle off
```

## 🔧 Command Palette

Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and type "ViGit" to see all commands:

```
ViGit: Commit Changes
ViGit: Commit and Push
ViGit: New Changelist
ViGit: Shelve Changes
ViGit: Show File History
ViGit: Annotate (Git Blame)
ViGit: New Branch
ViGit: Pull
ViGit: Push
ViGit: Fetch
... and more!
```

## 🎓 Learning More

### Next Steps:

1. **Explore Context Menus**: Right-click everything to discover features
2. **Try Shelving**: Practice context switching without losing work
3. **Create Changelists**: Organize your work better
4. **Use Annotate**: Understand code history
5. **Master Branches**: Get comfortable with merge/rebase

### Advanced Topics:

- **Cherry-picking**: Apply specific commits
- **Reset HEAD**: Undo commits safely
- **Rebase**: Keep history clean
- **File History**: Track changes to specific files

## 🆘 Common Questions

**Q: Where do changelists exist?**  
A: Changelists are local to ViGit, stored in VSCode workspace state. They don't affect Git itself.

**Q: Can I share shelved changes?**  
A: Yes! Shelves are stored as Git patches in `.vigit-shelf/` directory.

**Q: What's the difference between Shelf and Stash?**  
A: Shelf is ViGit's feature with a UI. Git stash is Git's native feature. Use Shelf for better visibility.

**Q: Can I use ViGit with the built-in Git?**  
A: Yes! They work side-by-side. ViGit adds features, doesn't replace anything.

**Q: How do I commit only some files?**  
A: Create a changelist, move only those files to it, make it active, then commit.

## 🚦 You're Ready!

You now know the basics of ViGit. Start using it and discover how IDEA-style Git integration makes version control more intuitive and powerful!

### Quick Reference Card:

```
📋 Local Changes  → Manage files & changelists
📊 Log            → View history
📦 Shelf          → Store WIP
🌲 Branches       → Switch & merge
🔄 Refresh        → Update all views
✓ Commit          → Save your work
```

Happy coding! 🎉


