import React from "react";
import { SortKey } from "./ClusterMetricsDashboard";

export interface HistoryBucket {
  cpu: number[];
  mem: number[];
  gpu: number[];
}

export interface PodMetricRow {
  pod_name: string;
  namespace: string;
  cpu_usage: number;
  mem_usage: number;
  gpu_usage: number;
}

interface PodHistoricalTrendTableProps {
  activeSubTab: "usage" | "trends";
  currentMetricRows: PodMetricRow[];
  historicalTrends: Record<string, HistoryBucket>;
  handleSortRequest: (field: SortKey) => void;
  renderSortIndicator: (field: SortKey) => React.ReactNode;
  renderLibraryTrendLine: (
    data: number[],
    strokeColor: string,
  ) => React.ReactNode;
}

export default function PodHistoricalTrendTable({
  activeSubTab,
  currentMetricRows,
  historicalTrends,
  handleSortRequest,
  renderSortIndicator,
  renderLibraryTrendLine,
}: PodHistoricalTrendTableProps) {
  if (activeSubTab !== "trends") return null;

  return (
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
            CPU Usage Timeline (15 Ticks) {renderSortIndicator("cpu_usage")}
          </th>
          <th
            onClick={() => handleSortRequest("mem_usage")}
            className="px-5 py-3 cursor-pointer hover:bg-[#6D4929] transition-colors"
          >
            RAM Capacity Timeline (15 Ticks) {renderSortIndicator("mem_usage")}
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

            const isSystemCore =
              row.pod_name.includes("kubedash-") ||
              row.namespace.includes("kube-system");
            return (
              <tr
                key={targetKey}
                className={`transition-colors ${
                  isSystemCore
                    ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-4 border-l-amber-500"
                    : "bg-[#FBF5DD]/10 hover:bg-[#FBF5DD]/30 border-l-4 border-l-transparent"
                }`}
              >
                <td className="px-5 py-4">
                  <div className="font-bold text-slate-700">{row.pod_name}</div>
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
                  {row.gpu_usage > 0 || podHistory.gpu.some((v) => v > 0) ? (
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
  );
}
