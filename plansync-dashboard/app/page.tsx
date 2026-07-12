"use client";

import React, { useEffect, useState } from "react";
import {
  dashboardDb,
  Project,
  PlanNode,
  CommitEvent,
  CodeContract,
  Decision,
  ActiveSession,
} from "../lib/db";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [planNodes, setPlanNodes] = useState<PlanNode[]>([]);
  const [commits, setCommits] = useState<CommitEvent[]>([]);
  const [contracts, setContracts] = useState<CodeContract[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"tasks" | "decisions" | "contracts">("tasks");

  // Form State for creating new plan node
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskOwner, setNewTaskOwner] = useState("");
  const [newTaskPaths, setNewTaskPaths] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Load Data
  const loadData = async () => {
    try {
      const projs = await dashboardDb.getProjects();
      setProjects(projs);
      
      const currentProjId = selectedProjectId || (projs.length > 0 ? projs[0].id : "");
      if (projs.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projs[0].id);
      }

      if (currentProjId) {
        const [nodes, comms, conts, decs, sess] = await Promise.all([
          dashboardDb.getPlanNodes(currentProjId),
          dashboardDb.getCommits(currentProjId),
          dashboardDb.getContracts(currentProjId),
          dashboardDb.getDecisions(currentProjId),
          dashboardDb.getActiveSessions(currentProjId),
        ]);
        setPlanNodes(nodes);
        setCommits(comms);
        setContracts(conts);
        setDecisions(decs);
        setSessions(sess);
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh every 10 seconds for real-time live preview
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [selectedProjectId]);

  // Check for active file conflicts
  const getCollisions = () => {
    const collisions: Array<{ user1: string; user2: string; files: string[] }> = [];
    const activeThreshold = Date.now() - 5 * 60 * 1000; // Last 5 mins active

    const activeUserSessions = sessions.filter(
      s => new Date(s.last_heartbeat).getTime() > activeThreshold
    );

    for (let i = 0; i < activeUserSessions.length; i++) {
      for (let j = i + 1; j < activeUserSessions.length; j++) {
        const u1 = activeUserSessions[i];
        const u2 = activeUserSessions[j];
        const overlap = u1.file_paths.filter(f1 => u2.file_paths.includes(f1));
        if (overlap.length > 0) {
          collisions.push({
            user1: u1.github_username,
            user2: u2.github_username,
            files: overlap,
          });
        }
      }
    }
    return collisions;
  };

  const collisions = getCollisions();
  const activeProject = projects.find(p => p.id === selectedProjectId);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName || !newTaskPaths) return;
    setSubmitting(true);
    try {
      const pathsArray = newTaskPaths.split(",").map(p => p.trim()).filter(Boolean);
      await dashboardDb.createPlanNode({
        project_id: selectedProjectId,
        name: newTaskName,
        description: newTaskDesc,
        owner_github_username: newTaskOwner || "unassigned",
        target_paths: pathsArray,
        status: "not_started",
      });
      // Clear form
      setNewTaskName("");
      setNewTaskDesc("");
      setNewTaskOwner("");
      setNewTaskPaths("");
      await loadData();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      
      {/* Background Neon Glow Effect */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none" />
      
      {/* Navbar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-indigo-600 flex items-center justify-center font-bold text-xl shadow-[0_0_20px_rgba(34,211,238,0.3)] text-white">
              P
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-500 bg-clip-text text-transparent tracking-tight">
                PlanSync
              </h1>
              <p className="text-xs text-slate-500">Multi-Agent Coordination Hub</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status indicator */}
            <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/50`}>
              {dashboardDb.isMock ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                  <span className="text-amber-400 font-medium">DEMO PREVIEW</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-emerald-400 font-medium">LIVE DATABASE</span>
                </>
              )}
            </div>

            {/* Project Selector */}
            <div className="relative">
              <select
                className="appearance-none bg-slate-900 border border-slate-800 text-slate-300 px-4 py-1.5 pr-8 rounded-lg text-sm focus:outline-none focus:border-cyan-500 cursor-pointer"
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setLoading(true);
                }}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.repo_full_name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6 relative">
        
        {/* Loading Spinner */}
        {loading && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full border-4 border-slate-800 border-t-cyan-500 animate-spin" />
            <p className="text-slate-400 text-sm">Syncing agent logs...</p>
          </div>
        )}

        {/* Global Collision Warnings */}
        {collisions.length > 0 && (
          <div className="border border-red-500/30 bg-red-950/20 backdrop-blur-md rounded-xl p-4 flex gap-4 items-start shadow-[0_0_20px_rgba(239,68,68,0.05)] border-l-4 border-l-red-500 animate-bounce-subtle">
            <div className="text-red-400 mt-0.5">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold text-sm">Active Session Overlap Detected!</h3>
              <p className="text-slate-300 text-xs mt-1">
                Multiple agents are editing the same files simultaneously. Please coordinate tasks to avoid git merge conflicts.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {collisions.map((c, i) => (
                  <div key={i} className="text-xs bg-red-950/50 border border-red-900/50 rounded-lg px-3 py-1.5 text-slate-300">
                    🧑‍💻 <span className="text-red-400 font-medium">@{c.user1}</span> & <span className="text-red-400 font-medium">@{c.user2}</span> overlapping on:
                    <div className="mt-1 font-mono text-[11px] text-slate-400">
                      {c.files.map(f => `  - ${f}`).join("\n")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border border-slate-900 bg-slate-900/30 rounded-xl p-5 backdrop-blur-sm hover:border-slate-800 transition">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Active Agents</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight">
                {sessions.filter(s => new Date(s.last_heartbeat).getTime() > Date.now() - 5 * 60 * 1000).length}
              </span>
              <span className="text-xs text-slate-400">active now</span>
            </div>
          </div>

          <div className="border border-slate-900 bg-slate-900/30 rounded-xl p-5 backdrop-blur-sm hover:border-slate-800 transition">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Architecture Decisions</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight">{decisions.length}</span>
              <span className="text-xs text-slate-400">extracted</span>
            </div>
          </div>

          <div className="border border-slate-900 bg-slate-900/30 rounded-xl p-5 backdrop-blur-sm hover:border-slate-800 transition">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">API Contracts</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight">{contracts.length}</span>
              <span className="text-xs text-slate-400">active signatures</span>
            </div>
          </div>

          <div className="border border-slate-900 bg-slate-900/30 rounded-xl p-5 backdrop-blur-sm hover:border-slate-800 transition">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Workspace Conflict State</p>
            <div className="mt-2 flex items-center gap-2">
              {collisions.length > 0 ? (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                  <span className="text-sm font-bold text-red-500 uppercase tracking-wide">COLLISIONS</span>
                </>
              ) : (
                <>
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-sm font-bold text-emerald-500 uppercase tracking-wide">CLEARED (NO DRIFT)</span>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Dashboard Grid Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Column 1: Active Sessions & Commit Feed */}
          <div className="flex flex-col gap-6 lg:col-span-1">
            
            {/* Active Sessions */}
            <div className="border border-slate-900 bg-slate-950/50 rounded-2xl p-5 backdrop-blur-md flex flex-col gap-4 shadow-xl">
              <div className="flex justify-between items-center">
                <h2 className="text-base font-bold text-slate-200">Teammate Sessions</h2>
                <span className="text-xs text-slate-500 bg-slate-900/50 border border-slate-900 px-2 py-0.5 rounded-full">
                  Heartbeat monitored
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {sessions.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No agent sessions active.</p>
                ) : (
                  sessions.map((s) => {
                    const isOnline = new Date(s.last_heartbeat).getTime() > Date.now() - 5 * 60 * 1000;
                    const isStale = new Date(s.last_heartbeat).getTime() > Date.now() - 15 * 60 * 1000 && !isOnline;
                    
                    return (
                      <div
                        key={s.id}
                        className={`p-3 rounded-xl border transition-all ${
                          isOnline
                            ? "bg-slate-900/40 border-slate-800/80"
                            : "bg-slate-950/10 border-slate-900/30 opacity-60"
                        }`}
                      >
                        <div className="flex justify-between items-center gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isOnline
                                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                                  : isStale
                                  ? "bg-amber-500"
                                  : "bg-slate-600"
                              }`}
                            />
                            <span className="font-semibold text-sm text-slate-300">
                              @{s.github_username}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {isOnline ? "Active" : "Away"}
                          </span>
                        </div>

                        {/* File lists */}
                        <div className="mt-2 flex flex-col gap-1">
                          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Editing:</p>
                          {s.file_paths.map((fp, i) => (
                            <div key={i} className="text-xs font-mono text-cyan-400 bg-slate-950/50 px-2 py-1 rounded border border-slate-900/50 truncate flex items-center justify-between">
                              <span>{fp.split("/").pop()}</span>
                              <span className="text-[9px] text-slate-600 font-sans">{fp}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Live Commit Feed */}
            <div className="border border-slate-900 bg-slate-950/50 rounded-2xl p-5 backdrop-blur-md flex flex-col gap-4 shadow-xl">
              <h2 className="text-base font-bold text-slate-200">Commit Event Stream</h2>
              
              <div className="relative border-l border-slate-900 pl-4 ml-2 flex flex-col gap-5">
                {commits.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No commits received yet.</p>
                ) : (
                  commits.map((c) => (
                    <div key={c.id} className="relative group">
                      {/* Timeline dot */}
                      <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-800 group-hover:bg-cyan-500 transition-colors border border-slate-950" />
                      
                      <div className="text-xs text-slate-500 flex items-center justify-between gap-2">
                        <span>@{c.author_github_username}</span>
                        <span className="font-mono text-[10px] text-slate-600">
                          {c.commit_sha.substring(0, 7)}
                        </span>
                      </div>
                      
                      <p className="text-xs text-slate-300 font-medium mt-1 pr-2 line-clamp-2">
                        {c.message}
                      </p>

                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 font-mono">
                          branch: {c.branch}
                        </span>
                        <span className="text-[9px] text-slate-600">
                          {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Column 2 & 3: Tabs workspace (Tasks, Decisions, Contracts) & Task Creator */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            
            {/* Tabs selector */}
            <div className="border border-slate-900 bg-slate-950/50 rounded-2xl p-5 backdrop-blur-md flex flex-col gap-4 shadow-xl">
              <div className="flex border-b border-slate-900 pb-3 justify-between items-center flex-wrap gap-4">
                <div className="flex gap-2">
                  {(["tasks", "decisions", "contracts"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                        activeTab === tab
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                          : "text-slate-400 border border-transparent hover:text-slate-200"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <span className="text-xs text-slate-500 italic">
                  {activeTab === "tasks" && `${planNodes.length} registered nodes`}
                  {activeTab === "decisions" && `${decisions.length} decisions logged`}
                  {activeTab === "contracts" && `${contracts.length} interfaces active`}
                </span>
              </div>

              {/* Tab 1: Tasks */}
              {activeTab === "tasks" && (
                <div className="flex flex-col gap-3">
                  {planNodes.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No tasks created yet.</p>
                  ) : (
                    planNodes.map((node) => {
                      const badgeColors = {
                        not_started: "bg-slate-900/80 border-slate-800 text-slate-400",
                        in_progress: "bg-blue-500/10 border-blue-500/20 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]",
                        blocked: "bg-red-500/10 border-red-500/20 text-red-400",
                        done: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                      };

                      return (
                        <div
                          key={node.id}
                          className="p-4 rounded-xl border border-slate-900 bg-slate-900/10 hover:border-slate-800 transition"
                        >
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <h3 className="text-sm font-bold text-slate-200">{node.name}</h3>
                              <p className="text-xs text-slate-400 mt-1">{node.description}</p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badgeColors[node.status]}`}>
                              {node.status.replace("_", " ")}
                            </span>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                            <span className="text-slate-500">
                              Owner: <span className="text-slate-300">@{node.owner_github_username}</span>
                            </span>
                            
                            <div className="flex gap-1.5 flex-wrap items-center">
                              <span className="text-slate-500">Targets:</span>
                              {node.target_paths.map((p, i) => (
                                <code key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-900 font-mono text-cyan-400">
                                  {p}
                                </code>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab 2: Decisions */}
              {activeTab === "decisions" && (
                <div className="flex flex-col gap-4">
                  {decisions.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No decisions extracted.</p>
                  ) : (
                    decisions.map((dec) => (
                      <div
                        key={dec.id}
                        className="p-4 rounded-xl border border-slate-900 bg-indigo-950/5 hover:border-slate-800 transition flex flex-col gap-2"
                      >
                        <h3 className="text-sm font-bold text-indigo-300">{dec.topic}</h3>
                        <p className="text-xs text-slate-300 leading-relaxed">{dec.summary}</p>
                        
                        <div className="flex justify-between items-center text-[10px] text-slate-500 mt-2">
                          <span>Commit: <code className="text-[10px] text-slate-400 font-mono">{dec.source_commit_sha?.substring(0, 7)}</code></span>
                          <span>{new Date(dec.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 3: Contracts */}
              {activeTab === "contracts" && (
                <div className="flex flex-col gap-3">
                  {contracts.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">No exported contracts extracted.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-900 text-slate-500 uppercase tracking-wider font-semibold">
                            <th className="py-2 px-3">Module</th>
                            <th className="py-2 px-3">Function Name</th>
                            <th className="py-2 px-3">Signature</th>
                            <th className="py-2 px-3">Source File</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contracts.map((c) => (
                            <tr key={c.id} className="border-b border-slate-900/50 hover:bg-slate-900/10 transition-colors">
                              <td className="py-3 px-3 font-semibold text-indigo-400">{c.module_name}</td>
                              <td className="py-3 px-3 font-mono font-bold text-slate-200">{c.function_name}</td>
                              <td className="py-3 px-3 font-mono text-cyan-400 select-all">{c.signature}</td>
                              <td className="py-3 px-3 text-slate-500 truncate max-w-[150px]" title={c.file_path}>
                                {c.file_path}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Task Registration Form (Simulates Agent Registration) */}
            <div className="border border-slate-900 bg-slate-950/50 rounded-2xl p-5 backdrop-blur-md flex flex-col gap-4 shadow-xl">
              <h2 className="text-base font-bold text-slate-200">Register Upcoming Task Node</h2>
              <p className="text-xs text-slate-500">
                Register tasks manually here to simulate what agents do via the `plan_task` tool.
              </p>

              <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Task Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Implement Jwt Strategy"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">GitHub Owner</label>
                  <input
                    type="text"
                    placeholder="e.g. Claude-Sonnet-Agent"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    value={newTaskOwner}
                    onChange={(e) => setNewTaskOwner(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Description</label>
                  <input
                    type="text"
                    placeholder="Add a short description about this task"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Target File Paths (comma separated)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. src/auth/jwt.ts, src/auth/types.ts"
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                    value={newTaskPaths}
                    onChange={(e) => setNewTaskPaths(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2 mt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs tracking-wider uppercase transition shadow-[0_0_15px_rgba(34,211,238,0.2)] disabled:opacity-50"
                  >
                    {submitting ? "Registering..." : "Register Task Node"}
                  </button>
                </div>
              </form>
            </div>

          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600 mt-auto">
        <p>© 2026 PlanSync. Built for Multi-Agent Developer Teams.</p>
      </footer>
    </div>
  );
}
