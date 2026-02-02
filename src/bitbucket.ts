import { getAuthHeader } from "./config.js";
import axios, { AxiosInstance } from "axios";

export class BitbucketError extends Error {
  public readonly statusCode?: number;
  public readonly errorType: string;
  public readonly details: any;
  public readonly suggestion?: string;
  public readonly isRetryable: boolean;

  constructor(params: {
    message: string;
    statusCode?: number;
    errorType: string;
    details?: any;
    suggestion?: string;
    isRetryable?: boolean;
  }) {
    super(params.message);
    this.name = "BitbucketError";
    this.statusCode = params.statusCode;
    this.errorType = params.errorType;
    this.details = params.details;
    this.suggestion = params.suggestion;
    this.isRetryable = params.isRetryable ?? false;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorType: this.errorType,
      details: this.details,
      suggestion: this.suggestion,
      isRetryable: this.isRetryable,
    };
  }
}

export interface BitbucketClientOptions {
  email: string;
  token: string;
  baseUrl?: string; // Defaults to Bitbucket Cloud API v2
  authType?: "basic" | "bearer"; // Defaults to 'basic' for Cloud, 'bearer' for Server
}

export class BitbucketClient {
  private email: string;
  private token: string;
  private baseUrl: string;
  private http: AxiosInstance;
  private isCloud: boolean;
  private authType: "basic" | "bearer";

  constructor(opts: BitbucketClientOptions) {
    console.log("[BitbucketClient] Initializing client");
    this.email = opts.email;
    this.token = opts.token;
    this.baseUrl = opts.baseUrl || "https://api.bitbucket.org/2.0";
    this.authType =
      opts.authType ||
      (this.baseUrl.includes("api.bitbucket.org") ? "basic" : "bearer");
    this.isCloud =
      this.baseUrl.includes("api.bitbucket.org") ||
      this.baseUrl === "https://api.bitbucket.org/2.0";
    console.log(
      `[BitbucketClient] Config: baseUrl=${this.baseUrl}, authType=${this.authType}, isCloud=${this.isCloud}`
    );
    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: getAuthHeader(this.email, this.token, this.authType),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
    console.log("[BitbucketClient] Client initialized successfully");
  }

