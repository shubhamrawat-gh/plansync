async function request(env, path, method = "GET", body, customHeaders) {
    const url = `${env.SUPABASE_URL}${path}`;
    const headers = {
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
    async select(env, table, query = {}, selectParams = "*") {
        const params = new URLSearchParams(query);
        params.set("select", selectParams);
        return request(env, `/rest/v1/${table}?${params.toString()}`);
    },
    async selectOne(env, table, query = {}) {
        const params = new URLSearchParams(query);
        params.set("select", "*");
        params.set("limit", "1");
        const results = await request(env, `/rest/v1/${table}?${params.toString()}`);
        return results && results.length > 0 ? results[0] : null;
    },
    async insert(env, table, data) {
        return request(env, `/rest/v1/${table}`, "POST", data, {
            "Prefer": "return=representation",
        });
    },
    async update(env, table, query, data) {
        const params = new URLSearchParams(query);
        return request(env, `/rest/v1/${table}?${params.toString()}`, "PATCH", data, {
            "Prefer": "return=representation",
        });
    },
    async delete(env, table, query) {
        const params = new URLSearchParams(query);
        await request(env, `/rest/v1/${table}?${params.toString()}`, "DELETE");
    },
    async rpc(env, functionName, params) {
        return request(env, `/rest/v1/rpc/${functionName}`, "POST", params);
    },
    // High-level Helper: Get or create project by repo name
    async getOrCreateProject(env, repoFullName, installationId) {
        const existing = await this.selectOne(env, "projects", { repo_full_name: `eq.${repoFullName}` });
        if (existing) {
            // If installation ID has changed, update it
            if (Number(existing.github_app_installation_id) !== installationId) {
                const updated = await this.update(env, "projects", { id: `eq.${existing.id}` }, { github_app_installation_id: installationId });
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
