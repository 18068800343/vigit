# ViGit Keyboard Shortcuts

Quick reference for keyboard shortcuts and commands in ViGit.

## Command Palette

All ViGit commands are accessible via the Command Palette:

**Windows/Linux**: `Ctrl+Shift+P`  
**macOS**: `Cmd+Shift+P`

Then type "ViGit" to filter ViGit commands.

## Recommended Custom Keybindings

Add these to your `keybindings.json` for faster workflow:

```json
[
  {
    "key": "ctrl+alt+c",
    "command": "vigit.commit",
    "when": "!terminalFocus"
  },
  {
    "key": "ctrl+alt+p",
    "command": "vigit.push",
    "when": "!terminalFocus"
  },
  {
    "key": "ctrl+alt+l",
    "command": "vigit.pull",
    "when": "!terminalFocus"
  },
  {
    "key": "ctrl+alt+r",
    "command": "vigit.refresh",
    "when": "!terminalFocus"
  },
  {
    "key": "ctrl+alt+b",
    "command": "vigit.newBranch",
    "when": "!terminalFocus"
  },
  {
    "key": "ctrl+alt+s",
    "command": "vigit.shelveChanges",
    "when": "!terminalFocus"
  },
  {
    "key": "ctrl+alt+n",
    "command": "vigit.newChangelist",
    "when": "!terminalFocus"
  },
  {
    "key": "ctrl+alt+h",
    "command": "vigit.showFileHistory",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+alt+a",
    "command": "vigit.annotate",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+alt+d",
    "command": "vigit.showDiff",
    "when": "editorTextFocus"
  }
]
```

## Quick Actions by View

### Local Changes View

| Action | Method |
|--------|--------|
| Show diff | Click on file |
| Stage file | Right-click → "Add to Index" |
| Unstage file | Right-click → "Remove from Index" |
| Revert file | Right-click → "Revert File" |
| Move to changelist | Right-click → "Move to Changelist" |
| Create changelist | Toolbar → + icon |
| Commit | Toolbar → ✓ icon |
| Refresh | Toolbar → ⟳ icon |

### Log View

| Action | Method |
|--------|--------|
| Show commit details | Click on commit |
| Cherry-pick | Right-click → "Cherry-Pick" |
| Reset to commit | Right-click → "Reset HEAD" |
| Refresh | Toolbar → ⟳ icon |

### Shelf View

| Action | Method |
|--------|--------|
| Unshelve | Right-click → "Unshelve Changes" |
| Delete shelf | Right-click → "Delete" |
| Create shelf | From Local Changes toolbar |

### Branches View

| Action | Method |
|--------|--------|
| Checkout | Click on branch |
| Merge | Right-click → "Merge Branch" |
| Rebase | Right-click → "Rebase Branch" |
| Delete | Right-click → "Delete Branch" |
| Create new | Toolbar → + icon |

## Editor Context Menu

Right-click in any file editor:

| Command | Description |
|---------|-------------|
| Show File History | View all commits that modified this file |
| Annotate (Git Blame) | Show who changed each line |
| Compare with Branch | Diff current file with another branch |

## Command Reference

### General Commands

| Command | Description |
|---------|-------------|
| `vigit.refresh` | Refresh all ViGit views |

### Commit Commands

| Command | Description |
|---------|-------------|
| `vigit.commit` | Commit changes in active changelist |
| `vigit.commitAndPush` | Commit and push in one action |

### File Commands

| Command | Description |
|---------|-------------|
| `vigit.showDiff` | Show diff for selected file |
| `vigit.revertFile` | Discard changes in file |
| `vigit.stageFile` | Add file to Git index |
| `vigit.unstageFile` | Remove file from Git index |
| `vigit.showFileHistory` | Show commit history for file |
| `vigit.annotate` | Show Git blame annotations |
| `vigit.compareWithBranch` | Compare file with another branch |

### Changelist Commands

| Command | Description |
|---------|-------------|
| `vigit.newChangelist` | Create a new changelist |
| `vigit.moveToChangelist` | Move file to different changelist |
| `vigit.deleteChangelist` | Delete a changelist |
| `vigit.setActiveChangelist` | Set as active changelist |

### Shelf Commands

| Command | Description |
|---------|-------------|
| `vigit.shelveChanges` | Shelve changes from active changelist |
| `vigit.unshelveChanges` | Apply shelved changes |
| `vigit.deleteShelvedChanges` | Delete shelved changes |

### Branch Commands

| Command | Description |
|---------|-------------|
| `vigit.checkoutBranch` | Checkout a branch |
| `vigit.newBranch` | Create and checkout new branch |
| `vigit.deleteBranch` | Delete a branch |
| `vigit.mergeBranch` | Merge branch into current |
| `vigit.rebaseBranch` | Rebase current onto selected branch |

### Git Operations

| Command | Description |
|---------|-------------|
| `vigit.pull` | Pull from remote |
| `vigit.push` | Push to remote |
| `vigit.fetch` | Fetch from remote |
| `vigit.cherryPick` | Cherry-pick a commit |
| `vigit.resetHead` | Reset HEAD to specified commit |

## Navigation Shortcuts

Standard VSCode shortcuts work in ViGit views:

| Shortcut | Action |
|----------|--------|
| `↑` `↓` | Navigate items |
| `Enter` | Activate item (open/execute) |
| `Space` | Toggle selection |
| `Ctrl+F` | Search in view |
| `Escape` | Close/Cancel |

## Workflow Shortcuts

### Quick Commit Workflow

```
1. Ctrl+Shift+P
2. Type "vigit commit"
3. Enter
4. Type message
5. Enter
```

### Quick Branch Switch

```
1. Go to Branches view
2. Click on branch name
3. Done!
```

### Quick Diff Check

```
1. Click file in Local Changes
2. Diff opens automatically
3. Review changes
4. Close when done
```

## Creating Custom Shortcuts

To create your own shortcuts:

1. Open Keyboard Shortcuts:
   - **Windows/Linux**: `Ctrl+K Ctrl+S`
   - **macOS**: `Cmd+K Cmd+S`

2. Search for "vigit"

3. Click the + icon next to any command

4. Press your desired key combination

5. Hit Enter to save

### Suggested Keybindings

Based on JetBrains IDEA shortcuts:

```json
{
  "key": "ctrl+k",
  "command": "vigit.commit",
  "when": "!terminalFocus"
}

{
  "key": "ctrl+shift+k",
  "command": "vigit.push",
  "when": "!terminalFocus"
}

{
  "key": "ctrl+t",
  "command": "vigit.pull",
  "when": "!terminalFocus"
}

{
  "key": "alt+9",
  "command": "workbench.view.extension.vigit-container",
  "when": "!terminalFocus"
}
```

## Tips for Keyboard Efficiency

1. **Learn Command Palette**: Fastest way to any command
2. **Use Arrow Keys**: Navigate views without mouse
3. **Create Your Own**: Map frequently used commands
4. **Remember Context**: Right-click menus show available actions
5. **Practice Patterns**: Develop muscle memory for common workflows

## Accessibility

ViGit fully supports keyboard navigation:

- All features accessible via keyboard
- Screen reader compatible
- High contrast theme support
- Configurable labels and descriptions

## Next Steps

- Try the suggested keybindings
- Create your own shortcuts for favorite commands
- Practice keyboard-only workflows
- Check out [QUICKSTART.md](QUICKSTART.md) for more tips

---

**Pro Tip**: Print this page as a reference card and keep it handy while learning ViGit keyboard shortcuts!


