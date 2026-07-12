import { execSync } from "child_process";

export function getGitConfig() {
  try {
    const username = execSync("git config user.name").toString().trim();
    const email = execSync("git config user.email").toString().trim();
    
    // Extract a clean username (GitHub username is ideal, fallback to email prefix or name)
    let githubUsername = username;
    try {
      githubUsername = execSync("git config github.user").toString().trim();
    } catch {
      // Fallback
      if (email) {
        githubUsername = email.split("@")[0];
      }
    }

    const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    const remoteUrl = execSync("git config --get remote.origin.url").toString().trim();

    // Parse owner/repo from remote URL
    // Supports:
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    let repoName = "";
    const match = remoteUrl.match(/github\.com[/:]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (match) {
      repoName = match[1];
    }

    return {
      username: githubUsername || "anonymous-agent",
      branch,
      repoName,
      remoteUrl,
    };
  } catch (error) {
    console.error("Error executing git commands. Ensure you are inside a Git repository:", error.message);
    return {
      username: "anonymous-agent",
      branch: "main",
      repoName: "",
      remoteUrl: "",
    };
  }
}
