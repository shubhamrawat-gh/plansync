# PlanSync Developer Agent Context Board

Welcome, Developer Agent! This file contains complete context, design guidelines, and code contracts for **PlanSync** — the coordination layer for multi-agent teams. Use this file as your project brief before proposing or implementing changes.

---

## 1. Project Context & Purpose

PlanSync solves the problem of **agent context fragmentation** on repositories where multiple independent coding sessions run concurrently. Instead of manual static context updates (which agents routinely forget or misalign), PlanSync uses:
1. A **GitHub Webhook** on the remote server to capture push events, extract function signatures, note architectural decisions, and rewrite `AGENTS.md` in the repository automatically.
2. A **Local File Watcher (CLI)** that runs silently in the background, updating active session statuses and list of edited files to avoid overlapping changes.
3. A **Remote MCP Server** exposing 6 specialized tools for agents to query recent commits, check active file collisions, fetch module contracts, and detect semantically duplicate functions before writing them.
4. A **Next.js Web Dashboard** displaying real-time timelines and drift flags.

---

## 2. Codebase Reference Map

The codebase is split into three clean directories:

```
aproject 1/
├── supabase/
│   └── schema.sql              # Postgres tables, indexes, and pgvector cosine search function
├── plansync-mcp/               # Cloudflare Worker codebase (MCP Server + Webhook Receiver)
│   ├── package.json            # Handles @modelcontextprotocol/sdk and zod
│   ├── wrangler.json           # Cloudflare environment bindings
│   └── src/
│       ├── index.ts            # Entry point, Bearer authentication, stateless POST/SSE routers
│       ├── tools.ts            # Tool registry schemas and operational logic
│       ├── webhook.ts          # HMAC validator, commit logger, decisions logger, and AGENTS.md updater
│       ├── db.ts               # PostgREST wrapper using native fetch
│       ├── ast.ts              # Lightweight regex-based TS/JS/Python signature extractor
│       └── embeddings.ts       # Cloudflare Workers AI embedding generator
├── plansync-dashboard/         # Next.js 16 Web Dashboard (Tailwind CSS v4)
│   ├── package.json            # React 19 dependencies
│   ├── app/
│   │   ├── page.tsx            # Beautiful responsive dark-mode dashboard
│   │   └── layout.tsx          # Font and metadata configurations
│   └── lib/
│       └── db.ts               # PostgREST requester and high-fidelity mock fallback data
├── plansync-cli/               # Node Command Line Tool
│   ├── package.json            # commander, chokidar, and picocolors
│   ├── bin/
│   │   └── index.js            # CLI CLI entry (init / watch commands)
│   └── src/
│       ├── watcher.js          # Chokidar workspace observer, throttled heartbeat sender
│       └── git.js              # Native git config, branch, and remote origin parser
└── AGENTS.md                   # Repository documentation auto-managed by the Webhook
```

---

## 3. Database Schema Reference

The database is built on PostgreSQL with `pgvector` enabled.

- **`projects`**: Maps a GitHub repository (e.g. `PiyushkumarSingh026/localrepo`) to a project UUID and installation ID.
- **`plan_nodes`**: Tracks project tasks, ownership, targets (file globs), and statuses (`not_started`, `in_progress`, `blocked`, `done`).
- **`commit_events`**: Logs commits, branch names, affected file paths, and commit authors.
- **`contracts`**: Stores exported class/function names, signatures, file paths, and a 384-dimensional vector embedding.
- **`decisions`**: Stores architecture updates extracted from commits/PR descriptions.
- **`active_sessions`**: Logs heartbeats from CLI watchers (`github_username`, active `file_paths`, `last_heartbeat`).

### Custom RPC similarity function:
```sql
match_contracts(
  p_project_id uuid,
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
```

---

## 4. MCP Tools Registry

When interacting with PlanSync, agents register and query coordination information through these 6 tools:

1. **`plan_task`**
   - *Description*: Register an upcoming coding task before starting.
   - *Inputs*: `name` (string), `description` (string), `owner` (string), `target_files` (string[]).
   - *Output*: Warnings if a teammate has touched these files recently or has an active task covering this area.

2. **`get_api_contract`**
   - *Description*: Retrieve type signatures of exported functions for a given module.
   - *Inputs*: `module_name` (string).
   - *Output*: Exported function signatures and their respective file paths.

3. **`check_collision`**
   - *Description*: Check for active edits or recent commits overlapping specific file paths.
   - *Inputs*: `file_paths` (string[]).
   - *Output*: Warning listings of active heartbeats or pushes in the last 2 hours.

4. **`get_recent_decisions`**
   - *Description*: Query architectural summaries logged on the project.
   - *Inputs*: `topic` (optional string).
   - *Output*: Chronological log of architecture details matching the topic.

5. **`check_semantic_duplicate`**
   - *Description*: Query whether a newly written function already exists in some format elsewhere.
   - *Inputs*: `function_name` (string), `signature_or_docstring` (string).
   - *Output*: Similar signature contracts and their cosine similarity score (%).

6. **`catch_me_up`**
   - *Description*: Get a recap of changes since the last session.
   - *Inputs*: `since_minutes` (optional number, defaults to 120).
   - *Output*: Summary of commits, plan node status advances, and architectural updates.

---

## 5. Development & Testing Guidelines for Agents

When building or editing PlanSync features, satisfy these strict guidelines:
- **Ponytail Lean-Code Discipline**: Standard library first. Do not introduce custom implementations or dependencies if standard JS/TS or wrangler bindings already support them. Keep diffs as short as possible.
- **Isolate Environment**: Remember that the Cloudflare Worker runs in a V8 isolate. Avoid Node-specific packages like `fs`, `child_process`, or heavy native node addons. Use native `crypto.subtle` for HMAC and `fetch` for PostgREST database queries.
- **Next.js Routing**: Next.js 16 uses React 19 and App Router. Keep the main page (`plansync-dashboard/app/page.tsx`) in `"use client"` for fast interactive dashboard states and automatic 10s database polling.
- **Workspace CLI**: The CLI is a pure ESM project. Make sure file paths use native paths and git command outputs are handled with robust fallbacks.
