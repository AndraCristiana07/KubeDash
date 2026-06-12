import React from "react";
import SpeedIcon from "@mui/icons-material/Speed";
import MemoryIcon from "@mui/icons-material/Memory";

interface MetricEntry {
  pod_name: string;
  namespace: string;
  cpu_usage: number; // m
  mem_usage: number; // MB
  gpu_usage?: number;
  last_updated: number;
}

interface ResourceHogsPanelProps {
  metrics: { [key: string]: MetricEntry };
}

export default function ResourceHogsPanel({ metrics }: ResourceHogsPanelProps) {
  // convert dictionary object values into a flat array
  const metricsList = Object.values(metrics);

  // top 3 CPU consumers (sorted descending)
  const topCpu = [...metricsList]
    .sort((a, b) => b.cpu_usage - a.cpu_usage)
    .slice(0, 3);

  // top 3 Memory consumers (sorted descending)
  const topMem = [...metricsList]
    .sort((a, b) => b.mem_usage - a.mem_usage)
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 font-mono">
      {/* cpu consumers */}
      <div className="bg-[#FBF5DD] border border-[#E7E1B1] rounded-xl p-4 shadow-sm flex flex-col justify-between animate-enter">
        <div className="flex items-center gap-2 border-b border-[#E7E1B1] pb-2 mb-3">
          <SpeedIcon className="text-red-600 text-sm animate-pulse" />
          <h4 className="text-xs font-black uppercase tracking-wider text-[#0D530E]">
            CPU Resource Dominators (Top 3)
          </h4>
        </div>

        <div className="space-y-2 flex-1">
          {topCpu.length === 0 ? (
            <div className="text-[11px] text-slate-400 italic text-center py-4 font-sans">
              Awaiting payload streams from notification socket channels...
            </div>
          ) : (
            topCpu.map((pod, index) => (
              <div
                key={`cpu-${pod.namespace}-${pod.pod_name}`}
                className="flex items-center justify-between text-xs bg-white/50 border border-[#E7E1B1]/40 rounded-lg p-2 hover:bg-white/80 transition-all"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">
                      #{index + 1}
                    </span>
                    <span className="font-bold text-[#0D530E] truncate block text-[11px]">
                      {pod.pod_name}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 block font-sans truncate">
                    ns: {pod.namespace}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-black text-red-600 font-mono text-[11px] bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md shadow-2xs">
                    {pod.cpu_usage}m
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* memory consumers */}
      <div className="bg-[#FBF5DD] border border-[#E7E1B1] rounded-xl p-4 shadow-sm flex flex-col justify-between animate-enter">
        <div className="flex items-center gap-2 border-b border-[#E7E1B1] pb-2 mb-3">
          <MemoryIcon className="text-amber-600 text-sm animate-pulse" />
          <h4 className="text-xs font-black uppercase tracking-wider text-[#0D530E]">
            Memory Allocation Hogs (Top 3)
          </h4>
        </div>

        <div className="space-y-2 flex-1">
          {topMem.length === 0 ? (
            <div className="text-[11px] text-slate-400 italic text-center py-4 font-sans">
              Awaiting payload streams from notification socket channels...
            </div>
          ) : (
            topMem.map((pod, index) => (
              <div
                key={`mem-${pod.namespace}-${pod.pod_name}`}
                className="flex items-center justify-between text-xs bg-white/50 border border-[#E7E1B1]/40 rounded-lg p-2 hover:bg-white/80 transition-all"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-400 font-bold">
                      #{index + 1}
                    </span>
                    <span className="font-bold text-[#0D530E] truncate block text-[11px]">
                      {pod.pod_name}
                    </span>
                  </div>
                  <span className="text-[9px] text-slate-400 block font-sans truncate">
                    ns: {pod.namespace}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-black text-amber-700 font-mono text-[11px] bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md shadow-2xs">
                    {pod.mem_usage} MB
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
