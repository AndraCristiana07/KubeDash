import React, { useState, useEffect } from "react";

interface AuditLogEntry {
  id: number;
  pod_name: string;
  namespace: string;
  message: string;
  level: string;
  created_at: string;
}

interface AuditLogViewProps {
  goApiUrl: string;
  activeNamespace: string;
}

export default function AuditLogView({
  goApiUrl,
  activeNamespace,
}: AuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [namespaceFilter, setNamespaceFilter] = useState<string>(
    activeNamespace || "all",
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [rowLimit, setRowLimit] = useState<number>(50);

  const fetchAuditHistory = async () => {
    setLoading(true);
    try {
      const nsParam = namespaceFilter === "all" ? "" : namespaceFilter;
      const lvlParam = severityFilter === "all" ? "" : severityFilter;

      const url = `${goApiUrl}/api/logs?namespace=${nsParam}&level=${lvlParam}&search=${encodeURIComponent(searchQuery)}&limit=${rowLimit}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Could not fetch log matrix");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Audit history loading failure:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditHistory();
  }, [namespaceFilter, severityFilter, rowLimit]);

  return (
    <div
      className="w-full bg-[#FBF5DD] border border-[#E7E1B1] rounded-xl 
        p-6 shadow-sm text-[#0D530E]"
    >
      {/* header toolbar */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 
            border-b border-[#E7E1B1] pb-4 mb-6"
      >
        <div>
          <h2
            className="text-lg font-bold tracking-tight 
                text-[#0D530E] flex items-center gap-2"
          >
            Cluster Audit Log History
          </h2>
          <p className="text-xs text-[#306D29] mt-0.5">
            Historical timeline of persistent core engine lifecycle actions
          </p>
        </div>

        {/* filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* search input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search message or pod..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchAuditHistory()}
              className="px-3 py-1.5 text-xs bg-white/80 border 
                border-[#E7E1B1] rounded-lg text-[#0D530E] 
                placeholder-[#306D29]/50 focus:outline-none focus:border-[#306D29] 
                w-52 font-medium shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setTimeout(fetchAuditHistory, 10);
                }}
                className="absolute right-2.5 top-2 text-[#306D29] hover:text-[#0D530E] text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* severity dropdown */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white/80 border 
                border-[#E7E1B1] rounded-lg text-[#0D530E] focus:outline-none 
                focus:border-[#306D29] cursor-pointer font-medium shadow-sm"
          >
            <option value="all">All Severities</option>
            <option value="Warning">Warnings Only</option>
            <option value="Normal">Info Only</option>
          </select>

          {/* limit dropdown */}
          <select
            value={rowLimit}
            onChange={(e) => setRowLimit(Number(e.target.value))}
            className="px-2.5 py-1.5 text-xs bg-white/80 border border-[#E7E1B1] 
                rounded-lg text-[#0D530E] focus:outline-none focus:border-[#306D29] 
                cursor-pointer font-medium shadow-sm"
          >
            <option value={25}>Show 25</option>
            <option value={50}>Show 50</option>
            <option value={100}>Show 100</option>
          </select>

          <button
            onClick={fetchAuditHistory}
            disabled={loading}
            className="px-3 py-1.5 bg-[#306D29] hover:bg-[#0D530E] 
                active:bg-[#0D530E]/90 disabled:opacity-40 text-[#FBF5DD] 
                text-xs min-w-[150px] font-semibold rounded-lg transition-all 
                shadow-sm cursor-pointer"
          >
            {loading ? "Syncing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* table */}
      <div
        className="overflow-x-auto rounded-lg border border-[#E7E1B1] 
            max-h-[520px] overflow-y-auto bg-white/50 backdrop-blur-sm"
      >
        <table className="w-full text-left border-collapse table-auto">
          <thead>
            <tr
              className="bg-[#E7E1B1]/40 border-b border-[#E7E1B1] 
                text-[#0D530E] font-mono text-[11px] uppercase tracking-wider 
                sticky top-0 z-10 backdrop-blur-md"
            >
              <th className="px-4 py-3 w-24">Severity</th>
              <th className="px-4 py-3 w-40">Namespace</th>
              <th className="px-4 py-3 w-56">Resource / Pod Target</th>
              <th className="px-4 py-3">Event Summary Message Context</th>
              <th className="px-4 py-3 w-48 text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E1B1]/30 text-xs text-[#0D530E]/90">
            {logs.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-12 text-[#306D29] font-medium"
                >
                  {loading
                    ? "Streaming query metrics from central database engine..."
                    : "No historical event records located matching filter parameters."}
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isWarn = log.level === "Warning";
                return (
                  <tr
                    key={log.id}
                    className="hover:bg-[#E7E1B1]/20 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold 
                            font-mono tracking-wide uppercase ${
                              isWarn
                                ? "bg-red-100 text-red-800 border border-red-200"
                                : "bg-[#306D29]/10 text-[#306D29] border border-[#306D29]/20"
                            }`}
                      >
                        {isWarn ? "Warn" : "Info"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#306D29] font-mono max-w-[140px] truncate">
                      {log.namespace}
                    </td>
                    <td
                      className="px-4 py-3 text-[#0D530E] font-semibold 
                        font-mono max-w-[200px] truncate"
                    >
                      {log.pod_name || "cluster-level"}
                    </td>
                    <td
                      className="px-4 py-3 text-[#0D530E]/80 pr-6 leading-relaxed 
                        select-text font-sans break-words font-medium"
                    >
                      {log.message}
                    </td>
                    <td className="px-4 py-3 text-[#306D29]/70 font-mono text-right whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
