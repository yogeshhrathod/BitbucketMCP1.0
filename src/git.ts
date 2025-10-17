import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export interface RepoContext {
  repoRoot: string;
  remoteUrl: string;
  host: string;
  workspace: string;
  repoSlug: string;
}

export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = startDir;
  while (true) {
    const gitDir = path.join(dir, '.git');
    if (fs.existsSync(gitDir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('No git repository found from current directory upwards');
}

export function getRemoteUrl(repoRoot: string): string {
  const res = spawnSync('git', ['config', '--get', 'remote.origin.url'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  if (res.status !== 0) {
    throw new Error(`Failed to get git remote: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}

export function parseBitbucketRemote(remoteUrl: string): {
  host: string;
  workspace: string;
  repoSlug: string;
} {
  // SSH: git@bitbucket.org:workspace/repo.git
  const ssh = /^git@([^:]+):([^/]+)\/(.+?)(\.git)?$/i.exec(remoteUrl);
  if (ssh) {
    const host = ssh[1];
    const workspace = ssh[2];
    let repo = ssh[3];
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);
    return { host, workspace, repoSlug: repo };
  }

  // HTTPS: https://bitbucket.org/workspace/repo.git OR https://user@bitbucket.org/workspace/repo.git
  const https = /^https?:\/\/(?:[^@]+@)?([^\/]+)\/([^\/]+)\/(.+?)(?:\.git)?$/i.exec(remoteUrl);
  if (https) {
    const host = https[1];
    const workspace = https[2];
    const repo = https[3];
    return { host, workspace, repoSlug: repo };
  }

  throw new Error(`Unsupported Bitbucket remote URL: ${remoteUrl}`);
}

export function getCurrentBranch(repoRoot: string): string {
  const res = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf-8',
  });
  if (res.status !== 0) {
    throw new Error(`Failed to get current branch: ${res.stderr || res.stdout}`);
  }
  return res.stdout.trim();
}
