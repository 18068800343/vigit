import * as vscode from 'vscode';
import { GitBranch, GitCommit, GitService } from '../services/gitService';

interface BranchCommitSummary {
    hash: string;
    abbrevHash: string;
    message: string;
    author: string;
    date: string;
    refs: string[];
}

export class BranchDetailsPanel implements vscode.Disposable {
    private panel?: vscode.WebviewPanel;
    private panelDisposables: vscode.Disposable[] = [];
    private currentBranch?: GitBranch;
    private readonly maxCommits = 200;

    constructor(
        private readonly gitService: GitService
    ) {}

    dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
        this.disposePanel();
    }

    async show(branch: GitBranch): Promise<void> {
        this.currentBranch = branch;
        await this.ensurePanel();
        await this.render(branch);
        this.panel?.reveal(vscode.ViewColumn.Beside, true);
    }

    private async ensurePanel(): Promise<void> {
        if (this.panel) {
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'vigit.branchDetails',
            'Branch Details',
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panelDisposables.push(
            this.panel.onDidDispose(() => this.disposePanel()),
            this.panel.webview.onDidReceiveMessage(message => {
                void this.handleMessage(message);
            })
        );
    }

    private disposePanel(): void {
        this.panelDisposables.forEach(d => d.dispose());
        this.panelDisposables = [];
        this.panel = undefined;
    }

    private async render(branch: GitBranch): Promise<void> {
        if (!this.panel) {
            return;
        }

        try {
            const commits = await this.gitService.getBranchLog(branch.name, this.maxCommits);
            if (!this.panel) {
                return;
            }
            const displayName = this.getDisplayBranchName(branch);
            this.panel.title = `Branch: ${displayName}`;
            this.panel.webview.html = this.getHtmlForWebview(
                this.panel.webview,
                branch,
                commits,
                displayName
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (this.panel) {
                this.panel.webview.html = `<div style="padding:16px;font-family: var(--vscode-font-family);">${message}</div>`;
            }
        }
    }

    private async handleMessage(message: any): Promise<void> {
        if (!message || typeof message.type !== 'string') {
            return;
        }

        switch (message.type) {
            case 'requestDiff':
                await this.handleDiffRequest(message.payload?.hash);
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

    private async handleDiffRequest(hash?: string): Promise<void> {
        if (!hash || !this.panel) {
            return;
        }

        try {
            const diff = await this.gitService.getCommitDiff(hash);
            if (!this.panel) {
                return;
            }
            await this.panel.webview.postMessage({
                type: 'commitDiff',
                payload: {
                    hash,
                    diff
                }
            });
        } catch (error) {
            if (!this.panel) {
                return;
            }
            const message = error instanceof Error ? error.message : String(error);
            await this.panel.webview.postMessage({
                type: 'commitDiff',
                payload: {
                    hash,
                    error: message
                }
            });
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
            refs: commit.refs
        }));

        const branchInfo = branch.remote ? 'Remote branch' : 'Local branch';

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
            height: 100vh;
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
        }
        .commit-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .commit-item.selected {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
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
        .diff-viewer {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        .diff-header {
            padding: 10px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 13px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
        }
        .diff-content {
            flex: 1;
            margin: 0;
            padding: 12px 16px;
            background: var(--vscode-editor-background);
            overflow: auto;
            font-family: var(--vscode-editor-font-family, Consolas, 'Courier New', monospace);
            font-size: 12px;
            line-height: 1.4;
            white-space: pre-wrap;
        }
        .empty-state {
            display: none;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 24px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            gap: 8px;
            font-size: 13px;
        }
        .header-actions button {
            border: 1px solid var(--vscode-button-border, transparent);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 4px;
            padding: 6px 14px;
            cursor: pointer;
        }
        .header-actions button:hover {
            filter: brightness(1.1);
        }
    </style>
</head>
<body>
    <div class="branch-panel">
        <div class="panel-header">
            <div>
                <h2>${branchDisplayName}</h2>
                <p>${branchInfo}</p>
            </div>
            <div class="header-actions">
                <button id="branchRefresh">Refresh</button>
            </div>
        </div>
        <div class="panel-body">
            <div class="commit-list" id="commitList"></div>
            <div class="diff-viewer">
                <div class="diff-header">
                    <span id="diffHeader">Select a commit to view its diff</span>
                </div>
                <pre class="diff-content" id="diffContent"></pre>
            </div>
        </div>
        <div class="empty-state" id="emptyState">
            <strong>No commits found for this branch.</strong>
            <span>Try fetching or refreshing the repository.</span>
        </div>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            const commitList = document.getElementById('commitList');
            const diffHeader = document.getElementById('diffHeader');
            const diffContent = document.getElementById('diffContent');
            const emptyState = document.getElementById('emptyState');
            const refreshBtn = document.getElementById('branchRefresh');

            const state = {
                commits: ${JSON.stringify(commitData)},
                selected: null
            };

            const formatDate = (iso) => {
                try {
                    return new Date(iso).toLocaleString();
                } catch (error) {
                    return iso;
                }
            };

            const renderCommits = () => {
                commitList.innerHTML = '';
                if (!Array.isArray(state.commits) || state.commits.length === 0) {
                    emptyState.style.display = 'flex';
                    diffHeader.textContent = 'No commits to display';
                    diffContent.textContent = '';
                    return;
                }

                emptyState.style.display = 'none';
                state.commits.forEach(commit => {
                    const item = document.createElement('button');
                    item.className = 'commit-item';
                    if (commit.hash === state.selected) {
                        item.classList.add('selected');
                    }
                    item.dataset.hash = commit.hash;

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
                    commitList.appendChild(item);
                });

                if (!state.selected && state.commits.length > 0) {
                    selectCommit(state.commits[0]);
                }
            };

            const selectCommit = commit => {
                state.selected = commit.hash;
                diffHeader.textContent = commit.abbrevHash + ' · ' + commit.message;
                diffContent.textContent = 'Loading diff...';
                updateSelection();

                vscode.postMessage({
                    type: 'requestDiff',
                    payload: { hash: commit.hash }
                });
            };

            const updateSelection = () => {
                const items = commitList.querySelectorAll('.commit-item');
                items.forEach(item => {
                    if (item.dataset.hash === state.selected) {
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                });
            };

            window.addEventListener('message', event => {
                const message = event.data;
                if (!message || typeof message.type !== 'string') {
                    return;
                }

                if (message.type === 'commitDiff' && message.payload) {
                    if (message.payload.hash === state.selected) {
                        diffContent.textContent = message.payload.error
                            ? message.payload.error
                            : (message.payload.diff || 'No differences');
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
