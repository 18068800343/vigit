import * as vscode from 'vscode';
import * as path from 'path';
import { CommitFileChange, GitBranch, GitCommit, GitService } from '../services/gitService';
import { DiffViewHelper } from '../helpers/diffViewHelper';

interface BranchCommitSummary {
    hash: string;
    abbrevHash: string;
    message: string;
    author: string;
    date: string;
    refs: string[];
    parents: string[];
}

export class BranchDetailsPanel implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewId = 'vigit.branchDetailsPanel';

    private view?: vscode.WebviewView;
    private viewDisposables: vscode.Disposable[] = [];
    private currentBranch?: GitBranch;
    private readonly maxCommits = 200;

    constructor(
        private readonly gitService: GitService
    ) {}

    dispose(): void {
        this.disposeView();
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };
        webviewView.webview.html = this.getEmptyStateHtml(webviewView.webview);

        this.viewDisposables.push(
            webviewView.onDidDispose(() => this.disposeView()),
            webviewView.webview.onDidReceiveMessage(message => {
                void this.handleMessage(message);
            })
        );

        if (this.currentBranch) {
            void this.render(this.currentBranch);
        }
    }

    async show(branch: GitBranch): Promise<void> {
        this.currentBranch = branch;
        await this.ensureViewVisible();
        if (!this.view) {
            vscode.window.showWarningMessage('Unable to open branch details view');
            return;
        }

        await this.render(branch);
        this.view.show?.(false);
    }

    private async ensureViewVisible(): Promise<void> {
        if (this.view) {
            return;
        }

        try {
            await vscode.commands.executeCommand(`${BranchDetailsPanel.viewId}.focus`);
        } catch {
            await vscode.commands.executeCommand('workbench.view.extension.vigit-panel');
        }

        for (let i = 0; i < 5 && !this.view; i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    private disposeView(): void {
        this.viewDisposables.forEach(d => d.dispose());
        this.viewDisposables = [];
        this.view = undefined;
    }

    private getEmptyStateHtml(webview: vscode.Webview): string {
        const cspSource = webview.cspSource;
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
        body {
            margin: 0;
            padding: 32px;
            font-family: var(--vscode-font-family);
            background: var(--vscode-sideBar-background);
            color: var(--vscode-descriptionForeground);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            text-align: center;
            gap: 12px;
        }
        h2 {
            margin: 0;
            font-size: 16px;
            color: var(--vscode-foreground);
        }
        p {
            margin: 0;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <h2>No branch selected</h2>
    <p>Pick any local or remote branch from the Branches view to inspect its history.</p>
</body>
</html>`;
    }

    private async render(branch: GitBranch): Promise<void> {
        if (!this.view) {
            return;
        }

        try {
            const commits = await this.gitService.getBranchLog(branch.name, this.maxCommits);
            if (!this.view) {
                return;
            }
            const displayName = this.getDisplayBranchName(branch);
            this.view.title = displayName;
            this.view.description = branch.remote ? 'Remote' : 'Local';
            this.view.webview.html = this.getHtmlForWebview(
                this.view.webview,
                branch,
                commits,
                displayName
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (this.view) {
                this.view.webview.html = `<div style="padding:16px;font-family: var(--vscode-font-family);">${message}</div>`;
            }
        }
    }

    private async handleMessage(message: any): Promise<void> {
        if (!message || typeof message.type !== 'string') {
            return;
        }

        switch (message.type) {
            case 'requestCommitFiles':
                await this.handleCommitFilesRequest(message.payload?.hash);
                break;
            case 'openCommitFileDiff':
                await this.handleCommitFileDiff(message.payload);
                break;
            case 'commitAction':
                await this.handleCommitActionRequest(message.payload);
                break;
            case 'refreshBranch':
                if (this.currentBranch) {
                    await this.render(this.currentBranch);
                }
                break;
            default:
                break;
        }
    }

    private async handleCommitFilesRequest(hash?: string): Promise<void> {
        if (!hash || !this.view) {
            return;
        }

        try {
            const files = await this.gitService.getCommitFileChanges(hash);
            await this.view.webview.postMessage({
                type: 'commitFiles',
                payload: {
                    hash,
                    files
                }
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.view?.webview.postMessage({
                type: 'commitFiles',
                payload: {
                    hash,
                    error: message
                }
            });
        }
    }

    private async handleCommitFileDiff(payload: any): Promise<void> {
        const hash: string | undefined = payload?.hash;
        const parentHash: string | undefined = payload?.parentHash || undefined;
        const change: CommitFileChange | undefined = payload?.change;

        if (!hash || !change) {
            return;
        }

        try {
            await DiffViewHelper.showCommitFileDiff(this.gitService, hash, parentHash, change);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`鏃犳硶鎵撳紑 diff: ${message}`);
        }
    }

    private async handleCommitActionRequest(payload: any): Promise<void> {
        const action: string | undefined = payload?.action;
        const commit: BranchCommitSummary | undefined = payload?.commit;

        if (!action || !commit) {
            return;
        }

        try {
            switch (action) {
                case 'copyHash':
                    await vscode.env.clipboard.writeText(commit.hash);
                    vscode.window.showInformationMessage(`已复制提交 ${commit.abbrevHash}`);
                    break;
                case 'createPatch':
                    await this.createPatchForCommit(commit);
                    break;
                case 'cherryPick':
                    await this.cherryPickCommit(commit);
                    break;
                case 'checkout':
                    await this.checkoutCommit(commit);
                    break;
                case 'compareLocal':
                    await DiffViewHelper.showCommitDiff(this.gitService, commit.hash);
                    break;
                case 'resetHere':
                    await this.resetBranchToCommit(commit);
                    break;
                case 'revert':
                    await this.revertCommit(commit);
                    break;
                case 'branchHere':
                    await this.createBranchFromCommit(commit);
                    break;
                case 'tagHere':
                    await this.createTagFromCommit(commit);
                    break;
                default:
                    break;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(message);
        }
    }

    private async createPatchForCommit(commit: BranchCommitSummary): Promise<void> {
        const patch = await this.gitService.getCommitPatch(commit.hash);
        const defaultUri = vscode.Uri.file(
            path.join(this.gitService.getWorkspaceRoot(), `${commit.abbrevHash}.patch`)
        );

        const target = await vscode.window.showSaveDialog({
            defaultUri,
            saveLabel: '保存补丁',
            filters: {
                Patch: ['patch', 'diff'],
                All: ['*']
            }
        });

        if (!target) {
            return;
        }

        await vscode.workspace.fs.writeFile(target, Buffer.from(patch, 'utf8'));
        vscode.window.showInformationMessage(`补丁已保存到 ${target.fsPath}`);
    }

    private async cherryPickCommit(commit: BranchCommitSummary): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `是否将提交 ${commit.abbrevHash} cherry-pick 到当前分支？`,
            { modal: true },
            'Cherry-pick'
        );

        if (confirm !== 'Cherry-pick') {
            return;
        }

        await this.gitService.cherryPick(commit.hash);
        await this.refreshAfterGitOperation(`已 cherry-pick ${commit.abbrevHash}`);
    }

    private async checkoutCommit(commit: BranchCommitSummary): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `将以游离 HEAD 方式切换到提交 ${commit.abbrevHash}，继续？`,
            { modal: true },
            'Checkout'
        );

        if (confirm !== 'Checkout') {
            return;
        }

        await this.gitService.checkoutCommit(commit.hash);
        vscode.window.showInformationMessage(`已复制提交 ${commit.abbrevHash}`);
    }

    private async resetBranchToCommit(commit: BranchCommitSummary): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Reset 当前分支到 ${commit.abbrevHash}? 所有未提交的更改都会丢失。`,
            { modal: true },
            'Reset --hard'
        );

        if (confirm !== 'Reset --hard') {
            return;
        }

        await this.gitService.resetToCommit(commit.hash);
        await this.refreshAfterGitOperation(`已重置到 ${commit.abbrevHash}`);
    }

    private async revertCommit(commit: BranchCommitSummary): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `创建一个新的提交以还原 ${commit.abbrevHash}?`,
            { modal: true },
            'Revert'
        );

        if (confirm !== 'Revert') {
            return;
        }

        await this.gitService.revertCommit(commit.hash);
        await this.refreshAfterGitOperation(`已 revert ${commit.abbrevHash}`);
    }

    private async createBranchFromCommit(commit: BranchCommitSummary): Promise<void> {
        const branchName = await vscode.window.showInputBox({
            prompt: '输入要创建的分支名称',
            placeHolder: 'feature/awesome-change',
            validateInput: (value) => {
                if (!value?.trim()) {
                    return '分支名称不能为空';
                }
                return null;
            }
        });

        if (!branchName) {
            return;
        }

        await this.gitService.createBranchAtCommit(branchName.trim(), commit.hash);
        await this.refreshAfterGitOperation(`已基于 ${commit.abbrevHash} 创建分支 ${branchName.trim()}`);
    }

    private async createTagFromCommit(commit: BranchCommitSummary): Promise<void> {
        const tagName = await vscode.window.showInputBox({
            prompt: '输入 tag 名称',
            placeHolder: 'v1.0.0',
            validateInput: (value) => {
                if (!value?.trim()) {
                    return 'Tag 名称不能为空';
                }
                return null;
            }
        });

        if (!tagName) {
            return;
        }

        await this.gitService.createTag(tagName.trim(), commit.hash);
        vscode.window.showInformationMessage(`已在 ${commit.abbrevHash} 创建 tag ${tagName.trim()}`);
    }

    private async refreshAfterGitOperation(message?: string): Promise<void> {
        try {
            await vscode.commands.executeCommand('vigit.refresh');
        } catch (error) {
            console.warn('ViGit: failed to refresh after git operation', error);
        }
        if (message) {
            vscode.window.showInformationMessage(message);
        }
    }

    private getHtmlForWebview(
        webview: vscode.Webview,
        branch: GitBranch,
        commits: GitCommit[],
        branchDisplayName: string
    ): string {
        const nonce = this.getNonce();
        const cspSource = webview.cspSource;
        const commitData: BranchCommitSummary[] = commits.map(commit => ({
            hash: commit.hash,
            abbrevHash: commit.abbrevHash,
            message: commit.message,
            author: commit.author,
            date: commit.date.toISOString(),
            refs: commit.refs,
            parents: commit.parents
        }));

        const infoParts: string[] = [branch.remote ? 'Remote branch' : 'Local branch'];
        if (branch.upstream) {
            infoParts.push(`Upstream: ${branch.upstream}`);
        }
        const ahead = branch.ahead ?? 0;
        const behind = branch.behind ?? 0;
        if (ahead > 0 || behind > 0) {
            infoParts.push(`Ahead/Behind: ${ahead}/${behind}`);
        }
        const branchInfo = infoParts.join(' | ');

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
        :root {
            color-scheme: var(--vscode-color-scheme);
        }
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            background: var(--vscode-sideBar-background);
            color: var(--vscode-foreground);
        }
        .branch-panel {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            gap: 16px;
        }
        .panel-header h2 {
            margin: 0;
            font-size: 15px;
        }
        .panel-header p {
            margin: 2px 0 0;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .panel-body {
            flex: 1;
            display: flex;
            min-height: 0;
        }
        .commit-list {
            width: 320px;
            border-right: 1px solid var(--vscode-panel-border);
            overflow: auto;
            background: var(--vscode-sideBar-background);
        }
        .commit-empty {
            padding: 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        .commit-item {
            width: 100%;
            border: none;
            background: transparent;
            padding: 10px 16px;
            text-align: left;
            display: flex;
            flex-direction: column;
            gap: 4px;
            cursor: pointer;
            border-bottom: 1px solid var(--vscode-panel-border);
            color: var(--vscode-sideBar-foreground, var(--vscode-foreground));
        }
        .commit-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .commit-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .commit-item.selected .commit-meta {
            color: inherit;
        }
        .commit-hash {
            font-weight: 600;
            font-size: 12px;
        }
        .commit-message {
            font-size: 13px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .commit-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        .commit-refs {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
        }
        .commit-refs span {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 4px;
        }
        .commit-details {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        .details-header {
            padding: 10px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
        }
        .selected-hash {
            font-weight: 600;
            font-size: 14px;
        }
        .selected-meta {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .details-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
        }
        .file-tree {
            flex: 1;
            overflow: auto;
            padding: 12px 16px;
            background: var(--vscode-editor-background);
        }
        .file-empty {
            flex: 1;
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            gap: 8px;
            padding: 16px;
            color: var(--vscode-descriptionForeground);
        }
        .file-empty strong {
            font-size: 14px;
        }
        .tree-folder {
            border: none;
            margin: 0;
            padding: 0;
            color: inherit;
        }
        .tree-folder > summary {
            cursor: pointer;
            padding: 4px 0;
            font-weight: 600;
        }
        .tree-children {
            margin-left: 12px;
            border-left: 1px dashed var(--vscode-panel-border);
            padding-left: 12px;
        }
        .file-item {
            width: 100%;
            border: none;
            background: transparent;
            padding: 4px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            font-size: 13px;
            color: inherit;
        }
        .file-item:hover {
            color: var(--vscode-list-activeSelectionForeground);
        }
        .file-label {
            flex: 1;
            text-align: left;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .status-badge {
            font-size: 10px;
            border-radius: 999px;
            padding: 2px 8px;
            margin-left: 12px;
            text-transform: uppercase;
        }
        .status-added {
            background: rgba(81, 161, 81, 0.2);
            color: #5fb760;
        }
        .status-modified {
            background: rgba(255, 196, 37, 0.2);
            color: #ffca3e;
        }
        .status-deleted {
            background: rgba(255, 84, 84, 0.2);
            color: #ff5a5a;
        }
        .status-renamed, .status-copied {
            background: rgba(86, 156, 214, 0.2);
            color: #56afde;
        }
        .header-actions button {
            border: 1px solid var(--vscode-button-border, transparent);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 4px;
            padding: 6px 14px;
            cursor: pointer;
            font-size: 12px;
        }
        .header-actions button:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .context-menu {
            position: fixed;
            min-width: 240px;
            background: var(--vscode-menu-background, var(--vscode-editor-background));
            border: 1px solid var(--vscode-menu-toggleBorder, var(--vscode-panel-border));
            border-radius: 6px;
            box-shadow: 0 4px 18px rgba(0,0,0,0.3);
            padding: 4px 0;
            z-index: 9999;
        }
        .context-menu.hidden {
            display: none;
        }
        .context-item {
            width: 100%;
            border: none;
            background: transparent;
            text-align: left;
            padding: 6px 16px;
            font-size: 13px;
            color: inherit;
            cursor: pointer;
        }
        .context-item:hover:not(:disabled) {
            background: var(--vscode-list-hoverBackground);
        }
        .context-item:disabled {
            opacity: 0.5;
            cursor: default;
        }
        .context-separator {
            height: 1px;
            background: var(--vscode-panel-border);
            margin: 4px 0;
        }
    </style>
</head>
<body>
    <div class="branch-panel">
        <div class="panel-header">
            <div>
                <h2>${branchDisplayName}</h2>
                <p>${branchInfo || 'Select a commit to inspect its history'}</p>
            </div>
            <div class="header-actions">
                <button id="branchRefresh">Refresh</button>
            </div>
        </div>
        <div class="panel-body">
            <div class="commit-list" id="commitList"></div>
            <div class="commit-details">
                <div class="details-header">
                    <div>
                        <div class="selected-hash" id="selectedHash">尚未选择提交</div>
                        <div class="selected-meta" id="selectedMeta">在左侧选择提交即可查看详情</div>
                    </div>
                    <div class="commit-refs" id="commitRefs"></div>
                </div>
                <div class="details-body">
                    <div class="file-tree" id="fileTree"></div>
                    <div class="file-empty" id="fileEmptyState">
                        <strong>等待选择提交</strong>
                        <span>选择任意提交后将在此处显示文件树。单击文件即可在 VSCode 中打开 Diff 视图。</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div id="contextMenu" class="context-menu hidden"></div>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            const commitList = document.getElementById('commitList');
            const fileTree = document.getElementById('fileTree');
            const fileEmptyState = document.getElementById('fileEmptyState');
            const selectedHash = document.getElementById('selectedHash');
            const selectedMeta = document.getElementById('selectedMeta');
            const commitRefs = document.getElementById('commitRefs');
            const refreshBtn = document.getElementById('branchRefresh');
            const contextMenu = document.getElementById('contextMenu');

            const state = Object.assign({
                commits: ${JSON.stringify(commitData)},
                selected: null,
                fileCache: {},
                pending: new Set()
            }, vscode.getState() || {});

            const commitMap = new Map();
            state.commits.forEach(commit => commitMap.set(commit.hash, commit));

            const menuItems = [
                { id: 'copyHash', label: '复制提交哈希' },
                { id: 'createPatch', label: '创建补丁...' },
                { id: 'cherryPick', label: 'Cherry-pick...' },
                { id: 'checkout', label: '切换到此版本' },
                { id: 'compareLocal', label: '与当前工作区比较' },
                { id: 'resetHere', label: 'Reset 当前分支至此...' },
                { id: 'revert', label: 'Revert 此提交' },
                { separator: true },
                { id: 'branchHere', label: '基于此提交创建分支...' },
                { id: 'tagHere', label: '基于此提交创建 Tag...' },
                { separator: true },
                { id: 'goParent', label: '跳转到父提交', local: true },
                { id: 'goChild', label: '跳转到子提交', local: true }
            ];

            const formatDate = (iso) => {
                try {
                    return new Date(iso).toLocaleString();
                } catch (error) {
                    return iso;
                }
            };

            const persistState = () => {
                vscode.setState({
                    selected: state.selected
                });
            };

            const renderCommits = () => {
                commitList.innerHTML = '';
                if (!Array.isArray(state.commits) || state.commits.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'commit-empty';
                    empty.textContent = '该分支暂无提交记录。';
                    commitList.appendChild(empty);
                    fileEmptyState.style.display = 'flex';
                    fileEmptyState.innerHTML = '<strong>暂无提交</strong><span>当分支包含提交后即可在这里查看文件树。</span>';
                    return;
                }

                state.commits.forEach(commit => {
                    const item = document.createElement('button');
                    item.className = 'commit-item';
                    item.dataset.hash = commit.hash;

                    if (commit.hash === state.selected) {
                        item.classList.add('selected');
                    }

                    const hash = document.createElement('div');
                    hash.className = 'commit-hash';
                    hash.textContent = commit.abbrevHash;
                    item.appendChild(hash);

                    const message = document.createElement('div');
                    message.className = 'commit-message';
                    message.textContent = commit.message;
                    item.appendChild(message);

                    const meta = document.createElement('div');
                    meta.className = 'commit-meta';
                    meta.textContent = commit.author + ' · ' + formatDate(commit.date);
                    item.appendChild(meta);

                    item.addEventListener('click', () => selectCommit(commit));
                    item.addEventListener('contextmenu', (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        showContextMenu(commit, event.pageX, event.pageY);
                    });

                    commitList.appendChild(item);
                });

                if (!state.selected && state.commits.length > 0) {
                    selectCommit(state.commits[0]);
                    return;
                }

                const current = commitMap.get(state.selected);
                if (current) {
                    updateSelection();
                    updateHeader(current);
                    renderFileTree(current);
                }
            };

            const updateSelection = () => {
                commitList.querySelectorAll('.commit-item').forEach(item => {
                    if (item.dataset.hash === state.selected) {
                        item.classList.add('selected');
                        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    } else {
                        item.classList.remove('selected');
                    }
                });
            };

            const selectCommit = (commit) => {
                state.selected = commit.hash;
                persistState();
                updateSelection();
                updateHeader(commit);
                renderFileTree(commit);
            };

            const updateHeader = (commit) => {
                selectedHash.textContent = commit.abbrevHash + ' · ' + commit.message;
                selectedMeta.textContent = commit.author + ' · ' + formatDate(commit.date);
                commitRefs.innerHTML = '';
                if (Array.isArray(commit.refs) && commit.refs.length > 0) {
                    commit.refs.forEach(ref => {
                        const badge = document.createElement('span');
                        badge.textContent = ref;
                        commitRefs.appendChild(badge);
                    });
                }
            };

            const requestFiles = (commit) => {
                if (state.pending.has(commit.hash)) {
                    return;
                }
                state.pending.add(commit.hash);
                fileEmptyState.style.display = 'flex';
                fileEmptyState.innerHTML = '<strong>正在加载提交文件...</strong><span>请稍候。</span>';
                vscode.postMessage({
                    type: 'requestCommitFiles',
                    payload: { hash: commit.hash }
                });
            };

            const renderFileTree = (commit) => {
                if (!commit) {
                    return;
                }
                const files = state.fileCache[commit.hash];
                if (!files) {
                    fileTree.innerHTML = '';
                    requestFiles(commit);
                    return;
                }

                if (Array.isArray(files) && files.length === 0) {
                    fileTree.innerHTML = '';
                    fileEmptyState.style.display = 'flex';
                    fileEmptyState.innerHTML = '<strong>此提交未修改任何文件</strong><span>您可以换一个提交继续查看。</span>';
                    return;
                }

                fileEmptyState.style.display = 'none';
                fileTree.innerHTML = '';

                const tree = buildTree(files);
                renderTreeNodes(tree, fileTree, commit);
            };

            const buildTree = (files) => {
                const root = [];
                files.forEach(change => {
                    const normalized = (change.path || '').replace(/\\\\/g, '/');
                    const segments = normalized.split('/').filter(Boolean);
                    let level = root;
                    segments.forEach((segment, index) => {
                        if (index === segments.length - 1) {
                            level.push({
                                type: 'file',
                                name: segment,
                                change
                            });
                            return;
                        }
                        let folder = level.find(item => item.type === 'folder' && item.name === segment);
                        if (!folder) {
                            folder = { type: 'folder', name: segment, children: [] };
                            level.push(folder);
                        }
                        level = folder.children;
                    });
                });
                return root;
            };

            const renderTreeNodes = (nodes, container, commit, depth = 0) => {
                const sorted = nodes.slice().sort((a, b) => {
                    if (a.type === b.type) {
                        return a.name.localeCompare(b.name);
                    }
                    return a.type === 'folder' ? -1 : 1;
                });

                sorted.forEach(node => {
                    if (node.type === 'folder') {
                        const details = document.createElement('details');
                        details.className = 'tree-folder';
                        if (depth < 2) {
                            details.open = true;
                        }
                        const summary = document.createElement('summary');
                        summary.textContent = node.name;
                        details.appendChild(summary);
                        const childContainer = document.createElement('div');
                        childContainer.className = 'tree-children';
                        details.appendChild(childContainer);
                        container.appendChild(details);
                        renderTreeNodes(node.children, childContainer, commit, depth + 1);
                    } else {
                        const button = document.createElement('button');
                        button.className = 'file-item';
                        const label = document.createElement('span');
                        label.className = 'file-label';
                        label.textContent = node.name;
                        button.appendChild(label);
                        const badge = new DocumentFragment();
                        const span = document.createElement('span');
                        const statusClass = mapStatusClass(node.change.status);
                        span.className = 'status-badge ' + statusClass;
                        span.textContent = mapStatusLabel(node.change.status);
                        badge.appendChild(span);
                        button.appendChild(badge);
                        button.addEventListener('click', () => openFileDiff(node.change, commit));
                        container.appendChild(button);
                    }
                });
            };

            const mapStatusClass = (status = '') => {
                const code = status.charAt(0);
                switch (code) {
                    case 'A': return 'status-added';
                    case 'D': return 'status-deleted';
                    case 'R': return 'status-renamed';
                    case 'C': return 'status-copied';
                    default: return 'status-modified';
                }
            };

            const mapStatusLabel = (status = '') => {
                const code = status.charAt(0);
                switch (code) {
                    case 'A': return '新增';
                    case 'D': return '删除';
                    case 'R': return '重命名';
                    case 'C': return '复制';
                    default: return '修改';
                }
            };

            const openFileDiff = (change, commit) => {
                vscode.postMessage({
                    type: 'openCommitFileDiff',
                    payload: {
                        hash: commit.hash,
                        parentHash: Array.isArray(commit.parents) ? commit.parents[0] : undefined,
                        change
                    }
                });
            };

            const findChildCommit = (hash) => {
                return state.commits.find(item => Array.isArray(item.parents) && item.parents.includes(hash));
            };

            const showContextMenu = (commit, x, y) => {
                contextMenu.innerHTML = '';

                const parentAvailable = Array.isArray(commit.parents) && commit.parents.length > 0;
                const childCommit = findChildCommit(commit.hash);

                menuItems.forEach(item => {
                    if (item.separator) {
                        const separator = document.createElement('div');
                        separator.className = 'context-separator';
                        contextMenu.appendChild(separator);
                        return;
                    }
                    const button = document.createElement('button');
                    button.className = 'context-item';
                    button.textContent = item.label;

                    const disabled =
                        (item.id === 'goParent' && !parentAvailable) ||
                        (item.id === 'goChild' && !childCommit);

                    if (disabled) {
                        button.disabled = true;
                    }

                    button.addEventListener('click', () => {
                        hideContextMenu();
                        if (item.local) {
                            if (item.id === 'goParent' && parentAvailable) {
                                const target = commitMap.get(commit.parents[0]);
                                if (target) {
                                    selectCommit(target);
                                }
                            }
                            if (item.id === 'goChild' && childCommit) {
                                selectCommit(childCommit);
                            }
                            return;
                        }
                        vscode.postMessage({
                            type: 'commitAction',
                            payload: { action: item.id, commit }
                        });
                    });

                    contextMenu.appendChild(button);
                });

                contextMenu.classList.remove('hidden');
                contextMenu.style.display = 'block';
                contextMenu.style.left = x + 'px';
                contextMenu.style.top = y + 'px';

                const rect = contextMenu.getBoundingClientRect();
                const overflowX = rect.right - window.innerWidth;
                const overflowY = rect.bottom - window.innerHeight;
                if (overflowX > 0) {
                    contextMenu.style.left = Math.max(0, x - overflowX - 8) + 'px';
                }
                if (overflowY > 0) {
                    contextMenu.style.top = Math.max(0, y - overflowY - 8) + 'px';
                }
            };

            const hideContextMenu = () => {
                contextMenu.classList.add('hidden');
                contextMenu.style.display = 'none';
            };

            document.addEventListener('click', hideContextMenu);
            document.addEventListener('contextmenu', (event) => {
                if (!event.target.closest('.commit-item')) {
                    hideContextMenu();
                }
            });
            document.addEventListener('scroll', hideContextMenu, true);
            window.addEventListener('blur', hideContextMenu);

            window.addEventListener('message', event => {
                const message = event.data;
                if (!message || typeof message.type !== 'string') {
                    return;
                }

                if (message.type === 'commitFiles' && message.payload) {
                    state.pending.delete(message.payload.hash);
                    if (message.payload.error && message.payload.hash === state.selected) {
                        fileTree.innerHTML = '';
                        fileEmptyState.style.display = 'flex';
                        fileEmptyState.innerHTML = '<strong>无法加载提交文件</strong><span>' + message.payload.error + '</span>';
                        return;
                    }
                    state.fileCache[message.payload.hash] = message.payload.files || [];
                    if (message.payload.hash === state.selected) {
                        const commit = commitMap.get(state.selected);
                        if (commit) {
                            renderFileTree(commit);
                        }
                    }
                }
            });

            refreshBtn.addEventListener('click', () => {
                vscode.postMessage({ type: 'refreshBranch' });
            });

            renderCommits();
        })();
    </script>
</body>
</html>`;
    }
    private getDisplayBranchName(branch: GitBranch): string {
        if (!branch.remote) {
            return branch.name;
        }
        return branch.name.replace(/^remotes\//, '');
    }

    private getNonce(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 32; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }
}

