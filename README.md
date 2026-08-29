# PlanSync

PlanSync is a real-time coordination hub for multi-agent developer teams working inside a shared GitHub repository. It combines webhook ingestion, semantic code analysis, a live dashboard, and workspace automation to keep humans and agents aligned on what is being built, who is building it, and which interfaces already exist.

## Why PlanSync exists

In multi-agent repositories, the hard part is rarely writing code — it is preventing duplicated effort, conflicting edits, and unclear ownership. PlanSync addresses that by turning repository activity into shared project state:

- commits become coordination signals
- file changes become ownership and collision signals
- function signatures become discoverable contracts
- decisions become durable project memory
- session heartbeats become live presence indicators

The result is a repo that can stay synchronized across contributors, tools, and agent sessions.

## Core capabilities

### 1. Shared project memory
PlanSync maintains a coordination layer for:

- architecture decisions
- active task ownership
- known API and function contracts
- recent commits and modified files
- session and workspace activity

### 2. Collision prevention
Before work starts, PlanSync can help answer questions like:

- Is another agent already editing this area?
- Has a similar task already been claimed?
- Does a function with this behavior already exist?
- Are two teams converging on the same module?

### 3. Contract extraction
PlanSync parses source code to extract function signatures and related interface details so that shared APIs can be tracked and reused consistently.

### 4. Live coordination dashboard
The dashboard provides a visible, always-current view of repository state, including:

- plan/task progress
- commit history
- decision summaries
- extracted code contracts
- active or recent coordination signals

### 5. Workspace automation
A CLI can initialize the coordination workflow, watch local changes, and report updates back into the system.

## System architecture

PlanSync is split into four practical layers.

### A. Postgres / Supabase data model
The data layer stores the project state needed for coordination.

Typical entities include:

- projects
- plan nodes
- commit events
- code contracts
- decisions
- task ownership records
- session or heartbeat metadata

The schema is built for fast lookups, traceability, and semantic matching.

### B. Cloudflare Worker MCP service
The worker acts as the coordination backend.

Responsibilities:

- receive GitHub webhook events
- verify request signatures
- parse commit and file-change payloads
- extract code contracts from changed files
- update project state in the database
- expose MCP tools for agent workflows
- refresh auto-managed `AGENTS.md` sections

This layer is designed to be lightweight and isolate-friendly.

### C. Next.js dashboard
The dashboard is the human-readable interface for the coordination layer.

It surfaces:

- current work in progress
- recent repository activity
- plan status and drift indicators
- decision history
- contract inventory
- mock or live database-backed state

### D. CLI tooling
The CLI is the developer-side companion.

It can:

- initialize the workflow in a repository
- watch files for local changes
- send periodic heartbeat updates
- read git metadata for branch and remote context

## Key workflows

### Repository onboarding
1. A repository is connected to PlanSync.
2. The schema and worker are configured.
3. `AGENTS.md` is initialized or updated.
4. The dashboard begins reflecting repository state.

### Working on a task
1. A developer or agent claims work.
2. Target files and ownership are recorded.
3. Similar tasks and collisions are checked.
4. Progress is surfaced in the dashboard.

### Commit ingestion
1. A commit is pushed.
2. The webhook handler validates the payload.
3. Modified files and messages are extracted.
4. Contract extraction runs on relevant source files.
5. The coordination state is updated.

### Catch-up for returning contributors
1. A user or agent returns after some time away.
2. PlanSync summarizes recent decisions and changes.
3. The dashboard or MCP tools provide the latest project context.

## What makes this project advanced

PlanSync is not just a dashboard or a webhook listener. It is a coordination system with multiple layers of intelligence:

- **event-driven state updates** from GitHub activity
- **semantic search/matching** for duplicate detection
- **contract awareness** for code reuse and interface tracking
- **auto-maintained coordination docs** for persistent team memory
- **multi-surface access** through worker endpoints, a UI, and CLI tooling

## Suggested repository layout

```text
plansync/
├── AGENTS.md
├── supabase/
│   └── schema.sql
├── plansync-mcp/
│   ├── package.json
│   ├── wrangler.json
│   └── src/
│       ├── index.ts
│       ├── tools.ts
│       ├── webhook.ts
│       ├── db.ts
│       ├── ast.ts
│       └── embeddings.ts
├── plansync-dashboard/
│   ├── package.json
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── api/
│   │       └── auth/
│   └── lib/
│       └── db.ts
└── plansync-cli/
    ├── package.json
    ├── bin/
    │   └── index.js
    └── src/
        ├── watcher.js
        └── git.js
```

## Data model concepts

PlanSync appears to center around these entities and responsibilities:

### Project
A project ties the GitHub repository to a coordination workspace.

### Plan node
A plan node represents an item of work, typically with status, ownership, and target file paths.

### Commit event
A commit event captures author, branch, files changed, hash, and message.

### Code contract
A code contract represents a discovered function or module interface extracted from source.

## Operational constraints

Because parts of the system run in a Cloudflare Worker and browser UI, the implementation should stay lightweight:

- prefer standard runtime APIs where possible
- avoid Node-only dependencies in isolate environments
- keep database and network calls simple and explicit
- keep dashboard state readable and reactive
- keep docs synchronized with the coordination model

## Getting started

If you are working on the dashboard portion:

```bash
cd plansync-dashboard
npm install
npm run dev
```

If you are working on the full system, you will also need to configure:

- the Postgres/Supabase schema
- the Cloudflare Worker environment bindings
- GitHub webhook delivery
- any CLI environment variables or auth hooks

## How to extend PlanSync

Good next features usually fall into one of these buckets:

- richer contract extraction for more languages
- stronger semantic duplicate detection
- better plan/ownership conflict resolution
- more detailed dashboard filters and timelines
- broader AGENTS.md auto-maintenance rules
- improved catch-up summaries for returning contributors

## README purpose

This README is intended to be a high-signal entry point for new contributors, maintainers, and autonomous agents. It should make the project understandable without needing to inspect every implementation file first.

## License

Add license information here when the project license is finalized.
