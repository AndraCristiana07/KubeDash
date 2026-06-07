import React, { useEffect, useState, useRef } from "react";

interface LogStreamModalProps {
  podName: string;
  namespace: string;
  onClose: () => void;
}

const WB =
  (typeof process !== "undefined" && process.env?.REACT_WEBSOCKET) ||
  "ws://localhost:8080";

export default function LogStreamModal({
  podName,
  namespace,
  onClose,
}: LogStreamModalProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [filterText, setFilterText] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wsUrl = `${WB}/api/cluster/logs/stream?namespace=${namespace}&name=${podName}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      // split incoming chunks by newline
      const newLines = event.data
        .split(/\r?\n/)
        .filter((line: string) => line.trim() !== "");
      setLogs((prevLogs) => [...prevLogs, ...newLines]);
    };

    ws.onclose = () => {
      setLogs((prevLogs) => [...prevLogs, "[Stream disconnected safely]"]);
    };

    return () => {
      ws.close();
    };
  }, [podName, namespace]);

  // auto scroll on new lines
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const filteredLogs = logs.filter((line) =>
    line.toLowerCase().includes(filterText.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center 
        justify-center bg-black/40 backdrop-blur-sm p-8"
    >
      <div
        className="bg-[#FBF5DD] border border-[#E7E1B1] w-full max-w-5xl 
            h-[600px] rounded-xl flex flex-col overflow-hidden shadow-2xl"
      >
        {/* header */}
        <div
          className="bg-[#0D530E] text-[#FBF5DD] px-5 py-3.5 flex flex-col 
            sm:flex-row sm:items-center justify-between gap-3 
            border-b border-[#306D29]/20"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Live Container Logs</span>
            <span className="font-mono text-xs opacity-60 bg-[#306D29] px-2 py-0.5 rounded">
              {namespace}/{podName}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Filter logs..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="px-3 py-1 text-xs bg-[#306D29] text-white 
                rounded-md border border-[#E7E1B1]/20 placeholder-white/50 
                focus:outline-none focus:border-[#E7E1B1]"
            />
            <button
              onClick={onClose}
              className="text-[#E7E1B1] hover:text-white text-xs font-bold 
                bg-[#306D29] px-3 py-1 rounded-lg transition-all 
                cursor-pointer whitespace-nowrap"
            >
              Close Stream
            </button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 bg-zinc-950 p-4 font-mono text-xs 
            overflow-y-auto selection:bg-emerald-800 selection:text-white"
        >
          <div className="flex flex-col gap-1 text-left">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((line, index) => {
                const isError =
                  line.toLowerCase().includes("error") ||
                  line.toLowerCase().includes("fail");
                const isWarn = line.toLowerCase().includes("warn");

                return (
                  <div
                    key={index}
                    className={`py-0.5 px-1 rounded transition-colors duration-150 ${
                      isError
                        ? "text-red-400 bg-red-950/20"
                        : isWarn
                          ? "text-amber-400 bg-amber-950/20"
                          : "text-emerald-400 hover:bg-zinc-900"
                    }`}
                  >
                    {line}
                  </div>
                );
              })
            ) : (
              <div className="text-zinc-500 italic">
                Waiting for container logs stream...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
