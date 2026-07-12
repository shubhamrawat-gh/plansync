export interface Project {
  id: string;
  repo_full_name: string;
  github_app_installation_id: number;
  created_at: string;
}

export interface PlanNode {
  id: string;
  project_id: string;
  name: string;
  description: string;
  owner_github_username: string;
  target_paths: string[];
  status: "not_started" | "in_progress" | "blocked" | "done";
  updated_at: string;
}

export interface CommitEvent {
  id: string;
  project_id: string;
  author_github_username: string;
  branch: string;
  file_paths: string[];
  commit_sha: string;
  message: string;
  created_at: string;
}

export interface CodeContract {
  id: string;
  project_id: string;
  module_name: string;
  function_name: string;
  signature: string;
  file_path: string;
  updated_at: string;
}

export interface Decision {
  id: string;
  project_id: string;
  topic: string;
  summary: string;
  source_commit_sha: string;
  created_at: string;
}

export interface ActiveSession {
  id: string;
  project_id: string;
  github_username: string;
  file_paths: string[];
  last_heartbeat: string;
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

async function request(path: string, method: string = "GET", body?: any) {
  if (!isConfigured) return null;
  const url = `${SUPABASE_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      "apikey": SUPABASE_ANON_KEY!,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(`PostgREST error: ${response.statusText}`);
    return null;
  }
  if (response.status === 204) return null;
  return response.json();
}

// ---------------- MOCK DATA FOR PREMIUM PREVIEW ----------------
const MOCK_PROJECTS: Project[] = [
  {
    id: "659a4be2-9272-4430-b586-a9837c97e372",
    repo_full_name: "PiyushkumarSingh026/localrepo",
    github_app_installation_id: 54321098,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "project-2-uuid",
    repo_full_name: "hackathon-team/copilot-coordinator",
    github_app_installation_id: 12345678,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  }
];

const MOCK_PLAN_NODES: PlanNode[] = [
  {
    id: "node-1",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    name: "GitHub Webhook Signature Check",
    description: "Verify push signatures with subtle crypto in Cloudflare Workers.",
    owner_github_username: "Claude-Sonnet-Agent",
    target_paths: ["plansync-mcp/src/webhook.ts", "plansync-mcp/src/index.ts"],
    status: "done",
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "node-2",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    name: "AST Contract Extraction",
    description: "Extract exported function names and signatures from JS/TS and Python code.",
    owner_github_username: "Antigravity-Agent",
    target_paths: ["plansync-mcp/src/ast.ts"],
    status: "in_progress",
    updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    id: "node-3",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    name: "Interactive Dashboard",
    description: "Next.js dashboard visualizer for active agents, recent decisions, and contracts.",
    owner_github_username: "piyus",
    target_paths: ["plansync-dashboard/app/page.tsx", "plansync-dashboard/lib/db.ts"],
    status: "in_progress",
    updated_at: new Date().toISOString(),
  },
  {
    id: "node-4",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    name: "Workspace Watcher CLI",
    description: "Build Node.js CLI watch script that periodically sends heartbeat packets.",
    owner_github_username: "Codex-Agent",
    target_paths: ["plansync-cli/src/watcher.js", "plansync-cli/bin/index.js"],
    status: "not_started",
    updated_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  }
];

const MOCK_COMMITS: CommitEvent[] = [
  {
    id: "commit-1",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    author_github_username: "Claude-Sonnet-Agent",
    branch: "main",
    file_paths: ["plansync-mcp/src/webhook.ts"],
    commit_sha: "e7a3b8d91f2c4b5a6c7d8e9f0a1b2c3d4e5f6a7b",
    message: "feat: add crypto verifySignature to webhook receiver",
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "commit-2",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    author_github_username: "Antigravity-Agent",
    branch: "ast-extractor",
    file_paths: ["plansync-mcp/src/ast.ts"],
    commit_sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    message: "feat: decided to use lightweight regex parser for TS/JS and Python files to avoid Worker bundle limits",
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  }
];

const MOCK_CONTRACTS: CodeContract[] = [
  {
    id: "contract-1",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    module_name: "webhook",
    function_name: "verifySignature",
    signature: "(request: Request, secret: string): Promise<boolean>",
    file_path: "plansync-mcp/src/webhook.ts",
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "contract-2",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    module_name: "ast",
    function_name: "extractContracts",
    signature: "(filePath: string, content: string): ExtractedContract[]",
    file_path: "plansync-mcp/src/ast.ts",
    updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  }
];

const MOCK_DECISIONS: Decision[] = [
  {
    id: "decision-1",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    topic: "Regex Contract Parser",
    summary: "Decided to implement a regex-based parser in src/ast.ts rather than including the full 'typescript' compiler npm package. This satisfies the Cloudflare Worker 1MB bundle size constraints while maintaining accuracy for standard exports.",
    source_commit_sha: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  }
];

const MOCK_SESSIONS: ActiveSession[] = [
  {
    id: "session-1",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    github_username: "Antigravity-Agent",
    file_paths: ["plansync-mcp/src/ast.ts", "plansync-mcp/src/tools.ts"],
    last_heartbeat: new Date().toISOString(),
  },
  {
    id: "session-2",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    github_username: "piyus",
    file_paths: ["plansync-dashboard/app/page.tsx"],
    last_heartbeat: new Date(Date.now() - 1000 * 30).toISOString(), // 30s ago
  },
  {
    id: "session-3",
    project_id: "659a4be2-9272-4430-b586-a9837c97e372",
    github_username: "Codex-Agent",
    file_paths: ["plansync-cli/package.json"],
    last_heartbeat: new Date(Date.now() - 1000 * 600).toISOString(), // 10m ago (stale)
  }
];

export const dashboardDb = {
  isMock: !isConfigured,

  async getProjects(): Promise<Project[]> {
    if (!isConfigured) return MOCK_PROJECTS;
    const res = await request("/rest/v1/projects?select=*");
    return res || [];
  },

  async getPlanNodes(projectId: string): Promise<PlanNode[]> {
    if (!isConfigured) return MOCK_PLAN_NODES.filter(n => n.project_id === projectId);
    const res = await request(`/rest/v1/plan_nodes?project_id=eq.${projectId}&select=*`);
    return res || [];
  },

  async getCommits(projectId: string): Promise<CommitEvent[]> {
    if (!isConfigured) return MOCK_COMMITS.filter(c => c.project_id === projectId);
    const res = await request(`/rest/v1/commit_events?project_id=eq.${projectId}&select=*&order=created_at.desc`);
    return res || [];
  },

  async getContracts(projectId: string): Promise<CodeContract[]> {
    if (!isConfigured) return MOCK_CONTRACTS.filter(c => c.project_id === projectId);
    const res = await request(`/rest/v1/contracts?project_id=eq.${projectId}&select=*&order=module_name.asc`);
    return res || [];
  },

  async getDecisions(projectId: string): Promise<Decision[]> {
    if (!isConfigured) return MOCK_DECISIONS.filter(d => d.project_id === projectId);
    const res = await request(`/rest/v1/decisions?project_id=eq.${projectId}&select=*&order=created_at.desc`);
    return res || [];
  },

  async getActiveSessions(projectId: string): Promise<ActiveSession[]> {
    if (!isConfigured) return MOCK_SESSIONS.filter(s => s.project_id === projectId);
    const res = await request(`/rest/v1/active_sessions?project_id=eq.${projectId}&select=*&order=last_heartbeat.desc`);
    return res || [];
  },

  async createPlanNode(node: Omit<PlanNode, "id" | "updated_at">): Promise<PlanNode | null> {
    if (!isConfigured) {
      const newNode: PlanNode = {
        ...node,
        id: `node-${Math.random().toString(36).substring(7)}`,
        updated_at: new Date().toISOString(),
      };
      MOCK_PLAN_NODES.push(newNode);
      return newNode;
    }
    const res = await request("/rest/v1/plan_nodes", "POST", node);
    return res && res.length > 0 ? res[0] : null;
  }
};
