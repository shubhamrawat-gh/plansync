import { db } from "./db";
import { handleWebhook } from "./webhook";
import { listTools, callTool } from "./tools";

// In-memory sessions map for local/single-isolate SSE testing
const sseSessions = new Map<string, ReadableStreamDefaultController>();

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Webhook Endpoint
    if (url.pathname === "/webhook") {
      try {
        const response = await handleWebhook(request, env);
        // Inject CORS headers
        const newHeaders = new Headers(response.headers);
        Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      } catch (err: any) {
        console.error("Webhook error:", err);
        return new Response(`Webhook Error: ${err.message}`, { status: 500, headers: corsHeaders });
      }
    }

    // 2. Active Session Heartbeat Endpoint (from CLI watch)
    if (url.pathname === "/session/heartbeat" && request.method === "POST") {
      try {
        const authHeader = request.headers.get("Authorization");
        const token = authHeader?.replace("Bearer ", "").trim();
        if (!token) {
          return new Response("Unauthorized", { status: 401, headers: corsHeaders });
        }

        const project = await db.selectOne(env, "projects", { id: `eq.${token}` });
        if (!project) {
          return new Response("Project not found", { status: 404, headers: corsHeaders });
        }

        const body = await request.json() as any;
        const { github_username, file_paths } = body;

        if (!github_username || !file_paths) {
          return new Response("Missing parameters", { status: 400, headers: corsHeaders });
        }

        // Upsert session heartbeat
        const existing = await db.selectOne(env, "active_sessions", {
          project_id: `eq.${project.id}`,
          github_username: `eq.${github_username}`
        });

        if (existing) {
          await db.update(env, "active_sessions", { id: `eq.${existing.id}` }, {
            file_paths,
            last_heartbeat: new Date().toISOString()
          });
        } else {
          await db.insert(env, "active_sessions", {
            project_id: project.id,
            github_username,
            file_paths
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      } catch (err: any) {
        return new Response(`Error: ${err.message}`, { status: 500, headers: corsHeaders });
      }
    }

    // 3. MCP SSE / HTTP Server Endpoint
    if (url.pathname === "/mcp") {
      // Auth check
      const authHeader = request.headers.get("Authorization");
      let token = authHeader?.replace("Bearer ", "").trim();
      
      // Fallback to query param token if not in headers (common for SSE GET requests)
      if (!token) {
        token = url.searchParams.get("token") || undefined;
      }

      if (!token) {
        return new Response("Unauthorized: Bearer token or token query parameter required", {
          status: 401,
          headers: corsHeaders,
        });
      }

      // Verify project exists
      const project = await db.selectOne(env, "projects", { id: `eq.${token}` });
      if (!project) {
        return new Response("Unauthorized: Project not found", { status: 401, headers: corsHeaders });
      }

      // Handle SSE Connection Init (GET)
      if (request.method === "GET") {
        const sessionId = Math.random().toString(36).substring(2, 15);
        
        const stream = new ReadableStream({
          start(controller) {
            sseSessions.set(sessionId, controller);
            
            // Send endpoint URL for POST requests
            const postUrl = `${url.origin}/mcp?token=${token}&sessionId=${sessionId}`;
            const message = `event: endpoint\ndata: ${postUrl}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
          },
          cancel() {
            sseSessions.delete(sessionId);
          }
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            ...corsHeaders,
          }
        });
      }

      // Handle JSON-RPC Calls (POST)
      if (request.method === "POST") {
        try {
          const body = await request.json() as any;
          const sessionId = url.searchParams.get("sessionId");

          let rpcResponse: any;

          if (body.method === "initialize") {
            rpcResponse = {
              jsonrpc: "2.0",
              id: body.id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: {
                  tools: {}
                },
                serverInfo: {
                  name: "plansync-mcp",
                  version: "1.0.0"
                }
              }
            };
          } else if (body.method === "tools/list") {
            rpcResponse = {
              jsonrpc: "2.0",
              id: body.id,
              result: {
                tools: listTools()
              }
            };
          } else if (body.method === "tools/call") {
            const toolName = body.params?.name;
            const args = body.params?.arguments || {};
            const result = await callTool(env, project.id, toolName, args);

            rpcResponse = {
              jsonrpc: "2.0",
              id: body.id,
              result
            };
          } else {
            // Default success/empty for check/handshake methods
            rpcResponse = {
              jsonrpc: "2.0",
              id: body.id,
              result: {}
            };
          }

          // If sessionId is present, write response back to the open SSE stream
          if (sessionId && sseSessions.has(sessionId)) {
            const controller = sseSessions.get(sessionId);
            if (controller) {
              const sseMessage = `event: message\ndata: ${JSON.stringify(rpcResponse)}\n\n`;
              controller.enqueue(new TextEncoder().encode(sseMessage));
              
              return new Response("Accepted", { status: 202, headers: corsHeaders });
            }
          }

          // Otherwise return directly via stateless HTTP POST
          return new Response(JSON.stringify(rpcResponse), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders,
            }
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: err.message }
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json", ...corsHeaders }
            }
          );
        }
      }
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  }
};
