import { db } from "./db";
import { extractContracts } from "./ast";
import { getEmbedding } from "./embeddings";

export interface WebhookEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_TOKEN?: string; // GitHub Token (PAT or Installation token)
  AI?: any;
}

// Verify GitHub Webhook HMAC SHA256 Signature
export async function verifySignature(request: Request, secret: string): Promise<boolean> {
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const parts = signature.split("=");
  if (parts.length !== 2) return false;
  const signatureHex = parts[1];
  const signatureBytes = new Uint8Array(
    signatureHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  const bodyText = await request.clone().text();
  return await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    encoder.encode(bodyText)
  );
}

// Fetch file content from GitHub using the Raw Accept header
async function fetchGitHubFile(
  env: WebhookEnv,
  repoFullName: string,
  path: string,
  ref: string
): Promise<string | null> {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN env variable not set. Cannot fetch file content.");
    return null;
  }

  const url = `https://api.github.com/repos/${repoFullName}/contents/${path}?ref=${ref}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PlanSync-App",
      "Accept": "application/vnd.github.v3.raw",
      "Authorization": `token ${token}`,
    },
  });

  if (!response.ok) {
    console.warn(`Failed to fetch file ${path} from GitHub: ${response.status}`);
    return null;
  }

  return response.text();
}

// Commit updated AGENTS.md back to GitHub
async function commitGitHubFile(
  env: WebhookEnv,
  repoFullName: string,
  path: string,
  content: string,
  sha: string | undefined,
  message: string,
  branch: string
): Promise<boolean> {
  const token = env.GITHUB_TOKEN;
  if (!token) return false;

  const url = `https://api.github.com/repos/${repoFullName}/contents/${path}`;
  const body: any = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch,
  };
  if (sha) {
    body.sha = sha;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "User-Agent": "PlanSync-App",
      "Content-Type": "application/json",
      "Authorization": `token ${token}`,
    },
    body: JSON.stringify(body),
  });

  return response.ok;
}

