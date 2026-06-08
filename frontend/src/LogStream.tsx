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

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    const wsUrl = `${WB}/api/cluster/logs/stream?namespace=${namespace}&name=${podName}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      // logs paused
      if (isPausedRef.current) return;

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

  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // track manial scroll
  const handleScrollDetect = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;

    // autoScroll off
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  };

  const filteredLogs = logs.filter((line) =>
    line.toLowerCase().includes(filterText.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center 
        justify-center bg-[#0D530E]/30 backdrop-blur-sm p-8"
    >
      <div
        className="bg-[#FBF5DD] border border-[#E7E1B1] w-full max-w-5xl 
            h-[600px] rounded-xl flex flex-col overflow-hidden shadow-2xl animate-enter"
      >
        {/* header toolbar */}
        <div
          className="bg-[#0D530E] text-[#FBF5DD] px-5 py-3.5 flex flex-col 
            sm:flex-row sm:items-center justify-between gap-3 
            border-b border-[#306D29]/20 shadow-sm"
        >
          <div className="flex items-center gap-2.5 min-w-0 sm:flex-initial">
            <span className="font-bold text-sm tracking-tight whitespace-nowrap">
              Live Container Logs Terminal
            </span>

            <div className="relative group inline-flex items-center">
              <span
                className="font-mono text-[11px] font-bold text-[#E7E1B1] 
                  bg-[#306D29] px-2 py-0.5 rounded border border-[#E7E1B1]/10
                  w-[140px] md:w-[220px] truncate cursor-help select-all"
              >
                {namespace}/{podName}
              </span>

              <div
                className="absolute top-full left-0 mt-1.5 hidden group-hover:flex flex-col 
                  bg-[#0D530E] text-[#FBF5DD] border border-[#E7E1B1]/20 px-3 py-1.5 
                  rounded-lg text-xs font-mono whitespace-nowrap shadow-xl z-50 
                  pointer-events-none animate-enter"
              >
                <div
                  className="absolute -top-1 left-4 w-2 h-2 bg-[#0D530E] 
                    border-t border-l border-[#E7E1B1]/20 rotate-45"
                />

                <div
                  className="text-[#E7E1B1]/60 text-[10px] font-sans 
                    font-bold uppercase tracking-wider mb-0.5"
                >
                  Full Resource Track:
                </div>
                <div className="font-bold tracking-wide select-all selection:bg-[#306D29]">
                  {namespace}/{podName}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* search*/}
            <div className="relative">
              <input
                type="text"
                placeholder="Filter output logs..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="px-3 py-1 text-xs bg-[#306D29] text-[#FBF5DD] 
                  placeholder-[#FBF5DD]/40 rounded-md border border-[#E7E1B1]/20 
                  focus:outline-none focus:border-[#E7E1B1] w-48 font-medium shadow-inner"
              />
              {filterText && (
                <button
                  onClick={() => setFilterText("")}
                  className="absolute right-2 top-1 text-[#E7E1B1]/60 
                    hover:text-[#FBF5DD] text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>

            {/* pause toggle */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className={`text-xs font-bold px-3 py-1 rounded-md border min-w-[150px]
                transition-all cursor-pointer shadow-sm flex items-center gap-1.5 ${
                  isPaused
                    ? "bg-amber-600 text-white border-amber-500 hover:bg-amber-700"
                    : "bg-[#306D29] text-[#E7E1B1] border-[#E7E1B1]/10 hover:text-white hover:bg-[#306D29]/80"
                }`}
            >
              {isPaused ? "Resume Stream" : "Pause Stream"}
            </button>

            {/* clear logs */}
            <button
              onClick={() => setLogs([])}
              className="text-[#E7E1B1] hover:text-white text-xs font-bold 
                bg-[#306D29] border border-[#E7E1B1]/10 px-3 py-1 rounded-md 
                transition-all cursor-pointer shadow-sm"
            >
              Clear Output
            </button>
            <button
              onClick={onClose}
              className="text-[#0D530E] hover:bg-[#FBF5DD] text-xs 
                font-bold bg-[#E7E1B1] px-3 py-1 rounded-md transition-all 
                cursor-pointer shadow-sm"
            >
              x
            </button>
          </div>
        </div>

        {/* console stats */}
        <div
          className="bg-[#E7E1B1]/30 border-b border-[#E7E1B1] px-5 py-1.5 
            flex items-center justify-between text-[11px] font-semibold text-[#306D29]"
        >
          <div className="flex items-center gap-4">
            <span>
              Buffer Limit:{" "}
              <span className="text-[#0D530E]">{logs.length} loaded</span>
            </span>
            {filterText && (
              <span>
                Filtered Matches:{" "}
                <span className="text-emerald-700 font-bold">
                  {filteredLogs.length} matching
                </span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 font-mono">
            <span
              className={`w-2 h-2 rounded-full ${isPaused ? "bg-amber-500 animate-pulse" : "bg-emerald-600 animate-ping"}`}
            />
            {isPaused ? "CONSOLE BUFFER FROZEN" : "STREAMING ACTIVE"}
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={handleScrollDetect}
          className="flex-1 bg-[#091C0A] p-4 font-mono text-xs overflow-y-auto 
            selection:bg-[#306D29] selection:text-white scroll-smooth"
        >
          <div className="flex flex-col gap-0.5 text-left leading-relaxed">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((line, index) => {
                const isError =
                  line.toLowerCase().includes("error") ||
                  line.toLowerCase().includes("fail") ||
                  line.toLowerCase().includes("exception");
                const isWarn = line.toLowerCase().includes("warn");

                return (
                  <div
                    key={index}
                    className={`py-0.5 px-1.5 rounded transition-colors 
                      duration-100 font-mono whitespace-pre-wrap break-all ${
                        isError
                          ? "text-red-300 bg-red-950/40 font-semibold border-l-2 border-red-500 pl-1"
                          : isWarn
                            ? "text-amber-200 bg-amber-950/30 border-l-2 border-amber-500 pl-1"
                            : "text-[#C2E7BF] hover:bg-[#123114]/60"
                      }`}
                  >
                    {line}
                  </div>
                );
              })
            ) : (
              // TODO: text is too dark or too slim to be seen on black
              <div className="text-[#306D29]/60 italic py-8 text-center font-bold">
                {logs.length === 0
                  ? "Waiting for incoming live infrastructure stream events from core client engine..."
                  : "No logged line chunks match your active string queries."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
