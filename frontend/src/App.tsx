import React, { useState, useEffect } from "react";

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
  const [status, setStatus] = useState<"Healthy" | "Degraded">("Healthy");
  const [activeTab, setActiveTab] = useState<"overview" | "settings">(
    "overview",
  );

  const [podsCount, setPodsCount] = useState<number>(0);
  const [nodesTotal, setNodesTotal] = useState<number>(0);
  const [dbLogs, setDbLogs] = useState<ClusterLog[]>([]);

  useEffect(() => {
    // fetch active cluster counts
    const fetchClusterMetrics = async () => {
      try {
        const res = await fetch(`${GO_API}/api/cluster/summary`);
        const data = await res.json();
        setPodsCount(data.podsCount || 0);
        setNodesTotal(data.nodesTotal || 0);
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

    fetchClusterMetrics();
    fetchClusterLogs();

    // wait 4 seconds before trying again
    const interval = setInterval(() => {
      fetchClusterMetrics();
      fetchClusterLogs();
    }, 4000);

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
                  className="px-4 py-2 text-xs font-bold bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-md cursor-pointer transition-all active:scale-95"
                  onClick={() =>
                    setStatus((prev) =>
                      prev === "Healthy" ? "Degraded" : "Healthy",
                    )
                  }
                >
                  Toggle Incident Status
                </button>

                <button className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 rounded-md cursor-pointer transition-all active:scale-95 text-white">
                  + Deploy New Pod
                </button>

                <button className="px-4 py-2 text-xs font-bold bg-slate-800 border border-slate-700 hover:bg-slate-600 rounded-md cursor-pointer transition-all text-slate-400">
                  Refresh Metrics
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

              {/* logs container Placeholder */}
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
          /* temp settings */
          <div className="w-full max-w-4xl mx-auto bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-2">
              Engine Settings
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Cluster configurations will go here.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
