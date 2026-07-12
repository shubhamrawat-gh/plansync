import { db } from "./db";
import { getEmbedding } from "./embeddings";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export function listTools(): ToolDefinition[] {
  return [
    {
      name: "plan_task",
      description: "Register an upcoming coding task before starting work. Returns warnings if similar work is already in progress by a teammate, or if a plan node already covers this area. Call this before writing significant new code.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "Short description of the task about to be done" },
          target_files: { type: "array", items: { type: "string" }, description: "Glob patterns or file paths this task will likely touch" },
          owner: { type: "string", description: "Your GitHub username" },
          name: { type: "string", description: "Short name/title for the task" }
        },
        required: ["description", "target_files", "owner", "name"]
      }
    },
    {
      name: "get_api_contract",
      description: "Get the real, extracted function signature and type contract for a named module or feature already built by a teammate (e.g. 'auth', 'cart'). Returns the actual exported function signatures, not a description — use this instead of guessing an interface.",
      inputSchema: {
        type: "object",
        properties: {
          module_name: { type: "string", description: "The name of the module or file (without extension) to retrieve contracts for" }
        },
        required: ["module_name"]
      }
    },
    {
      name: "check_collision",
      description: "Check whether any teammate's agent session has touched these file paths recently, including uncommitted work on other branches. Call before and during large edits to avoid overwriting concurrent work.",
      inputSchema: {
        type: "object",
        properties: {
          file_paths: { type: "array", items: { type: "string" }, description: "List of absolute or relative file paths to check for collision" }
        },
        required: ["file_paths"]
      }
    },
    {
      name: "get_recent_decisions",
      description: "Get recent architecture decisions and their rationale for a given topic, extracted from commit messages and PR descriptions. Use this to understand why the codebase is structured a certain way before changing it.",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Optional topic keyword to filter decisions" }
        }
      }
    },
    {
      name: "check_semantic_duplicate",
      description: "Check whether a newly written function or module is semantically similar to existing code elsewhere in the project, even in a different file. Call this after writing a new helper or utility function, before finalizing it.",
      inputSchema: {
        type: "object",
        properties: {
          function_name: { type: "string", description: "Name of the new function" },
          signature_or_docstring: { type: "string", description: "The function signature, arguments, return type, or docstring description" }
        },
        required: ["function_name", "signature_or_docstring"]
      }
    },
    {
      name: "catch_me_up",
      description: "Get a summary of what changed in the project — commits, plan status changes, decisions — since a given time or since the caller's last session. Use at the start of a session if returning after a break.",
      inputSchema: {
        type: "object",
        properties: {
          since_minutes: { type: "number", description: "Number of minutes to look back. Defaults to 120 (2 hours)" }
        }
      }
    }
  ];
}

