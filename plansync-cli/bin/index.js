#!/usr/bin/env node

import { Command } from "commander";
import pc from "picocolors";
import fs from "fs";
import path from "path";
import { getGitConfig } from "../src/git.js";
import { startWatcher } from "../src/watcher.js";

const program = new Command();

program
  .name("plansync")
  .description("PlanSync Multi-Agent Coordination CLI tool")
  .version("1.0.0");

// 1. init command
program
  .command("init")
  .description("Initialize PlanSync in this repository")
  .option("-s, --server <url>", "PlanSync Worker server URL", "http://localhost:8787")
  .option("-t, --token <token>", "Project authentication Token (Supabase Project ID)")
  .action(async (options) => {
    console.log(pc.cyan("⚡ Initializing PlanSync..."));

    const gitInfo = getGitConfig();
    if (!gitInfo.repoName) {
      console.error(pc.red("❌ Error: Could not determine GitHub repository name. Ensure this is a git repo with a remote origin."));
      process.exit(1);
    }

    console.log(`Detected Repo: ${pc.green(gitInfo.repoName)}`);
    console.log(`Detected Branch: ${pc.green(gitInfo.branch)}`);
    console.log(`Detected Agent Username: ${pc.green(gitInfo.username)}`);

    let token = options.token;
    if (!token) {
      console.log(pc.yellow("\n⚠️ Authentication token was not provided."));
      console.log(`To obtain a token, register your repo on the PlanSync Dashboard:`);
      console.log(pc.blue(`${options.server.replace("/mcp", "")}`));
      console.log(`After registering, run: ${pc.bold(`plansync init --token <YOUR_PROJECT_ID> --server <SERVER_URL>`)}`);
      
      // Let's create a dummy config anyway so they can edit it
      token = "YOUR_PROJECT_ID_HERE";
    }

    const config = {
      serverUrl: options.server,
      token: token,
      repoName: gitInfo.repoName
    };

    fs.writeFileSync(path.join(process.cwd(), ".plansync.json"), JSON.stringify(config, null, 2));
    console.log(pc.green("\n✓ Created .plansync.json configuration file."));

    // Check if AGENTS.md exists. If not, write it.
    const agentsMdPath = path.join(process.cwd(), "AGENTS.md");
    if (!fs.existsSync(agentsMdPath)) {
      const template = `# AGENTS.md

## Project context
<!-- manual section — edit freely -->
Welcome to the multi-agent team repository. This file serves as a shared context board for all active agent sessions (Claude Code, Antigravity, etc.) and developer coordinates.

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
      fs.writeFileSync(agentsMdPath, template);
      console.log(pc.green("✓ Created starter AGENTS.md. Make sure to commit it to the repository!"));
    } else {
      console.log(pc.blue("ℹ AGENTS.md already exists. Skipping template creation."));
    }

    console.log(pc.cyan("\n✓ Ready! Run `plansync watch` to start sending live heartbeats."));
  });

// 2. watch command
program
  .command("watch")
  .description("Watch workspace directory for file changes and update active session status")
  .action(() => {
    const configPath = path.join(process.cwd(), ".plansync.json");
    if (!fs.existsSync(configPath)) {
      console.error(pc.red("❌ Error: No .plansync.json found. Please run `plansync init` first."));
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!config.token || config.token === "YOUR_PROJECT_ID_HERE") {
      console.error(pc.red("❌ Error: Valid project token not found in .plansync.json. Run `plansync init` with your project token."));
      process.exit(1);
    }

    startWatcher(config.serverUrl, config.token);
  });

program.parse(process.argv);
