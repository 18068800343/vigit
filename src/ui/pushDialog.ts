import * as vscode from 'vscode';
import * as path from 'path';
import { BranchesProvider } from '../providers/branchesProvider';
import { GitBranch, GitDiffEntry, GitService } from '../services/gitService';

interface RemoteOption {
    name: string;
    fetch?: string;
    push?: string;
}

interface PushSummaryPayload {
    commits: Array<{
        hash: string;
        abbrevHash: string;
        author: string;
        message: string;
        date: string;
    }>;
    files: GitDiffEntry[];
    error?: string;
}

interface PushDialogState {
    branchName: string;
    repositoryLabel: string;
    remote?: string;
    remoteBranch?: string;
    remotes: RemoteOption[];
    summary: PushSummaryPayload;
}

interface PushMessage {
    type: 'refreshSummary' | 'performPush' | 'dismiss';
    payload?: any;
}

interface SummaryMessagePayload {
    remote?: string;
    remoteBranch?: string;
    summary: PushSummaryPayload;
}

export class PushDialog implements vscode.Disposable {
    private panel?: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private currentBranch?: GitBranch;
    private currentRemote?: string;
    private currentRemoteBranch?: string;

    constructor(
        private readonly gitService: GitService,
        private readonly branchesProvider: BranchesProvider
    ) {}

    dispose(): void {
        this.disposePanel();
    }

    async show(branch: GitBranch): Promise<void> {
        this.currentBranch = branch;
        const panel = this.ensurePanel();

        const remotes = await this.gitService.getRemotes();
        const remoteOptions = remotes.map(remote => ({
            name: remote.name,
            fetch: remote.refs.fetch ?? undefined,
            push: remote.refs.push ?? undefined
        }));
        const defaults = this.resolveDefaultTarget(branch, remoteOptions);

        this.currentRemote = defaults.remote;
        this.currentRemoteBranch = defaults.remoteBranch;

        const summary = await this.buildSummary(branch, defaults.remote, defaults.remoteBranch);
        const repositoryLabel = path.basename(this.gitService.getWorkspaceRoot());
        const state: PushDialogState = {
            branchName: this.getDisplayBranchName(branch),
            repositoryLabel,
            remote: defaults.remote,
            remoteBranch: defaults.remoteBranch,
            remotes: remoteOptions,
            summary
        };

        panel.title = `Push · ${this.getDisplayBranchName(branch)}`;
        panel.webview.html = this.getHtml(panel.webview, state);
    }

