import * as vscode from 'vscode';
import * as path from 'path';
import { GitService, GitStatus } from '../services/gitService';
import { ChangelistManager, Changelist } from '../managers/changelistManager';
import { LocalChangesProvider } from '../providers/localChangesProvider';
import { CommitDialog } from './commitDialog';

interface CommitPanelFileItem {
    id: string;
    absolutePath: string;
    relativePath: string;
    fileName: string;
    directory: string;
    statusCode: string;
    statusLabel: string;
    staged: boolean;
    changelistName?: string;
    inActiveChangelist?: boolean;
    renamedFrom?: string;
}

interface CommitPanelGroup {
    id: string;
    label: string;
    description?: string;
    active?: boolean;
    files: CommitPanelFileItem[];
}

interface CommitPanelStatePayload {
    files: CommitPanelFileItem[];
    groups: CommitPanelGroup[];
    changelist?: { id: string; name: string; count: number };
    history: string[];
    lastCommitMessage: string;
    busy: boolean;
}

interface CommitRequestPayload {
    files: string[];
    message: string;
    andPush?: boolean;
    amend?: boolean;
}

export class CommitPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewId = 'vigit.commitPanel';

    private view?: vscode.WebviewView;
    private isBusy = false;
    private readonly disposables: vscode.Disposable[] = [];
    private lastCommitMessage = '';
    private lastCommitMessageFetchedAt = 0;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly gitService: GitService,
        private readonly changelistManager: ChangelistManager,
        private readonly localChangesProvider: LocalChangesProvider,
        private readonly commitDialog: CommitDialog
    ) {
        this.disposables.push(
            this.localChangesProvider.onDidChangeTreeData(() => {
                void this.postState();
            })
        );
    }

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
        this.disposables.push(
            webviewView.webview.onDidReceiveMessage(message => {
                void this.handleMessage(message);
            })
        );
        this.disposables.push(
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible) {
                    void this.refreshAndPostState(true);
                }
            })
        );
        void this.refreshAndPostState(true);
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }

    private async handleMessage(message: any): Promise<void> {
        if (!message || typeof message.type !== 'string') {
            return;
        }

        switch (message.type) {
            case 'commit':
                await this.handleCommitRequest(message.payload as CommitRequestPayload);
                break;
            case 'refresh':
                await this.refreshAndPostState(true);
                break;
            case 'openDiff':
                if (message.payload?.file) {
                    void vscode.commands.executeCommand('vigit.showDiff', message.payload.file, false);
                }
                break;
            case 'openFile':
                if (message.payload?.file) {
                    await this.openFile(message.payload.file);
                }
                break;
            default:
                break;
        }
    }

    private async openFile(filePath: string): Promise<void> {
        try {
            const document = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(document, { preview: false });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Unable to open file: ${errorMessage}`);
        }
    }

    private async handleCommitRequest(payload: CommitRequestPayload | undefined): Promise<void> {
        if (!payload || this.isBusy) {
            return;
        }
        const files = Array.isArray(payload.files) ? payload.files : [];
        if (files.length === 0) {
            vscode.window.showWarningMessage('Select at least one file to commit');
            return;
        }

        this.setBusy(true);
        try {
            await this.commitDialog.commitFromPanel({
                files,
                message: payload.message,
                andPush: payload.andPush,
                amend: payload.amend
            });
            this.view?.webview.postMessage({ type: 'committed' });
        } finally {
            this.setBusy(false);
            await this.postState();
        }
    }

    private setBusy(value: boolean): void {
        this.isBusy = value;
        this.view?.webview.postMessage({ type: 'busy', payload: value });
    }

    private async refreshAndPostState(forceRefresh = false): Promise<void> {
        if (forceRefresh || !this.localChangesProvider.getGitStatus()) {
            await this.localChangesProvider.refresh();
        }
        await this.postState();
    }

    private async postState(): Promise<void> {
        if (!this.view) {
            return;
        }

        const gitStatus = this.localChangesProvider.getGitStatus() ?? await this.gitService.getStatus();
        const activeChangelist = this.changelistManager.getActiveChangelist();
        const files = this.buildFileItems(gitStatus, activeChangelist?.id);
        const groups = this.buildGroups(gitStatus, files);
        const history = this.commitDialog.getCommitHistoryEntries();
        const lastCommitMessage = await this.getLastCommitMessage();

        const payload: CommitPanelStatePayload = {
            files,
            groups,
            changelist: activeChangelist
                ? {
                      id: activeChangelist.id,
                      name: activeChangelist.name,
                      count: activeChangelist.files.length
                  }
                : undefined,
            history,
            lastCommitMessage,
            busy: this.isBusy
        };

        this.view.webview.postMessage({
            type: 'state',
            payload
        });
    }

    private buildFileItems(status: GitStatus | null, activeChangelistId?: string): CommitPanelFileItem[] {
        const workspaceRoot = this.gitService.getWorkspaceRoot();
        const items = new Map<string, CommitPanelFileItem>();

        const ensureItem = (absolutePath: string, relativePath: string): CommitPanelFileItem => {
            const existing = items.get(absolutePath);
            if (existing) {
                return existing;
            }

            const normalized = this.normalize(relativePath);
            const fileName = path.basename(normalized);
            const directory = this.getDirectoryLabel(normalized);
            const item: CommitPanelFileItem = {
                id: normalized,
                absolutePath,
                relativePath: normalized,
                fileName,
                directory,
                statusCode: 'M',
                statusLabel: 'Modified',
                staged: false
            };
            items.set(absolutePath, item);
            return item;
        };

        if (status) {
            const addByStatus = (relativePath: string, code: string, label: string, extra?: Partial<CommitPanelFileItem>) => {
                const normalized = this.normalize(relativePath);
                const absolutePath = path.join(workspaceRoot, normalized);
                const item = ensureItem(absolutePath, normalized);
                item.statusCode = code;
                item.statusLabel = label;
                Object.assign(item, extra);
            };

            status.modified.forEach(rel => addByStatus(rel, 'M', 'Modified'));
            status.deleted.forEach(rel => addByStatus(rel, 'D', 'Deleted'));
            status.untracked.forEach(rel => addByStatus(rel, 'U', 'Untracked'));
            status.renamed.forEach(entry =>
                addByStatus(entry.to, 'R', 'Renamed', { renamedFrom: this.normalize(entry.from) })
            );
            status.staged.forEach(rel => {
                const normalized = this.normalize(rel);
                const absolutePath = path.join(workspaceRoot, normalized);
                const item = ensureItem(absolutePath, normalized);
                item.staged = true;
            });
        }

        const changelists = this.changelistManager.getChangelists();
        for (const changelist of changelists) {
            for (const file of changelist.files) {
                const relative = this.normalize(path.relative(workspaceRoot, file));
                const item = ensureItem(file, relative);
                item.changelistName = changelist.name;
                item.inActiveChangelist = changelist.id === activeChangelistId;
            }
        }

        return Array.from(items.values()).sort((a, b) => {
            if (a.inActiveChangelist !== b.inActiveChangelist) {
                return a.inActiveChangelist ? -1 : 1;
            }
            if (a.changelistName !== b.changelistName) {
                if (!a.changelistName) {
                    return 1;
                }
                if (!b.changelistName) {
                    return -1;
                }
                return a.changelistName.localeCompare(b.changelistName);
            }
            return a.relativePath.localeCompare(b.relativePath);
        });
    }

    private buildGroups(status: GitStatus | null, fileItems: CommitPanelFileItem[]): CommitPanelGroup[] {
        const workspaceRoot = this.gitService.getWorkspaceRoot();
        const fileLookup = new Map(fileItems.map(item => [item.absolutePath, item]));
        const groupedPaths = new Set<string>();
        const groups: CommitPanelGroup[] = [];

        const pushGroup = (group: CommitPanelGroup) => {
            if (!group.files || group.files.length === 0) {
                return;
            }
            group.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
            group.files.forEach(file => groupedPaths.add(file.absolutePath));
            groups.push(group);
        };

        const changelists = this.changelistManager.getChangelists();
        for (const changelist of changelists) {
            const files = changelist.files
                .map(file => fileLookup.get(file))
                .filter((item): item is CommitPanelFileItem => Boolean(item));

            pushGroup({
                id: `changelist:${changelist.id}`,
                label: this.formatChangelistLabel(changelist),
                description: this.describeFileCount(files.length),
                active: changelist.active,
                files
            });
        }

        const config = vscode.workspace.getConfiguration('vigit');
        const showUnversioned = config.get<boolean>('showUnversionedFiles', true);
        if (showUnversioned && status?.untracked?.length) {
            const untrackedFiles: CommitPanelFileItem[] = [];
            for (const relative of status.untracked) {
                const absolute = path.join(workspaceRoot, this.normalize(relative));
                const item = fileLookup.get(absolute);
                if (item && !groupedPaths.has(item.absolutePath)) {
                    untrackedFiles.push(item);
                }
            }

            pushGroup({
                id: 'category:unversioned',
                label: `Unversioned Files [${untrackedFiles.length}]`,
                description: this.describeFileCount(untrackedFiles.length),
                active: false,
                files: untrackedFiles
            });
        }

        const remaining = fileItems.filter(item => !groupedPaths.has(item.absolutePath));
        if (remaining.length > 0) {
            pushGroup({
                id: 'category:other',
                label: 'Other Changes',
                description: this.describeFileCount(remaining.length),
                active: false,
                files: remaining
            });
        }

        return groups;
    }

    private describeFileCount(count: number): string | undefined {
        if (count <= 0) {
            return undefined;
        }
        return `${count} file${count === 1 ? '' : 's'}`;
    }

    private formatChangelistLabel(changelist: Changelist): string {
        const suffix = changelist.active ? ' (active)' : '';
        return `${changelist.name}${suffix} [${changelist.files.length}]`;
    }

    private getDirectoryLabel(relativePath: string): string {
        const normalized = this.normalize(relativePath);
        const separatorIndex = normalized.lastIndexOf('/');
        if (separatorIndex === -1) {
            return '';
        }
        return normalized.slice(0, separatorIndex);
    }

    private normalize(relativePath: string): string {
        return relativePath.replace(/\\/g, '/');
    }

    private async getLastCommitMessage(): Promise<string> {
        const now = Date.now();
        if (this.lastCommitMessage && now - this.lastCommitMessageFetchedAt < 10000) {
            return this.lastCommitMessage;
        }

        try {
            const log = await this.gitService.getLog(1);
            this.lastCommitMessage = log.length > 0 ? log[0].message : '';
            this.lastCommitMessageFetchedAt = now;
        } catch (error) {
            console.warn('ViGit: unable to read last commit message', error);
            this.lastCommitMessage = '';
            this.lastCommitMessageFetchedAt = now;
        }

        return this.lastCommitMessage;
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        const cspSource = webview.cspSource;
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
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
        }
        .panel {
            display: flex;
            flex-direction: column;
            height: 100vh;
            box-sizing: border-box;
        }
        .panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            gap: 12px;
        }
        .panel-header h2 {
            margin: 0;
            font-size: 14px;
        }
        .panel-header p {
            margin: 2px 0 0;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
        .header-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .header-actions button {
            border: 1px solid var(--vscode-button-border, transparent);
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border-radius: 3px;
            padding: 4px 10px;
            cursor: pointer;
        }
        .header-actions button:disabled {
            opacity: 0.5;
            cursor: default;
        }
        .content {
            flex: 1;
            overflow: auto;
        }
        .group {
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .group.collapsed .group-files,
        .group.collapsed .group-empty {
            display: none;
        }
        .group-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: var(--vscode-sideBar-background);
            cursor: pointer;
            user-select: none;
            gap: 8px;
        }
        .group-header-left {
            display: flex;
            align-items: center;
            gap: 6px;
            flex: 1;
            min-width: 0;
        }
        .group-collapse-icon {
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid var(--vscode-foreground);
            transition: transform 0.1s ease-out;
            margin-right: 4px;
        }
        .group.collapsed .group-collapse-icon {
            transform: rotate(-90deg);
        }
        .group-title {
            font-size: 13px;
            font-weight: 600;
        }
        .group-title.active {
            color: var(--vscode-textLink-activeForeground);
        }
        .group-description {
            color: var(--vscode-descriptionForeground);
            font-size: 11px;
        }
        .group-files {
            display: flex;
            flex-direction: column;
        }
        .file-row {
            display: grid;
            grid-template-columns: auto auto 1fr auto;
            align-items: center;
            gap: 6px;
            padding: 3px 12px;
            border-top: 1px solid var(--vscode-panel-border);
            cursor: pointer;
            min-height: 26px;
        }
        .file-row:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .file-row.selected {
            background: var(--vscode-list-activeSelectionBackground);
        }
        .file-row input[type=\"checkbox\"] {
            margin: 0;
        }
        .status {
            width: 20px;
            height: 20px;
            border-radius: 3px;
            text-align: center;
            line-height: 20px;
            font-size: 11px;
            font-weight: bold;
            color: var(--vscode-sideBar-background);
        }
        .status-M { background: #4fc3f7; }
        .status-D { background: #ef5350; }
        .status-U { background: #ffb74d; color: #000; }
        .status-R { background: #7e57c2; }
        .file-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
            min-width: 0;
        }
        .file-name {
            font-size: 13px;
            white-space: nowrap;
            text-overflow: ellipsis;
            overflow: hidden;
        }
        .file-path {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            white-space: nowrap;
            text-overflow: ellipsis;
            overflow: hidden;
        }
        .file-actions button {
            border: 1px solid transparent;
            background: transparent;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
        }
        .group-empty {
            padding: 6px 12px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .message-section {
            border-top: 1px solid var(--vscode-panel-border);
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .message-toolbar {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .message-toolbar span {
            font-size: 12px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
        }
        .message-actions {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        textarea {
            width: 100%;
            min-height: 70px;
            resize: vertical;
            padding: 8px;
            box-sizing: border-box;
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
        }
        .button-row {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }
        .button-row button {
            border-radius: 4px;
            border: none;
            padding: 8px 16px;
            cursor: pointer;
            font-weight: 500;
        }
        #commitBtn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        #commitPushBtn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .button-row button:disabled {
            opacity: 0.5;
            cursor: default;
        }
        select, label {
            font-size: 12px;
        }
        .empty-state {
            padding: 24px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="panel">
        <div class="panel-header">
            <div>
                <h2>Changes</h2>
                <p id="changelistLabel">No changelist selected</p>
            </div>
            <div class="header-actions">
                <label><input type="checkbox" id="selectAll" /> Select All</label>
                <button id="refreshBtn">Refresh</button>
            </div>
        </div>
        <div class="content" id="groupContainer"></div>
        <div class="message-section">
            <div class="message-toolbar">
                <span>Commit Message</span>
                <div class="message-actions">
                    <select id="historyPicker">
                        <option value=\"\">History...</option>
                    </select>
                    <label title=\"Reuse last commit message\"><input type="checkbox" id="amendToggle" /> Amend</label>
                </div>
            </div>
            <textarea id="commitMessage" placeholder="Describe your changes"></textarea>
            <div class="button-row">
                <button id="commitBtn">Commit</button>
                <button id="commitPushBtn">Commit &amp; Push</button>
            </div>
        </div>
    </div>
﻿    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            const groupContainer = document.getElementById('groupContainer');
            const changelistLabel = document.getElementById('changelistLabel');
            const selectAll = document.getElementById('selectAll');
            const refreshBtn = document.getElementById('refreshBtn');
            const commitBtn = document.getElementById('commitBtn');
            const commitPushBtn = document.getElementById('commitPushBtn');
            const commitMessageInput = document.getElementById('commitMessage');
            const amendToggle = document.getElementById('amendToggle');
            const historyPicker = document.getElementById('historyPicker');

            const state = {
                files: [],
                groups: [],
                selected: new Set(),
                commitMessage: '',
                amend: false,
                busy: false,
                history: [],
                lastCommitMessage: '',
                changelist: null,
                autoFilledFromAmend: false,
                collapsedGroups: new Set()
            };

            const persisted = vscode.getState() || {};
              if (Array.isArray(persisted.selected)) {
                  state.selected = new Set(persisted.selected);
              }
              if (typeof persisted.commitMessage === 'string') {
                  state.commitMessage = persisted.commitMessage;
                  commitMessageInput.value = state.commitMessage;
              }
              if (typeof persisted.amend === 'boolean') {
                  state.amend = persisted.amend;
                  amendToggle.checked = state.amend;
              }
              if (Array.isArray(persisted.collapsedGroups)) {
                  state.collapsedGroups = new Set(persisted.collapsedGroups);
              }

              const persistState = () => {
                  vscode.setState({
                      selected: Array.from(state.selected),
                      commitMessage: state.commitMessage,
                      amend: state.amend,
                      collapsedGroups: Array.from(state.collapsedGroups)
                  });
              };

            const updateSelectAll = () => {
                const total = state.files.length;
                selectAll.checked = total > 0 && state.selected.size === total;
                selectAll.indeterminate = total > 0 && state.selected.size > 0 && state.selected.size < total;
            };

            const updateButtons = () => {
                const disable = state.busy || state.selected.size === 0 || !state.commitMessage.trim();
                commitBtn.disabled = disable;
                commitPushBtn.disabled = disable;
                selectAll.disabled = state.busy || state.files.length === 0;
                refreshBtn.disabled = state.busy;
                commitMessageInput.disabled = state.busy;
                amendToggle.disabled = state.busy;
                historyPicker.disabled = state.busy || state.history.length === 0;
            };

            const renderGroups = () => {
                groupContainer.innerHTML = '';
                if (!state.groups.length) {
                    const empty = document.createElement('div');
                    empty.className = 'empty-state';
                    empty.textContent = 'No local changes';
                    groupContainer.appendChild(empty);
                    selectAll.checked = false;
                    selectAll.indeterminate = false;
                    updateButtons();
                    return;
                }

                const fragment = document.createDocumentFragment();
                  state.groups.forEach(group => {
                      const section = document.createElement('div');
                      section.className = 'group';
                      section.dataset.groupId = group.id;
                      const isCollapsed = state.collapsedGroups.has(group.id);
                      if (isCollapsed) {
                          section.classList.add('collapsed');
                      }
  
                      const header = document.createElement('div');
                      header.className = 'group-header';
                      const headerLeft = document.createElement('div');
                      headerLeft.className = 'group-header-left';
                      const collapseIcon = document.createElement('span');
                      collapseIcon.className = 'group-collapse-icon';
                      headerLeft.appendChild(collapseIcon);
  
                      const title = document.createElement('div');
                      title.className = 'group-title';
                      title.textContent = group.label;
                      if (group.active) {
                          title.classList.add('active');
                      }
                      headerLeft.appendChild(title);
                      header.appendChild(headerLeft);
  
                      if (group.description) {
                          const desc = document.createElement('div');
                          desc.className = 'group-description';
                          desc.textContent = group.description;
                          header.appendChild(desc);
                      }

                      header.addEventListener('click', () => {
                          if (state.collapsedGroups.has(group.id)) {
                              state.collapsedGroups.delete(group.id);
                          } else {
                              state.collapsedGroups.add(group.id);
                          }
                          persistState();
                          renderGroups();
                      });
  
                      section.appendChild(header);
  
                      if (group.files && group.files.length > 0) {
                          const list = document.createElement('div');
                          list.className = 'group-files';
                          group.files.forEach(file => list.appendChild(renderFileRow(file)));
                          section.appendChild(list);
                      } else {
                          const emptyGroup = document.createElement('div');
                          emptyGroup.className = 'group-empty';
                          emptyGroup.textContent = 'No files';
                          section.appendChild(emptyGroup);
                      }
  
                      fragment.appendChild(section);
                  });

                groupContainer.appendChild(fragment);
                updateSelectAll();
                updateButtons();
            };

            const renderFileRow = file => {
                const row = document.createElement('div');
                row.className = 'file-row';

                const isSelected = state.selected.has(file.absolutePath);
                if (isSelected) {
                    row.classList.add('selected');
                }

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = isSelected;
                checkbox.addEventListener('change', event => {
                    event.stopPropagation();
                    toggleSelection(file.absolutePath, checkbox.checked);
                });
                row.appendChild(checkbox);

                const status = document.createElement('span');
                const statusCode = file.statusCode || 'M';
                status.className = 'status status-' + statusCode;
                status.textContent = statusCode;
                status.title = file.statusLabel || '';
                row.appendChild(status);

                const info = document.createElement('div');
                info.className = 'file-info';
                const name = document.createElement('div');
                name.className = 'file-name';
                name.textContent = file.fileName;
                info.appendChild(name);
                const path = document.createElement('div');
                path.className = 'file-path';
                const segments = [];
                if (file.directory) {
                    segments.push(file.directory);
                }
                if (file.changelistName) {
                    segments.push(file.changelistName);
                }
                path.textContent = segments.join(' · ');
                info.appendChild(path);
                row.appendChild(info);

                const actions = document.createElement('div');
                actions.className = 'file-actions';
                const diffButton = document.createElement('button');
                diffButton.type = 'button';
                diffButton.textContent = 'Diff';
                diffButton.addEventListener('click', event => {
                    event.stopPropagation();
                    vscode.postMessage({ type: 'openDiff', payload: { file: file.absolutePath } });
                });
                actions.appendChild(diffButton);
                row.appendChild(actions);

                row.addEventListener('click', event => {
                    const target = event.target;
                    if (target instanceof HTMLInputElement || target instanceof HTMLButtonElement) {
                        return;
                    }
                    toggleSelection(file.absolutePath, !state.selected.has(file.absolutePath));
                });

                row.addEventListener('dblclick', () => {
                    vscode.postMessage({ type: 'openDiff', payload: { file: file.absolutePath } });
                });

                return row;
            };

            const toggleSelection = (filePath, selected) => {
                if (selected) {
                    state.selected.add(filePath);
                } else {
                    state.selected.delete(filePath);
                }
                persistState();
                renderGroups();
            };

            const applyStatePayload = payload => {
                state.files = Array.isArray(payload.files) ? payload.files : [];
                state.groups = Array.isArray(payload.groups) ? payload.groups : [];
                if (state.groups.length > 0) {
                    const knownIds = new Set(state.groups.map(group => group.id));
                    state.collapsedGroups = new Set(
                        Array.from(state.collapsedGroups).filter(id => knownIds.has(id))
                    );
                }
                state.busy = !!payload.busy;
                state.history = Array.isArray(payload.history) ? payload.history : [];
                state.lastCommitMessage = payload.lastCommitMessage || '';
                state.changelist = payload.changelist || null;

                const validPaths = new Set(state.files.map(file => file.absolutePath));
                const previousSelection = new Set(state.selected);
                state.selected = new Set();
                previousSelection.forEach(filePath => {
                    if (validPaths.has(filePath)) {
                        state.selected.add(filePath);
                    }
                });
                if (state.selected.size === 0) {
                    const preferredGroup = state.groups.find(group => group.active && group.files && group.files.length > 0);
                    const source = preferredGroup ? preferredGroup.files : state.files;
                    source.forEach(file => state.selected.add(file.absolutePath));
                }
                persistState();

                changelistLabel.textContent = state.changelist
                    ? state.changelist.name + ' (' + state.changelist.count + ' files)'
                    : 'No changelist selected';

                historyPicker.innerHTML = '<option value="">History...</option>';
                state.history.forEach(entry => {
                    const option = document.createElement('option');
                    option.value = entry;
                    option.textContent = entry;
                    historyPicker.appendChild(option);
                });

                if (state.amend && !state.commitMessage && state.lastCommitMessage) {
                    state.commitMessage = state.lastCommitMessage;
                    commitMessageInput.value = state.commitMessage;
                    state.autoFilledFromAmend = true;
                }

                renderGroups();
            };

            window.addEventListener('message', event => {
                const message = event.data;
                if (!message || typeof message.type !== 'string') {
                    return;
                }
                switch (message.type) {
                    case 'state':
                        applyStatePayload(message.payload || {});
                        break;
                    case 'busy':
                        state.busy = !!message.payload;
                        updateButtons();
                        break;
                    case 'committed':
                        if (!state.amend) {
                            state.commitMessage = '';
                            commitMessageInput.value = '';
                            amendToggle.checked = false;
                            state.amend = false;
                        }
                        state.selected.clear();
                        persistState();
                        renderGroups();
                        updateButtons();
                        break;
                    default:
                        break;
                }
            });

            commitMessageInput.addEventListener('input', () => {
                state.commitMessage = commitMessageInput.value;
                if (state.autoFilledFromAmend && !state.amend) {
                    state.autoFilledFromAmend = false;
                }
                persistState();
                updateButtons();
            });

            amendToggle.addEventListener('change', () => {
                state.amend = amendToggle.checked;
                if (state.amend && !state.commitMessage && state.lastCommitMessage) {
                    state.commitMessage = state.lastCommitMessage;
                    commitMessageInput.value = state.commitMessage;
                    state.autoFilledFromAmend = true;
                }
                if (!state.amend && state.autoFilledFromAmend) {
                    state.commitMessage = '';
                    commitMessageInput.value = '';
                    state.autoFilledFromAmend = false;
                }
                persistState();
                updateButtons();
            });

            const sendCommit = andPush => {
                if (state.busy) {
                    return;
                }
                vscode.postMessage({
                    type: 'commit',
                    payload: {
                        files: Array.from(state.selected),
                        message: state.commitMessage,
                        andPush,
                        amend: state.amend
                    }
                });
            };

            commitBtn.addEventListener('click', () => sendCommit(false));
            commitPushBtn.addEventListener('click', () => sendCommit(true));
            refreshBtn.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
            selectAll.addEventListener('change', () => {
                if (selectAll.checked) {
                    state.selected = new Set(state.files.map(f => f.absolutePath));
                } else {
                    state.selected.clear();
                }
                persistState();
                renderGroups();
            });
            historyPicker.addEventListener('change', () => {
                if (historyPicker.value) {
                    commitMessageInput.value = historyPicker.value;
                    state.commitMessage = historyPicker.value;
                    historyPicker.selectedIndex = 0;
                    persistState();
                    updateButtons();
                }
            });

            updateButtons();
        })();
    </script>


</body>
</html>`;
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



