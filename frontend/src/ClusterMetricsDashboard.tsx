import React, { useEffect, useState } from "react";

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

export default function ClusterMetricsDashboard({ metrics }: DashboardProps) {
  const [filterText, setFilterText] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value);
    setCurrentPage(1);
  };

  const renderProgressBar = (
    value: number,
    max: number,
    type: "cpu" | "mem" | "gpu",
  ) => {
    const percentage = Math.min(Math.round((value / max) * 100), 100);
    const totalBlocks = 10;
    const filledBlocks = Math.round((percentage / 100) * totalBlocks);

    const filledChar = "■";
    const emptyChar = "□";
    const barString =
      filledChar.repeat(filledBlocks) +
      emptyChar.repeat(totalBlocks - filledBlocks);

    let colorClass = "text-emerald-600 font-bold"; // safe load
    if (percentage > 50 && percentage <= 80)
      colorClass = "text-amber-600 font-bold"; // warning load
    if (percentage > 80) colorClass = "text-red-500 font-bold animate-pulse"; // danger load

    return (
      <div className="font-mono text-xs flex items-center gap-2">
        <span className={colorClass}>[{barString}]</span>
        <span className="text-[#306D29] font-medium min-w-[35px] text-right">
          {percentage}%
        </span>
      </div>
    );
  };

  // filter the rows first
  const filteredRows = Object.values(metrics).filter(
    (row) =>
      row.pod_name.toLowerCase().includes(filterText.toLowerCase()) ||
      row.namespace.toLowerCase().includes(filterText.toLowerCase()),
  );

  // calculate pagination metrics dynamically based on active filter results
  const totalRows = filteredRows.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage) || 1;

  // current page boundary index to deal with dynamic data deletions
  const sanitizedPage = Math.min(currentPage, totalPages);

  const indexOfLastRow = sanitizedPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;

  // slice the live items array to isolate the view window
  const currentMetricRows = filteredRows.slice(indexOfFirstRow, indexOfLastRow);

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

  return (
    <div className="p-6 bg-[#FBF5DD] min-h-screen text-slate-800">
      {/* global status  */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* total pods */}
        <div
          className="bg-white border border-[#E7E1B1] rounded-xl p-4 
            shadow-sm flex flex-col justify-between font-mono"
        >
          <span
            className="text-[10px] uppercase font-bold 
                tracking-wider text-slate-500"
          >
            Managed Pods
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-[#0D530E]">
              {totalPodsCount}
            </span>
            <span className="text-xs text-slate-400">Allocated Nodes</span>
          </div>
          <div
            className="text-[10px] text-emerald-700 font-bold mt-2 
                flex items-center gap-1"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Collecting from Stream
          </div>
        </div>

        {/* total CPU load */}
        <div
          className="bg-white border border-[#E7E1B1] rounded-xl p-4 
            shadow-sm flex flex-col justify-between font-mono"
        >
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

        {/* total RAM capacity */}
        <div
          className="bg-white border border-[#E7E1B1] rounded-xl p-4 
            shadow-sm flex flex-col justify-between font-mono"
        >
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

        {/* GPU matrix load */}
        <div
          className="bg-white border border-[#E7E1B1] rounded-xl p-4 
            shadow-sm flex flex-col justify-between font-mono"
        >
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

      <div
        className="bg-white border border-[#E7E1B1] rounded-xl mt-10 
            shadow-sm overflow-hidden flex flex-col"
      >
        {/* filter actions */}
        <div
          className="bg-[#E7E1B1]/20 px-5 py-3 border-b border-[#E7E1B1] 
            flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-xs font-bold text-[#0D530E] uppercase tracking-wider">
            Live Hardware Compute Monitor
          </div>
          <input
            type="text"
            placeholder="Filter nodes by pod/namespace..."
            value={filterText}
            onChange={handleFilterChange}
            className="px-3 py-1.5 text-xs bg-white text-slate-800 
                placeholder-slate-400 rounded-md border border-[#E7E1B1] 
                focus:outline-none focus:border-[#0D530E] w-64 shadow-inner"
          />
        </div>

        {/* compute data grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono">
            <thead>
              <tr
                className="bg-[#0D530E] text-[#FBF5DD] text-[11px] font-bold 
                    tracking-wider border-b border-[#306D29]/20 uppercase"
              >
                <th className="px-5 py-3">Namespace</th>
                <th className="px-5 py-3">Target Infrastructure Pod</th>
                <th className="px-5 py-3">CPU Load (Millicores)</th>
                <th className="px-5 py-3">RAM Allocation</th>
                <th className="px-5 py-3">NVIDIA GPU Compute</th>
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

                    {/* CPU column */}
                    <td className="px-5 py-3.5">
                      <div className="text-[11px] text-slate-500 mb-0.5">
                        {row.cpu_usage}m
                      </div>
                      {renderProgressBar(row.cpu_usage, 2000, "cpu")}
                    </td>

                    {/* memory Column */}
                    <td className="px-5 py-3.5">
                      <div className="text-[11px] text-slate-500 mb-0.5">
                        {row.mem_usage} MB
                      </div>
                      {renderProgressBar(row.mem_usage, 4096, "mem")}
                    </td>

                    {/* GPU core load column */}
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
                      <span
                        className="inline-flex items-center gap-1.5 px-2 
                            py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 
                            text-emerald-700 border border-emerald-200"
                      >
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
                    {filterText
                      ? "No telemetry records match your active query criteria..."
                      : "Waiting for telemetry broadcast stream vectors from cluster nodes..."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalRows > 0 && (
          <div
            className="bg-[#E7E1B1]/10 px-5 py-3.5 border-t border-[#E7E1B1] 
                flex items-center justify-between font-mono text-[11px] 
                text-slate-600 select-none"
          >
            <div>
              Showing{" "}
              <span className="font-bold text-[#0D530E]">
                {indexOfFirstRow + 1}
              </span>
              –
              <span className="font-bold text-[#0D530E]">
                {Math.min(indexOfLastRow, totalRows)}
              </span>{" "}
              of <span className="font-bold text-[#0D530E]">{totalRows}</span>{" "}
              active data frames
            </div>

            <div className="flex items-center gap-1.5">
              <div
                className="px-3 py-1 bg-[#E7E1B1]/30 border border-[#E7E1B1] 
                    rounded font-bold text-[#0D530E]"
              >
                PAGE {sanitizedPage} OF {totalPages}
              </div>
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={sanitizedPage === 1}
                className="px-2.5 py-1 rounded border border-[#E7E1B1] bg-white 
                    text-[#306D29] font-bold hover:bg-[#0D530E] hover:text-[#FBF5DD] 
                    transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
              >
                {"<"} PREV
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
                NEXT {">"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
