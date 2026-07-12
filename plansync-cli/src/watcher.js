import chokidar from "chokidar";
import { getGitConfig } from "./git.js";

export function startWatcher(serverUrl, token) {
  const gitInfo = getGitConfig();
  const username = gitInfo.username;
  
  console.log(`Starting PlanSync File Watcher for @${username} on branch [${gitInfo.branch}]...`);
  console.log(`Target server: ${serverUrl}`);

  // Track modified/active files in a Set
  const activeFiles = new Set();
  let heartbeatTimeout = null;

  // Send heartbeat function
  async function sendHeartbeat() {
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
    }

    const filePaths = Array.from(activeFiles);
    
    try {
      const response = await fetch(`${serverUrl}/session/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          github_username: username,
          file_paths: filePaths
        })
      });

      if (!response.ok) {
        console.error(`[PlanSync] Heartbeat failed: ${response.status} - ${await response.text()}`);
      } else {
        console.log(`[PlanSync] Heartbeat synced. Active files: ${filePaths.length}`);
      }
    } catch (err) {
      console.error("[PlanSync] Network error sending heartbeat:", err.message);
    }

    // Schedule next heartbeat in 30 seconds
    heartbeatTimeout = setTimeout(sendHeartbeat, 30000);
  }

  // Initialize chokidar watcher
  const watcher = chokidar.watch(".", {
    ignored: [
      /(^|[/\\])\../,     // Ignore dotfiles
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**"
    ],
    persistent: true,
    ignoreInitial: true
  });

  // Watch change and add events
  watcher
    .on("change", (path) => {
      console.log(`[PlanSync] File modified: ${path}`);
      activeFiles.add(path);
      
      // Throttle heartbeat on changes: send in 2 seconds
      if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
      heartbeatTimeout = setTimeout(sendHeartbeat, 2000);
    })
    .on("unlink", (path) => {
      activeFiles.delete(path);
      if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
      heartbeatTimeout = setTimeout(sendHeartbeat, 2000);
    });

  // Start initial heartbeat
  sendHeartbeat();

  // Handle clean exit
  process.on("SIGINT", () => {
    console.log("\nStopping PlanSync Watcher...");
    if (heartbeatTimeout) clearTimeout(heartbeatTimeout);
    watcher.close().then(() => {
      process.exit(0);
    });
  });
}
