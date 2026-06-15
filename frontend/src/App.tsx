import React, { useState, useEffect } from "react";
import TerminalModal from "./Terminal";
import LogStreamModal from "./LogStream";
import AuditLogView from "./AuditLogs";
import { SettingsPanel } from "./SettingsPanel";
import ClusterMetricsDashboard from "./ClusterMetricsDashboard";
import ClusterPodsTable from "./PodsManagement";
import YamlDeployModal from "./YAMLDeployModal";
import DeployWorkloadModal from "./DeployModal";
import InjectEnvMapsModal from "./ConfigEdit";
import OverviewTabContent from "./OverviewTab";
import ConfigQuickViewModal from "./ConfigQuickViewModal";
import toast, { Toaster, useToasterStore } from "react-hot-toast";
import WarningIcon from "@mui/icons-material/Warning";

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
  message: string;
  image: string;
  age_seconds: number;
  linked_configs: string[];
  restart_count: number;
  last_term_state?: string;
}

const GO_API =
  (typeof process !== "undefined" && process.env?.GO_API) ||
  "http://localhost:8080";
const WB =
  (typeof process !== "undefined" && process.env?.REACT_WEBSOCKET) ||
  "ws://localhost:8080";

export default function App() {
  const [activeTab, setActiveTab] = useState<
    "overview" | "settings" | "pods" | "audit" | "metrics"
  >("overview");

  const [podsCount, setPodsCount] = useState<number>(0);
  const [nodesTotal, setNodesTotal] = useState<number>(0);
  const [dbLogs, setDbLogs] = useState<ClusterLog[]>([]);
  const [status, setStatus] = useState<string>("Healthy");

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isYamlModalOpen, setIsYamlModalOpen] = useState(false);

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

  const [envMappings, setEnvMappings] = useState<
    { sourceKey: string; envKey: string }[]
  >([
    { sourceKey: "", envKey: "" }, // starts with one clean row ready
  ]);

  const [configs, setConfigs] = useState<any[]>([]);

  const [configEditPod, setConfigEditPod] = useState<any | null>(null);
  const [editConfigName, setEditConfigName] = useState("");
  const [editConfigType, setEditConfigType] = useState("");
  const [editMappings, setEditMappings] = useState<
    { sourceKey: string; envKey: string }[]
  >([{ sourceKey: "", envKey: "" }]);

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

  const [metrics, setMetrics] = useState<Record<string, any>>({});

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
    if (isModalOpen || configEditPod) {
      fetchClusterConfigsForDeployment();
    }
  }, [isModalOpen, configEditPod, targetNamespace, GO_API]);

  const { toasts } = useToasterStore();

  // for toaster limits
  useEffect(() => {
    const TOAST_LIMIT = 4;
    if (toasts.length > TOAST_LIMIT) {
      toasts
        .filter((t) => t.visible) // look at active onscreen alerts
        .filter((_, idx) => idx >= TOAST_LIMIT) // grab any that overflow the boundary limit
        .forEach((t) => toast.dismiss(t.id)); // evict them from the queue
    }
  }, [toasts]);

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
                className="text-red-700/50 hover:text-red-700 p-0.5 rounded 
                  transition-colors focus:outline-none cursor-pointer flex-shrink-0"
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
        toast.success(
          (t) => (
            <div className="flex items-start gap-3 justify-between w-full">
              <span className="text-xs text-[#0D530E] font-medium leading-relaxed">
                Successfully deployed pod {newPodName.trim()}
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
        `WARNING: You are attempting to restart a core dashboard component ("${podName}").\n\n` +
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
          (t: any) => (
            <div className="flex items-start gap-3 justify-between w-full">
              <span className="text-xs text-[#0D530E] font-medium leading-relaxed">
                Rolling restart safely dispatched for pod instance!
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
      try {
        const clusterEvent = JSON.parse(event.data);

        if (clusterEvent.type === "metrics_telemetry" && clusterEvent.data) {
          const payload = clusterEvent.data;
          const key = `${payload.namespace}/${payload.pod_name}`;

          setMetrics((prev) => ({
            ...prev,
            [key]: {
              pod_name: payload.pod_name,
              namespace: payload.namespace,
              cpu_usage: payload.cpu_usage,
              mem_usage: payload.mem_usage,
              gpu_usage: payload.gpu_usage,
              last_updated: Date.now(),
            },
          }));
          return;
        }

        if (!clusterEvent.message || clusterEvent.message.trim() === "") return;

        const msgText = clusterEvent.message;
        const namespaceText = clusterEvent.namespace || "default";
        const podText = clusterEvent.pod_name || "Resource";
        const levelText = clusterEvent.level || "";

        const isWarning = levelText === "Warning";
        const isErrorMsg =
          msgText.toLowerCase().includes("fail") ||
          msgText.toLowerCase().includes("backoff") ||
          msgText.toLowerCase().includes("err") ||
          msgText.toLowerCase().includes("nonexistent");

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
                  <p className="text-xs font-mono font-bold text-red-800 flex items-center gap-1">
                    <WarningIcon
                      fontSize="inherit"
                      className="text-[#FFDA03]"
                    />{" "}
                    CLUSTER WARNING ({namespaceText})
                  </p>
                  <p className="text-xs text-[#0D530E] mt-1 font-semibold">
                    Pod: {podText}
                  </p>
                  <p className="text-xs text-[#306D29] mt-1 line-clamp-3 font-mono leading-relaxed">
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
                  p-0.5 rounded transition-colors focus:outline-hidden 
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
              duration: 7000,
              id: `toast-${podText}`,
            },
          );

          setDbLogs((prev: ClusterLog[]) => {
            const logExists = prev.some(
              (l) => l.message === msgText && l.pod_name === podText,
            );
            if (logExists) return prev;

            const newLog: ClusterLog = {
              ID: Date.now(),
              namespace: namespaceText,
              pod_name: podText,
              message: msgText,
              level: "Warning",
              CreatedAt: new Date().toISOString(),
            };

            return [newLog, ...prev];
          });
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
              onClick={() => setActiveTab("metrics")}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm 
                font-semibold transition-all cursor-pointer ${
                  activeTab === "metrics"
                    ? "bg-[#306D29] text-[#FBF5DD] shadow-md font-bold"
                    : "text-[#E7E1B1] hover:bg-[#306D29]/30 hover:text-[#FBF5DD]"
                }`}
            >
              Hardware Metrics
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
          <OverviewTabContent
            activeTab={activeTab}
            status={status}
            nodesTotal={nodesTotal}
            podsCount={podsCount}
            isModalOpen={isModalOpen}
            setIsModalOpen={setIsModalOpen}
            handleManualRefresh={handleManualRefresh}
            isRefreshing={isRefreshing}
            targetNamespace={targetNamespace}
            dbLogs={dbLogs}
          />
        ) : activeTab === "pods" ? (
          /* pods table */
          <ClusterPodsTable
            clusterPods={clusterPods}
            targetNamespace={targetNamespace}
            isRestarting={isRestarting}
            deletingPod={deletingPod}
            setIsModalOpen={setIsModalOpen}
            setLogPod={setLogPod}
            setSshPod={setSshPod}
            handleDeletePod={handleDeletePod}
            onTriggerRestartClick={onTriggerRestartClick}
            handleConfigBadgeClick={handleConfigBadgeClick}
            setConfigEditPod={setConfigEditPod}
            setEditConfigName={setEditConfigName}
            setEditConfigType={setEditConfigType}
            setEditMappings={setEditMappings}
            formatPodAge={formatPodAge}
            handleManualRefresh={handleManualRefresh}
            GO_API={GO_API}
            toast={toast}
          />
        ) : activeTab == "audit" ? (
          <AuditLogView goApiUrl={GO_API} activeNamespace={targetNamespace} />
        ) : activeTab == "metrics" ? (
          <ClusterMetricsDashboard metrics={metrics} />
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
      {isModalOpen && (
        <DeployWorkloadModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSwitchToYaml={() => setIsYamlModalOpen(true)}
          targetNamespace={targetNamespace}
          configs={configs}
          isDeploying={isDeploying}
          handleDeployPod={handleDeployPod}
          newPodName={newPodName}
          setNewPodName={setNewPodName}
          newPodImage={newPodImage}
          setNewPodImage={setNewPodImage}
          attachConfigName={attachConfigName}
          setAttachConfigName={setAttachConfigName}
          setAttachConfigType={setAttachConfigType}
          envMappings={envMappings}
          setEnvMappings={setEnvMappings}
        />
      )}
      <YamlDeployModal
        isOpen={isYamlModalOpen}
        onClose={() => setIsYamlModalOpen(false)}
        targetNamespace={targetNamespace}
        handleManualRefresh={handleManualRefresh}
        toast={toast}
        GO_API={GO_API}
      />
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
        <ConfigQuickViewModal
          quickViewConfig={quickViewConfig}
          setQuickViewConfig={setQuickViewConfig}
          isLoadingQuickView={isLoadingQuickView}
          quickViewData={quickViewData}
        />
      )}
      {/* post deployment variable mapping */}
      {configEditPod && (
        <InjectEnvMapsModal
          configEditPod={configEditPod}
          setConfigEditPod={setConfigEditPod}
          configs={configs}
          GO_API={GO_API}
          fetchClusterPods={fetchClusterPods}
          editConfigName={editConfigName}
          setEditConfigName={setEditConfigName}
          editConfigType={editConfigType}
          setEditConfigType={setEditConfigType}
          editMappings={editMappings}
          setEditMappings={setEditMappings}
        />
      )}
      <Toaster position="top-right" reverseOrder={false} />
    </div>
  );
}
