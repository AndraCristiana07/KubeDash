import React, { useState, useEffect } from "react";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";

interface PodMetricRow {
  pod_name: string;
  namespace: string;
  cpu_usage: number; // millicores (m)
  mem_usage: number; // Megabytes (MB)
  gpu_usage: number; // percentage (0-100)
  last_updated: number;
}

interface DashboardProps {
  metrics: Record<string, PodMetricRow>;
}

interface HistoryBucket {
  cpu: number[];
  mem: number[];
  gpu: number[];
}

type SortKey =
  | "namespace"
  | "pod_name"
  | "cpu_usage"
  | "mem_usage"
  | "gpu_usage";
type SortOrder = "asc" | "desc";

export default function ClusterMetricsDashboard({ metrics }: DashboardProps) {
  const [filterText, setFilterText] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [activeSubTab, setActiveSubTab] = useState<"usage" | "trends">("usage");

  const [sortKey, setSortKey] = useState<SortKey>("namespace");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [historicalTrends, setHistoricalTrends] = useState<
    Record<string, HistoryBucket>
  >({});
  const historyDepth = 15;

  useEffect(() => {
    setHistoricalTrends((prevHistory) => {
      const updatedHistory = { ...prevHistory };
      Object.values(metrics).forEach((pod) => {
        const key = `${pod.namespace}/${pod.pod_name}`;
        const existing = updatedHistory[key] || { cpu: [], mem: [], gpu: [] };

        const nextCpu = [...existing.cpu, pod.cpu_usage].slice(-historyDepth);
        const nextMem = [...existing.mem, pod.mem_usage].slice(-historyDepth);
        const nextGpu = [...existing.gpu, pod.gpu_usage].slice(-historyDepth);

        updatedHistory[key] = { cpu: nextCpu, mem: nextMem, gpu: nextGpu };
      });

      // evict old dead pods from history map state layers
      const currentKeys = new Set(
        Object.values(metrics).map((p) => `${p.namespace}/${p.pod_name}`),
      );
      Object.keys(updatedHistory).forEach((key) => {
        if (!currentKeys.has(key)) delete updatedHistory[key];
      });
      return updatedHistory;
    });
  }, [metrics]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
    setCurrentPage(1);
  };

  const handleSortRequest = (key: SortKey) => {
    if (sortKey === key) {
      // toggle sort directions
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder(
        key === "cpu_usage" || key === "mem_usage" || key === "gpu_usage"
          ? "desc"
          : "asc",
      );
    }
    setCurrentPage(1); // go back to page 1 on sorting shifts
  };

  const renderSortIndicator = (key: SortKey) => {
    if (sortKey !== key) {
      return <SwapVertIcon fontSize="inherit" />;
    }

    return sortOrder === "asc" ? (
      <ArrowUpwardIcon fontSize="inherit" />
    ) : (
      <ArrowDownwardIcon fontSize="inherit" />
    );
  };

  const renderLibraryTrendLine = (
    dataPoints: number[],
    strokeColor = "#306D29",
  ) => {
    if (!dataPoints || dataPoints.length < 2) {
      return (
        <span className="text-[10px] text-slate-400 italic font-mono">
          Gathering vectors...
        </span>
      );
    }
    const min = Math.min(...dataPoints);
    const max = Math.max(...dataPoints);

    return (
      <div className="flex items-center gap-3">
        <div className="w-[140px] h-[24px]">
          <SparkLineChart
            data={dataPoints}
            height={24}
            width={140}
            color={strokeColor}
            showTooltip={false}
            showHighlight={true}
            curve="linear"
          />
        </div>
        <span className="text-[10px] text-slate-400 font-mono text-right min-w-[45px]">
          ({min === max ? min : `${min}→${max}`})
        </span>
      </div>
    );
  };

  const renderProgressBar = (
    value: number,
    max: number,
    type: "cpu" | "mem" | "gpu",
  ) => {
    const percentage = Math.min(Math.round((value / max) * 100), 100);
    const totalBlocks = 10;
    const filledBlocks = Math.round((percentage / 100) * totalBlocks);
    const barString =
      "■".repeat(filledBlocks) + "□".repeat(totalBlocks - filledBlocks);

    let colorClass = "text-emerald-600 font-bold";
    if (percentage > 50 && percentage <= 80)
      colorClass = "text-amber-600 font-bold";
    if (percentage > 80) colorClass = "text-red-500 font-bold animate-pulse";

    return (
      <div className="font-mono text-xs flex items-center gap-2">
        <span className={colorClass}>[{barString}]</span>
        <span className="text-[#306D29] font-medium min-w-[35px] text-right">
          {percentage}%
        </span>
      </div>
    );
  };

  // global summaries
  const allMetricsArray = Object.values(metrics);
  const totalPodsCount = allMetricsArray.length;
  const globalSummary = allMetricsArray.reduce(
    (acc, current) => {
      acc.cpu += current.cpu_usage;
      acc.mem += current.mem_usage;
      if (current.gpu_usage > 0) {
        acc.activeGPUs += 1;
        acc.gpuSum += current.gpu_usage;
      }
      return acc;
    },
    { cpu: 0, mem: 0, activeGPUs: 0, gpuSum: 0 },
  );
  const avgGpuLoad =
    globalSummary.activeGPUs > 0
      ? Math.round(globalSummary.gpuSum / globalSummary.activeGPUs)
      : 0;

  const filteredRows = allMetricsArray.filter(
    (row) =>
      row.pod_name.toLowerCase().includes(filterText.toLowerCase()) ||
      row.namespace.toLowerCase().includes(filterText.toLowerCase()),
  );

  const sortedRows = [...filteredRows].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortOrder === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    } else {
      // number metric comparisons (CPU, Memory, GPU usages)
      return sortOrder === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    }
  });

  const totalRows = sortedRows.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;
  const sanitizedPage = Math.min(currentPage, totalPages);
  const indexOfLastRow = sanitizedPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentMetricRows = sortedRows.slice(indexOfFirstRow, indexOfLastRow);

  return (
    <div className="p-6 bg-[#FBF5DD] min-h-screen text-slate-800 space-y-6">
      {/* sumarry */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E7E1B1] rounded-xl p-4 shadow-sm flex flex-col justify-between font-mono">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            Managed Pods
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-[#0D530E]">
              {totalPodsCount}
            </span>
            <span className="text-xs text-slate-400">Allocated Nodes</span>
          </div>
          <div className="text-[10px] text-emerald-700 font-bold mt-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Collecting from Stream
          </div>
        </div>

        <div className="bg-white border border-[#E7E1B1] rounded-xl p-4 shadow-sm flex flex-col justify-between font-mono">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            Aggregated CPU Engine Load
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-[#0D530E]">
              {globalSummary.cpu.toLocaleString()}
            </span>
            <span className="text-xs font-bold text-slate-600">millicores</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            Equates to ~
            <span className="font-bold text-[#306D29]">
              {(globalSummary.cpu / 1000).toFixed(2)}
            </span>{" "}
            full cores
          </div>
        </div>

        <div className="bg-white border border-[#E7E1B1] rounded-xl p-4 shadow-sm flex flex-col justify-between font-mono">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            Total RAM Allocation
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-[#0D530E]">
              {globalSummary.mem >= 1024
                ? (globalSummary.mem / 1024).toFixed(2)
                : globalSummary.mem}
            </span>
            <span className="text-xs font-bold text-slate-600">
              {globalSummary.mem >= 1024 ? "GB" : "MB"}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            Spanning across all working namespaces
          </div>
        </div>

        <div className="bg-white border border-[#E7E1B1] rounded-xl p-4 shadow-sm flex flex-col justify-between font-mono">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
            NVIDIA GPU Matrix Compute
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-[#0D530E]">
              {globalSummary.activeGPUs > 0 ? `${avgGpuLoad}%` : "0%"}
            </span>
            <span className="text-xs text-slate-500">Avg Utilization</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-2">
            Active GPUs:{" "}
            <span className="font-bold text-[#306D29]">
              {globalSummary.activeGPUs}
            </span>{" "}
            units loaded
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-[#E7E1B1] pb-px font-mono text-xs">
        <button
          onClick={() => setActiveSubTab("usage")}
          className={`px-4 py-2 border-t border-x rounded-t-lg transition-all font-bold tracking-wide cursor-pointer ${
            activeSubTab === "usage"
              ? "bg-white border-[#E7E1B1] text-[#0D530E] relative z-10 shadow-2xs"
              : "bg-[#E7E1B1]/20 border-transparent text-slate-500 hover:bg-[#E7E1B1]/40"
          }`}
        >
          Real-time Resource Usage
        </button>
        <button
          onClick={() => setActiveSubTab("trends")}
          className={`px-4 py-2 border-t border-x rounded-t-lg transition-all font-bold tracking-wide cursor-pointer ${
            activeSubTab === "trends"
              ? "bg-white border-[#E7E1B1] text-[#0D530E] relative z-10 shadow-2xs"
              : "bg-[#E7E1B1]/20 border-transparent text-slate-500 hover:bg-[#E7E1B1]/40"
          }`}
        >
          Historical Trends
        </button>
      </div>

      <div className="bg-white border border-[#E7E1B1] rounded-b-xl rounded-tr-xl shadow-sm overflow-hidden flex flex-col">
        <div className="bg-[#E7E1B1]/20 px-5 py-3 border-b border-[#E7E1B1] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-bold text-[#0D530E] uppercase tracking-wider">
            {activeSubTab === "usage"
              ? "Live Hardware Compute Monitor"
              : "Timeline Velocity Vector Matrices"}
          </div>
          <input
            type="text"
            placeholder="Filter nodes by pod/namespace..."
            value={filterText}
            onChange={handleFilterChange}
            className="px-3 py-1.5 text-xs bg-white text-slate-800 placeholder-slate-400 rounded-md border border-[#E7E1B1] focus:outline-none focus:border-[#0D530E] w-64 shadow-inner"
          />
        </div>

        <div className="overflow-x-auto">
          {activeSubTab === "usage" ? (
            <table className="w-full text-left border-collapse font-mono table-fixed">
              <thead>
                <tr className="bg-[#0D530E] text-[#FBF5DD] text-[11px] font-bold tracking-wider border-b border-[#306D29]/20 uppercase select-none">
                  <th
                    onClick={() => handleSortRequest("namespace")}
                    className="px-5 py-3 cursor-pointer hover:bg-[#306D29] transition-colors"
                  >
                    Namespace {renderSortIndicator("namespace")}
                  </th>
                  <th
                    onClick={() => handleSortRequest("pod_name")}
                    className="px-5 py-3 cursor-pointer hover:bg-[#306D29] transition-colors"
                  >
                    Target Infrastructure Pod {renderSortIndicator("pod_name")}
                  </th>
                  <th
                    onClick={() => handleSortRequest("cpu_usage")}
                    className="px-5 py-3 cursor-pointer hover:bg-[#306D29] transition-colors"
                  >
                    CPU Load (Millicores) {renderSortIndicator("cpu_usage")}
                  </th>
                  <th
                    onClick={() => handleSortRequest("mem_usage")}
                    className="px-5 py-3 cursor-pointer hover:bg-[#306D29] transition-colors"
                  >
                    RAM Allocation {renderSortIndicator("mem_usage")}
                  </th>
                  <th
                    onClick={() => handleSortRequest("gpu_usage")}
                    className="px-5 py-3 cursor-pointer hover:bg-[#306D29] transition-colors"
                  >
                    NVIDIA GPU Compute {renderSortIndicator("gpu_usage")}
                  </th>
                  <th className="px-5 py-3 text-right">Telemetry Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E1B1]/50 text-xs">
                {currentMetricRows.length > 0 ? (
                  currentMetricRows.map((row) => (
                    <tr
                      key={`${row.namespace}/${row.pod_name}`}
                      className="hover:bg-[#FBF5DD]/30 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-bold text-[#306D29]">
                        {row.namespace}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-700">
                        {row.pod_name}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-[11px] text-slate-500 mb-0.5">
                          {row.cpu_usage}m
                        </div>
                        {renderProgressBar(row.cpu_usage, 2000, "cpu")}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-[11px] text-slate-500 mb-0.5">
                          {row.mem_usage} MB
                        </div>
                        {renderProgressBar(row.mem_usage, 4096, "mem")}
                      </td>
                      <td className="px-5 py-3.5">
                        {row.gpu_usage > 0 ? (
                          <>
                            <div className="text-[11px] text-slate-500 mb-0.5">
                              Core Active
                            </div>
                            {renderProgressBar(row.gpu_usage, 100, "gpu")}
                          </>
                        ) : (
                          <span className="text-slate-400 italic text-[11px] tracking-wide select-none">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                          LIVE
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-12 text-center text-[#306D29]/60 italic font-medium"
                    >
                      No matching resource rows found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            /* historical sparklines */
            <table className="w-full text-left border-collapse font-mono table-fixed">
              <thead>
                <tr className="bg-[#53370D] text-[#FBF5DD] text-[11px] font-bold tracking-wider border-b border-[#6D4929]/20 uppercase select-none">
                  <th
                    onClick={() => handleSortRequest("pod_name")}
                    className="px-5 py-3 cursor-pointer hover:bg-[#6D4929] transition-colors"
                  >
                    Target Workspace Pod {renderSortIndicator("pod_name")}
                  </th>
                  <th
                    onClick={() => handleSortRequest("cpu_usage")}
                    className="px-5 py-3 cursor-pointer hover:bg-[#6D4929] transition-colors"
                  >
                    CPU Usage Timeline (15 Ticks){" "}
                    {renderSortIndicator("cpu_usage")}
                  </th>
                  <th
                    onClick={() => handleSortRequest("mem_usage")}
                    className="px-5 py-3 cursor-pointer hover:bg-[#6D4929] transition-colors"
                  >
                    RAM Capacity Timeline (15 Ticks){" "}
                    {renderSortIndicator("mem_usage")}
                  </th>
                  <th
                    onClick={() => handleSortRequest("gpu_usage")}
                    className="px-5 py-3 cursor-pointer hover:bg-[#6D4929] transition-colors"
                  >
                    GPU Allocation Timeline {renderSortIndicator("gpu_usage")}
                  </th>
                  <th className="px-5 py-3 text-right">Telemetry Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E1B1]/50 text-xs">
                {currentMetricRows.length > 0 ? (
                  currentMetricRows.map((row) => {
                    const targetKey = `${row.namespace}/${row.pod_name}`;
                    const podHistory = historicalTrends[targetKey] || {
                      cpu: [],
                      mem: [],
                      gpu: [],
                    };

                    return (
                      <tr
                        key={targetKey}
                        className="hover:bg-[#FBF5DD]/30 transition-colors"
                      >
                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-700">
                            {row.pod_name}
                          </div>
                          <div className="text-[10px] font-bold text-amber-800">
                            {row.namespace}
                          </div>
                        </td>
                        <td className="px-5 py-4 vertical-middle">
                          {renderLibraryTrendLine(podHistory.cpu, "#306D29")}
                        </td>
                        <td className="px-5 py-4 vertical-middle">
                          {renderLibraryTrendLine(podHistory.mem, "#225da8")}
                        </td>
                        <td className="px-5 py-4 vertical-middle">
                          {row.gpu_usage > 0 ||
                          podHistory.gpu.some((v) => v > 0) ? (
                            renderLibraryTrendLine(podHistory.gpu, "#b85c00")
                          ) : (
                            <span className="text-slate-400 italic text-[11px] pl-2 select-none">
                              — No Device Load
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            TRACKING
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-12 text-center text-slate-400 italic font-medium"
                    >
                      No matching historical logs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* pagination*/}
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
              active data frames
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
