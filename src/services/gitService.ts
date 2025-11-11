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
    graph?: string;
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

    async getLog(maxCount: number = 100, includeGraph: boolean = false): Promise<GitCommit[]> {
        const log = await this.git.log({
            maxCount
        });

        const commits: GitCommit[] = log.all.map(commit => ({
            hash: commit.hash,
            abbrevHash: commit.hash.substring(0, 7),
            author: (commit as any).author_name || '',
            email: (commit as any).author_email || '',
            date: new Date(commit.date),
            message: commit.message,
            parents: [],
            refs: (commit as any).refs ? String((commit as any).refs).split(',').map((r: string) => r.trim()).filter((r: string) => r) : []
        }));

        if (includeGraph) {
            try {
                const graphOutput = await this.git.raw([
                    'log',
                    `--max-count=${maxCount}`,
                    '--graph',
                    '--pretty=format:%H%x09%s'
                ]);

                const graphMap = new Map<string, string>();
                const lines = graphOutput.split('\n');

                for (const line of lines) {
                    const match = line.match(/([\s\|\*\\\/]+)([0-9a-f]{7,40})\t/);
                    if (!match) {
                        continue;
                    }
                    const graphPart = match[1].replace(/\s+$/g, '');
                    const hash = match[2];
                    graphMap.set(hash, graphPart.trimEnd());
                }

                commits.forEach(commit => {
                    const graph = graphMap.get(commit.hash);
                    if (graph) {
                        commit.graph = graph;
                    }
                });
            } catch (error) {
                console.error('Failed to load git graph:', error);
            }
        }

        return commits;
    }

    async getFileLog(filePath: string, maxCount: number = 100): Promise<GitCommit[]> {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const log: LogResult = await this.git.log({
            file: relativePath,
            maxCount
        });

        return log.all.map(commit => ({
            hash: commit.hash,
            abbrevHash: commit.hash.substring(0, 7),
            author: (commit as any).author_name || '',
            email: (commit as any).author_email || '',
            date: new Date(commit.date),
            message: commit.message,
            parents: [],
            refs: []
        }));
    }

    async getBranchLog(branchName: string, maxCount: number = 100): Promise<GitCommit[]> {
        const log: LogResult = await this.git.log([branchName, '-n', String(maxCount)]);

        return log.all.map(commit => ({
            hash: commit.hash,
            abbrevHash: commit.hash.substring(0, 7),
            author: (commit as any).author_name || '',
            email: (commit as any).author_email || '',
            date: new Date(commit.date),
            message: commit.message,
            parents: [],
            refs: (commit as any).refs ? String((commit as any).refs).split(',').map((r: string) => r.trim()).filter((r: string) => r) : []
        }));
    }

    async getCommitDiff(commitHash: string): Promise<string> {
        return await this.git.show([commitHash]);
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

    getWorkspaceRoot(): string {
        return this.workspaceRoot;
    }

    async getFileContent(filePath: string, ref: string = 'HEAD'): Promise<string> {
        try {
            const relativePath = path.relative(this.workspaceRoot, filePath);
            return await this.git.show([`${ref}:${relativePath}`]);
        } catch (error) {
            return '';
        }
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
}
