import * as vscode from 'vscode';
import simpleGit, { SimpleGit, StatusResult, LogResult, DiffResult, BranchSummary, TagResult, RemoteWithRefs } from 'simple-git';
import * as path from 'path';

export interface GitStatus {
    modified: string[];
    staged: string[];
    untracked: string[];
    deleted: string[];
    renamed: { from: string; to: string }[];
}

export interface GitCommit {
    hash: string;
    abbrevHash: string;
    author: string;
    email: string;
    date: Date;
    message: string;
    parents: string[];
    refs: string[];
}

export interface GitBranch {
    name: string;
    current: boolean;
    remote: boolean;
    commit: string;
    upstream?: string;
    ahead?: number;
    behind?: number;
}

export interface GitDiffEntry {
    path: string;
    status: string;
}

export interface CommitFileChange {
    path: string;
    status: string;
    previousPath?: string;
}

export interface GitStashEntry {
    hash: string;
    message: string;
    branch?: string;
    date: Date;
}

export class GitService {
    private git: SimpleGit;
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.git = simpleGit(workspaceRoot);
    }

    async initialize(): Promise<void> {
        try {
            await this.git.status();
        } catch (error) {
            throw new Error('Not a git repository or git is not installed');
        }
    }

    async getStatus(): Promise<GitStatus> {
        const status: StatusResult = await this.git.status();
        
        return {
            modified: [...status.modified, ...status.conflicted],
            staged: [...status.staged],
            untracked: status.not_added,
            deleted: status.deleted,
            renamed: status.renamed.map(r => ({
                from: r.from,
                to: r.to
            }))
        };
    }

    async getDiff(filePath: string, staged: boolean = false): Promise<string> {
        try {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            if (staged) {
                return await this.git.diff(['--cached', '--', relativePath]);
            } else {
                return await this.git.diff(['--', relativePath]);
            }
        } catch (error) {
            console.error('Error getting diff:', error);
            return '';
        }
    }

    async stageFile(filePath: string): Promise<void> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        await this.git.add(relativePath);
    }

    async stageFiles(filePaths: string[]): Promise<void> {
        const relativePaths = filePaths.map(p => path.relative(this.workspaceRoot, p));
        await this.git.add(relativePaths);
    }

    async unstageFile(filePath: string): Promise<void> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        await this.git.reset(['HEAD', '--', relativePath]);
    }

    async unstageFiles(filePaths: string[]): Promise<void> {
        const relativePaths = filePaths.map(p => path.relative(this.workspaceRoot, p));
        if (relativePaths.length > 0) {
            await this.git.reset(['HEAD', '--', ...relativePaths]);
        }
    }

    async revertFile(filePath: string): Promise<void> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        await this.git.checkout(['--', relativePath]);
    }

    async revertPaths(filePaths: string[]): Promise<void> {
        if (filePaths.length === 0) {
            return;
        }
        const relativePaths = filePaths.map(p => path.relative(this.workspaceRoot, p));
        await this.git.checkout(['--', ...relativePaths]);
    }

    async commit(message: string, files?: string[]): Promise<void> {
        if (files && files.length > 0) {
            const relativePaths = files.map(p => path.relative(this.workspaceRoot, p));
            await this.git.add(relativePaths);
        }
        await this.git.commit(message);
    }

    async commitAmend(message: string): Promise<void> {
        await this.git.commit(message, ['--amend']);
    }

    async push(remote: string = 'origin', branch?: string): Promise<void> {
        if (branch) {
            await this.git.push(remote, branch);
        } else {
            await this.git.push();
        }
    }

    async pushTags(remote: string = 'origin'): Promise<void> {
        await this.git.raw(['push', remote, '--tags']);
    }

    async pull(remote: string = 'origin', branch?: string): Promise<void> {
        if (branch) {
            await this.git.pull(remote, branch);
        } else {
            await this.git.pull();
        }
    }

    async fetch(remote: string = 'origin'): Promise<void> {
        await this.git.fetch(remote);
    }

    async getLog(maxCount: number = 100): Promise<GitCommit[]> {
        const log = await this.runFormattedLog({
            maxCount,
            format: this.getLogFormat()
        });

        return log.all.map(entry => this.mapLogEntry(entry));
    }

    async getFileLog(filePath: string, maxCount: number = 100): Promise<GitCommit[]> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const log = await this.runFormattedLog({
            file: relativePath,
            maxCount,
            format: this.getLogFormat()
        });

        return log.all.map(entry => this.mapLogEntry(entry));
    }

    async getBranchLog(branchName: string, maxCount: number = 100): Promise<GitCommit[]> {
        const log = await this.runFormattedLog({
            maxCount,
            format: this.getLogFormat()
        }, [branchName]);

        return log.all.map(entry => this.mapLogEntry(entry));
    }

    async getCommitsBetween(baseRef: string, headRef: string, maxCount: number = 200): Promise<GitCommit[]> {
        const log = await this.runFormattedLog({
            from: baseRef,
            to: headRef,
            maxCount,
            format: this.getLogFormat()
        });

        return log.all.map(entry => this.mapLogEntry(entry));
    }

    async getDiffSummaryBetween(baseRef: string, headRef: string): Promise<GitDiffEntry[]> {
        const diffText = await this.git.diff(['--name-status', `${baseRef}..${headRef}`]);
        const lines = diffText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const entries: GitDiffEntry[] = [];

        for (const line of lines) {
            const [statusRaw, ...paths] = line.split('\t');
            if (!statusRaw) {
                continue;
            }

            if (statusRaw.startsWith('R') && paths.length >= 2) {
                entries.push({
                    status: 'R',
                    path: `${paths[0]} → ${paths[1]}`
                });
                continue;
            }

            entries.push({
                status: statusRaw,
                path: paths[0] ?? ''
            });
        }

        return entries;
    }

    async getCommitDiff(commitHash: string): Promise<string> {
        return await this.git.show([commitHash]);
    }

    async getCommitFileChanges(commitHash: string): Promise<CommitFileChange[]> {
        const output = await this.git.show(['--name-status', '--pretty=format:', commitHash]);
        const lines = output.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        const changes: CommitFileChange[] = [];

        for (const line of lines) {
            const segments = line.split('\t').map(entry => entry.trim()).filter(Boolean);
            if (segments.length === 0) {
                continue;
            }

            const status = segments[0];
            if (status.startsWith('R') || status.startsWith('C')) {
                if (segments.length >= 3) {
                    changes.push({
                        status,
                        previousPath: segments[1],
                        path: segments[2]
                    });
                }
                continue;
            }

            changes.push({
                status,
                path: segments[1] ?? ''
            });
        }

        return changes;
    }

    async getCommitPatch(commitHash: string): Promise<string> {
        return await this.git.raw(['format-patch', '-1', commitHash, '--stdout']);
    }

    async checkoutCommit(commitHash: string): Promise<void> {
        await this.git.checkout(commitHash);
    }

    async resetToCommit(commitHash: string, mode: 'soft' | 'mixed' | 'hard' = 'hard'): Promise<void> {
        await this.git.reset([`--${mode}`, commitHash]);
    }

    async revertCommit(commitHash: string): Promise<void> {
        await this.git.raw(['revert', '--no-edit', commitHash]);
    }

    async getBranches(): Promise<GitBranch[]> {
        const summary: BranchSummary = await this.git.branch(['-a']);
        const branches: GitBranch[] = [];
        const trackingMap = await this.getBranchTrackingMap();

        for (const [name, info] of Object.entries(summary.branches)) {
            const isRemote = name.includes('remotes/');
            const tracking = !isRemote ? trackingMap.get(name) : undefined;

            branches.push({
                name,
                current: info.current,
                remote: isRemote,
                commit: info.commit,
                upstream: tracking?.upstream,
                ahead: tracking?.ahead,
                behind: tracking?.behind
            });
        }

        return branches;
    }

    async getTags(): Promise<string[]> {
        const tagResult: TagResult = await this.git.tags();
        return tagResult.all;
    }

    async getCurrentBranch(): Promise<string> {
        const summary = await this.git.branch();
        return summary.current;
    }

    async createBranch(branchName: string, startPoint?: string): Promise<void> {
        if (startPoint) {
            await this.git.checkoutBranch(branchName, startPoint);
        } else {
            await this.git.checkoutLocalBranch(branchName);
        }
    }

    async createBranchAtCommit(branchName: string, commitHash: string, checkout: boolean = false): Promise<void> {
        if (checkout) {
            await this.git.checkoutBranch(branchName, commitHash);
            return;
        }
        await this.git.raw(['branch', branchName, commitHash]);
    }

    async checkoutBranch(branchName: string): Promise<void> {
        await this.git.checkout(branchName);
    }

    async deleteBranch(branchName: string, force: boolean = false): Promise<void> {
        if (force) {
            await this.git.deleteLocalBranch(branchName, true);
        } else {
            await this.git.deleteLocalBranch(branchName);
        }
    }

    async mergeBranch(branchName: string): Promise<void> {
        await this.git.merge([branchName]);
    }

    async rebase(branchName: string): Promise<void> {
        await this.git.rebase([branchName]);
    }

    async createTag(tagName: string, startPoint?: string): Promise<void> {
        if (startPoint) {
            await this.git.raw(['tag', tagName, startPoint]);
        } else {
            await this.git.addTag(tagName);
        }
    }

    async cherryPick(commitHash: string): Promise<void> {
        await this.git.raw(['cherry-pick', commitHash]);
    }

    async reset(mode: 'soft' | 'mixed' | 'hard', target: string = 'HEAD'): Promise<void> {
        await this.git.reset([`--${mode}`, target]);
    }

    async getBlame(filePath: string): Promise<string> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        return await this.git.raw(['blame', relativePath]);
    }

    async stash(message?: string): Promise<void> {
        if (message) {
            await this.git.stash(['push', '-m', message]);
        } else {
            await this.git.stash();
        }
    }

    async stashPop(stashId?: string): Promise<void> {
        if (stashId) {
            await this.git.stash(['pop', stashId]);
        } else {
            await this.git.stash(['pop']);
        }
    }

    async stashApply(stashId?: string): Promise<void> {
        if (stashId) {
            await this.git.stash(['apply', stashId]);
        } else {
            await this.git.stash(['apply']);
        }
    }

    async stashDrop(stashId: string): Promise<void> {
        await this.git.stash(['drop', stashId]);
    }

    async getStashList(): Promise<GitStashEntry[]> {
        const result = await this.git.stashList();
        return result.all.map(entry => ({
            hash: entry.hash,
            message: entry.message,
            branch: (entry as any).branch,
            date: this.resolveStashDate(entry)
        }));
    }

    async getStashDiff(stashId: string): Promise<string> {
        return await this.git.show([stashId]);
    }

    async getFileContent(filePath: string, ref: string = 'HEAD'): Promise<string> {
        try {
            const gitPath = this.toGitPath(filePath);
            return await this.git.show([`${ref}:${gitPath}`]);
        } catch (error) {
            return '';
        }
    }

    getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }

    async compareWithBranch(branchName: string, filePath?: string): Promise<string> {
        if (filePath) {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            return await this.git.diff([branchName, '--', relativePath]);
        } else {
            return await this.git.diff([branchName]);
        }
    }

    async getRemotes(): Promise<RemoteWithRefs[]> {
        return await this.git.getRemotes(true);
    }

    async addRemote(name: string, url: string): Promise<void> {
        await this.git.addRemote(name, url);
    }

    async removeRemote(name: string): Promise<void> {
        await this.git.removeRemote(name);
    }

    async updateRemote(name: string, url: string): Promise<void> {
        await this.git.remote(['set-url', name, url]);
    }

    private resolveStashDate(entry: any): Date {
        if (entry.date) {
            return new Date(entry.date);
        }

        const unixTime: number | undefined = entry.unixTime;
        if (typeof unixTime === 'number') {
            return new Date(unixTime * 1000);
        }

        return new Date();
    }

    private async getBranchTrackingMap(): Promise<Map<string, { upstream?: string; ahead?: number; behind?: number }>> {
        const map = new Map<string, { upstream?: string; ahead?: number; behind?: number }>();
        try {
            const output = await this.git.raw([
                'for-each-ref',
                '--format=%(refname:short)\t%(upstream:short)\t%(upstream:track)',
                'refs/heads'
            ]);

            const lines = output.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            for (const line of lines) {
                const [branchName, upstreamRaw, trackRaw] = line.split('\t');
                if (!branchName) {
                    continue;
                }

                const trackingInfo: { upstream?: string; ahead?: number; behind?: number } = {};
                if (upstreamRaw) {
                    trackingInfo.upstream = upstreamRaw;
                }

                if (trackRaw) {
                    const cleaned = trackRaw.replace(/[\[\]]/g, '');
                    const segments = cleaned.split(',').map(seg => seg.trim());
                    for (const segment of segments) {
                        const aheadMatch = segment.match(/ahead\s+(\d+)/i);
                        if (aheadMatch) {
                            trackingInfo.ahead = Number(aheadMatch[1]);
                        }
                        const behindMatch = segment.match(/behind\s+(\d+)/i);
                        if (behindMatch) {
                            trackingInfo.behind = Number(behindMatch[1]);
                        }
                    }
                }

                map.set(branchName, trackingInfo);
            }
        } catch (error) {
            console.warn('ViGit: unable to load branch tracking info', error);
        }
        return map;
    }

    private getLogFormat(): Record<string, string> {
        return {
            hash: '%H',
            date: '%ai',
            message: '%s',
            refs: '%D',
            parents: '%P',
            author_name: '%an',
            author_email: '%ae'
        };
    }

    private async runFormattedLog(
        options?: Parameters<SimpleGit['log']>[0],
        customArgs?: string[]
    ): Promise<LogResult<Record<string, string>>> {
        const logFn = this.git.log as unknown as (
            options?: Parameters<SimpleGit['log']>[0],
            customArgs?: string[]
        ) => Promise<LogResult<Record<string, string>>>;
        return logFn.call(this.git, options, customArgs);
    }

    private mapLogEntry(entry: any): GitCommit {
        const parents = typeof entry.parents === 'string'
            ? entry.parents.split(' ').map((value: string) => value.trim()).filter(Boolean)
            : [];

        const refs = entry.refs
            ? String(entry.refs).split(',').map((r: string) => r.trim()).filter(Boolean)
            : [];

        return {
            hash: entry.hash,
            abbrevHash: entry.hash ? entry.hash.substring(0, 7) : '',
            author: entry.author_name || '',
            email: entry.author_email || '',
            date: entry.date ? new Date(entry.date) : new Date(),
            message: entry.message || '',
            parents,
            refs
        };
    }

    private toGitPath(filePath: string): string {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        return relativePath.split(path.sep).join(path.posix.sep);
    }
}
