import React, { useState, useMemo } from "react";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import LockIcon from "@mui/icons-material/Lock";
import SettingsIcon from "@mui/icons-material/Settings";
import SearchIcon from "@mui/icons-material/Search";
import WarningIcon from "@mui/icons-material/Warning";

interface PodEntry {
  name: string;
  namespace: string;
  status: string;
  message: string;
  image: string;
  age_seconds: number;
  linked_configs: string[];
}

interface ClusterPodsTableProps {
  clusterPods: PodEntry[];
  targetNamespace: string;
  isRestarting: string | null;
  deletingPod: string | null;
  setIsModalOpen: (open: boolean) => void;
  setLogPod: (pod: PodEntry) => void;
  setSshPod: (pod: PodEntry) => void;
  handleDeletePod: (namespace: string, name: string) => void;
  handleManualRefresh: () => void;
  onTriggerRestartClick: (namespace: string, name: string) => void;
  handleConfigBadgeClick: (
    typeLabel: "secret" | "configmap",
    name: string,
    namespace: string,
  ) => void;
  setConfigEditPod: (pod: PodEntry) => void;
  setEditConfigName: (name: string) => void;
  setEditConfigType: (type: string) => void;
  setEditMappings: (
    mappings: Array<{ sourceKey: string; envKey: string }>,
  ) => void;
  formatPodAge: (seconds: number) => string;
  toast: any;
  GO_API: string;
}

type PodSortKey = "name" | "namespace" | "status" | "image" | "age_seconds";
type SortOrder = "asc" | "desc";

