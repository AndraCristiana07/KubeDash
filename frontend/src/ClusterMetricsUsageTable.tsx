import React from "react";
import { SortKey } from "./ClusterMetricsDashboard";

export interface MetricRow {
  namespace: string;
  pod_name: string;
  cpu_usage: number;
  mem_usage: number;
  gpu_usage: number;
}

interface PodUsageTableProps {
  activeSubTab: string;
  currentMetricRows: MetricRow[];
  handleSortRequest: (field: SortKey) => void;
  renderSortIndicator: (field: SortKey) => React.ReactNode;
  renderProgressBar: (
    current: number,
    max: number,
    type: "cpu" | "mem" | "gpu",
  ) => React.ReactNode;
}

export default function PodUsageTable({
  activeSubTab,
  currentMetricRows,
  handleSortRequest,
  renderSortIndicator,
  renderProgressBar,
}: PodUsageTableProps) {
  if (activeSubTab !== "usage") return null;

  return (
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
          currentMetricRows.map((row) => {
            const isSystemCore =
              row.pod_name.includes("kubedash-") ||
              row.namespace.includes("kube-system");
            return (
              <tr
                key={`${row.namespace}/${row.pod_name}`}
                className={`transition-colors ${
                  isSystemCore
                    ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-4 border-l-amber-500"
                    : "hover:bg-[#FBF5DD]/30"
                }`}
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
            );
          })
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
  );
}