export async function callTool(
  env: any,
  projectId: string,
  toolName: string,
  args: any
): Promise<{ content: Array<{ type: "text"; text: string }>; isError?: boolean }> {
  try {
    switch (toolName) {
      case "plan_task": {
        const { description, target_files, owner, name } = args;
        
        // Check for colliding active sessions
        const activeSessions = await db.select(env, "active_sessions", {
          project_id: `eq.${projectId}`,
          last_heartbeat: `gt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}`
        });

        const warnings: string[] = [];
        for (const session of activeSessions) {
          if (session.github_username !== owner) {
            const overlap = session.file_paths.filter((fp: string) =>
              target_files.some((tf: string) => fp.includes(tf.replace(/\*/g, "")))
            );
            if (overlap.length > 0) {
              warnings.push(`Teammate @${session.github_username} is actively editing overlapping files: ${overlap.join(", ")}`);
            }
          }
        }

        // Check for colliding plan nodes
        const existingNodes = await db.select(env, "plan_nodes", {
          project_id: `eq.${projectId}`
        });

        for (const node of existingNodes) {
          if (node.status === "in_progress" && node.owner_github_username !== owner) {
            const overlap = node.target_paths.filter((tp: string) =>
              target_files.some((tf: string) => tp.includes(tf.replace(/\*/g, "")) || tf.includes(tp.replace(/\*/g, "")))
            );
            if (overlap.length > 0) {
              warnings.push(`Task "${node.name}" is in_progress by @${node.owner_github_username} targeting similar paths: ${overlap.join(", ")}`);
            }
          }
        }

        // Register/Upsert this plan node
        const matchedNode = existingNodes.find(n => n.name.toLowerCase() === name.toLowerCase());
        if (matchedNode) {
          await db.update(env, "plan_nodes", { id: `eq.${matchedNode.id}` }, {
            description,
            owner_github_username: owner,
            target_paths: target_files,
            status: "in_progress",
            updated_at: new Date().toISOString()
          });
        } else {
          await db.insert(env, "plan_nodes", {
            project_id: projectId,
            name,
            description,
            owner_github_username: owner,
            target_paths: target_files,
            status: "in_progress"
          });
        }

        const warningText = warnings.length > 0
          ? `⚠️ COLLISIONS DETECTED:\n${warnings.map(w => `- ${w}`).join("\n")}`
          : "✅ No collisions detected. You are clear to proceed!";

        return {
          content: [{
            type: "text",
            text: `Task "${name}" successfully registered under your ownership.\n\n${warningText}`
          }]
        };
      }

      case "get_api_contract": {
        const { module_name } = args;
        const contracts = await db.select(env, "contracts", {
          project_id: `eq.${projectId}`,
          module_name: `eq.${module_name}`
        });

        if (contracts.length === 0) {
          return {
            content: [{
              type: "text",
              text: `No contracts found for module "${module_name}".`
            }]
          };
        }

        const lines = contracts.map(c => `- \`${c.function_name}${c.signature}\` (File: ${c.file_path})`);
        return {
          content: [{
            type: "text",
            text: `API contracts for module "${module_name}":\n\n${lines.join("\n")}`
          }]
        };
      }

      case "check_collision": {
        const { file_paths } = args;
        const warnings: string[] = [];

        // Check active sessions in last 5 minutes
        const activeSessions = await db.select(env, "active_sessions", {
          project_id: `eq.${projectId}`,
          last_heartbeat: `gt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}`
        });

        for (const session of activeSessions) {
          const overlap = session.file_paths.filter((fp: string) =>
            file_paths.some((f: string) => f.includes(fp) || fp.includes(f))
          );
          if (overlap.length > 0) {
            warnings.push(`@${session.github_username} is actively editing: ${overlap.join(", ")}`);
          }
        }

        // Check recent commits in last 2 hours
        const recentCommits = await db.select(env, "commit_events", {
          project_id: `eq.${projectId}`,
          created_at: `gt.${new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()}`
        });

        const commitCollisions: string[] = [];
        for (const commit of recentCommits) {
          const overlap = commit.file_paths.filter((fp: string) =>
            file_paths.some((f: string) => f.includes(fp) || fp.includes(f))
          );
          if (overlap.length > 0) {
            commitCollisions.push(`@${commit.author_github_username} pushed to "${commit.branch}": ${overlap.join(", ")} ("${commit.message}")`);
          }
        }

        let report = "";
        if (warnings.length > 0) {
          report += `⚠️ ACTIVE TEAMMATE OVERLAPS:\n${warnings.map(w => `- ${w}`).join("\n")}\n\n`;
        }
        if (commitCollisions.length > 0) {
          report += `🕒 RECENT COMMITS OVERLAPS (Last 2 hours):\n${commitCollisions.map(c => `- ${c}`).join("\n")}\n\n`;
        }

        if (!report) {
          report = "✅ Clear! No active sessions or recent commits overlap with your files.";
        }

        return {
          content: [{
            type: "text",
            text: report
          }]
        };
      }

      case "get_recent_decisions": {
        const { topic } = args;
        const query: Record<string, string> = { project_id: `eq.${projectId}` };
        
        let decisions = await db.select(env, "decisions", query);
        
        if (topic) {
          decisions = decisions.filter(d =>
            d.topic.toLowerCase().includes(topic.toLowerCase()) ||
            d.summary.toLowerCase().includes(topic.toLowerCase())
          );
        }

        if (decisions.length === 0) {
          return {
            content: [{
              type: "text",
              text: topic ? `No architectural decisions found matching "${topic}".` : "No architectural decisions found."
            }]
          };
        }

        const decisionLines = decisions.map(
          d => `### ${d.topic}\n- **Summary**: ${d.summary}\n- **Commit**: ${d.source_commit_sha?.substring(0, 7) || "unknown"}\n- **Date**: ${new Date(d.created_at).toLocaleString()}`
        );

        return {
          content: [{
            type: "text",
            text: `Recent Architecture Decisions:\n\n${decisionLines.join("\n\n")}`
          }]
        };
      }

      case "check_semantic_duplicate": {
        const { function_name, signature_or_docstring } = args;
        const embeddingText = `${function_name} ${signature_or_docstring}`;
        
        // Generate embedding
        const embedding = await getEmbedding(env, embeddingText);

        // Run RPC call to find matches
        const matches = await db.rpc(env, "match_contracts", {
          p_project_id: projectId,
          query_embedding: embedding,
          match_threshold: 0.70, // 70% threshold
          match_count: 3
        });

        if (!matches || matches.length === 0) {
          return {
            content: [{
              type: "text",
              text: "✅ No similar functions found in contracts. This appears unique!"
            }]
          };
        }

        const matchLines = matches.map(
          (m: any) => `- \`${m.module_name}.${m.function_name}${m.signature}\` in [${m.file_path}](file:///${m.file_path}) (Similarity: ${(m.similarity * 100).toFixed(1)}%)`
        );

        return {
          content: [{
            type: "text",
            text: `⚠️ SEMANTIC DUPLICATE WARNING:\nFound functions that may already solve this:\n\n${matchLines.join("\n")}`
          }]
        };
      }

      case "catch_me_up": {
        const sinceMinutes = args.since_minutes || 120;
        const sinceTime = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();

        // 1. Fetch recent commits
        const commits = await db.select(env, "commit_events", {
          project_id: `eq.${projectId}`,
          created_at: `gt.${sinceTime}`
        });

        // 2. Fetch recent decisions
        const decisions = await db.select(env, "decisions", {
          project_id: `eq.${projectId}`,
          created_at: `gt.${sinceTime}`
        });

        // 3. Fetch plan updates
        const planNodes = await db.select(env, "plan_nodes", {
          project_id: `eq.${projectId}`,
          updated_at: `gt.${sinceTime}`
        });

        let recap = `## Recap for the last ${sinceMinutes} minutes:\n\n`;

        if (commits.length > 0) {
          recap += `### 💻 Commits Pushed (${commits.length}):\n`;
          commits.forEach(c => {
            recap += `- **@${c.author_github_username}** on \`${c.branch}\`: "${c.message}" (${c.file_paths?.length || 0} files)\n`;
          });
          recap += "\n";
        }

        if (decisions.length > 0) {
          recap += `### 💡 Architecture Decisions Made (${decisions.length}):\n`;
          decisions.forEach(d => {
            recap += `- **${d.topic}**: ${d.summary}\n`;
          });
          recap += "\n";
        }

        if (planNodes.length > 0) {
          recap += `### 📋 Task Updates (${planNodes.length}):\n`;
          planNodes.forEach(p => {
            recap += `- **${p.name}** updated to \`${p.status}\` (Owned by @${p.owner_github_username || "unassigned"})\n`;
          });
          recap += "\n";
        }

        if (commits.length === 0 && decisions.length === 0 && planNodes.length === 0) {
          recap += "Nothing has changed! You are completely up to date.";
        }

        return {
          content: [{
            type: "text",
            text: recap
          }]
        };
      }

      default:
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Tool "${toolName}" not found.`
          }]
        };
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error executing tool "${toolName}": ${error.message}`
      }]
    };
  }
}