export default function ClusterPodsTable({
  clusterPods,
  targetNamespace,
  isRestarting,
  deletingPod,
  setIsModalOpen,
  setLogPod,
  setSshPod,
  handleDeletePod,
  onTriggerRestartClick,
  handleConfigBadgeClick,
  setConfigEditPod,
  setEditConfigName,
  setEditConfigType,
  setEditMappings,
  formatPodAge,
  handleManualRefresh,
  GO_API,
  toast,
}: ClusterPodsTableProps) {
  const [sortKey, setSortKey] = useState<PodSortKey>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [selectedPods, setSelectedPods] = useState<string[]>([]);
  const [isBulkExecuting, setIsBulkExecuting] = useState<boolean>(false);

  const statusCounts = useMemo(() => {
    const counts = {
      All: clusterPods.length,
      Running: 0,
      Pending: 0,
      Failed: 0,
    };
    clusterPods.forEach((pod) => {
      if (pod.status === "Running") counts.Running++;
      else if (pod.status === "Pending") counts.Pending++;
      else counts.Failed++; // catches CrashLoopBackOff, Evicted, Error
    });
    return counts;
  }, [clusterPods]);

  const handleSortRequest = (key: PodSortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder(key === "age_seconds" ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const handleBulkRestart = async () => {
    if (selectedPods.length === 0) return;

    const confirmBounce = window.confirm(
      `Are you absolutely sure you want to trigger rolling restarts across these ${selectedPods.length} pods?`,
    );
    if (!confirmBounce) return;

    setIsBulkExecuting(true);
    toast.loading(`Restarting ${selectedPods.length} workloads...`, {
      id: "bulk-op",
    });

    // loop through selections and use parent function
    for (const compoundKey of selectedPods) {
      const [ns, name] = compoundKey.split("/");
      try {
        await onTriggerRestartClick(ns, name);
      } catch (err) {
        console.error(`Failed to bulk restart ${name}:`, err);
      }
    }

    setIsBulkExecuting(false);
    setSelectedPods([]); // clear selected list
    toast.success(`Successfully signaled orchestration cycles for pods!`, {
      id: "bulk-op",
    });
    handleManualRefresh();
  };

  const handleBulkDelete = async () => {
    if (selectedPods.length === 0) return;

    const confirmKill = window.confirm(
      `DANGER: You are about to instantly delete ${selectedPods.length} pods from the cluster simultaneously. Proceed?`,
    );
    if (!confirmKill) return;

    setIsBulkExecuting(true);
    toast.loading(`Deleting ${selectedPods.length} workloads...`, {
      id: "bulk-op",
    });

    // loop through selections and use parent function
    for (const compoundKey of selectedPods) {
      const [ns, name] = compoundKey.split("/");
      try {
        await handleDeletePod(ns, name);
      } catch (err) {
        console.error(`Failed to bulk delete ${name}:`, err);
      }
    }

    setIsBulkExecuting(false);
    setSelectedPods([]); // clear selected list
    toast.success(`Eviction signal executed successfully!`, { id: "bulk-op" });
    handleManualRefresh();
  };

  const renderSortIndicator = (key: PodSortKey) => {
    return (
      <span className="inline-flex items-center text-[13px] ml-1 opacity-80 select-none">
        {sortKey !== key ? (
          <SwapVertIcon fontSize="inherit" className="text-slate-400" />
        ) : sortOrder === "asc" ? (
          <ArrowUpwardIcon fontSize="inherit" />
        ) : (
          <ArrowDownwardIcon fontSize="inherit" />
        )}
      </span>
    );
  };

  const filteredPods = useMemo(() => {
    return clusterPods.filter((pod) => {
      const cleanQuery = searchQuery.toLowerCase().trim();

      const matchesSearch =
        pod.name.toLowerCase().includes(cleanQuery) ||
        pod.namespace.toLowerCase().includes(cleanQuery) ||
        pod.image.toLowerCase().includes(cleanQuery);

      const matchesStatus =
        statusFilter === "All" ||
        (statusFilter === "Failed" &&
          pod.status !== "Running" &&
          pod.status !== "Pending") ||
        pod.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [clusterPods, searchQuery, statusFilter]);

  const sortedPods = [...filteredPods].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortOrder === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    } else {
      return sortOrder === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }
  });

  const totalRows = sortedPods.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
  const sanitizedPage = Math.min(currentPage, totalPages);
  const indexOfLastRow = sanitizedPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentPodsRows = sortedPods.slice(indexOfFirstRow, indexOfLastRow);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      <div className="flex justify-between items-center w-full">
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
            transition-all cursor-pointer shadow shrink-0"
        >
          + Deploy New Pod
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-[#E7E1B1]/10 border border-[#E7E1B1]/60 p-3 rounded-xl shadow-2xs w-full">
        {/* filter bar */}
        <div className="relative flex-1 max-w-md flex items-center">
          <span className="absolute left-3 text-slate-400 flex items-center pointer-events-none">
            <SearchIcon fontSize="small" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1); // go to first page when typing a filter
            }}
            placeholder="Search by pod name, image tag or scope namespace..."
            className="w-full pl-9 pr-4 py-1.5 bg-white border border-[#E7E1B1] rounded-lg text-xs font-mono text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#306D29] focus:border-[#306D29] transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-slate-400 hover:text-slate-600 text-xs font-sans font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* pill to select specific pods over status  */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {(["All", "Running", "Pending", "Failed"] as const).map((type) => {
            const isActive = statusFilter === type;
            const count = statusCounts[type];

            const badgeThemes = {
              All: isActive
                ? "bg-[#0D530E] text-white border-[#0D530E]"
                : "bg-white text-slate-600 border-[#E7E1B1] hover:bg-[#E7E1B1]/20",
              Running: isActive
                ? "bg-[#0D530E] text-white border-[#0D530E]"
                : "bg-[#0D530E]/5 text-[#0D530E] border-[#0D530E]/20 hover:bg-[#0D530E]/10",
              Pending: isActive
                ? "bg-amber-600 text-white border-amber-600"
                : "bg-amber-600/5 text-amber-700 border-amber-600/20 hover:bg-amber-600/10",
              Failed: isActive
                ? "bg-red-600 text-white border-red-600"
                : "bg-red-600/5 text-red-700 border-red-600/20 hover:bg-red-600/10",
            };

            return (
              <button
                key={type}
                onClick={() => {
                  setStatusFilter(type);
                  setCurrentPage(1); // go to first page when switching filters
                }}
                className={`px-2.5 py-1 text-[10px] font-bold font-mono tracking-wide uppercase rounded-md border shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${badgeThemes[type]}`}
              >
                <span>{type}</span>
                <span
                  className={`text-[9px] px-1 rounded-sm ${isActive ? "bg-white/20 text-white" : "bg-slate-700/5 text-slate-500 font-bold"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="w-full bg-[#E7E1B1]/30 border border-[#E7E1B1] 
          rounded-xl overflow-hidden shadow-sm flex flex-col items-stretch"
      >
        <div className="w-full overflow-x-auto scrollbar-thin">
          <div className="max-h-[480px] overflow-y-auto pr-px">
            <table className="w-full text-left border-collapse text-xs relative min-w-[850px]">
              <thead>
                <tr
                  className="bg-[#E7E1B1]/60 border-b border-[#E7E1B1] 
                      text-[#0D530E] font-bold tracking-wider uppercase text-[10px]
                      sticky top-0 z-10 select-none"
                >
                  <th className="p-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        currentPodsRows.length > 0 &&
                        currentPodsRows.every((p) =>
                          selectedPods.includes(`${p.namespace}/${p.name}`),
                        )
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          // select all visible rows on the current page
                          const pageKeys = currentPodsRows.map(
                            (p) => `${p.namespace}/${p.name}`,
                          );
                          setSelectedPods((prev) =>
                            Array.from(new Set([...prev, ...pageKeys])),
                          );
                        } else {
                          // uncheck all visible rows on the current page
                          const pageKeys = currentPodsRows.map(
                            (p) => `${p.namespace}/${p.name}`,
                          );
                          setSelectedPods((prev) =>
                            prev.filter((key) => !pageKeys.includes(key)),
                          );
                        }
                      }}
                      className="rounded border-[#E7E1B1] text-[#306D29] focus:ring-[#306D29] h-3.5 w-3.5 accent-[#306D29] cursor-pointer"
                    />
                  </th>
                  <th
                    onClick={() => handleSortRequest("name")}
                    className="p-4 cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                  >
                    <div className="flex items-center gap-0.5">
                      Pod Name {renderSortIndicator("name")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSortRequest("namespace")}
                    className="p-4 cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                  >
                    <div className="flex items-center gap-0.5">
                      Namespace {renderSortIndicator("namespace")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSortRequest("status")}
                    className="p-4 cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                  >
                    <div className="flex items-center gap-0.5">
                      Status {renderSortIndicator("status")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSortRequest("image")}
                    className="p-4 cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                  >
                    <div className="flex items-center gap-0.5">
                      Container Image {renderSortIndicator("image")}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSortRequest("age_seconds")}
                    className="p-4 text-center cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                  >
                    <div className="flex items-center justify-center gap-0.5">
                      Age {renderSortIndicator("age_seconds")}
                    </div>
                  </th>
                  <th className="p-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E1B1]/60 font-mono text-slate-700">
                {currentPodsRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-slate-400 italic bg-[#FBF5DD]/30"
                    >
                      No active pods found inside the current boundary context.
                    </td>
                  </tr>
                ) : (
                  currentPodsRows.map((pod) => {
                    const isSystemCore = pod.name.includes("kubedash-");
                    // console.log(pod.status);
                    const isFailing =
                      pod.status === "Failed" ||
                      (pod.message &&
                        pod.message.toLowerCase().includes("backoff")) ||
                      (pod.message &&
                        pod.message.toLowerCase().includes("err"));

                    const podKey = `${pod.namespace}/${pod.name}`;
                    const isChecked = selectedPods.includes(podKey);

                    return (
                      <tr
                        key={`${pod.namespace}/${pod.name}`}
                        className={`transition-colors border-b border-[#E7E1B1]/10 ${
                          isChecked
                            ? "bg-[#306D29]/10 hover:bg-[#306D29]/15 border-l-4 border-l-[#306D29]"
                            : isFailing
                              ? "bg-red-500/[0.08] hover:bg-red-500/[0.15] border-l-4 border-l-red-600 animate-pulse hover:animate-none"
                              : isSystemCore
                                ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-4 border-l-amber-500"
                                : "bg-[#FBF5DD]/10 hover:bg-[#E7E1B1]/20 border-l-4 border-l-transparent"
                        }`}
                      >
                        <td className="p-4 text-center whitespace-nowrap w-10">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedPods((prev) => [...prev, podKey]);
                              } else {
                                setSelectedPods((prev) =>
                                  prev.filter((k) => k !== podKey),
                                );
                              }
                            }}
                            className="rounded border-[#E7E1B1] text-[#306D29] focus:ring-[#306D29] h-3.5 w-3.5 accent-[#306D29] cursor-pointer"
                          />
                        </td>
                        <td className="p-4 font-bold text-[#0D530E] whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{pod.name}</span>
                            {isSystemCore && (
                              <span
                                className="text-[8px] uppercase tracking-wider 
                                  font-extrabold px-1.5 py-0.5 rounded bg-amber-600/10 
                                  text-amber-800 border border-amber-600/20 shadow-sm"
                              >
                                Core
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-slate-600 whitespace-nowrap">
                          {pod.namespace}
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1 items-start">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                pod.status === "Running"
                                  ? "bg-[#0D530E]/10 text-[#0D530E] border border-[#0D530E]/20"
                                  : pod.status === "Pending"
                                    ? "bg-amber-600/10 text-amber-700 border border-amber-600/20"
                                    : "bg-red-600/10 text-red-700 border border-red-600/20"
                              }`}
                            >
                              {pod.status}
                            </span>

                            {pod.message && (
                              <span
                                className="text-[10px] font-semibold text-red-700 max-w-[200px] truncate block font-mono"
                                title={pod.message}
                              >
                                <WarningIcon fontSize="inherit" />{" "}
                                {pod.message.split(":")[0]}{" "}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-[#306D29] font-medium max-w-[280px]">
                          <div className="truncate font-bold" title={pod.image}>
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
                                        className={`text-[9px] px-1.5 py-0.5 rounded-md font-sans font-bold flex items-center gap-1 tracking-wide shadow-2xs border transition-all transform hover:scale-105 active:scale-95 cursor-pointer ${
                                          isSecret
                                            ? "bg-red-500/10 text-red-800 border-red-500/20 hover:bg-red-500/20"
                                            : "bg-blue-500/10 text-blue-800 border-blue-500/20 hover:bg-blue-500/20"
                                        }`}
                                      >
                                        <span className="flex items-center text-[10px]">
                                          {isSecret ? (
                                            <LockIcon fontSize="inherit" />
                                          ) : (
                                            <SettingsIcon fontSize="inherit" />
                                          )}
                                        </span>
                                        <span className="truncate max-w-[90px]">
                                          {cleanName}
                                        </span>
                                      </button>
                                    );
                                  },
                                )}
                              </div>
                            )}
                        </td>
                        <td className="p-4 text-center text-slate-500 font-medium whitespace-nowrap px-6">
                          {formatPodAge(pod.age_seconds)}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap px-4">
                          <div className="flex justify-center items-center gap-1">
                            <button
                              onClick={() => {
                                setConfigEditPod(pod);
                                setEditConfigName("");
                                setEditConfigType("");
                                setEditMappings([
                                  { sourceKey: "", envKey: "" },
                                ]);
                              }}
                              className="px-2 py-0.5 text-[9px] font-bold 
                                  text-blue-800 hover:text-white bg-blue-500/10 
                                  hover:bg-blue-600 border border-blue-500/20 
                                  rounded transition-all cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setLogPod(pod)}
                              className={`px-2 py-0.5 text-[9px] font-bold rounded transition-all 
                                cursor-pointer border ${isFailing ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600 shadow-xs scale-105" : "text-amber-800 hover:text-white bg-amber-500/10 hover:bg-amber-600 border border-amber-500/20"}`}
                            >
                              Logs
                            </button>
                            <button
                              onClick={() => setSshPod(pod)}
                              className="px-2 py-0.5 text-[9px] font-bold 
                                text-[#0D530E] hover:text-[#FBF5DD] bg-[#306D29]/10 
                                hover:bg-[#306D29] border border-[#306D29]/20 
                                rounded transition-all cursor-pointer"
                            >
                              Term
                            </button>
                            <button
                              onClick={() =>
                                onTriggerRestartClick(pod.namespace, pod.name)
                              }
                              disabled={isRestarting === pod.name}
                              title="Trigger Restart"
                              className="p-1 rounded border border-[#E7E1B1] bg-white text-[#306D29] 
                                hover:bg-[#FBF5DD] hover:text-[#0D530E] transition-all cursor-pointer 
                                disabled:opacity-40 shadow-sm flex items-center justify-center shrink-0"
                            >
                              {isRestarting === pod.name ? (
                                <svg
                                  className="animate-spin h-3 w-3 text-[#0D530E]"
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
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="h-3 w-3"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2.5}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                                  />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() =>
                                handleDeletePod(pod.namespace, pod.name)
                              }
                              disabled={deletingPod === pod.name}
                              className="px-2 py-0.5 text-[9px] font-bold 
                                text-red-700 hover:text-white bg-red-600/10 
                                hover:bg-red-600 border border-red-600/20 rounded 
                                transition-all cursor-pointer disabled:opacity-40"
                            >
                              {deletingPod === pod.name ? "Kill" : "Del"}
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

        {totalRows > 0 && (
          <div
            className="bg-[#E7E1B1]/10 px-5 py-3 border-t border-[#E7E1B1] 
              flex items-center justify-between font-mono text-[11px] text-slate-600 select-none mt-auto"
          >
            <div>
              Showing{" "}
              <span className="font-bold text-[#0D530E]">
                {indexOfFirstRow + 1}
              </span>
              -
              <span className="font-bold text-[#0D530E]">
                {Math.min(indexOfLastRow, totalRows)}
              </span>{" "}
              of <span className="font-bold text-[#0D530E]">{totalRows}</span>{" "}
              active pods
            </div>

            <div className="flex items-center gap-1.5">
              <div className="px-3 py-1 bg-[#E7E1B1]/30 border border-[#E7E1B1] rounded font-bold text-[#0D530E]">
                PAGE {sanitizedPage} OF {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={sanitizedPage === 1}
                className="inline-flex items-center justify-center px-2 py-1 rounded border border-[#E7E1B1] 
                    bg-white text-[#306D29] font-bold hover:bg-[#0D530E] 
                    hover:text-[#FBF5DD] transition-all disabled:opacity-30 
                    disabled:pointer-events-none cursor-pointer h-7"
              >
                <KeyboardArrowLeftIcon fontSize="small" className="mr-0.5" />{" "}
                PREV
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={sanitizedPage === totalPages}
                className="inline-flex items-center justify-center px-2 py-1 rounded border border-[#E7E1B1] bg-white 
                  text-[#306D29] font-bold hover:bg-[#0D530E] hover:text-[#FBF5DD] 
                  transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer h-7"
              >
                NEXT{" "}
                <KeyboardArrowRightIcon fontSize="small" className="ml-0.5" />
              </button>
            </div>
          </div>
        )}
      </div>
      {/* bulk ops */}
      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0D530E] border-2 border-[#306D29] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-6 z-50 transform transition-all duration-300 font-mono text-xs ${
          selectedPods.length > 0
            ? "translate-y-0 opacity-100 scale-100"
            : "translate-y-20 opacity-0 scale-95 pointer-events-none"
        }`}
      >
        <div className="text-[#FBF5DD] flex items-center gap-2">
          <span className="bg-white/20 px-2 py-0.5 rounded text-[11px] font-black animate-pulse">
            {selectedPods.length}
          </span>
          <span className="font-bold tracking-wide uppercase text-[10px]">
            Workloads Staged
          </span>
        </div>

        <div className="h-4 w-px bg-white/20" />

        <div className="flex items-center gap-2">
          <button
            onClick={handleBulkRestart}
            disabled={isBulkExecuting}
            className="px-3 py-1.5 bg-[#306D29] text-[#FBF5DD] font-bold rounded-lg border border-[#306D29] hover:bg-[#0D530E] hover:border-white/30 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            Bulk Restart
          </button>

          <button
            onClick={handleBulkDelete}
            disabled={isBulkExecuting}
            className="px-3 py-1.5 bg-red-600 text-white font-black rounded-lg border border-red-700 hover:bg-red-700 transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-md"
          >
            Mass Delete
          </button>

          <button
            onClick={() => setSelectedPods([])}
            disabled={isBulkExecuting}
            className="px-2.5 py-1.5 text-white/60 hover:text-white transition-colors cursor-pointer font-sans text-[11px] font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
