# Bitbucket MCP Server

A Model Context Protocol server for Bitbucket Cloud and Server, built with TypeScript and Node.js. Provides tools for repository info, pull requests, branches, and commits. **Requires explicit workspace and repoSlug parameters for all repository-specific operations.**

## Features

- **Bitbucket Cloud API v2** or **Server API v1.0** support (auto-detected by base URL)
- **MCP stdio server** ready to run via `npx bitbucket-mcp`
- **Config via env or JSON** compatible with your provided structure
- **Tests** with Vitest and Nock

## Configuration

Use environment variables or a JSON config file in the working directory.

- Env vars:
  - `ATLASSIAN_SITE_URL=<base_url>` (e.g., 'bitbucket' for Cloud API `https://api.bitbucket.org/2.0`, or 'https://your-server.com/bitbucket' for Server API)
  - `ATLASSIAN_USER_EMAIL=<your_email>`
  - `ATLASSIAN_API_TOKEN=<your_api_token>` (Bitbucket App Password for Cloud, Personal Access Token for Server)

- JSON file (any of `mcp.config.json`, `.mcp.config.json`, `.bitbucket.mcp.json`):
```json
{
  "bitbucket": {
    "environments": {
      "ATLASSIAN_SITE_URL": "bitbucket",
      "ATLASSIAN_USER_EMAIL": "<your_email>",
      "ATLASSIAN_API_TOKEN": "<your_api_token>"
    }
  }
}
```

## Usage

- Local run as MCP server over stdio:
```
npx bitbucket-mcp
```
The server will require explicit workspace and repoSlug parameters for all repository operations.

### Tools

- **repo_info**: Get repository info. Requires `workspace` and `repoSlug`.
- **pr_list**: List PRs. Requires `workspace` and `repoSlug`. Optional `state`=OPEN|MERGED|DECLINED|SUPERSEDED (default OPEN).
- **pr_create**: Create a PR with `title`, `sourceBranch`, `destBranch`. Requires `workspace` and `repoSlug`. Optional `description`.
- **pr_get**: Get details of a specific PR by `prId`. Requires `workspace`, `repoSlug`, and `prId`.
- **pr_diff**: Get diff of a PR. Requires `workspace`, `repoSlug`, and `prId`.
- **pr_changes**: Get file changes in a PR. Requires `workspace`, `repoSlug`, and `prId`.
- **pr_comment_add**: Add a comment to a PR. Requires `workspace`, `repoSlug`, `prId`, and `text`.
- **branches_list**: List branches. Requires `workspace` and `repoSlug`.
- **branch_create**: Create a branch with `name` and `targetHash`. Requires `workspace` and `repoSlug`.
- **commits_list**: List commits, optional `spec`. Requires `workspace` and `repoSlug`.
- **workspaces_list**: List all accessible workspaces.
- **repos_list**: List repositories in a workspace. Requires `workspace`.
- **file_content**: Get content of a file at a specific commit. Requires `workspace`, `repoSlug`, `filePath`, and `commitHash`.
- **connection_test**: Test connection to Bitbucket API.

## Development

- Build: `npm run build`
- Test: `npm test`

Requires Node.js >= 18.17.
