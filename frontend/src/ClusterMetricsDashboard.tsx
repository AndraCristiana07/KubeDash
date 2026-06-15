import React, { useState, useEffect } from "react";
import { SparkLineChart } from "@mui/x-charts/SparkLineChart";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import SearchIcon from "@mui/icons-material/Search";
import ResourceHogsPanel from "./ResourceHogPanel";
import ClusterMetricsSummaryGrid from "./ClusterMetricsSummary";
import PodUsageTable from "./ClusterMetricsUsageTable";
import PodHistoricalTrendTable from "./ClusterMetricsSparklinesTable";

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

export type SortKey =
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
      <ClusterMetricsSummaryGrid
        totalPodsCount={totalPodsCount}
        globalSummary={globalSummary}
        avgGpuLoad={avgGpuLoad}
      />
      <ResourceHogsPanel metrics={metrics} />
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
          <div className="relative w-full sm:w-72 flex items-center">
            <span className="absolute left-3 text-slate-400 flex items-center pointer-events-none">
              <SearchIcon fontSize="small" />
            </span>
            <input
              type="text"
              placeholder="Filter nodes by pod/namespace..."
              value={filterText}
              onChange={handleFilterChange}
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-[#E7E1B1] rounded-lg text-xs font-mono text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#306D29] focus:border-[#306D29] transition-all shadow-2xs"
            />
            {filterText && (
              <button
                onClick={() =>
                  handleFilterChange({ target: { value: "" } } as any)
                }
                className="absolute right-2.5 text-slate-400 hover:text-slate-600 text-xs font-sans font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {activeSubTab === "usage" ? (
            <PodUsageTable
              activeSubTab={activeSubTab}
              currentMetricRows={currentMetricRows}
              handleSortRequest={handleSortRequest}
              renderSortIndicator={renderSortIndicator}
              renderProgressBar={renderProgressBar}
            />
          ) : (
            /* historical sparklines */
            <PodHistoricalTrendTable
              activeSubTab={activeSubTab}
              currentMetricRows={currentMetricRows}
              historicalTrends={historicalTrends}
              handleSortRequest={handleSortRequest}
              renderSortIndicator={renderSortIndicator}
              renderLibraryTrendLine={renderLibraryTrendLine}
            />
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