  private async request<T>(
    path: string,
    init?: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: any;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    const method = init?.method || "GET";
    const url = `${this.baseUrl}${path}`;
    console.log(`[BitbucketClient] ${method} ${path}`);
    try {
      const res = await this.http.request<T>({
        url: path,
        method,
        data: init?.body,
        headers: init?.headers,
      });
      console.log(
        `[BitbucketClient] ${method} ${path} - Success (${res.status})`
      );
      return res.data as T;
    } catch (error: any) {
      const status = error.response?.status;
      const responseData = error.response?.data;

      console.error(`[BitbucketClient] ${method} ${path} - Error:`, {
        status,
        statusText: error.response?.statusText,
        message: error.message,
        data: responseData,
      });

      // Create structured error based on status code
      if (status === 401) {
        throw new BitbucketError({
          message: "Authentication failed",
          statusCode: 401,
          errorType: "AUTHENTICATION_ERROR",
          details: { path, method, response: responseData },
          suggestion:
            "Check your email and app password/token. Ensure credentials are valid and have not expired.",
          isRetryable: false,
        });
      } else if (status === 403) {
        throw new BitbucketError({
          message: "Permission denied",
          statusCode: 403,
          errorType: "PERMISSION_ERROR",
          details: { path, method, response: responseData },
          suggestion:
            "Your credentials lack permission for this operation. Check repository access rights and workspace permissions.",
          isRetryable: false,
        });
      } else if (status === 404) {
        throw new BitbucketError({
          message: "Resource not found",
          statusCode: 404,
          errorType: "NOT_FOUND_ERROR",
          details: { path, method, response: responseData },
          suggestion:
            "Verify workspace name, repository slug, or resource ID. Check if the resource exists and is accessible.",
          isRetryable: false,
        });
      } else if (status === 400) {
        throw new BitbucketError({
          message: "Bad request",
          statusCode: 400,
          errorType: "VALIDATION_ERROR",
          details: { path, method, response: responseData },
          suggestion: `Invalid request parameters. ${
            responseData?.error?.message ||
            "Check the request payload and parameters."
          }`,
          isRetryable: false,
        });
      } else if (status === 409) {
        throw new BitbucketError({
          message: "Conflict",
          statusCode: 409,
          errorType: "CONFLICT_ERROR",
          details: { path, method, response: responseData },
          suggestion:
            "Resource already exists or conflicts with existing data. Try a different name or check for duplicates.",
          isRetryable: false,
        });
      } else if (status === 429) {
        throw new BitbucketError({
          message: "Rate limit exceeded",
          statusCode: 429,
          errorType: "RATE_LIMIT_ERROR",
          details: { path, method, response: responseData },
          suggestion:
            "Too many requests. Wait before retrying. Check rate limit headers for reset time.",
          isRetryable: true,
        });
      } else if (status && status >= 500) {
        throw new BitbucketError({
          message: "Bitbucket server error",
          statusCode: status,
          errorType: "SERVER_ERROR",
          details: { path, method, response: responseData },
          suggestion:
            "Bitbucket service is experiencing issues. Retry after a short delay.",
          isRetryable: true,
        });
      } else if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
        throw new BitbucketError({
          message: "Network connection failed",
          statusCode: undefined,
          errorType: "NETWORK_ERROR",
          details: { path, method, code: error.code },
          suggestion:
            "Check network connectivity and baseUrl configuration. Verify the Bitbucket server is reachable.",
          isRetryable: true,
        });
      } else if (error.code === "ETIMEDOUT") {
        throw new BitbucketError({
          message: "Request timeout",
          statusCode: undefined,
          errorType: "TIMEOUT_ERROR",
          details: { path, method },
          suggestion:
            "Request took too long. Check network speed or try again.",
          isRetryable: true,
        });
      } else {
        throw new BitbucketError({
          message: error.message || "Unknown error occurred",
          statusCode: status,
          errorType: "UNKNOWN_ERROR",
          details: {
            path,
            method,
            response: responseData,
            originalError: error.code,
          },
          suggestion: "An unexpected error occurred. Check logs for details.",
          isRetryable: false,
        });
      }
    }
  }

  async getRepo(workspace: string, repoSlug: string) {
    console.log(`[getRepo] workspace=${workspace}, repoSlug=${repoSlug}`);
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}`
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}`
      );
    }
  }

  async listPullRequests(
    workspace: string,
    repoSlug: string,
    state: "OPEN" | "MERGED" | "DECLINED" | "SUPERSEDED" = "OPEN"
  ) {
    console.log(
      `[listPullRequests] workspace=${workspace}, repoSlug=${repoSlug}, state=${state}`
    );
    const params = new URLSearchParams({ state });
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests?${params.toString()}`
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests?${params.toString()}`
      );
    }
  }

  async createPullRequest(
    workspace: string,
    repoSlug: string,
    args: {
      title: string;
      sourceBranch: string;
      destBranch: string;
      description?: string;
    }
  ) {
    console.log(
      `[createPullRequest] workspace=${workspace}, repoSlug=${repoSlug}, title=${args.title}, source=${args.sourceBranch}, dest=${args.destBranch}`
    );
    if (this.isCloud) {
      const body = {
        title: args.title,
        description: args.description || "",
        source: { branch: { name: args.sourceBranch } },
        destination: { branch: { name: args.destBranch } },
      };
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
    } else {
      // Bitbucket Server format
      const body = {
        title: args.title,
        description: args.description || "",
        state: "OPEN",
        open: true,
        closed: false,
        fromRef: {
          id: `refs/heads/${args.sourceBranch}`,
          repository: {
            slug: repoSlug,
            name: null,
            project: {
              key: workspace,
            },
          },
        },
        toRef: {
          id: `refs/heads/${args.destBranch}`,
          repository: {
            slug: repoSlug,
            name: null,
            project: {
              key: workspace,
            },
          },
        },
        locked: false,
        reviewers: [],
      };
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
    }
  }

  async listBranches(workspace: string, repoSlug: string) {
    console.log(`[listBranches] workspace=${workspace}, repoSlug=${repoSlug}`);
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/refs/branches`
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/branches`
      );
    }
  }

  async createBranch(
    workspace: string,
    repoSlug: string,
    name: string,
    targetHash: string
  ) {
    console.log(
      `[createBranch] workspace=${workspace}, repoSlug=${repoSlug}, name=${name}, targetHash=${targetHash}`
    );
    const body = { name, target: { hash: targetHash } };
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/refs/branches`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/branches`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
    }
  }

  async listWorkspaces() {
    console.log("[listWorkspaces] Fetching workspaces/projects");
    if (this.isCloud) {
      return this.request("/workspaces");
    } else {
      return this.request("/projects");
    }
  }

  async listRepositories(workspace: string) {
    console.log(`[listRepositories] workspace=${workspace}`);
    if (this.isCloud) {
      return this.request(`/repositories/${encodeURIComponent(workspace)}`);
    } else {
      return this.request(`/projects/${encodeURIComponent(workspace)}/repos`);
    }
  }

  async getPullRequest(workspace: string, repoSlug: string, prId: number) {
    console.log(
      `[getPullRequest] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}`
    );
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}`
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}`
      );
    }
  }

  async getPullRequestDiff(workspace: string, repoSlug: string, prId: number) {
    console.log(
      `[getPullRequestDiff] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}`
    );
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}/diff`
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}/diff`
      );
    }
  }

  async getPullRequestChanges(
    workspace: string,
    repoSlug: string,
    prId: number
  ) {
    console.log(
      `[getPullRequestChanges] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}`
    );
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}/diffstat`
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}/changes`
      );
    }
  }

  async addPullRequestComment(
    workspace: string,
    repoSlug: string,
    prId: number,
    text: string
  ) {
    console.log(
      `[addPullRequestComment] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}, textLength=${text.length}`
    );
    const body = this.isCloud ? { content: { raw: text } } : { text };
    const path = this.isCloud
      ? `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}/comments`
      : `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}/comments`;
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getFileContent(
    workspace: string,
    repoSlug: string,
    filePath: string,
    commitHash: string
  ) {
    console.log(
      `[getFileContent] workspace=${workspace}, repoSlug=${repoSlug}, filePath=${filePath}, commitHash=${commitHash}`
    );
    if (this.isCloud) {
      const url = `${this.baseUrl}/repositories/${encodeURIComponent(
        workspace
      )}/${encodeURIComponent(repoSlug)}/src/${encodeURIComponent(
        commitHash
      )}/${encodeURIComponent(filePath)}`;
      console.log(`[getFileContent] Fetching from URL: ${url}`);
      const res = await fetch(url, {
        headers: {
          Authorization: getAuthHeader(this.email, this.token, this.authType),
        },
      });
      if (!res.ok) {
        console.error(`[getFileContent] Failed with status ${res.status}`);
        const errorText = await res
          .text()
          .catch(() => "Unable to read error response");

        if (res.status === 404) {
          throw new BitbucketError({
            message: "File not found",
            statusCode: 404,
            errorType: "FILE_NOT_FOUND",
            details: {
              workspace,
              repoSlug,
              filePath,
              commitHash,
              response: errorText,
            },
            suggestion:
              "Verify the file path and commit hash are correct. File may not exist at this commit.",
            isRetryable: false,
          });
        } else if (res.status === 401) {
          throw new BitbucketError({
            message: "Authentication failed for file content",
            statusCode: 401,
            errorType: "AUTHENTICATION_ERROR",
            details: { workspace, repoSlug, filePath, commitHash },
            suggestion: "Check authentication credentials.",
            isRetryable: false,
          });
        } else {
          throw new BitbucketError({
            message: `Failed to fetch file content: HTTP ${res.status}`,
            statusCode: res.status,
            errorType: "FILE_FETCH_ERROR",
            details: {
              workspace,
              repoSlug,
              filePath,
              commitHash,
              response: errorText,
            },
            suggestion: "Check file permissions and repository access.",
            isRetryable: res.status >= 500,
          });
        }
      }
      const content = await res.text();
      console.log(`[getFileContent] Retrieved ${content.length} characters`);
      return content;
    } else {
      const response = await this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/browse/${encodeURIComponent(filePath)}?at=${encodeURIComponent(
          commitHash
        )}`
      );
      // Server returns {lines: [{text: ...}]}
      const content =
        (response as any).lines?.map((l: any) => l.text).join("\n") || "";
      console.log(`[getFileContent] Retrieved ${content.length} characters`);
      return content;
    }
  }

  async testConnection(): Promise<{
    success: boolean;
    error?: BitbucketError;
  }> {
    console.log("[testConnection] Testing Bitbucket connection");
    try {
      await this.listWorkspaces();
      console.log("[testConnection] Connection successful");
      return { success: true };
    } catch (error: any) {
      console.error("[testConnection] Connection failed:", error.message);
      if (error instanceof BitbucketError) {
        return { success: false, error };
      }
      return {
        success: false,
        error: new BitbucketError({
          message: error.message || "Connection test failed",
          errorType: "CONNECTION_TEST_FAILED",
          details: { originalError: error },
          suggestion: "Verify baseUrl, credentials, and network connectivity.",
          isRetryable: true,
        }),
      };
    }
  }

  async listCommits(workspace: string, repoSlug: string, spec?: string) {
    console.log(
      `[listCommits] workspace=${workspace}, repoSlug=${repoSlug}, spec=${
        spec || "none"
      }`
    );
    if (this.isCloud) {
      const path = spec
        ? `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
            repoSlug
          )}/commits/${encodeURIComponent(spec)}`
        : `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
            repoSlug
          )}/commits`;
      return this.request(path);
    } else {
      const path = spec
        ? `/projects/${encodeURIComponent(
            workspace
          )}/repos/${encodeURIComponent(
            repoSlug
          )}/commits?until=${encodeURIComponent(spec)}`
        : `/projects/${encodeURIComponent(
            workspace
          )}/repos/${encodeURIComponent(repoSlug)}/commits`;
      return this.request(path);
    }
  }

  async approvePullRequest(workspace: string, repoSlug: string, prId: number) {
    console.log(
      `[approvePullRequest] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}`
    );
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}/approve`,
        { method: "POST" }
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}/approve`,
        { method: "POST" }
      );
    }
  }

  async declinePullRequest(workspace: string, repoSlug: string, prId: number) {
    console.log(
      `[declinePullRequest] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}`
    );
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}/decline`,
        { method: "POST" }
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}/decline`,
        { method: "POST" }
      );
    }
  }

  async mergePullRequest(
    workspace: string,
    repoSlug: string,
    prId: number,
    options?: {
      closeSourceBranch?: boolean;
      mergeStrategy?: "merge_commit" | "squash" | "fast_forward";
      message?: string;
    }
  ) {
    console.log(
      `[mergePullRequest] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}, strategy=${
        options?.mergeStrategy || "default"
      }`
    );
    if (this.isCloud) {
      const body: any = {};
      if (options?.closeSourceBranch !== undefined) {
        body.close_source_branch = options.closeSourceBranch;
      }
      if (options?.mergeStrategy) {
        body.merge_strategy = options.mergeStrategy;
      }
      if (options?.message) {
        body.message = options.message;
      }
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}/merge`,
        {
          method: "POST",
          body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
        }
      );
    } else {
      // Bitbucket Server merge
      const body: any = { version: 0 }; // Version is required for Server
      if (options?.message) {
        body.message = options.message;
      }
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}/merge`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
    }
  }

  async updatePullRequest(
    workspace: string,
    repoSlug: string,
    prId: number,
    updates: { title?: string; description?: string }
  ) {
    console.log(
      `[updatePullRequest] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}`
    );
    if (this.isCloud) {
      const body: any = {};
      if (updates.title) body.title = updates.title;
      if (updates.description) body.description = updates.description;
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        }
      );
    } else {
      const body: any = { version: 0 }; // Version required for Server
      if (updates.title) body.title = updates.title;
      if (updates.description) body.description = updates.description;
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        }
      );
    }
  }

  async addPullRequestReviewers(
    workspace: string,
    repoSlug: string,
    prId: number,
    reviewers: string[]
  ) {
    console.log(
      `[addPullRequestReviewers] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}, reviewers=${reviewers.join(
        ", "
      )}`
    );
    if (this.isCloud) {
      // For Cloud, we need to update the PR with reviewers
      const body = {
        reviewers: reviewers.map((uuid) => ({ uuid })),
      };
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}`,
        {
          method: "PUT",
          body: JSON.stringify(body),
        }
      );
    } else {
      // For Server, add reviewers individually
      const promises = reviewers.map((username) =>
        this.request(
          `/projects/${encodeURIComponent(
            workspace
          )}/repos/${encodeURIComponent(
            repoSlug
          )}/pull-requests/${prId}/participants`,
          {
            method: "POST",
            body: JSON.stringify({
              user: { name: username },
              role: "REVIEWER",
            }),
          }
        )
      );
      return Promise.all(promises);
    }
  }

  async listPullRequestComments(
    workspace: string,
    repoSlug: string,
    prId: number
  ) {
    console.log(
      `[listPullRequestComments] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}`
    );
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}/comments`
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}/activities`
      );
    }
  }

  async getCommit(workspace: string, repoSlug: string, commitHash: string) {
    console.log(
      `[getCommit] workspace=${workspace}, repoSlug=${repoSlug}, commitHash=${commitHash}`
    );
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/commit/${encodeURIComponent(commitHash)}`
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/commits/${encodeURIComponent(commitHash)}`
      );
    }
  }

  async getCommitDiff(workspace: string, repoSlug: string, commitHash: string) {
    console.log(
      `[getCommitDiff] workspace=${workspace}, repoSlug=${repoSlug}, commitHash=${commitHash}`
    );
    if (this.isCloud) {
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/diff/${encodeURIComponent(commitHash)}`
      );
    } else {
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/commits/${encodeURIComponent(commitHash)}/diff`
      );
    }
  }

  async compareBranches(
    workspace: string,
    repoSlug: string,
    source: string,
    destination: string
  ) {
    console.log(
      `[compareBranches] workspace=${workspace}, repoSlug=${repoSlug}, source=${source}, dest=${destination}`
    );
    if (this.isCloud) {
      // Cloud uses spec format: destination..source
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/diff/${encodeURIComponent(destination)}..${encodeURIComponent(
          source
        )}`
      );
    } else {
      // Server uses from/to query params
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/compare/diff?from=${encodeURIComponent(
          source
        )}&to=${encodeURIComponent(destination)}`
      );
    }
  }

  async addInlineCommentAfterReview(
    workspace: string,
    repoSlug: string,
    prId: number,
    filePath: string,
    line: number,
    text: string,
    lineType: "ADDED" | "CONTEXT" | "REMOVED" = "ADDED"
  ) {
    console.log(
      `[addInlineCommentAfterReview] workspace=${workspace}, repoSlug=${repoSlug}, prId=${prId}, file=${filePath}, line=${line}, lineType=${lineType}`
    );
    if (this.isCloud) {
      const body = {
        content: { raw: text },
        inline: { path: filePath, to: line },
      };
      return this.request(
        `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(
          repoSlug
        )}/pullrequests/${prId}/comments`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
    } else {
      const body = {
        text,
        anchor: {
          line,
          lineType,
          fileType: "TO",
          path: filePath,
        },
      };
      return this.request(
        `/projects/${encodeURIComponent(workspace)}/repos/${encodeURIComponent(
          repoSlug
        )}/pull-requests/${prId}/comments`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
    }
  }
}
