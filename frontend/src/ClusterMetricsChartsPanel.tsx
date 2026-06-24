import React, { useState, useEffect } from "react";
import { LineChart } from "@mui/x-charts/LineChart";
import TimelineIcon from "@mui/icons-material/Timeline";

export interface HistoricalSnapshot {
  timestamp: number;
  cpu_usage: number; // in millicores
  mem_usage: number; // in MiB
}

export default function ClusterTimelineChartsPanel() {
  const [historyData, setHistoryData] = useState<HistoricalSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchClusterHistory() {
      try {
        const response = await fetch(
          "http://localhost:8080/api/cluster/metrics/history",
        );
        if (!response.ok) {
          throw new Error(`HTTP network error: ${response.status}`);
        }
        const body = await response.json();
        setHistoryData(body.history || []);
      } catch (err: any) {
        setError(err.message || "Failed to load metrics sequence");
      } finally {
        setLoading(false);
      }
    }

    fetchClusterHistory();
    // refresh every 10 seconds to align with Redis worker tick
    const scheduleId = setInterval(fetchClusterHistory, 10000);
    return () => clearInterval(scheduleId);
  }, []);

  if (loading && historyData.length === 0) {
    return (
      <div className="p-12 text-center font-mono text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
        Fetching historical matrix indexes from Redis cache vaults...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center font-mono text-xs text-red-500 bg-red-50 m-4 border border-red-200 rounded-lg">
        Error Aggregating Data Pipeline: {error}
      </div>
    );
  }

  if (historyData.length < 2) {
    return (
      <div className="p-12 text-center font-mono text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
        <TimelineIcon
          className="text-slate-300 animate-pulse"
          fontSize="large"
        />
        Dataset warm-up phase. Gathering historical metric data points from
        Redis...
      </div>
    );
  }

  // map data out into clear arrays for charts
  const xAxisLabels = historyData.map((item) => {
    const timeFrame = new Date(item.timestamp * 1000);
    return timeFrame.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  });

  const cpuSeries = historyData.map((item) => item.cpu_usage);
  const memSeries = historyData.map((item) => item.mem_usage);

  return (
    <div className="p-6 grid grid-cols-1 xl:grid-cols-2 gap-6 bg-slate-50">
      {/* CPU usage timeline panel */}
      <div className="bg-white p-4 border border-[#E7E1B1] rounded-xl shadow-xs flex flex-col">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#0D530E] border-b border-slate-100 pb-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Aggregate Cluster CPU Allocation (Millicores)
        </div>
        <div className="w-full h-[280px] flex items-center justify-center">
          <LineChart
            xAxis={[{ data: xAxisLabels, scaleType: "point" }]}
            series={[
              {
                data: cpuSeries,
                label: "Total CPU (m)",
                color: "#10b981",
                area: true,
              },
            ]}
            height={280}
            margin={{ top: 20, bottom: 40, left: 50, right: 20 }}
          />
        </div>
      </div>

      {/* Memory usage timeline panel */}
      <div className="bg-white p-4 border border-[#E7E1B1] rounded-xl shadow-xs flex flex-col">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-blue-800 border-b border-slate-100 pb-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Aggregate Cluster RAM Footprint (MiB)
        </div>
        <div className="w-full h-[280px] flex items-center justify-center">
          <LineChart
            xAxis={[{ data: xAxisLabels, scaleType: "point" }]}
            series={[
              {
                data: memSeries,
                label: "Memory (MiB)",
                color: "#2563eb",
                area: true,
              },
            ]}
            height={280}
            margin={{ top: 20, bottom: 40, left: 50, right: 20 }}
          />
        </div>
      </div>
    </div>
  );
}
