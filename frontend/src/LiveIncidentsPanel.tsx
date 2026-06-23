import React, { useState, useEffect } from "react";

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

  const fetchStreamLedger = async () => {
    try {
      const res = await fetch(`${goApiUrl}/api/cluster/incidents`);
      if (!res.ok) throw new Error("Faulty response");
      const body = await res.json();

      // filter clientside based on dashboard's global active namespace select frame
      const data: IncidentItem[] = body.incidents || [];
      if (activeNamespace && activeNamespace !== "all") {
        setIncidents(data.filter((item) => item.namespace === activeNamespace));
      } else {
        setIncidents(data);
      }
    } catch (err) {
      console.error("Stream sync fault:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStreamLedger();
    const tickerId = setInterval(fetchStreamLedger, 5000); // 5s update sequence
    return () => clearInterval(tickerId);
  }, [activeNamespace]);

  return (
    <div className="mt-4 space-y-4">
      <div className="bg-red-500/10 border border-red-200 rounded-lg p-3 text-xs font-mono text-red-800 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
        <strong>Live Stream:</strong> Displaying up to 50 active telemetry
        warning vectors intercepted directly out of Redis memory stores.
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
    </div>
  );
}
