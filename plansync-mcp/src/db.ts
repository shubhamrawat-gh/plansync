export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
}

async function request(
  env: Env,
  path: string,
  method: string = "GET",
  body?: any,
  customHeaders?: Record<string, string>
): Promise<any> {
  const url = `${env.SUPABASE_URL}${path}`;
  const headers: Record<string, string> = {
    "apikey": env.SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${env.SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...customHeaders,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Database error (${response.status}): ${errorText}`);
  }

  // PostgREST returns 204 No Content for some operations
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const db = {
  async select<T = any>(
    env: Env,
    table: string,
    query: Record<string, string> = {},
    selectParams: string = "*"
  ): Promise<T[]> {
    const params = new URLSearchParams(query);
    params.set("select", selectParams);
    return request(env, `/rest/v1/${table}?${params.toString()}`);
  },

  async selectOne<T = any>(
    env: Env,
    table: string,
    query: Record<string, string> = {}
  ): Promise<T | null> {
    const params = new URLSearchParams(query);
    params.set("select", "*");
    params.set("limit", "1");
    const results = await request(env, `/rest/v1/${table}?${params.toString()}`);
    return results && results.length > 0 ? results[0] : null;
  },

  async insert<T = any>(env: Env, table: string, data: any): Promise<T[]> {
    return request(env, `/rest/v1/${table}`, "POST", data, {
      "Prefer": "return=representation",
    });
  },

  async update<T = any>(
    env: Env,
    table: string,
    query: Record<string, string>,
    data: any
  ): Promise<T[]> {
    const params = new URLSearchParams(query);
    return request(env, `/rest/v1/${table}?${params.toString()}`, "PATCH", data, {
      "Prefer": "return=representation",
    });
  },

  async delete(env: Env, table: string, query: Record<string, string>): Promise<void> {
    const params = new URLSearchParams(query);
    await request(env, `/rest/v1/${table}?${params.toString()}`, "DELETE");
  },

  async rpc<T = any>(env: Env, functionName: string, params: any): Promise<T> {
    return request(env, `/rest/v1/rpc/${functionName}`, "POST", params);
  },

  // High-level Helper: Get or create project by repo name
  async getOrCreateProject(
    env: Env,
    repoFullName: string,
    installationId: number
  ): Promise<{ id: string; repo_full_name: string; github_app_installation_id: number }> {
    const existing = await this.selectOne(env, "projects", { repo_full_name: `eq.${repoFullName}` });
    if (existing) {
      // If installation ID has changed, update it
      if (Number(existing.github_app_installation_id) !== installationId) {
        const updated = await this.update(
          env,
          "projects",
          { id: `eq.${existing.id}` },
          { github_app_installation_id: installationId }
        );
        return updated[0];
      }
      return existing;
    }
    const inserted = await this.insert(env, "projects", {
      repo_full_name: repoFullName,
      github_app_installation_id: installationId,
    });
    return inserted[0];
  },
};
