import React, { useState, useEffect } from "react";
import SearchIcon from "@mui/icons-material/Search";

interface IncidentItem {
  namespace: string;
  pod_name: string;
  reason: string;
  message: string;
  type: string;
  timestamp: number;
}

export default function LiveIncidentStreamPanel({
  goApiUrl,
  activeNamespace,
}: {
  goApiUrl: string;
  activeNamespace: string;
}) {
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [currentCursor, setCurrentCursor] = useState<string>("+");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchStream = async (cursorToUse = currentCursor) => {
    setLoading(true);
    try {
      const nsParam = activeNamespace === "all" ? "" : activeNamespace;
      const url = `${goApiUrl}/api/cluster/incidents?start_id=${encodeURIComponent(cursorToUse)}&namespace=${nsParam}&search=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Faulty response");
      const body = await res.json();

      const data: IncidentItem[] = body.incidents || [];
      setIncidents(data);

      if (data.length === 50 && body.next_cursor) {
        setNextCursor(body.next_cursor);
      } else {
        setNextCursor(null);
      }
    } catch (err) {
      console.error("Stream sync fault:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // reset back to top page if the user changes the namespace
    setCurrentCursor("+");
    setCursorHistory([]);
    fetchStream("+");
  }, [activeNamespace]);

  const handleNextPage = () => {
    if (!nextCursor) return;
    setCursorHistory((prev) => [...prev, currentCursor]); // save current position
    setCurrentCursor(nextCursor);
    fetchStream(nextCursor);
  };

  const handlePrevPage = () => {
    if (cursorHistory.length === 0) return;
    const previousCursors = [...cursorHistory];
    const targetCursor = previousCursors.pop() || "+";

    setCursorHistory(previousCursors);
    setCurrentCursor(targetCursor);
    fetchStream(targetCursor);
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-red-500/10 border border-red-200 rounded-lg p-3 text-xs font-mono text-red-800 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
        <strong>Live Stream:</strong> Displaying 50 active telemetry warnings
        intercepted directly out of Redis memory stores.
      </div>
      {/* filters */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-[#E7E1B1]/10 border border-[#E7E1B1]/60 p-3 rounded-xl shadow-2xs w-full mb-4">
        <div className="relative flex-1 max-w-md flex items-center">
          <span className="absolute left-3 text-slate-400 flex items-center pointer-events-none">
            <SearchIcon fontSize="small" />
          </span>
          <input
            type="text"
            placeholder="Search message or pod..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchStream()}
            className="w-full pl-9 pr-4 py-1.5 bg-white border border-[#E7E1B1] rounded-lg text-xs font-mono text-slate-700 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-[#306D29] focus:border-[#306D29] transition-all shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setTimeout(fetchStream, 10);
              }}
              className="absolute right-2.5 top-2 text-[#306D29] hover:text-[#0D530E] text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-[#E7E1B1] max-h-[520px] bg-white">
        <table className="w-full text-left border-collapse table-auto text-xs">
          <thead>
            <tr className="bg-red-950/5 border-b border-[#E7E1B1] text-[#0D530E] font-mono text-[11px] uppercase tracking-wider sticky top-0 bg-white">
              <th className="px-4 py-3 w-32">Failure Event</th>
              <th className="px-4 py-3 w-40">Namespace</th>
              <th className="px-4 py-3 w-56">Resource Target</th>
              <th className="px-4 py-3">Incident Log Context Message</th>
              <th className="px-4 py-3 w-32 text-right">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
            {incidents.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="text-center py-12 text-slate-400 font-mono italic"
                >
                  {loading
                    ? "Hydrating stream records..."
                    : "No warnings detected inside this namespace view frame."}
                </td>
              </tr>
            ) : (
              incidents.map((item, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-red-500/5 transition-colors bg-white"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold font-mono tracking-wide bg-red-100 text-red-800 border border-red-200">
                      {item.reason}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 font-mono">
                    {item.namespace}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900 font-mono">
                    {item.pod_name || "cluster"}
                  </td>
                  <td className="px-4 py-3 text-slate-600 pr-6 break-words leading-relaxed">
                    {item.message}
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono text-right whitespace-nowrap">
                    {new Date(item.timestamp * 1000).toLocaleTimeString([], {
                      hour12: false,
                    })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border border-[#E7E1B1] bg-[#E7E1B1]/20 px-4 py-3 rounded-b-lg text-xs font-medium">
        <div className="text-slate-500 font-mono">
          {cursorHistory.length === 0
            ? "Showing latest snapshot timeline"
            : `Viewing historical log layer: ${cursorHistory.length + 1}`}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePrevPage}
            disabled={cursorHistory.length === 0 || loading}
            className="px-3 py-1 bg-white border border-[#E7E1B1] text-[#0D530E] hover:bg-[#FBF5DD] disabled:opacity-40 rounded-md transition-all font-semibold shadow-sm cursor-pointer disabled:cursor-not-allowed font-mono"
          >
            {"<"} Prev
          </button>
          <button
            onClick={handleNextPage}
            disabled={!nextCursor || loading}
            className="px-3 py-1 bg-white border border-[#E7E1B1] text-[#0D530E] hover:bg-[#FBF5DD] disabled:opacity-40 rounded-md transition-all font-semibold shadow-sm cursor-pointer disabled:cursor-not-allowed font-mono"
          >
            Next {">"}
          </button>
        </div>
      </div>
    </div>
  );
}
