import React from "react";

interface GlobalSummary {
  cpu: number;
  mem: number;
  activeGPUs: number;
}

interface ClusterMetricsGridProps {
  totalPodsCount: number;
  globalSummary: GlobalSummary;
  avgGpuLoad: number | string;
}

export default function ClusterMetricsSummaryGrid({
  totalPodsCount,
  globalSummary,
  avgGpuLoad,
}: ClusterMetricsGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* managed pods card */}
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

      {/* CPU load card */}
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

      {/* RAM allocation card */}
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

      {/* NVIDIA GPU compute card */}
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
  );
}