export async function handleWebhook(request: Request, env: WebhookEnv): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // 1. Verify Signature
  const verified = await verifySignature(request, env.GITHUB_WEBHOOK_SECRET);
  if (!verified) {
    return new Response("Unauthorized signature", { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event !== "push") {
    return new Response("Event not supported", { status: 202 });
  }

  const payload = await request.json() as any;
  const repoFullName = payload.repository.full_name;
  const installationId = payload.installation?.id || 0;
  const ref = payload.ref;
  const branch = ref.replace("refs/heads/", "");

  // 2. Get or Create Project
  const project = await db.getOrCreateProject(env, repoFullName, installationId);

  // 3. Process Commits
  for (const commit of payload.commits || []) {
    const filePaths = [
      ...(commit.added || []),
      ...(commit.modified || []),
      ...(commit.removed || []),
    ];

    // Insert Commit Event
    await db.insert(env, "commit_events", {
      project_id: project.id,
      author_github_username: commit.author.username || commit.author.name,
      branch,
      file_paths: filePaths,
      commit_sha: commit.id,
      message: commit.message,
    });

    // Heuristic: Extract architecture decisions from commit message
    const isDecision =
      commit.message.toLowerCase().includes("decided") ||
      commit.message.toLowerCase().includes("chose") ||
      commit.message.toLowerCase().includes("instead of") ||
      commit.message.toLowerCase().startsWith("merge");
      
    if (isDecision) {
      // Split message by double newline to get summary vs detailed description
      const parts = commit.message.split("\n\n");
      const topic = parts[0].substring(0, 100);
      const summary = parts.slice(1).join("\n\n") || parts[0];

      await db.insert(env, "decisions", {
        project_id: project.id,
        topic,
        summary,
        source_commit_sha: commit.id,
      });
    }

    // Update Plan Nodes based on file paths
    // Fetch all plan nodes for this project
    const planNodes = await db.select(env, "plan_nodes", { project_id: `eq.${project.id}` });
    for (const node of planNodes) {
      const match = filePaths.some((fp: string) =>
        node.target_paths.some((tp: string) => {
          // Check simple glob match (e.g. contains or prefix)
          const cleanTp = tp.replace(/\*/g, "");
          return fp.includes(cleanTp);
        })
      );

      if (match) {
        let newStatus = node.status;
        if (node.status === "not_started") {
          newStatus = "in_progress";
        }
        // Auto mark as done if commit message contains completion keywords
        const completeKeywords = ["fix", "close", "resolve", "done", "complete"];
        if (completeKeywords.some(kw => commit.message.toLowerCase().includes(kw))) {
          newStatus = "done";
        }

        if (newStatus !== node.status) {
          await db.update(
            env,
            "plan_nodes",
            { id: `eq.${node.id}` },
            { status: newStatus, updated_at: new Date().toISOString() }
          );
        }
      }
    }

    // 4. AST Extraction & Vector Embedding
    // Only parse added/modified files
    const parseFiles = [...(commit.added || []), ...(commit.modified || [])];
    for (const filePath of parseFiles) {
      if (
        filePath.endsWith(".ts") ||
        filePath.endsWith(".js") ||
        filePath.endsWith(".tsx") ||
        filePath.endsWith(".jsx") ||
        filePath.endsWith(".py")
      ) {
        const content = await fetchGitHubFile(env, repoFullName, filePath, commit.id);
        if (content) {
          // Clean existing contracts for this file
          await db.delete(env, "contracts", {
            project_id: `eq.${project.id}`,
            file_path: `eq.${filePath}`,
          });

          const extracted = extractContracts(filePath, content);
          for (const contract of extracted) {
            // Generate semantic embedding for duplication detection
            const embeddingText = `${contract.module_name} ${contract.function_name} ${contract.signature}`;
            const embedding = await getEmbedding(env, embeddingText);

            await db.insert(env, "contracts", {
              project_id: project.id,
              module_name: contract.module_name,
              function_name: contract.function_name,
              signature: contract.signature,
              file_path: contract.file_path,
              embedding,
            });
          }
        }
      }
    }
  }

  // 5. Update AGENTS.md in the repo
  try {
    await syncAgentsMarkdown(env, project.id, repoFullName, branch);
  } catch (err) {
    console.error("Failed to sync AGENTS.md:", err);
  }

  return new Response("Webhook processed successfully", { status: 200 });
}

// Read from Supabase and rewrite AGENTS.md auto sections
async function syncAgentsMarkdown(
  env: WebhookEnv,
  projectId: string,
  repoFullName: string,
  branch: string
): Promise<void> {
  const token = env.GITHUB_TOKEN;
  if (!token) return;

  // 1. Fetch current AGENTS.md file
  let agentsMdContent = "";
  let fileSha: string | undefined;

  const url = `https://api.github.com/repos/${repoFullName}/contents/AGENTS.md?ref=${branch}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PlanSync-App",
      "Authorization": `token ${token}`,
    },
  });

  if (response.ok) {
    const data = await response.json() as any;
    fileSha = data.sha;
    agentsMdContent = decodeURIComponent(escape(atob(data.content)));
  } else if (response.status === 404) {
    // Start with a blank template if file does not exist
    agentsMdContent = `# AGENTS.md

## Project context
This file is automatically synchronized by PlanSync. Direct edits in auto-blocks will be overwritten.

## Architecture decisions
<!-- AUTO:DECISIONS -->
<!-- /AUTO -->

## Current task ownership
<!-- AUTO:OWNERSHIP -->
<!-- /AUTO -->

## Known contracts
<!-- AUTO:CONTRACTS -->
<!-- /AUTO -->
`;
  } else {
    throw new Error(`Failed to fetch AGENTS.md: ${response.status}`);
  }

  // 2. Fetch data from Supabase
  const [decisions, planNodes, contracts] = await Promise.all([
    db.select(env, "decisions", { project_id: `eq.${projectId}` }),
    db.select(env, "plan_nodes", { project_id: `eq.${projectId}` }),
    db.select(env, "contracts", { project_id: `eq.${projectId}` }),
  ]);

  // 3. Render Markdown sections
  const decisionsMd = decisions
    .map(d => `- **${d.topic}**: ${d.summary} (Commit: ${d.source_commit_sha?.substring(0, 7)})`)
    .join("\n");

  const ownershipMd = planNodes
    .map(n => `- **${n.name}** [${n.status}]: owned by @${n.owner_github_username || "unassigned"} (Targets: \`${n.target_paths.join(", ")}\`)`)
    .join("\n");

  const contractsMd = contracts
    .map(c => `- \`${c.module_name}.${c.function_name}${c.signature}\` in [${c.file_path}](file:///${c.file_path})`)
    .join("\n");

  // 4. Update the content strings between markers
  let updatedContent = replaceSection(agentsMdContent, "DECISIONS", decisionsMd);
  updatedContent = replaceSection(updatedContent, "OWNERSHIP", ownershipMd);
  updatedContent = replaceSection(updatedContent, "CONTRACTS", contractsMd);

  if (updatedContent !== agentsMdContent) {
    await commitGitHubFile(
      env,
      repoFullName,
      "AGENTS.md",
      updatedContent,
      fileSha,
      "docs: sync AGENTS.md auto-generated sections [skip ci]",
      branch
    );
  }
}

function replaceSection(content: string, sectionName: string, sectionBody: string): string {
  const startMarker = `<!-- AUTO:${sectionName} -->`;
  const endMarker = `<!-- /AUTO -->`;
  
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker, startIndex);

  if (startIndex === -1 || endIndex === -1) {
    return content; // If markers not found, don't edit
  }

  const before = content.substring(0, startIndex + startMarker.length);
  const after = content.substring(endIndex);

  return `${before}\n${sectionBody}\n${after}`;
}
