import React from "react";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";

interface LogEntry {
  ID?: string | number;
  namespace: string;
  pod_name?: string;
  message: string;
  level?: "Normal" | "Warning" | string;
}

interface OverviewTabContentProps {
  activeTab: string;
  status: string;
  nodesTotal: number;
  podsCount: number;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  handleManualRefresh: () => void;
  isRefreshing: boolean;
  targetNamespace: string;
  dbLogs: LogEntry[];
}

export default function OverviewTabContent({
  activeTab,
  status,
  nodesTotal,
  podsCount,
  setIsModalOpen,
  handleManualRefresh,
  isRefreshing,
  targetNamespace,
  dbLogs,
}: OverviewTabContentProps) {
  if (activeTab !== "overview") return null;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* metrics row */}
      <div className="grid grid-cols-3 gap-5">
        <div
          className="bg-[#E7E1B1]/40 border border-[#E7E1B1] p-5 
                  rounded-xl shadow-sm"
        >
          <div
            className="text-xs font-bold text-[#0D530E]/70 
                    uppercase tracking-wider"
          >
            Cluster State
          </div>
          <div
            className={`text-xl font-black mt-1 flex items-center gap-2 ${
              status === "Healthy" ? "text-[#5BB450]" : "text-[#B32626]"
            }`}
          >
            <span className="animate-pulse">
              <FiberManualRecordIcon fontSize="inherit" />
            </span>{" "}
            {status}
          </div>
        </div>

        <div className="bg-[#E7E1B1]/40 border border-[#E7E1B1] p-5 rounded-xl shadow-sm">
          <div className="text-xs font-bold text-[#0D530E]/70 uppercase tracking-wider">
            Active Nodes
          </div>
          <div className="text-2xl font-black mt-1 text-[#0D530E]">
            {nodesTotal}
            <span className="text-2xl font-black mt-1">
              {" "}
              / {nodesTotal || 1}
            </span>
            <span className="text-xs font-normal ml-3">Available</span>
          </div>
        </div>

        <div className="bg-[#E7E1B1]/40 border border-[#E7E1B1] p-5 rounded-xl shadow-sm">
          <div className="text-xs font-bold text-[#0D530E]/70 uppercase tracking-wider">
            Total Workloads
          </div>
          <div className="text-2xl font-black mt-1 text-[#306D29]">
            {podsCount}{" "}
            <span className="text-xs font-normal ml-2">Pods Running</span>
          </div>
        </div>
      </div>

      {/* action panel */}
      <div
        className="bg-[#E7E1B1]/30 border border-[#E7E1B1] p-5 
                rounded-xl shadow-sm flex items-center justify-between"
      >
        <div>
          <h3 className="text-sm font-bold text-[#0D530E]">
            Cluster Quick Actions
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Control orchestration happens instantly
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 text-xs font-bold bg-[#306D29] text-[#FBF5DD] 
                  hover:bg-[#0D530E] rounded-lg cursor-pointer transition-all 
                  active:scale-95 shadow"
          >
            + Deploy New Pod
          </button>

          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className={`px-4 py-2 text-xs md:min-w-[150px] text-center font-bold 
                    rounded-lg border transition-all active:scale-95 cursor-pointer ${
                      isRefreshing
                        ? "bg-[#FBF5DD]/20 border-[#E7E1B1]/60 text-[#0D530E]/70 cursor-not-allowed"
                        : "bg-[#FBF5DD] border-[#E7E1B1] text-[#0D530E] hover:bg-[#E7E1B1]/40"
                    }`}
          >
            {isRefreshing ? "Refreshing..." : "Refresh Metrics"}
          </button>
        </div>
      </div>

      {/* logs */}
      <div className="bg-[#E7E1B1]/30 border border-[#E7E1B1] rounded-xl p-5 shadow-sm">
        <div
          className="flex justify-between items-center border-b 
                  border-[#E7E1B1] pb-3 mb-4"
        >
          <h3 className="text-sm font-bold text-[#0D530E]">
            Monitored Event Resources
          </h3>
          <span
            className="text-xs font-mono bg-[#306D29]/10 text-[#0D530E] 
                    px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider"
          >
            Namespace: {targetNamespace || "all"}
          </span>
        </div>

        {dbLogs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center 
                    py-12 border border-dashed border-[#E7E1B1] rounded-xl 
                    text-slate-400 bg-[#FBF5DD]/50"
          >
            <p className="text-xs font-mono text-slate-500 font-semibold">
              No live workloads fetched yet.
            </p>
          </div>
        ) : (
          <div
            className="bg-[#0D530E] border border-[#306D29]/30 
                    rounded-xl p-4 font-mono text-xs max-h-60 overflow-y-auto 
                    space-y-1 text-[#FBF5DD] shadow-inner"
          >
            {dbLogs
              .slice()
              .reverse()
              .map((log, index) => (
                <div
                  key={log.ID || index}
                  className={`truncate py-0.5 border-b border-[#306D29]/10 last:border-0 ${
                    log.level === "Warning"
                      ? "text-amber-300 font-semibold"
                      : "text-[#FBF5DD]"
                  }`}
                >
                  <span className="text-[#E7E1B1]/70">[{log.namespace}]</span>{" "}
                  <span className="text-[#E7E1B1] font-bold">
                    {log.pod_name || "cluster"}:
                  </span>{" "}
                  {log.message}
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
