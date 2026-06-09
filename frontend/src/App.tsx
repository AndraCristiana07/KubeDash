import React, { useState, useEffect } from "react";
import TerminalModal from "./Terminal";
import LogStreamModal from "./LogStream";
import AuditLogView from "./AuditLogs";
import { SettingsPanel } from "./SettingsPanel";
import toast, { Toaster } from "react-hot-toast";

interface ClusterLog {
  ID: number;
  pod_name: string;
  namespace: string;
  message: string;
  level: string;
  CreatedAt: string;
}

interface PodEntry {
  name: string;
  namespace: string;
  status: string;
  image: string;
  age_seconds: number;
  linked_configs: string[];
}

const GO_API =
  (typeof process !== "undefined" && process.env?.GO_API) ||
  "http://localhost:8080";
const WB =
  (typeof process !== "undefined" && process.env?.REACT_WEBSOCKET) ||
  "ws://localhost:8080";

export default function App() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "settings" | "pods" | "audit"
  >("overview");

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

  const [clusterPods, setClusterPods] = useState<PodEntry[]>([]);
  const [deletingPod, setDeletingPod] = useState<string | null>(null);

  const [sshPod, setSshPod] = useState<PodEntry | null>(null);
  const [logPod, setLogPod] = useState<PodEntry | null>(null);
  const [isRestarting, setIsRestarting] = useState<string | null>(null);

  const [attachConfigType, setAttachConfigType] = useState("");
  const [attachConfigName, setAttachConfigName] = useState("");
  // const [attachEnvVarKey, setAttachEnvVarKey] = useState("");
  // const [attachSourceKey, setAttachSourceKey] = useState("");
  const [envMappings, setEnvMappings] = useState<
    { sourceKey: string; envKey: string }[]
  >([
    { sourceKey: "", envKey: "" }, // starts with one clean row ready
  ]);
  const [configs, setConfigs] = useState<any[]>([]);

  //for config object
  const [quickViewConfig, setQuickViewConfig] = useState<{
    type: string;
    name: string;
    namespace: string;
  } | null>(null);
  const [quickViewData, setQuickViewData] = useState<Record<
    string,
    string
  > | null>(null);
  const [isLoadingQuickView, setIsLoadingQuickView] = useState(false);

  const formatPodAge = (totalSeconds: number): string => {
    if (totalSeconds < 1) return "0s";

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);

    // show seconds if under a minute
    if (parts.length === 0 && seconds > 0) {
      parts.push(`${seconds}s`);
    }

    return parts.join(" ");
  };

  // fetch active cluster counts and status
  const fetchClusterMetrics = async () => {
    try {
      const res = await fetch(
        `${GO_API}/api/cluster/summary?namespace=${targetNamespace}`,
      );
      const data = await res.json();
      setPodsCount(data.podsCount || 0);
      setNodesTotal(data.nodesTotal || 0);
      setStatus(data.clusterStatus || "Healthy");
    } catch (err) {
      console.error("Failed fetching metrics:", err);
    }
  };

  // fetch saved database logs
  const fetchClusterLogs = async () => {
    try {
      const timestamp = new Date().getTime();
      const url = `${GO_API}/api/logs/overview?namespace=${targetNamespace}&_t=${timestamp}`;

      const res = await fetch(url, {
        method: "GET",
      });

      const json = await res.json();

      setDbLogs(json.data || []);
    } catch (err) {
      console.error("Failed fetching logs from Go backend:", err);
    }
  };

  const fetchClusterPods = async () => {
    try {
      const res = await fetch(
        `${GO_API}/api/cluster/pods?namespace=${targetNamespace}`,
      );
      const data = await res.json();
      setClusterPods(data.pods || []);
    } catch (err) {
      console.error("Failed fetching pods list:", err);
    }
  };

  const fetchClusterConfigsForDeployment = async () => {
    try {
      const res = await fetch(
        `${GO_API}/api/cluster/config?namespace=${targetNamespace}`,
      );
      if (res.ok) {
        const data = await res.json();
        setConfigs(data || []);
      }
    } catch (err) {
      console.error(
        "Failed fetching config maps & secrets for deployment dropdown:",
        err,
      );
    }
  };

  useEffect(() => {
    if (isModalOpen) {
      fetchClusterConfigsForDeployment();
    }
  }, [isModalOpen, targetNamespace, GO_API]);

  const handleDeletePod = async (namespace: string, name: string) => {
    if (!window.confirm(`Are you sure you want to terminate pod "${name}"?`))
      return;

    setDeletingPod(name);
    try {
      const res = await fetch(
        `${GO_API}/api/cluster/pods?namespace=${namespace}&name=${name}`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        // success toast
        toast.success(
          (t) => (
            <div className="flex items-start gap-3 justify-between w-full">
              <span className="text-xs text-[#0D530E] font-medium leading-relaxed">
                Pod{" "}
                <span className="font-mono font-bold text-[#306D29]">
                  "{name}"
                </span>{" "}
                termination executed safely. Kubernetes is stopping pod...
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(t.id);
                  toast.remove(t.id);
                }}
                className="text-[#306D29]/50 hover:text-[#0D530E] 
                  p-0.5 rounded transition-colors focus:outline-none 
                  cursor-pointer flex-shrink-0"
                aria-label="Close alert"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ),
          {
            duration: 5000,
            position: "top-right",
            style: {
              background: "#FBF5DD",
              border: "1px solid #E7E1B1",
              borderLeft: "4px solid #306D29",
              maxWidth: "420px",
              width: "100%",
            },
          },
        );

        await Promise.all([fetchClusterMetrics(), fetchClusterPods()]);
      } else {
        const errText = await res.text();

        toast.error(
          (t) => (
            <div className="flex items-start gap-3 justify-between w-full">
              <span className="text-xs text-red-800 font-semibold">
                Failed to delete pod: {errText}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(t.id);
                  toast.remove(t.id);
                }}
                className="text-red-700/50 hover:text-red-700 p-0.5 rounded transition-colors focus:outline-none cursor-pointer flex-shrink-0"
                aria-label="Close alert"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ),
          {
            duration: 6000,
            position: "top-right",
            style: {
              background: "#FBF5DD",
              border: "1px solid #E7E1B1",
              borderLeft: "4px solid #dc2626",
              maxWidth: "420px",
              width: "100%",
            },
          },
        );
      }
    } catch (err) {
      console.error("Error executing pod termination:", err);
      // error toast if there's network errors
      toast.error("Network or infrastructure system error occurred.", {
        duration: 5000,
        position: "top-right",
      });
    } finally {
      setDeletingPod(null);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);

    await Promise.all([
      fetchClusterMetrics(),
      fetchClusterLogs(),
      fetchClusterPods(),
    ]);

    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleDeployPod = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newPodName || !newPodImage) return;

    // filter rows
    const activeMappings = envMappings
      .filter((m) => m.sourceKey.trim() !== "")
      .map((m) => ({
        source_key: m.sourceKey,
        env_key: m.envKey,
      }));

    setIsDeploying(true);
    try {
      const res = await fetch(`${GO_API}/api/cluster/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pod_name: newPodName.trim(),
          image: newPodImage.trim(),
          namespace: targetNamespace || "default",
          config_type: attachConfigType,
          config_name: attachConfigName,
          mappings: activeMappings,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setNewPodName("");
        setNewPodImage("");
        setAttachConfigName("");
        setAttachConfigType("");
        setEnvMappings([{ sourceKey: "", envKey: "" }]); // reset back to a single mapping row
        await Promise.all([fetchClusterMetrics(), fetchClusterPods()]);
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

  const onTriggerRestartClick = (namespace: string, podName: string) => {
    // check if pod belongs to dashboard's core management layer
    const isCoreInfrastructure =
      podName.includes("kubedash-backend") ||
      podName.includes("kubedash-postgres");

    if (isCoreInfrastructure) {
      const confirmationPrompt = window.confirm(
        `⚠️ WARNING: You are attempting to restart a core dashboard component ("${podName}").\n\n` +
          `This action will momentarily disconnect your dashboard, drop active log streams, and interrupt live monitoring sessions.\n\n` +
          `Are you absolutely sure you want to proceed?`,
      );

      // terminate the execution chain silently
      if (!confirmationPrompt) return;
    }

    // proceed immediately with the restart flow
    handleRestartPod(namespace, podName);
  };

  const handleRestartPod = async (namespace: string, podName: string) => {
    setIsRestarting(podName);

    try {
      const res = await fetch(`${GO_API}/api/cluster/restart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespace: namespace,
          pod_name: podName,
        }),
      });

      if (res.ok) {
        toast.success(
          (t) => (
            <div className="flex items-start gap-3 justify-between w-full">
              <span className="text-xs text-[#0D530E] font-medium">
                Rolling restart safely dispatched for pod instance!
              </span>
            </div>
          ),
          {
            duration: 4000,
            style: { background: "#FBF5DD", borderLeft: "4px solid #306D29" },
          },
        );
        await Promise.all([fetchClusterMetrics(), fetchClusterPods()]);
      } else {
        const errText = await res.text();
        alert(`Restart action failed: ${errText}`);
      }
    } catch (err) {
      console.error("Network request failed:", err);
    } finally {
      setIsRestarting(null);
    }
  };

  const handleConfigBadgeClick = async (
    type: string,
    name: string,
    namespace: string,
  ) => {
    setQuickViewConfig({ type, name, namespace });
    setQuickViewData(null);
    setIsLoadingQuickView(true);

    try {
      // query config api route
      const res = await fetch(
        `${GO_API}/api/cluster/config?namespace=${namespace}`,
      );
      if (res.ok) {
        const allConfigs = await res.json();
        // get matching object
        const match = allConfigs.find(
          (c: any) => c.name === name && c.type === type,
        );
        setQuickViewData(
          match?.data || {
            STATUS: "No keys found inside this resource block.",
          },
        );
      } else {
        setQuickViewData({
          ERROR: "Failed to look up cluster resource values.",
        });
      }
    } catch (err) {
      console.error("Quick view lookup fault:", err);
      setQuickViewData({
        ERROR: "Network execution fault tracking variable keys.",
      });
    } finally {
      setIsLoadingQuickView(false);
    }
  };

  // notification socket
  useEffect(() => {
    const ws = new WebSocket(`${WB}/api/cluster/notifications`);

    ws.onopen = () => {
      console.log("Live Notification WebSocket Connected Successfully!");
    };

    ws.onmessage = (event) => {
      console.log("Received event hunk data payload:", event.data);
      try {
        const clusterEvent = JSON.parse(event.data);
        if (!clusterEvent.message) return;

        const msgText = clusterEvent.message;
        const namespaceText = clusterEvent.namespace || "default";
        const podText = clusterEvent.pod_name || "Resource";
        const levelText = clusterEvent.level || "";

        const isWarning = levelText === "Warning";
        const isErrorMsg =
          msgText.toLowerCase().includes("fail") ||
          msgText.toLowerCase().includes("backoff") ||
          msgText.toLowerCase().includes("err");

        if (isWarning || isErrorMsg) {
          toast.custom(
            (t) => (
              <div
                className={`${
                  t.visible ? "animate-enter" : "animate-leave"
                } max-w-md w-full bg-[#FBF5DD] border-2 border-red-600/30 
                shadow-xl rounded-xl pointer-events-auto flex p-4 
                text-left justify-between items-start gap-3 
                border-l-4 border-l-red-600`}
              >
                <div className="flex-1">
                  <p className="text-xs font-mono font-bold text-red-800">
                    ⚠️ CLUSTER WARNING ({namespaceText})
                  </p>
                  <p className="text-xs text-[#0D530E] mt-1 font-semibold">
                    Pod: {podText}
                  </p>
                  <p className="text-xs text-[#306D29] mt-1 line-clamp-3">
                    {msgText}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.dismiss(t.id);
                    toast.remove(t.id);
                  }}
                  className="text-[#306D29]/50 hover:text-[#0D530E] 
                  p-0.5 rounded transition-colors focus:outline-none 
                  cursor-pointer flex-shrink-0"
                  aria-label="Close alert"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ),
            { duration: 6000, id: `toast-${podText}` },
          );
        }
      } catch (err) {
        console.error("Failed parsing incoming alert package:", err);
      }
    };

    ws.onerror = (error) => {
      console.error("Notification Socket Error Encountered:", error);
    };

    return () => {
      ws.close();
    };
  }, [WB]);

  useEffect(() => {
    fetchClusterMetrics();
    fetchClusterLogs();
    fetchClusterPods();

    const interval = setInterval(() => {
      fetchClusterMetrics();
      fetchClusterLogs();
      fetchClusterPods();
    }, refreshInterval);

    return () => {
      clearInterval(interval);
    };
  }, [refreshInterval, targetNamespace]);

  return (
    <div
      className="flex h-screen w-screen bg-[#FBF5DD] font-sans 
        text-slate-800 overflow-hidden"
    >
      {/* left sidebar */}
      <aside
        className="w-56 bg-[#0D530E] border-r border-[#306D29]/20 p-4 flex 
          flex-col justify-between shrink-0 shadow-xl"
      >
        <div className="space-y-6">
          <div
            className="text-sm font-black uppercase tracking-widest 
              text-[#FBF5DD] px-2 flex items-center gap-2"
          >
            KubeDash
          </div>

          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm 
                font-semibold transition-all cursor-pointer ${
                  activeTab === "overview"
                    ? "bg-[#306D29] text-[#FBF5DD] shadow-md font-bold"
                    : "text-[#E7E1B1] hover:bg-[#306D29]/30 hover:text-[#FBF5DD]"
                }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("pods")}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm 
                font-semibold transition-all cursor-pointer ${
                  activeTab === "pods"
                    ? "bg-[#306D29] text-[#FBF5DD] shadow-md font-bold"
                    : "text-[#E7E1B1] hover:bg-[#306D29]/30 hover:text-[#FBF5DD]"
                }`}
            >
              Pods Management
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm 
                font-semibold transition-all cursor-pointer ${
                  activeTab === "audit"
                    ? "bg-[#306D29] text-[#FBF5DD] shadow-md font-bold"
                    : "text-[#E7E1B1] hover:bg-[#306D29]/30 hover:text-[#FBF5DD]"
                }`}
            >
              Audit logs
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm 
                font-semibold transition-all cursor-pointer ${
                  activeTab === "settings"
                    ? "bg-[#306D29] text-[#FBF5DD] shadow-md font-bold"
                    : "text-[#E7E1B1] hover:bg-[#306D29]/30 hover:text-[#FBF5DD]"
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
            <div className="grid grid-cols-3 gap-5">
              <div className="bg-[#E7E1B1]/40 border border-[#E7E1B1] p-5 rounded-xl shadow-sm">
                <div className="text-xs font-bold text-[#0D530E]/70 uppercase tracking-wider">
                  Cluster State
                </div>
                <div
                  className={`text-xl font-black mt-1 flex items-center gap-2 ${
                    status === "Healthy" ? "text-[#5BB450]" : "text-[#B32626]"
                  }`}
                >
                  <span className="animate-pulse">●</span> {status}
                </div>
              </div>

              <div className="bg-[#E7E1B1]/40 border border-[#E7E1B1] p-5 rounded-xl shadow-sm">
                <div className="text-xs font-bold text-[#0D530E]/70 uppercase tracking-wider">
                  Active Nodes
                </div>
                <div className="text-2xl font-black mt-1 text-[#0D530E]">
                  {nodesTotal}
                  <span className="text-2xl font-black mt-1">
                    {" "}
                    / {nodesTotal || 1}
                  </span>
                  <span className="text-xs font-normal ml-3">Available</span>
                </div>
              </div>

              <div className="bg-[#E7E1B1]/40 border border-[#E7E1B1] p-5 rounded-xl shadow-sm">
                <div className="text-xs font-bold text-[#0D530E]/70 uppercase tracking-wider">
                  Total Workloads
                </div>
                <div className="text-2xl font-black mt-1 text-[#306D29]">
                  {podsCount}{" "}
                  <span className="text-xs font-normal ml-2">Pods Running</span>
                </div>
              </div>
            </div>

            {/* action panel */}
            <div
              className="bg-[#E7E1B1]/30 border border-[#E7E1B1] p-5 
                rounded-xl shadow-sm flex items-center justify-between"
            >
              <div>
                <h3 className="text-sm font-bold text-[#0D530E]">
                  Cluster Quick Actions
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Control orchestration happens instantly
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="px-4 py-2 text-xs font-bold bg-[#306D29] text-[#FBF5DD] 
                  hover:bg-[#0D530E] rounded-lg cursor-pointer transition-all 
                  active:scale-95 shadow"
                >
                  + Deploy New Pod
                </button>

                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className={`px-4 py-2 text-xs md:min-w-[150px] text-center font-bold 
                    rounded-lg border transition-all active:scale-95 cursor-pointer ${
                      isRefreshing
                        ? "bg-[#FBF5DD]/20 border-[#E7E1B1]/60 text-[#0D530E]/70 cursor-not-allowed"
                        : "bg-[#FBF5DD] border-[#E7E1B1] text-[#0D530E] hover:bg-[#E7E1B1]/40"
                    }`}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh Metrics"}
                </button>
              </div>
            </div>

            {/* logs */}
            <div className="bg-[#E7E1B1]/30 border border-[#E7E1B1] rounded-xl p-5 shadow-sm">
              <div
                className="flex justify-between items-center border-b 
                  border-[#E7E1B1] pb-3 mb-4"
              >
                <h3 className="text-sm font-bold text-[#0D530E]">
                  Monitored Event Resources
                </h3>
                <span
                  className="text-xs font-mono bg-[#306D29]/10 text-[#0D530E] 
                    px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
                >
                  Namespace: {targetNamespace || "all"}
                </span>
              </div>

              {dbLogs.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center 
                    py-12 border border-dashed border-[#E7E1B1] rounded-xl 
                    text-slate-400 bg-[#FBF5DD]/50"
                >
                  <p className="text-xs font-mono text-slate-500 font-semibold">
                    No live workloads fetched yet.
                  </p>
                </div>
              ) : (
                <div
                  className="bg-[#0D530E] border border-[#306D29]/30 
                    rounded-xl p-4 font-mono text-xs max-h-60 overflow-y-auto 
                    space-y-1 text-[#FBF5DD] shadow-inner"
                >
                  {dbLogs
                    .slice()
                    .reverse()
                    .map((log, index) => (
                      <div
                        key={log.ID || index}
                        className={`truncate py-0.5 border-b border-[#306D29]/10 last:border-0 ${
                          log.level === "Warning"
                            ? "text-amber-300 font-semibold"
                            : "text-[#FBF5DD]"
                        }`}
                      >
                        <span className="text-[#E7E1B1]/70">
                          [{log.namespace}]
                        </span>{" "}
                        <span className="text-[#E7E1B1] font-bold">
                          {log.pod_name || "cluster"}:
                        </span>{" "}
                        {log.message}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === "pods" ? (
          /* pods table */
          <div className="w-full max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-[#0D530E]">
                  Active Cluster Pods
                </h2>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Context Scope: {targetNamespace || "all"}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-3 py-1.5 text-xs font-bold bg-[#306D29] 
                  text-[#FBF5DD] hover:bg-[#0D530E] rounded-lg text-white 
                  transition-all cursor-pointer shadow"
              >
                + Deploy New Pod
              </button>
            </div>

            <div
              className="bg-[#E7E1B1]/30 border border-[#E7E1B1] 
                rounded-xl overflow-hidden shadow-sm"
            >
              <div className="max-h-[480px] overflow-y-auto pr-px scrollbar-thin">
                <table className="w-full text-left border-collapse text-xs relative">
                  <thead>
                    <tr
                      className="bg-[#E7E1B1]/60 border-b border-[#E7E1B1] 
                      text-[#0D530E] font-bold tracking-wider uppercase text-[10px]
                      sticky top-0 z-10"
                    >
                      <th className="p-4">Pod Name</th>
                      <th className="p-4">Namespace</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Container Image</th>
                      <th className="p-4 text-center">Age</th>
                      <th className="p-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E7E1B1]/60 font-mono text-slate-700">
                    {clusterPods.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="p-8 text-center text-slate-400 italic bg-[#FBF5DD]/30"
                        >
                          No active pods found inside the current boundary
                          context.
                        </td>
                      </tr>
                    ) : (
                      clusterPods.map((pod) => {
                        const isSystemCore = pod.name.includes("kubedash-");
                        return (
                          <tr
                            key={pod.name}
                            className={`transition-colors border-b border-[#E7E1B1]/10 ${
                              isSystemCore
                                ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-4 border-l-amber-500" // system core
                                : "bg-[#FBF5DD]/10 hover:bg-[#E7E1B1]/20 border-l-4 border-l-transparent" // normal rows
                            }`}
                          >
                            <td className="p-4 font-bold text-[#0D530E]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>{pod.name}</span>

                                {/* "System Core" badge */}
                                {isSystemCore && (
                                  <span
                                    className="text-[9px] uppercase tracking-wider 
                                      font-extrabold px-1.5 py-0.5 rounded bg-amber-600/10 
                                      text-amber-800 border border-amber-600/20 shadow-sm"
                                  >
                                    System Core
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-slate-600">
                              {pod.namespace}
                            </td>
                            <td className="p-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] 
                              font-bold tracking-wide uppercase ${
                                pod.status === "Running"
                                  ? "bg-[#0D530E]/10 text-[#0D530E] border border-[#0D530E]/20"
                                  : pod.status === "Pending"
                                    ? "bg-amber-600/10 text-amber-700 border border-amber-600/20"
                                    : "bg-red-600/10 text-red-700 border border-red-600/20"
                              }`}
                              >
                                {pod.status}
                              </span>
                            </td>
                            <td className="p-4 text-[#306D29] font-medium max-w-[200px]">
                              <div
                                className="truncate font-bold"
                                title={pod.image}
                              >
                                {pod.image}
                              </div>

                              {pod.linked_configs &&
                                pod.linked_configs.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                                    {pod.linked_configs.map(
                                      (configStr: string, idx: number) => {
                                        const isSecret =
                                          configStr.startsWith("secret:");
                                        const typeLabel = isSecret
                                          ? "secret"
                                          : "configmap";
                                        const cleanName = configStr.replace(
                                          /^(secret:|cm:)/,
                                          "",
                                        );

                                        return (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() =>
                                              handleConfigBadgeClick(
                                                typeLabel,
                                                cleanName,
                                                pod.namespace,
                                              )
                                            }
                                            title={`Click to preview keys inside ${cleanName}`}
                                            className={`text-[9px] px-1.5 py-0.5 rounded-md 
                                              font-sans font-bold flex items-center gap-1 tracking-wide 
                                              shadow-2xs border transition-all transform 
                                              hover:scale-105 active:scale-95 cursor-pointer ${
                                                isSecret
                                                  ? "bg-red-500/10 text-red-800 border-red-500/20 hover:bg-red-500/20"
                                                  : "bg-blue-500/10 text-blue-800 border-blue-500/20 hover:bg-blue-500/20"
                                              }`}
                                          >
                                            <span>
                                              {isSecret ? "🔒" : "⚙️"}
                                            </span>
                                            <span className="truncate max-w-[100px]">
                                              {cleanName}
                                            </span>
                                          </button>
                                        );
                                      },
                                    )}
                                  </div>
                                )}
                            </td>
                            <td className="p-4 text-center text-slate-500 font-medium">
                              {formatPodAge(pod.age_seconds)}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => setLogPod(pod)}
                                  className="px-2 py-1 text-[10px] font-bold 
                                    text-amber-800 hover:text-white bg-amber-500/10 
                                    hover:bg-amber-600 border border-amber-500/20 
                                    rounded-md transition-all cursor-pointer"
                                >
                                  Logs
                                </button>
                                <button
                                  onClick={() => setSshPod(pod)}
                                  className="px-2 py-1 text-[10px] font-bold 
                                    text-[#0D530E] hover:text-[#FBF5DD] bg-[#306D29]/10 
                                    hover:bg-[#306D29] border border-[#306D29]/20 
                                    rounded-md transition-all cursor-pointer"
                                >
                                  Terminal
                                </button>
                                <button
                                  onClick={() =>
                                    onTriggerRestartClick(
                                      pod.namespace,
                                      pod.name,
                                    )
                                  }
                                  disabled={isRestarting === pod.name}
                                  title="Trigger Restart"
                                  className="p-1.5 rounded-lg border border-[#E7E1B1] bg-white text-[#306D29] 
                                    hover:bg-[#FBF5DD] hover:text-[#0D530E] transition-all cursor-pointer 
                                    disabled:opacity-40 shadow-sm flex items-center justify-center"
                                >
                                  {isRestarting === pod.name ? (
                                    <svg
                                      className="animate-spin h-3.5 w-3.5 text-[#0D530E]"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      />
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 
                                          12h4zm2 5.291A7.962 7.962 0 014 12H0c0 
                                          3.042 1.135 5.824 3 7.938l3-2.647z"
                                      />
                                    </svg>
                                  ) : (
                                    <svg
                                      className="h-3.5 w-3.5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2.5}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M16.023 9.348h4.992v-.001M2.985 
                                          19.644v-4.992m0 0h4.992m-4.993 0l3.181 
                                          3.183a8.25 8.25 0 0013.803-3.7M4.031 
                                          9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                                      />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  onClick={() =>
                                    handleDeletePod(pod.namespace, pod.name)
                                  }
                                  disabled={deletingPod === pod.name}
                                  className="px-2.5 py-1 text-[10px] font-bold 
                                    text-red-700 hover:text-white bg-red-600/10 
                                    hover:bg-red-600 border border-red-600/20 rounded-md 
                                    transition-all cursor-pointer disabled:opacity-40"
                                >
                                  {deletingPod === pod.name
                                    ? "Killing..."
                                    : "Delete"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab == "audit" ? (
          <AuditLogView goApiUrl={GO_API} activeNamespace={targetNamespace} />
        ) : (
          /* settings */
          <SettingsPanel
            GO_API={GO_API}
            targetNamespace={targetNamespace}
            setTargetNamespace={setTargetNamespace}
            refreshInterval={refreshInterval}
            setRefreshInterval={setRefreshInterval}
            toast={toast}
          />
        )}
      </main>

      {/* modal for deploying */}
      {/* TODO: make multiple keys setting possible */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center 
            bg-black/40 backdrop-blur-sm"
        >
          <div
            className="bg-[#FBF5DD] border border-[#E7E1B1] w-full max-w-md 
              rounded-xl p-6 shadow-2xl space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto"
          >
            <div>
              <h3 className="text-base font-black text-[#0D530E]">
                Deploy New Workspace Workload
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Spawns a container pod instance into namespace:{" "}
                <span className="font-bold underline text-[#306D29]">
                  {targetNamespace || "default"}
                </span>
              </p>
            </div>

            <form onSubmit={handleDeployPod} className="space-y-4">
              {/* pod name */}
              <div className="space-y-1">
                <label
                  className="text-[10px] font-bold uppercase tracking-wider 
                    text-[#0D530E]/70"
                >
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
                  className="w-full bg-[#E7E1B1]/20 border border-[#E7E1B1] 
                    focus:border-[#306D29] text-[#0D530E] font-medium rounded-lg 
                    px-3 py-2 text-sm placeholder-slate-400 outline-none transition-all"
                />
              </div>

              {/* container image */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#0D530E]/70">
                  Container Image
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., nginx:alpine or redis"
                  value={newPodImage}
                  onChange={(e) => setNewPodImage(e.target.value)}
                  className="w-full bg-[#E7E1B1]/20 border border-[#E7E1B1] 
                    focus:border-[#306D29] text-[#0D530E] font-medium rounded-lg 
                    px-3 py-2 text-sm placeholder-slate-400 outline-none transition-all"
                />
              </div>

              {/* optional cluster config mapping */}
              <div className="border border-[#E7E1B1] bg-[#E7E1B1]/20 p-3 rounded-lg space-y-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#0D530E]">
                  Link Cluster Variables (Optional)
                </div>

                {configs.length === 0 ? (
                  <div className="text-[10px] text-slate-500 italic">
                    No configs available in this namespace boundary to map.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* choose object */}
                    <div>
                      <select
                        value={attachConfigName}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAttachConfigName(val);
                          const chosen = configs.find(
                            (c: any) => c.name === val,
                          );
                          setAttachConfigType(chosen ? chosen.type : "");
                          if (!val)
                            setEnvMappings([{ sourceKey: "", envKey: "" }]);
                        }}
                        className="w-full bg-white border border-[#E7E1B1] 
                          text-[#0D530E] rounded-lg px-2 py-1.5 text-xs 
                          outline-none focus:border-[#306D29]"
                      >
                        <option value="">
                          -- Do not attach any resource variables --
                        </option>
                        {configs.map((cfg: any) => (
                          <option key={cfg.name} value={cfg.name}>
                            {cfg.name} ({cfg.type.toUpperCase()})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* choose target keys */}
                    {attachConfigName && (
                      <div className="space-y-3 pt-2 border-t border-[#E7E1B1]/40">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                            Map Resource Keys to Container
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setEnvMappings([
                                ...envMappings,
                                { sourceKey: "", envKey: "" },
                              ])
                            }
                            className="text-[10px] text-[#306D29] hover:text-[#0D530E] font-bold cursor-pointer"
                          >
                            + Add Variable Mapping
                          </button>
                        </div>

                        {envMappings.map((mapping, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end relative pb-1 animate-fadeIn"
                          >
                            <div>
                              <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">
                                Select Cluster Key
                              </label>
                              <select
                                required
                                value={mapping.sourceKey}
                                onChange={(e) => {
                                  const selectedKey = e.target.value;
                                  const updated = [...envMappings];
                                  updated[idx].sourceKey = selectedKey;
                                  // set variable name inside container to match source
                                  updated[idx].envKey = selectedKey
                                    .toUpperCase()
                                    .replace(/[^A-Z0-9_]/g, "");
                                  setEnvMappings(updated);
                                }}
                                className="w-full bg-white border border-[#E7E1B1] text-[#0D530E] rounded-lg px-2 py-1 text-xs outline-none"
                              >
                                <option value="">-- Choose Key --</option>
                                {Object.keys(
                                  configs.find(
                                    (c: any) => c.name === attachConfigName,
                                  )?.data || {},
                                ).map((k) => (
                                  <option key={k} value={k}>
                                    {k}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <div className="flex-1">
                                <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">
                                  Inject Into Code As
                                </label>
                                <input
                                  type="text"
                                  required
                                  placeholder="e.g., DB_PASS"
                                  value={mapping.envKey}
                                  onChange={(e) => {
                                    const updated = [...envMappings];
                                    updated[idx].envKey = e.target.value
                                      .toUpperCase()
                                      .replace(/[^A-Z0-9_]/g, "");
                                    setEnvMappings(updated);
                                  }}
                                  className="w-full bg-white border border-[#E7E1B1] text-[#0D530E] font-mono rounded-lg px-2 py-1 text-xs outline-none focus:border-[#306D29]"
                                />
                              </div>
                              {/* row delete */}
                              {envMappings.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEnvMappings(
                                      envMappings.filter(
                                        (_, mIdx) => mIdx !== idx,
                                      ),
                                    )
                                  }
                                  className="text-red-600 hover:text-red-800 text-xs font-bold pt-4 px-1 cursor-pointer"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* action pperations */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setAttachConfigName("");
                    setAttachConfigType("");
                    setEnvMappings([{ sourceKey: "", envKey: "" }]);
                  }}
                  className="px-4 py-2 text-xs font-bold bg-[#E7E1B1] 
                    hover:bg-[#E7E1B1]/60 text-[#0D530E] rounded-lg 
                    cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeploying}
                  className="px-4 py-2 text-xs font-bold bg-[#306D29] 
                    hover:bg-[#0D530E] disabled:bg-slate-300 text-[#FBF5DD] 
                    rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                >
                  {isDeploying ? "Deploying..." : "Launch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {sshPod && (
        <TerminalModal
          podName={sshPod.name}
          namespace={sshPod.namespace}
          onClose={() => setSshPod(null)}
        />
      )}
      {logPod && (
        <LogStreamModal
          podName={logPod.name}
          namespace={logPod.namespace}
          onClose={() => setLogPod(null)}
        />
      )}
      {quickViewConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center 
            justify-center bg-black/40 backdrop-blur-xs animate-fade-in"
        >
          <div
            className="bg-[#FBF5DD] border border-[#E7E1B1] w-full 
              max-w-sm rounded-xl p-5 shadow-2xl space-y-3 font-mono"
          >
            <div
              className="flex justify-between items-start 
                border-b border-[#E7E1B1]/60 pb-2"
            >
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Resource Quick-Peek ({quickViewConfig.namespace})
                </div>
                <h3 className="text-sm font-black text-[#0D530E] flex items-center gap-1.5 mt-0.5">
                  <span>{quickViewConfig.type === "secret" ? "🔒" : "⚙️"}</span>
                  <span>{quickViewConfig.name}</span>
                </h3>
              </div>
              <button
                onClick={() => setQuickViewConfig(null)}
                className="text-slate-400 hover:text-red-700 font-bold 
                  transition-colors text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* config content */}
            <div
              className="bg-white border border-[#E7E1B1] rounded-lg p-3 
                text-[11px] max-h-48 overflow-y-auto space-y-2"
            >
              {isLoadingQuickView ? (
                <div className="text-slate-400 italic py-4 text-center">
                  Querying cluster configurations...
                </div>
              ) : quickViewData ? (
                Object.entries(quickViewData).map(([key, value]) => (
                  <div
                    key={key}
                    className="border-b border-[#E7E1B1]/20 pb-1.5 last:border-0 last:pb-0"
                  >
                    <span className="text-[#306D29] font-bold block">
                      {key}:
                    </span>
                    <span
                      className="text-slate-600 font-medium break-all 
                        block pl-2 bg-slate-50/50 rounded mt-0.5 py-0.5 px-1"
                    >
                      {quickViewConfig.type === "secret"
                        ? "•••••••• (Encrypted Secret)"
                        : value}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-red-600 italic py-2 text-center">
                  No data found or mapping dropped.
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => setQuickViewConfig(null)}
                className="px-3 py-1 text-[10px] font-bold bg-[#E7E1B1] 
                  hover:bg-[#E7E1B1]/60 text-[#0D530E] rounded-md 
                  transition-all cursor-pointer"
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
      <Toaster position="top-right" reverseOrder={false} />
    </div>
  );
}
