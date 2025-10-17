import { getAuthHeader } from './config.js';
import axios, { AxiosInstance } from 'axios';

export interface BitbucketClientOptions {
  email: string;
  token: string;
  baseUrl?: string; // Defaults to Bitbucket Cloud API v2
  authType?: 'basic' | 'bearer'; // Defaults to 'basic' for Cloud, 'bearer' for Server
}

export class BitbucketClient {
  private email: string;
  private token: string;
  private baseUrl: string;
  private http: AxiosInstance;
  private isCloud: boolean;
  private authType: 'basic' | 'bearer';

  constructor(opts: BitbucketClientOptions) {
    this.email = opts.email;
    this.token = opts.token;
    this.baseUrl = opts.baseUrl || 'https://api.bitbucket.org/2.0';
    this.authType = opts.authType || (this.baseUrl.includes('api.bitbucket.org') ? 'basic' : 'bearer');
    this.isCloud = this.baseUrl.includes('api.bitbucket.org') || this.baseUrl === 'https://api.bitbucket.org/2.0';
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: getAuthHeader(this.email, this.token, this.authType),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }


  private async request<T>(path: string, init?: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: any; headers?: Record<string, string> }): Promise<T> {
    const method = init?.method || 'GET';
    const url = `${this.baseUrl}${path}`;
    try {
      const res = await this.http.request<T>({ url: path, method, data: init?.body, headers: init?.headers });
      return res.data as T;
    } catch (error: any) {
      throw error;
    }
  }

  async getRepo(workspace: string, repoSlug: string) {
    if (this.isCloud) {
      return this.request(`/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}`);
    } else {
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}`);
    }
  }

  async listPullRequests(workspace: string, repoSlug: string, state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED' = 'OPEN') {
    const params = new URLSearchParams({ state });
    if (this.isCloud) {
      return this.request(`/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/pullrequests?${params.toString()}`);
    } else {
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/pull-requests?${params.toString()}`);
    }
  }

  async createPullRequest(
    workspace: string,
    repoSlug: string,
    args: { title: string; sourceBranch: string; destBranch: string; description?: string }
  ) {
    if (this.isCloud) {
      const body = {
        title: args.title,
        description: args.description || '',
        source: { branch: { name: args.sourceBranch } },
        destination: { branch: { name: args.destBranch } },
      };
      return this.request(`/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/pullrequests`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } else {
      // Bitbucket Server format
      const body = {
        title: args.title,
        description: args.description || '',
        state: 'OPEN',
        open: true,
        closed: false,
        fromRef: {
          id: `refs/heads/${args.sourceBranch}`,
          repository: {
            slug: repoSlug,
            name: null,
            project: {
              key: workspace
            }
          }
        },
        toRef: {
          id: `refs/heads/${args.destBranch}`,
          repository: {
            slug: repoSlug,
            name: null,
            project: {
              key: workspace
            }
          }
        },
        locked: false,
        reviewers: []
      };
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/pull-requests`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }
  }

  async listBranches(workspace: string, repoSlug: string) {
    if (this.isCloud) {
      return this.request(`/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/refs/branches`);
    } else {
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/branches`);
    }
  }

  async createBranch(workspace: string, repoSlug: string, name: string, targetHash: string) {
    const body = { name, target: { hash: targetHash } };
    if (this.isCloud) {
      return this.request(`/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/refs/branches`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } else {
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/branches`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    }
  }

  async listWorkspaces() {
    if (this.isCloud) {
      return this.request('/workspaces');
    } else {
      return this.request('/projects');
    }
  }

  async listRepositories(workspace: string) {
    if (this.isCloud) {
      return this.request(`/repositories/${encodeURIComponent(workspace)}`);
    } else {
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos`);
    }
  }

  async getPullRequest(workspace: string, repoSlug: string, prId: number) {
    if (this.isCloud) {
      return this.request(`/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/pullrequests/${prId}`);
    } else {
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/pull-requests/${prId}`);
    }
  }

  async getPullRequestDiff(workspace: string, repoSlug: string, prId: number) {
    if (this.isCloud) {
      return this.request(`/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/pullrequests/${prId}/diff`);
    } else {
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/pull-requests/${prId}/diff`);
    }
  }

  async getPullRequestChanges(workspace: string, repoSlug: string, prId: number) {
    if (this.isCloud) {
      return this.request(`/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/pullrequests/${prId}/diffstat`);
    } else {
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/pull-requests/${prId}/changes`);
    }
  }

  async addPullRequestComment(workspace: string, repoSlug: string, prId: number, text: string) {
    const body = this.isCloud ? { content: { raw: text } } : { text };
    const path = this.isCloud
      ? `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/pullrequests/${prId}/comments`
      : `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/pull-requests/${prId}/comments`;
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getFileContent(workspace: string, repoSlug: string, filePath: string, commitHash: string) {
    if (this.isCloud) {
      const url = `${this.baseUrl}/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/src/${encodeURIComponent(commitHash)}/${encodeURIComponent(filePath)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: getAuthHeader(this.email, this.token, this.authType),
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.text();
    } else {
      const response = await this.request(`/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/browse/${encodeURIComponent(filePath)}?at=${encodeURIComponent(commitHash)}`);
      // Server returns {lines: [{text: ...}]}
      return (response as any).lines?.map((l: any) => l.text).join('\n') || '';
    }
  }

  async testConnection() {
    try {
      await this.listWorkspaces();
      return true;
    } catch (error: any) {
      return false;
    }
  }

  async listCommits(workspace: string, repoSlug: string, spec?: string) {
    if (this.isCloud) {
      const path = spec
        ? `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/commits/${encodeURIComponent(spec)}`
        : `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/commits`;
      return this.request(path);
    } else {
      const path = spec
        ? `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/commits?until=${encodeURIComponent(spec)}`
        : `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(repoSlug)}/commits`;
      return this.request(path);
    }
  }
}
