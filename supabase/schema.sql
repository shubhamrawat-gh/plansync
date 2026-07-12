-- Enable pgvector extension for semantic duplicate detection
create extension if not exists vector;

-- Projects table (maps to a GitHub repository installation)
create table projects (
  id uuid primary key default gen_random_uuid(),
  repo_full_name text unique not null,
  github_app_installation_id bigint not null,
  created_at timestamptz default now()
);

-- Plan nodes (tasks and files mapped to owners and status)
create table plan_nodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  description text,
  owner_github_username text,
  target_paths text[] not null,
  status text check (status in ('not_started','in_progress','blocked','done')) default 'not_started',
  updated_at timestamptz default now()
);

-- Real-time commit history
create table commit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  author_github_username text,
  branch text,
  file_paths text[],
  commit_sha text,
  message text,
  created_at timestamptz default now()
);

-- Extracted code contracts / API signatures
create table contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  module_name text,
  function_name text,
  signature text,
  file_path text,
  embedding vector(384), -- 384-dimensional embedding vector (e.g. all-MiniLM-L6-v2)
  updated_at timestamptz default now()
);

-- Architecture decisions extracted from commits/PRs
create table decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  topic text,
  summary text,
  source_commit_sha text,
  created_at timestamptz default now()
);

-- Active developer/agent session heartbeats
create table active_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  github_username text not null,
  file_paths text[] not null,
  last_heartbeat timestamptz default now()
);

-- Indexes for performance
create index idx_plan_nodes_project_id on plan_nodes(project_id);
create index idx_commit_events_project_id on commit_events(project_id);
create index idx_contracts_project_id on contracts(project_id);
create index idx_decisions_project_id on decisions(project_id);
create index idx_active_sessions_project_id on active_sessions(project_id);
create index idx_active_sessions_last_heartbeat on active_sessions(last_heartbeat);

-- RPC for Cosine Similarity search on Contracts table
create or replace function match_contracts(
  p_project_id uuid,
  query_embedding vector(384),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  module_name text,
  function_name text,
  signature text,
  file_path text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    contracts.id,
    contracts.module_name,
    contracts.function_name,
    contracts.signature,
    contracts.file_path,
    1 - (contracts.embedding <=> query_embedding) as similarity
  from contracts
  where contracts.project_id = p_project_id
    and 1 - (contracts.embedding <=> query_embedding) > match_threshold
  order by contracts.embedding <=> query_embedding
  limit match_count;
end;
$$;
