import React, { useState, useEffect } from "react";
import SearchIcon from "@mui/icons-material/Search";

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

// TODO: add asc/desc - sorting to columns
export default function AuditLogView({
  goApiUrl,
  activeNamespace,
}: AuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [namespaceFilter] = useState<string>(activeNamespace || "all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [rowLimit, setRowLimit] = useState<number>(50);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);

  const fetchAuditHistory = async (pageToFetch = currentPage) => {
    setLoading(true);
    try {
      const nsParam = namespaceFilter === "all" ? "" : namespaceFilter;
      const lvlParam = severityFilter === "all" ? "" : severityFilter;

      const url = `${goApiUrl}/api/logs?namespace=${nsParam}&level=${lvlParam}&search=${encodeURIComponent(searchQuery)}&limit=${rowLimit}&page=${pageToFetch}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Could not fetch log matrix");
      const data = await res.json();

      setLogs(data.logs || []);
      setTotalItems(data.total_items || 0);
      setCurrentPage(data.current_page || 1);
    } catch (err) {
      console.error("Audit history loading failure:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchAuditHistory(1);
  }, [namespaceFilter, severityFilter, rowLimit]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    fetchAuditHistory(newPage);
  };

  const totalPages = Math.ceil(totalItems / rowLimit) || 1;

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
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-[#E7E1B1]/10 border border-[#E7E1B1]/60 p-3 rounded-xl shadow-2xs w-full">
          <div className="relative flex-1 max-w-md flex items-center">
            <span className="absolute left-3 text-slate-400 flex items-center pointer-events-none">
              <SearchIcon fontSize="small" />
            </span>
            <input
              type="text"
              placeholder="Search message or pod..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchAuditHistory()}
              className="w-full pl-9 pr-4 py-1.5 bg-white border border-[#E7E1B1] rounded-lg text-xs font-mono text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#306D29] focus:border-[#306D29] transition-all shadow-2xs"
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
            className="px-2.5 py-1.5 text-xs bg-white/80 border 
                border-[#E7E1B1] rounded-lg text-[#0D530E] focus:outline-none 
                focus:border-[#306D29] cursor-pointer font-medium shadow-sm"
          >
            <option value={10}>10 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>

          <button
            onClick={() => fetchAuditHistory(currentPage)}
            disabled={loading}
            className="px-3 py-1.5 bg-[#306D29] hover:bg-[#0D530E] 
                active:bg-[#0D530E]/90 disabled:opacity-40 text-[#FBF5DD] text-xs 
                min-w-[150px] font-semibold rounded-lg transition-all shadow-sm cursor-pointer"
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
                const isSystemCore =
                  log.pod_name.includes("kubedash-") ||
                  log.namespace.includes("kube-system");
                return (
                  <tr
                    key={log.id}
                    className={`transition-colors ${
                      isSystemCore
                        ? "bg-amber-500/10 hover:bg-amber-500/15 border-l-4 border-l-amber-500"
                        : "bg-[#FBF5DD]/10 hover:bg-[#E7E1B1]/20 border-l-4 border-l-transparent"
                    }`}
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
                      title={log.pod_name}
                    >
                      {log.pod_name || "cluster-level"}
                    </td>
                    <td
                      className="px-4 py-3 text-[#0D530E]/80 pr-6 leading-relaxed 
                        select-text font-sans break-words font-medium"
                    >
                      {log.message}
                    </td>
                    <td
                      className="px-4 py-3 text-[#306D29]/70 font-mono 
                        text-right whitespace-nowrap"
                    >
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
      {/* pagination */}
      <div
        className="flex items-center justify-between border-t-0 border 
            border-[#E7E1B1] bg-[#E7E1B1]/20 px-4 py-3 rounded-b-lg text-xs font-medium"
      >
        <div className="text-[#306D29]">
          Showing{" "}
          <span className="font-bold text-[#0D530E]">{logs.length}</span> of{" "}
          <span className="font-bold text-[#0D530E]">{totalItems}</span> audit
          events
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[#306D29]">
            Page <span className="font-bold text-[#0D530E]">{currentPage}</span>{" "}
            of <span className="font-bold text-[#0D530E]">{totalPages}</span>
          </span>

          <div className="flex gap-2">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1 bg-white border border-[#E7E1B1] 
                text-[#0D530E] hover:bg-[#FBF5DD] disabled:opacity-40 
                rounded-md transition-all font-semibold shadow-sm 
                cursor-pointer disabled:cursor-not-allowed"
            >
              {"<"} Prev
            </button>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages || loading}
              className="px-3 py-1 bg-white border border-[#E7E1B1] 
                text-[#0D530E] hover:bg-[#FBF5DD] disabled:opacity-40 
                rounded-md transition-all font-semibold shadow-sm 
                cursor-pointer disabled:cursor-not-allowed"
            >
              Next {">"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
