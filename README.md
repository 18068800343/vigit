<img width="497" height="208" alt="创建 VGit 插件图标长条" src="https://github.com/user-attachments/assets/ccac79a5-afa3-4f72-893a-f15a4274186f" />

# ViGit Installation Guide


## Prerequisites

Before installing ViGit, ensure you have:

1. **Visual Studio Code** 1.85.0 or higher
2. **Node.js** 18.x or higher
3. **Git** installed and accessible from command line

## Installation Methods

### Method 1: From VSIX (Recommended for development)

1. Clone or download the ViGit repository
2. Open a terminal in the ViGit directory
3. Install dependencies:
   ```bash
   npm install
   ```
4. Compile the extension:
   ```bash
   npm run compile
   ```
5. Package the extension:
   ```bash
   npx vsce package
   ```
6. Install the generated `.vsix` file:
   - In VSCode, press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
   - Type "Install from VSIX"
   - Select the generated `vigit-1.0.0.vsix` file

### Method 2: From VSCode Marketplace (Coming Soon)

Once published, you can install directly from the VSCode Marketplace:

1. Open VSCode
2. Go to Extensions view (`Ctrl+Shift+X`)
3. Search for "ViGit"
4. Click "Install"

### Method 3: Development Mode

For development and testing:

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Open the folder in VSCode
4. Press `F5` to launch a new VSCode window with the extension loaded
5. Or use the "Run Extension" debug configuration

## Post-Installation Setup

### 1. Configure Git

Ensure Git is configured with your identity:

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 2. Open a Git Repository

1. Open a folder in VSCode that contains a Git repository
2. Or initialize a new Git repository:
   ```bash
   git init
   ```

### 3. Access ViGit

Click the ViGit icon in the Activity Bar (left sidebar) to see:
- **Local Changes**: View and manage your modifications
- **Log**: Browse commit history
- **Shelf**: Store temporary changes
- **Branches**: Manage branches

## Configuration

Customize ViGit behavior in VSCode settings:

1. Open Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "vigit"
3. Configure options:
   - `vigit.autoRefresh`: Auto-refresh git status
   - `vigit.autoStage`: Auto-stage files in changelists
   - `vigit.defaultChangelist`: Name of default changelist
   - `vigit.showUnversionedFiles`: Show untracked files

### Example Configuration

Add to your `settings.json`:

```json
{
  "vigit.autoRefresh": true,
  "vigit.autoStage": false,
  "vigit.defaultChangelist": "Default",
  "vigit.showUnversionedFiles": true,
  "vigit.commitMessageTemplate": "[TASK-ID] "
}
```

## Troubleshooting

### Extension Not Activating

- Ensure you have a Git repository open
- Check the Output panel: View → Output → Select "ViGit"
- Restart VSCode

### Git Commands Failing

- Verify Git is installed: `git --version`
- Ensure Git is in your system PATH
- Check you have proper permissions for the repository

### Performance Issues

- Disable `vigit.autoRefresh` if needed
- Close unused views to reduce resource usage

### Shelving Not Working

- Ensure the `.vigit-shelf` directory has write permissions
- Check that you have uncommitted changes to shelve

## Uninstallation

1. Go to Extensions view (`Ctrl+Shift+X`)
2. Find "ViGit"
3. Click the gear icon and select "Uninstall"
4. Restart VSCode

Note: Shelved changes are stored locally and will be preserved.

## Getting Help

If you encounter issues:

1. Check the [README](README.md) for feature documentation
2. Review the [CHANGELOG](CHANGELOG.md) for recent changes
3. Search existing issues on GitHub
4. Create a new issue with:
   - VSCode version
   - ViGit version
   - Git version
   - Operating system
   - Error messages or screenshots
   - Steps to reproduce

## Next Steps

After installation, check out:

- [Quick Start Guide](docs/QUICKSTART.md) - Learn the basics
- [Features Overview](README.md#features) - Explore all features
- [Keyboard Shortcuts](docs/SHORTCUTS.md) - Work more efficiently

Happy version controlling with ViGit! 🚀