    private ensurePanel(): vscode.WebviewPanel {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Active, false);
            return this.panel;
        }

        this.panel = vscode.window.createWebviewPanel(
            'vigit.pushDialog',
            'Push Commits',
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: false
            }
        );

        this.panel.onDidDispose(() => this.disposePanel());
        this.disposables.push(
            this.panel.webview.onDidReceiveMessage(message => {
                void this.handleMessage(message as PushMessage);
            })
        );

        return this.panel;
    }

    private disposePanel(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.panel = undefined;
    }

    private async handleMessage(message: PushMessage): Promise<void> {
        if (!message || typeof message.type !== 'string') {
            return;
        }

        switch (message.type) {
            case 'refreshSummary':
                await this.sendSummary(message.payload?.remote, message.payload?.remoteBranch);
                break;
            case 'performPush':
                await this.performPush(message.payload);
                break;
            case 'dismiss':
                this.panel?.dispose();
                break;
        }
    }

    private async sendSummary(remote?: string, remoteBranch?: string): Promise<void> {
        if (!this.panel || !this.currentBranch) {
            return;
        }

        this.currentRemote = remote;
        this.currentRemoteBranch = remoteBranch;
        const summary = await this.buildSummary(this.currentBranch, remote, remoteBranch);

        const payload: SummaryMessagePayload = {
            remote,
            remoteBranch,
            summary
        };

        this.panel.webview.postMessage({
            type: 'summary',
            payload
        });
    }

    private async performPush(payload: any): Promise<void> {
        if (!this.currentBranch) {
            return;
        }

        const remote = (payload?.remote || this.currentRemote || 'origin').trim();
        const remoteBranch =
            (payload?.remoteBranch || this.currentRemoteBranch || this.currentBranch.name).trim();

        if (!remote || !remoteBranch) {
            vscode.window.showWarningMessage('Remote and target branch are required to push.');
            this.postPushResult(false, 'Remote or target branch missing.');
            return;
        }

        const branchSpec =
            remoteBranch === this.currentBranch.name
                ? this.currentBranch.name
                : `${this.currentBranch.name}:${remoteBranch}`;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Pushing ${this.currentBranch.name} → ${remote}/${remoteBranch}`,
                cancellable: false
            }, async () => {
                await this.gitService.push(remote, branchSpec);
                if (payload?.pushTags === 'all') {
                    await this.gitService.pushTags(remote);
                }
            });

            await this.branchesProvider.refresh();
            vscode.window.showInformationMessage(`Pushed ${this.currentBranch.name} to ${remote}/${remoteBranch}.`);
            this.postPushResult(true);
            this.panel?.dispose();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Push failed: ${message}`);
            this.postPushResult(false, message);
        }
    }

    private postPushResult(success: boolean, message?: string): void {
        if (!this.panel) {
            return;
        }
        this.panel.webview.postMessage({
            type: 'pushResult',
            payload: { success, message }
        });
    }

    private resolveDefaultTarget(branch: GitBranch, remotes: RemoteOption[]): { remote?: string; remoteBranch?: string } {
        if (branch.upstream) {
            const [remote, ...rest] = branch.upstream.split('/');
            return {
                remote: remote || remotes[0]?.name,
                remoteBranch: rest.length > 0 ? rest.join('/') : branch.name
            };
        }
        return {
            remote: remotes[0]?.name,
            remoteBranch: branch.name
        };
    }

    private async buildSummary(branch: GitBranch, remote?: string, remoteBranch?: string): Promise<PushSummaryPayload> {
        if (!remote || !remoteBranch) {
            return {
                commits: [],
                files: [],
                error: 'Select a remote and target branch to preview outgoing commits.'
            };
        }

        const remoteRef = `${remote}/${remoteBranch}`;

        try {
            const commits = await this.gitService.getCommitsBetween(remoteRef, branch.name, 200);
            const files = await this.gitService.getDiffSummaryBetween(remoteRef, branch.name);
            return {
                commits: commits.map(commit => ({
                    hash: commit.hash,
                    abbrevHash: commit.abbrevHash,
                    author: commit.author,
                    message: commit.message,
                    date: commit.date.toISOString()
                })),
                files,
                error: undefined
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                commits: [],
                files: [],
                error: message
            };
        }
    }

    private getHtml(webview: vscode.Webview, state: PushDialogState): string {
        const nonce = this.getNonce();
        const serializedState = this.serializeState(state);
        const cspSource = webview.cspSource;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            margin: 0;
            padding: 0;
            background: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
            height: 100vh;
        }
        header {
            padding: 16px 24px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-sideBar-background);
        }
        header h1 {
            margin: 0;
            font-size: 16px;
        }
        header p {
            margin: 4px 0 0 0;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        main {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1px;
            background: var(--vscode-panel-border);
            overflow: hidden;
        }
        section {
            background: var(--vscode-editor-background);
            display: flex;
            flex-direction: column;
        }
        .section-header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-weight: 600;
        }
        .controls {
            display: flex;
            padding: 12px 16px;
            gap: 12px;
            flex-wrap: wrap;
            align-items: center;
        }
        label {
            display: flex;
            flex-direction: column;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        select, input {
            margin-top: 4px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 3px;
        }
        .list {
            flex: 1;
            overflow: auto;
        }
        .list-item {
            padding: 10px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .list-item:last-child {
            border-bottom: none;
        }
        .commit-title {
            font-weight: 600;
            margin-bottom: 4px;
        }
        .commit-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
        .file-entry {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            align-items: center;
        }
        .status-badge {
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 999px;
            background: var(--vscode-editorInfo-foreground);
            color: var(--vscode-editor-background);
            text-transform: uppercase;
            min-width: 32px;
            text-align: center;
        }
        footer {
            border-top: 1px solid var(--vscode-panel-border);
            padding: 12px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--vscode-sideBar-background);
        }
        .footer-actions {
            display: flex;
            gap: 8px;
        }
        button {
            border: none;
            border-radius: 3px;
            padding: 6px 16px;
            cursor: pointer;
            font-size: 13px;
        }
        button.primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        button.secondary {
            background: transparent;
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-panel-border);
        }
        .empty-state {
            padding: 24px;
            color: var(--vscode-descriptionForeground);
        }
        .error-banner {
            padding: 10px 16px;
            margin: 0 16px 12px 16px;
            border-radius: 4px;
            background: rgba(255, 0, 0, 0.15);
            color: var(--vscode-errorForeground);
        }
    </style>
