# Jira Integration Research

This document outlines the research for adding Jira platform support to `@issuer/cli`, including Jira's core concepts, API/SDK options, and the integration strategy based on existing implementations (PingCode, Yunxiao, GitHub, GitLab).

## 1. Jira Concepts & Hierarchy

Jira organizes work items in a structured hierarchy. The default out-of-the-box model maps closely to our `WorkType` enum:

- **Epic (Level 1)**: Represents a large body of work, significant objective, or feature that spans multiple sprints. Acts as a container for Stories, Tasks, and Bugs. (Maps to `@issuer/cli` `WorkType.Epic`).
- **Story (Level 0)**: User-centric requirements (e.g., "As a user..."). (Maps to `WorkType.Story`).
- **Task (Level 0)**: Generic pieces of technical, operational, or administrative work. (Maps to `WorkType.Task`).
- **Bug (Level 0)**: Defects or problems that need fixing. (Maps to `WorkType.Bug`).
- **Sub-task (Level -1)**: Child issues that break down a Story, Task, or Bug.

**Relationship Rules**: 
- Stories, Tasks, and Bugs sit at the same hierarchy level (Level 0). They are NOT children of one another, but they can all be children of an Epic.
- To link an issue to an Epic, Jira typically uses the "Epic Link" custom field or the "Parent" field (in newer Jira Cloud environments).

## 2. Integration Methods

### 2.1 Node.js SDK
- **`jira.js`**: The most modern, actively maintained, and TypeScript-friendly SDK. It provides comprehensive coverage for Jira Cloud API v2/v3 and Agile APIs.
- **`jira-client`**: An older, widely used object-oriented wrapper.
- **Recommendation**: Given the architecture of `@issuer/cli`, which leverages minimal dependencies (using raw `fetch` for PingCode and Yunxiao, and official light SDKs for GitHub/GitLab), we can either use `jira.js` or **directly use the native `fetch` API** to call Jira's REST API. Native `fetch` is preferred to keep the bundle size small, as we only need 4 endpoints (`create`, `update`, `get`, `list/search`).

### 2.2 Jira REST API (v3 vs v2)
- **API v3** requires the `description` and other rich-text fields to be formatted in **Atlassian Document Format (ADF)** (a complex JSON structure).
- **API v2** accepts standard Jira Wiki Markup for descriptions.
- Since our tasks are written in standard Markdown, we will need to either:
  1. Use a library to convert Markdown to ADF for API v3.
  2. Use API v2 and a lightweight Markdown-to-Jira-Markup converter.
  3. Wrap the Markdown in a single ADF `codeBlock` or `paragraph` block if using API v3.

### 2.3 Jira MCP Server (Atlassian Rovo MCP Server)
- Atlassian officially provides the **Atlassian Rovo MCP Server** (`atlassian/atlassian-mcp-server`).
- It is a **remote** MCP server hosted at `https://mcp.atlassian.com/v1/mcp`.
- **Local Proxy:** It uses an `mcp-remote` proxy that runs locally via Node.js to bridge the local agent (Claude, Cursor, etc.) to the Atlassian cloud.
- **Authentication:** Supports a secure browser-based OAuth 2.1 (3LO) consent flow, or headless API token authentication.
- **Capabilities:** It natively supports searching Jira/Confluence/Compass, creating/updating issues, and linking content.
- **Integration with `@issuer/cli`:** Because the official Atlassian MCP is very powerful and handles all authentication securely, we highly recommend users configure this MCP server in their agents. Our `mcp-detect.ts` can piggyback on this by detecting tools like `create_issue` or `create_jira_issue`, allowing `@issuer/cli` to use the official MCP channel as a true zero-code adapter for Jira syncs.

## 3. Implementation Strategy (Referencing Existing Adapters)

To implement the `JiraAdapter` (`src/adapter/jira/index.ts`), we can follow the established patterns from **PingCode** and **Yunxiao**:

### 3.1 Initialization & Auth
- **Auth**: Jira Cloud uses Basic Auth (Email + API Token base64 encoded). Data Center uses Personal Access Tokens (PAT). We should require `email` and `token` in the `.issuer/credentials.yml` or ENV vars (`ISSUER_JIRA_EMAIL`, `ISSUER_JIRA_TOKEN`).
- **Config**: Require the Jira Workspace URL (`--domain`) and Project Key (`--repo`).

### 3.2 Dynamic Type Resolution
Just like the PingCode adapter (`ensureTypeId`) and Yunxiao adapter, Jira projects have customizable Issue Type IDs.
- On the first push, the adapter should call `GET /rest/api/3/issuetype/project?projectIdOrKey=<KEY>` to fetch the available issue types for the project.
- Map our internal `WorkType` (story, bug, task, epic) to Jira's returned issue types.
- Cache the mapping in `.issuer/config.yml` (e.g., `jira_workitem_types: { "10001": "Story", "10004": "Bug" }`).

### 3.3 Create & Update Logic
- **Endpoint**: `POST /rest/api/3/issue` (or v2).
- **Payload**:
  ```json
  {
    "fields": {
      "project": { "key": "PROJ" },
      "summary": "Task title",
      "description": { ... ADF Object ... },
      "issuetype": { "id": "10001" },
      "labels": ["frontend", "issuer"]
    }
  }
  ```
- **Returns**: The created issue key (e.g., `PROJ-123`) which we will save as `platform_id` in the local markdown frontmatter, and `platform_url` as `https://domain.atlassian.net/browse/PROJ-123`.

### 3.4 Summary of Tasks to Implement
1. Create `src/adapter/jira/index.ts` implementing the `Adapter` interface.
2. Build Jira token resolution in `src/core/config.ts`.
3. Add `markdown-to-adf` conversion logic (or use API v2).
4. Implement dynamic `issuetype` fetching to prevent hardcoded type ID errors.
5. Register `jira` in `src/adapter/factory.ts`.
