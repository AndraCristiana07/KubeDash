import React, { useState } from "react";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import LockIcon from "@mui/icons-material/Lock";

interface PodEntry {
  name: string;
  namespace: string;
  status: string;
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
}: ClusterPodsTableProps) {
  const [sortKey, setSortKey] = useState<PodSortKey>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const handleSortRequest = (key: PodSortKey) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder(key === "age_seconds" ? "desc" : "asc");
    }
  };

  const renderSortIndicator = (key: PodSortKey) => {
    if (sortKey !== key) {
      return <SwapVertIcon fontSize="inherit" />;
    }

    return sortOrder === "asc" ? (
      <ArrowUpwardIcon fontSize="inherit" />
    ) : (
      <ArrowDownwardIcon fontSize="inherit" />
    );
  };

  const sortedPods = [...clusterPods].sort((a, b) => {
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
          <table className="w-full text-left border-collapse text-xs relative table-fixed">
            <thead>
              <tr
                className="bg-[#E7E1B1]/60 border-b border-[#E7E1B1] 
                    text-[#0D530E] font-bold tracking-wider uppercase text-[10px]
                    sticky top-0 z-10"
              >
                <th
                  onClick={() => handleSortRequest("name")}
                  className="p-4 cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                >
                  Pod Name {renderSortIndicator("name")}
                </th>
                <th
                  onClick={() => handleSortRequest("namespace")}
                  className="p-4 cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                >
                  Namespace {renderSortIndicator("namespace")}
                </th>
                <th
                  onClick={() => handleSortRequest("status")}
                  className="p-4 cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                >
                  Status {renderSortIndicator("status")}
                </th>
                <th
                  onClick={() => handleSortRequest("image")}
                  className="p-4 cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                >
                  Container Image {renderSortIndicator("image")}
                </th>
                <th
                  onClick={() => handleSortRequest("age_seconds")}
                  className="p-4 text-center cursor-pointer hover:bg-[#E7E1B1]/80 transition-colors"
                >
                  Age {renderSortIndicator("age_seconds")}
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
                  return (
                    <tr
                      key={`${pod.namespace}/${pod.name}`}
                      className={`transition-colors border-b border-[#E7E1B1]/10 ${
                        isSystemCore
                          ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-4 border-l-amber-500"
                          : "bg-[#FBF5DD]/10 hover:bg-[#E7E1B1]/20 border-l-4 border-l-transparent"
                      }`}
                    >
                      <td className="p-4 font-bold text-[#0D530E]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span>{pod.name}</span>
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
                      <td className="p-4 text-slate-600">{pod.namespace}</td>
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
                                      <span>{isSecret ? "🔒" : "⚙️"}</span>
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
                            onClick={() => {
                              setConfigEditPod(pod);
                              setEditConfigName("");
                              setEditConfigType("");
                              setEditMappings([{ sourceKey: "", envKey: "" }]);
                            }}
                            className="px-2 py-1 text-[10px] font-bold 
                                text-blue-800 hover:text-white bg-blue-500/10 \
                                hover:bg-blue-600 border border-blue-500/20 \
                                rounded-md transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setLogPod(pod)}
                            className="px-2 py-1 text-[10px] font-bold 
                              text-amber-800 hover:text-white bg-amber-500/10 \
                              hover:bg-amber-600 border border-amber-500/20 \
                              rounded-md transition-all cursor-pointer"
                          >
                            Logs
                          </button>
                          <button
                            onClick={() => setSshPod(pod)}
                            className="px-2 py-1 text-[10px] font-bold 
                              text-[#0D530E] hover:text-[#FBF5DD] bg-[#306D29]/10 \
                              hover:bg-[#306D29] border border-[#306D29]/20 \
                              rounded-md transition-all cursor-pointer"
                          >
                            Terminal
                          </button>
                          <button
                            onClick={() =>
                              onTriggerRestartClick(pod.namespace, pod.name)
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
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
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
                            className="px-2.5 py-1 text-[10px] font-bold 
                              text-red-700 hover:text-white bg-red-600/10 \
                              hover:bg-red-600 border border-red-600/20 rounded-md \
                              transition-all cursor-pointer disabled:opacity-40"
                          >
                            {deletingPod === pod.name ? "Killing..." : "Delete"}
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
        {totalRows > 0 && (
          <div className="bg-[#E7E1B1]/10 px-5 py-3.5 border-t border-[#E7E1B1] flex items-center justify-between font-mono text-[11px] text-slate-600 select-none">
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
                className="px-2.5 py-1 rounded border border-[#E7E1B1] 
                    bg-white text-[#306D29] font-bold hover:bg-[#0D530E] 
                    hover:text-[#FBF5DD] transition-all disabled:opacity-30 
                    disabled:pointer-events-none cursor-pointer"
              >
                <KeyboardArrowLeftIcon fontSize="small" /> PREV
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={sanitizedPage === totalPages}
                className="px-2.5 py-1 rounded border border-[#E7E1B1] bg-white 
                  text-[#306D29] font-bold hover:bg-[#0D530E] hover:text-[#FBF5DD] 
                  transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                NEXT <KeyboardArrowRightIcon fontSize="small" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
