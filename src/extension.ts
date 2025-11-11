import * as vscode from 'vscode';
import { GitService } from './services/gitService';
import { LocalChangesProvider } from './providers/localChangesProvider';
import { GitLogProvider } from './providers/gitLogProvider';
import { ShelfProvider } from './providers/shelfProvider';
import { BranchesProvider } from './providers/branchesProvider';
import { StashProvider } from './providers/stashProvider';
import { ChangelistManager } from './managers/changelistManager';
import { ShelfManager } from './managers/shelfManager';
import { CommitDialog } from './ui/commitDialog';
import { CommitPanelProvider } from './ui/commitPanelProvider';
import { BranchDetailsPanel } from './ui/branchDetailsPanel';
import { FileSystemWatcher } from './watchers/fileSystemWatcher';
import { CommandRegistry } from './commands/commandRegistry';

export async function activate(context: vscode.ExtensionContext) {
    console.log('ViGit extension is now active!');

    // Get workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showWarningMessage('ViGit: No workspace folder open');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    try {
        // Initialize core services
        const gitService = new GitService(workspaceRoot);
        await gitService.initialize();

        // Initialize managers
        const changelistManager = new ChangelistManager(context, workspaceRoot);
        const shelfManager = new ShelfManager(context, workspaceRoot, gitService);

        // Initialize tree view providers
        const localChangesProvider = new LocalChangesProvider(
            workspaceRoot,
            gitService,
            changelistManager
        );
        const gitLogProvider = new GitLogProvider(workspaceRoot, gitService);
        const shelfProvider = new ShelfProvider(shelfManager);
        const branchesProvider = new BranchesProvider(workspaceRoot, gitService);
        const stashProvider = new StashProvider(gitService);

        // Register tree views
        const gitLogView = vscode.window.createTreeView('vigit.log', {
            treeDataProvider: gitLogProvider,
            showCollapseAll: true
        });

        const branchesView = vscode.window.createTreeView('vigit.branches', {
            treeDataProvider: branchesProvider,
            showCollapseAll: true
        });

        const stashView = vscode.window.createTreeView('vigit.stash', {
            treeDataProvider: stashProvider,
            showCollapseAll: true
        });

        // Register file system watcher
        const fileWatcher = new FileSystemWatcher(
            workspaceRoot,
            gitService,
            localChangesProvider,
            changelistManager
        );

        // Initialize commit dialog
        const commitDialog = new CommitDialog(
            context,
            gitService,
            changelistManager,
            localChangesProvider
        );

        const commitPanelProvider = new CommitPanelProvider(
            context,
            gitService,
            changelistManager,
            localChangesProvider,
            commitDialog
        );
        const branchDetailsPanel = new BranchDetailsPanel(gitService);

        // Register all commands
        const commandRegistry = new CommandRegistry(
            context,
            gitService,
            changelistManager,
            shelfManager,
            localChangesProvider,
            gitLogProvider,
            shelfProvider,
            branchesProvider,
            stashProvider,
            commitDialog,
            branchDetailsPanel
        );
        commandRegistry.registerAllCommands();

        // Add to subscriptions
        context.subscriptions.push(
            gitLogView,
            branchesView,
            stashView,
            fileWatcher,
            commitPanelProvider,
            branchDetailsPanel,
            vscode.window.registerWebviewViewProvider(CommitPanelProvider.viewId, commitPanelProvider),
            vscode.window.registerWebviewViewProvider(BranchDetailsPanel.viewId, branchDetailsPanel)
        );

        vscode.window.showInformationMessage('ViGit: Ready for Git version control!');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`ViGit initialization failed: ${errorMessage}`);
        console.error('ViGit initialization error:', error);
    }
}

export function deactivate() {
    console.log('ViGit extension is now deactivated');
}


