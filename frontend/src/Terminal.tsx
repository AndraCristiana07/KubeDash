import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalModalProps {
  podName: string;
  namespace: string;
  onClose: () => void;
}

const WB =
  (typeof process !== "undefined" && process.env?.REACT_WEBSOCKET) ||
  "ws://localhost:8080";

export default function TerminalModal({
  podName,
  namespace,
  onClose,
}: TerminalModalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // xterm panel
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: "Courier New, monospace",
      theme: {
        background: "#0D530E",
        foreground: "#FBF5DD",
        cursor: "#FBF5DD",
        selectionBackground: "rgba(48, 109, 41, 0.4)",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    term.writeln(`Connecting secure channel context to pod: ${podName}...`);

    // WebSocket
    const wsUrl = `${WB}/api/cluster/ssh?namespace=${namespace}&name=${podName}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      term.clear();
      term.writeln(
        `Connected to [${namespace}] ${podName}. Type exit or close modal to detach.\r\n`,
      );
    };

    ws.onmessage = async (event) => {
      if (event.data instanceof Blob) {
        const text = await event.data.text();
        term.write(text);
      } else {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      term.writeln("\r\nSession socket pipeline disconnected safely.");
    };

    // take frontend input keys back to backend handler
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // resizing window
    const handleResize = () => fitAddon.fit();
    window.addEventListener("resize", handleResize);

    return () => {
      ws.close();
      term.dispose();
      window.removeEventListener("resize", handleResize);
    };
  }, [podName, namespace]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center 
        bg-black/40 backdrop-blur-sm p-8"
    >
      <div
        className="bg-[#FBF5DD] border border-[#E7E1B1] 
            w-full max-w-4xl h-[500px] rounded-xl flex flex-col 
            overflow-hidden shadow-2xl"
      >
        {/* header bar banner */}
        <div
          className="bg-[#0D530E] text-[#FBF5DD] px-5 py-3.5 flex 
            justify-between items-center border-b border-[#306D29]/20"
        >
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">
              Interactive Container Shell
            </span>
            <span
              className="font-mono text-xs opacity-60 bg-[#306D29] px-2 
                py-0.5 rounded"
            >
              {namespace}/{podName}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#E7E1B1] hover:text-white text-xs font-bold 
                bg-[#306D29] px-3 py-1 rounded-lg transition-all cursor-pointer"
          >
            Close Terminal
          </button>
        </div>

        {/* terminal bounding box */}
        <div className="flex-1 bg-[#0D530E] p-4 overflow-hidden">
          <div ref={terminalRef} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
