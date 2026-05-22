# Bitbucket MCP Server

[![npm version](https://img.shields.io/npm/v/@yogeshrathod/bitbucket-mcp.svg)](https://www.npmjs.com/package/@yogeshrathod/bitbucket-mcp)
[![npm downloads](https://img.shields.io/npm/dm/@yogeshrathod/bitbucket-mcp.svg)](https://www.npmjs.com/package/@yogeshrathod/bitbucket-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.17.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

A Model Context Protocol (MCP) server for Bitbucket Cloud and Server APIs, built with TypeScript and Node.js. Provides comprehensive tools for repository management, pull requests, branches, commits, and file operations.

## Features

- **Dual API Support** - Bitbucket Cloud API v2 and Server API v1.0 (auto-detected by base URL)
- **25+ MCP Tools** - Complete coverage of Bitbucket operations
- **Flexible Configuration** - Environment variables or JSON config files
- **Smart Defaults** - Auto-detects current branch for PR creation
- **Structured Errors** - Detailed error responses with suggestions
- **TypeScript** - Full type safety and modern ES modules

## Installation

### Using npm (Global)

```bash
npm install -g @yogeshrathod/bitbucket-mcp
```

### Using npx (No Installation)

```bash
npx @yogeshrathod/bitbucket-mcp
```

## Updating

### Update Global Installation

```bash
npm update -g @yogeshrathod/bitbucket-mcp
```

### Update to Latest with npx

```bash
npx @yogeshrathod/bitbucket-mcp@latest
```

### Check Current Version

```bash
npm list -g @yogeshrathod/bitbucket-mcp
```

## Configuration

Configure the server using environment variables or a JSON config file.

### Environment Variables

```bash
export ATLASSIAN_SITE_URL="bitbucket"  # or your server URL
export ATLASSIAN_USER_EMAIL="your-email@example.com"
export ATLASSIAN_API_TOKEN="your-app-password-or-pat"
```

| Variable               | Description                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `ATLASSIAN_SITE_URL`   | `bitbucket` for Cloud API, or full URL for Server (e.g., `https://bitbucket.company.com/rest/api/1.0`) |
| `ATLASSIAN_USER_EMAIL` | Your Bitbucket account email                                                                           |
| `ATLASSIAN_API_TOKEN`  | App Password (Cloud) or Personal Access Token (Server)                                                 |

### JSON Config File

Create one of these files in your working directory: `mcp.config.json`, `.mcp.config.json`, or `.bitbucket.mcp.json`

```json
{
  "bitbucket": {
    "defaultDestinationBranch": "main",
    "environments": {
      "ATLASSIAN_SITE_URL": "https://bitbucket.company.com/rest/api/1.0",
      "ATLASSIAN_USER_EMAIL": "your-email@example.com",
      "ATLASSIAN_API_TOKEN": "your-app-password",
      "BITBUCKET_DEFAULT_DEST_BRANCH": "main"
    }
  }
}
```

### MCP Client Configuration

Add to your MCP client config (e.g., Claude Desktop, Windsurf):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "npx",
      "args": ["@yogeshrathod/bitbucket-mcp"],
      "env": {
        "ATLASSIAN_SITE_URL": "bitbucket",
        "ATLASSIAN_USER_EMAIL": "your-email@example.com",
        "ATLASSIAN_API_TOKEN": "your-app-password"
      }
    }
  }
}
```

## Tools Reference

All repository-specific tools require `workspace` and `repoSlug` parameters.

### Connection & Discovery

| Tool              | Description                      | Parameters              |
| ----------------- | -------------------------------- | ----------------------- |
| `connection_test` | Test connection to Bitbucket API | -                       |
| `workspaces_list` | List all accessible workspaces   | -                       |
| `repos_list`      | List repositories in a workspace | `workspace`             |
| `repo_info`       | Get repository details           | `workspace`, `repoSlug` |

### Pull Requests

| Tool                     | Description                          | Parameters                                                                          |
| ------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------- |
| `pr_list`                | List pull requests                   | `workspace`, `repoSlug`, `state?` (OPEN\|MERGED\|DECLINED\|SUPERSEDED)              |
| `pr_create`              | Create a pull request                | `workspace`, `repoSlug`, `title`, `sourceBranch?`, `destBranch?`, `description?`    |
| `pr_get`                 | Get PR details                       | `workspace`, `repoSlug`, `prId`                                                     |
| `pr_update`              | Update PR title/description          | `workspace`, `repoSlug`, `prId`, `title?`, `description?`                           |
| `pr_diff`                | Get PR diff                          | `workspace`, `repoSlug`, `prId`                                                     |
| `pr_diff_file`           | Get per-file PR diff (avoids 2MB limit) | `workspace`, `repoSlug`, `prId`, `file_path`, `context_lines?` (default 3)          |
| `pr_changes`             | Get file changes in PR               | `workspace`, `repoSlug`, `prId`                                                     |
| `pr_approve`             | Approve a PR                         | `workspace`, `repoSlug`, `prId`                                                     |
| `pr_decline`             | Decline/reject a PR                  | `workspace`, `repoSlug`, `prId`                                                     |
| `pr_merge`               | Merge a PR                           | `workspace`, `repoSlug`, `prId`, `closeSourceBranch?`, `mergeStrategy?`, `message?` |
| `pr_comment_add`         | Add comment to PR                    | `workspace`, `repoSlug`, `prId`, `text`                                             |
| `pr_comments_list`       | List PR comments                     | `workspace`, `repoSlug`, `prId`                                                     |
| `pr_reviewers_add`       | Add reviewers to PR                  | `workspace`, `repoSlug`, `prId`, `reviewers` (array)                                |
| `pr_inline_comment_add`  | Add inline comment at specific line  | `workspace`, `repoSlug`, `prId`, `filePath`, `line`, `text`, `lineType?`            |
| `pr_task_add`            | Create inline comment with task      | `workspace`, `repoSlug`, `prId`, `file_path`, `line_number`, `line_type`, `comment_text`, `task_text?` |

### Branches

| Tool             | Description          | Parameters                                       |
| ---------------- | -------------------- | ------------------------------------------------ |
| `branches_list`  | List branches        | `workspace`, `repoSlug`                          |
| `branch_create`  | Create a branch      | `workspace`, `repoSlug`, `name`, `targetHash`    |
| `branch_compare` | Compare two branches | `workspace`, `repoSlug`, `source`, `destination` |

### Commits

| Tool           | Description        | Parameters                            |
| -------------- | ------------------ | ------------------------------------- |
| `commits_list` | List commits       | `workspace`, `repoSlug`, `spec?`      |
| `commit_get`   | Get commit details | `workspace`, `repoSlug`, `commitHash` |
| `commit_diff`  | Get commit diff    | `workspace`, `repoSlug`, `commitHash` |

### Files

| Tool           | Description                | Parameters                                        |
| -------------- | -------------------------- | ------------------------------------------------- |
| `file_content` | Get file content at commit | `workspace`, `repoSlug`, `filePath`, `commitHash` |

## Usage Examples

### List Open Pull Requests

```json
{
  "tool": "pr_list",
  "arguments": {
    "workspace": "my-workspace",
    "repoSlug": "my-repo",
    "state": "OPEN"
  }
}
```

### Create a Pull Request

```json
{
  "tool": "pr_create",
  "arguments": {
    "workspace": "my-workspace",
    "repoSlug": "my-repo",
    "title": "Add new feature",
    "sourceBranch": "feature/my-feature",
    "destBranch": "main",
    "description": "This PR adds a new feature"
  }
}
```

### Merge a Pull Request

```json
{
  "tool": "pr_merge",
  "arguments": {
    "workspace": "my-workspace",
    "repoSlug": "my-repo",
    "prId": 123,
    "mergeStrategy": "squash",
    "closeSourceBranch": true
  }
}
```

### Compare Branches

```json
{
  "tool": "branch_compare",
  "arguments": {
    "workspace": "my-workspace",
    "repoSlug": "my-repo",
    "source": "feature/my-feature",
    "destination": "main"
  }
}
```

### Get Per-File PR Diff

```json
{
  "tool": "pr_diff_file",
  "arguments": {
    "workspace": "my-workspace",
    "repoSlug": "my-repo",
    "prId": 123,
    "file_path": "src/components/App.tsx",
    "context_lines": 5
  }
}
```

### Create Inline Comment with Task

```json
{
  "tool": "pr_task_add",
  "arguments": {
    "workspace": "my-workspace",
    "repoSlug": "my-repo",
    "prId": 123,
    "file_path": "src/utils/helper.js",
    "line_number": 42,
    "line_type": "ADDED",
    "comment_text": "Please add error handling here",
    "task_text": "Add error handling"
  }
}
```

**Note**: `pr_task_add` creates a blocker comment on Bitbucket Server/Data Center and a task on Bitbucket Cloud.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Start development server
npm start
```

## Requirements

- Node.js >= 18.17.0
- Bitbucket Cloud App Password or Server Personal Access Token

## License

MIT © Yogesh Rathod
