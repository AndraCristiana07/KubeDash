import React, { useState, useEffect, ReactEventHandler } from "react";

interface ClusterLog {
  ID: number;
  pod_name: string;
  namespace: string;
  message: string;
  level: string;
  CreatedAt: string;
}

const GO_API =
  (typeof process !== "undefined" && process.env?.GO_API) ||
  "http://localhost:8080";

export default function App() {
  const [activeTab, setActiveTab] = useState<"overview" | "settings">(
    "overview",
  );

  const [podsCount, setPodsCount] = useState<number>(0);
  const [nodesTotal, setNodesTotal] = useState<number>(0);
  const [dbLogs, setDbLogs] = useState<ClusterLog[]>([]);
  const [status, setStatus] = useState<string>("Healthy");

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newPodName, setNewPodName] = useState<string>("");
  const [newPodImage, setNewPodImage] = useState<string>("");
  const [isDeploying, setIsDeploying] = useState<boolean>(false);

  const [refreshInterval, setRefreshInterval] = useState<number>(4000);
  const [targetNamespace, setTargetNamespace] = useState<string>("default");

  // fetch active cluster counts and status
  const fetchClusterMetrics = async () => {
    try {
      const res = await fetch(`${GO_API}/api/cluster/summary`);
      const data = await res.json();
      setPodsCount(data.podsCount || 0);
      setNodesTotal(data.nodesTotal || 0);
      setStatus(data.clusterStatus || "Healthy");
    } catch (err) {
      console.error("Failed fetching metrics from Go backend:", err);
    }
  };

  // fetch saved database logs
  const fetchClusterLogs = async () => {
    try {
      const res = await fetch(`${GO_API}/api/logs`);
      const json = await res.json();
      setDbLogs(json.data || []);
    } catch (err) {
      console.error("Failed fetching logs from Go backend:", err);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);

    await Promise.all([fetchClusterMetrics(), fetchClusterLogs()]);

    // timeout so the user sees the loading feedback
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleDeployPod = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newPodName || !newPodImage) return;

    setIsDeploying(true);
    try {
      const res = await fetch(`${GO_API}/api/cluster/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pod_name: newPodName.trim(),
          image: newPodImage.trim(),
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewPodName("");
        setNewPodImage("");
        await fetchClusterMetrics();
      } else {
        const errorText = await res.text();
        alert(`Deployment blocked (${res.status}): ${errorText}`);
      }
    } catch (err) {
      console.error("Failed to connect to API:", err);
    } finally {
      setIsDeploying(false);
    }
  };

  useEffect(() => {
    fetchClusterMetrics();
    fetchClusterLogs();

    // wait 4 seconds before trying again
    const interval = setInterval(() => {
      fetchClusterMetrics();
      fetchClusterLogs();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen w-screen bg-slate-950 font-sans text-slate-100 overflow-hidden">
      {/* left sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div className="text-xs font-bold uppercase tracking-wider text-sky-400 px-2">
            KubeDash
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "overview"
                  ? "bg-sky-600 text-white"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "settings"
                  ? "bg-sky-600 text-white"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              Settings
            </button>
          </nav>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        {activeTab === "overview" ? (
          <div className="w-full max-w-4xl mx-auto space-y-6">
            {/* metrics row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Cluster State
                </div>
                <div
                  className={`text-lg font-bold mt-1 ${status === "Healthy" ? "text-green-400" : "text-red-400"}`}
                >
                  ● {status}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Active Nodes
                </div>
                <div className="text-xl font-bold mt-1 text-slate-100">
                  {nodesTotal} / {nodesTotal || 1}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Total Workloads
                </div>
                <div className="text-xl font-bold mt-1 text-sky-400">
                  {podsCount} Pods
                </div>
              </div>
            </div>

            {/* action panel */}
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
              <h3 className="text-sm font-semibold text-slate-300 mb-3">
                Cluster Quick Actions
              </h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 rounded-md cursor-pointer transition-all active:scale-95 text-white"
                >
                  + Deploy New Pod
                </button>

                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className={`px-4 py-2 text-xs font-bold rounded-md border transition-all active:scale-95 cursor-pointer ${
                    isRefreshing
                      ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                  }`}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh Metrics"}
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                <h3 className="text-sm font-semibold text-slate-300">
                  Monitored Resources
                </h3>
                <span className="text-xs text-slate-500">
                  Namespace: default
                </span>
              </div>

              {/* logs container placeholder */}
              {dbLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-800 rounded-lg text-slate-500">
                  <span className="text-2xl mb-2">Logs</span>
                  <p className="text-xs font-mono">
                    No live workloads fetched yet.
                  </p>
                  <p className="text-[11px] text-slate-600 mt-1">
                    Go API endpoint linkages will display here.
                  </p>
                </div>
              ) : (
                /* terminal forDB events */
                <div className="bg-black border border-slate-800 rounded-lg p-4 font-mono text-xs max-h-60 overflow-y-auto space-y-1 text-emerald-400 shadow-inner">
                  {dbLogs
                    .slice()
                    .reverse()
                    .map((log, index) => (
                      <div
                        key={log.ID || index}
                        className={`truncate py-0.5 ${log.level === "Warning" ? "text-amber-400" : "text-emerald-400"}`}
                      >
                        <span className="text-slate-500">
                          [{log.namespace}]
                        </span>{" "}
                        <span className="text-sky-400 font-bold">
                          {log.pod_name || "cluster"}:
                        </span>{" "}
                        {log.message}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 animate-fade-in">
            <div>
              <h2 className="text-lg font-bold text-white">
                Engine Configuration
              </h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Customize KubeDash telemetry capture parameters.
              </p>
            </div>

            <hr className="border-slate-800" />

            <div className="space-y-4">
              {/* refresh interval */}
              <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800/60">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-200">
                    Metrics Polling Frequency
                  </div>
                  <div className="text-xs text-slate-500">
                    Sets how often the UI scrapes telemetry endpoints.
                  </div>
                </div>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs font-medium text-slate-200 outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value={2000}>High Speed (2s)</option>
                  <option value={4000}>Default (4s)</option>
                  <option value={10000}>Balanced (10s)</option>
                  <option value={30000}>Eco Mode (30s)</option>
                </select>
              </div>

              {/* target namespace */}
              <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800/60">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-slate-200">
                    Target Namespace Context
                  </div>
                  <div className="text-xs text-slate-500">
                    Filters core workloads to a designated isolation boundary.
                  </div>
                </div>
                <input
                  type="text"
                  value={targetNamespace}
                  onChange={(e) =>
                    setTargetNamespace(e.target.value.toLowerCase().trim())
                  }
                  className="w-32 bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-md px-3 py-1.5 text-xs text-slate-200 outline-none font-mono text-center"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* modal for deploying */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Deploy New Workspace Workload
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Spawns a container pod instance into namespace: default.
              </p>
            </div>

            <form onSubmit={handleDeployPod} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Pod Identity Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., custom-web-server"
                  value={newPodName}
                  onChange={(e) =>
                    setNewPodName(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Container Image
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., nginx:alpine or redis"
                  value={newPodImage}
                  onChange={(e) => setNewPodImage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-md px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeploying}
                  className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 disabled:bg-sky-800 text-white rounded-md cursor-pointer transition-all flex items-center gap-1.5"
                >
                  {isDeploying ? "Deploying..." : "Launch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