</head>
<body>
    <header>
        <h1>Push Commits to ${state.repositoryLabel}</h1>
        <p>${state.branchName} → <span id="targetLabel">${state.remote ?? '(no remote)'}${state.remoteBranch ? '/' + state.remoteBranch : ''}</span></p>
    </header>
    <main>
        <section>
            <div class="section-header">Commits</div>
            <div class="controls">
                <label>
                    Remote
                    <select id="remoteSelect"></select>
                </label>
                <label style="flex:1;">
                    Remote Branch
                    <input id="remoteBranchInput" type="text" />
                </label>
                <button id="reloadBtn" class="secondary">Reload</button>
            </div>
            <div id="commitError" class="error-banner" style="display:none;"></div>
            <div class="list" id="commitList"></div>
        </section>
        <section>
            <div class="section-header">Files</div>
            <div class="list" id="fileList"></div>
        </section>
    </main>
    <footer>
        <label>
            Push tags
            <select id="tagsSelect">
                <option value="none">None</option>
                <option value="all">All</option>
            </select>
        </label>
        <div class="footer-actions">
            <button id="cancelBtn" class="secondary">Cancel</button>
            <button id="pushBtn" class="primary">Push</button>
        </div>
    </footer>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const state = ${serializedState};

        const remoteSelect = document.getElementById('remoteSelect');
        const remoteBranchInput = document.getElementById('remoteBranchInput');
        const commitList = document.getElementById('commitList');
        const fileList = document.getElementById('fileList');
        const pushBtn = document.getElementById('pushBtn');
        const cancelBtn = document.getElementById('cancelBtn');
        const tagsSelect = document.getElementById('tagsSelect');
        const reloadBtn = document.getElementById('reloadBtn');
        const commitError = document.getElementById('commitError');
        const targetLabel = document.getElementById('targetLabel');

        const renderRemoteOptions = () => {
            remoteSelect.innerHTML = '';
            state.remotes.forEach(remote => {
                const option = document.createElement('option');
                option.value = remote.name;
                option.textContent = remote.name;
                remoteSelect.appendChild(option);
            });
            if (state.remote) {
                remoteSelect.value = state.remote;
            }
            remoteBranchInput.value = state.remoteBranch || '';
        };

        const renderCommits = () => {
            commitList.innerHTML = '';
            commitError.style.display = 'none';

            if (state.summary.error) {
                commitError.textContent = state.summary.error;
                commitError.style.display = 'block';
                return;
            }

            if (!state.summary.commits.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-state';
                empty.textContent = 'No outgoing commits for the selected remote.';
                commitList.appendChild(empty);
                return;
            }

            state.summary.commits.forEach(commit => {
                const item = document.createElement('div');
                item.className = 'list-item';

                const title = document.createElement('div');
                title.className = 'commit-title';
                title.textContent = commit.message;
                item.appendChild(title);

                const meta = document.createElement('div');
                meta.className = 'commit-meta';
                const date = new Date(commit.date);
                meta.textContent = \`\${commit.abbrevHash} · \${commit.author} · \${date.toLocaleString()}\`;
                item.appendChild(meta);

                commitList.appendChild(item);
            });
        };

        const renderFiles = () => {
            fileList.innerHTML = '';
            if (!state.summary.files.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-state';
                empty.textContent = 'No file changes to display.';
                fileList.appendChild(empty);
                return;
            }

            state.summary.files.forEach(file => {
                const item = document.createElement('div');
                item.className = 'list-item file-entry';

                const path = document.createElement('div');
                path.textContent = file.path;
                item.appendChild(path);

                const status = document.createElement('div');
                status.className = 'status-badge';
                status.textContent = file.status;
                item.appendChild(status);

                fileList.appendChild(item);
            });
        };

        const requestSummary = () => {
            const remote = remoteSelect.value;
            const remoteBranch = remoteBranchInput.value.trim();
            state.remote = remote;
            state.remoteBranch = remoteBranch;
            targetLabel.textContent = remote
                ? \`\${remote}\${remoteBranch ? '/' + remoteBranch : ''}\`
                : '(no remote)';

            vscode.postMessage({
                type: 'refreshSummary',
                payload: {
                    remote,
                    remoteBranch
                }
            });
        };

        const debounce = (fn, timeout = 350) => {
            let timer;
            return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(null, args), timeout);
            };
        };

        remoteSelect.addEventListener('change', () => requestSummary());
        remoteBranchInput.addEventListener('input', debounce(() => requestSummary(), 400));
        reloadBtn.addEventListener('click', () => requestSummary());

        pushBtn.addEventListener('click', () => {
            pushBtn.disabled = true;
            pushBtn.textContent = 'Pushing...';
            vscode.postMessage({
                type: 'performPush',
                payload: {
                    remote: remoteSelect.value,
                    remoteBranch: remoteBranchInput.value.trim(),
                    pushTags: tagsSelect.value
                }
            });
        });

        cancelBtn.addEventListener('click', () => vscode.postMessage({ type: 'dismiss' }));

        window.addEventListener('message', event => {
            const message = event.data;
            if (!message) {
                return;
            }

            if (message.type === 'summary' && message.payload) {
                if (typeof message.payload.remote === 'string') {
                    state.remote = message.payload.remote;
                    remoteSelect.value = message.payload.remote;
                }
                if (typeof message.payload.remoteBranch === 'string') {
                    state.remoteBranch = message.payload.remoteBranch;
                    remoteBranchInput.value = message.payload.remoteBranch;
                }
                state.summary = message.payload.summary;
                renderCommits();
                renderFiles();
            }

            if (message.type === 'pushResult') {
                pushBtn.disabled = false;
                pushBtn.textContent = 'Push';
                if (!message.payload?.success && message.payload?.message) {
                    commitError.textContent = message.payload.message;
                    commitError.style.display = 'block';
                }
            }
        });

        renderRemoteOptions();
        renderCommits();
        renderFiles();
    </script>
</body>
</html>`;
    }

    private serializeState(value: any): string {
        return JSON.stringify(value).replace(/</g, '\\u003c');
    }

    private getDisplayBranchName(branch: GitBranch): string {
        return branch.remote ? branch.name.replace(/^remotes\//, '') : branch.name;
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
