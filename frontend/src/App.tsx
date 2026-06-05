import React, { useState } from "react";

export default function App() {
  const [status, setStatus] = useState<"Healthy" | "Degraded">("Healthy");

  return (
    <div className="font-sans text-slate-50 text-center p-8 bg-slate-900 min-h-screen">
      <h1 className="text-3xl font-bold text-sky-400 mb-2">
        KubeDash Workspace
      </h1>
      <p className="text-slate-400 mb-6 text-sm">Responsive engine</p>

      {/* Status Badge */}
      <div
        className={`inline-block px-4 py-2 rounded-full font-bold text-white mb-6 transition-colors duration-300 ${
          status === "Healthy" ? "bg-emerald-600" : "bg-rose-600"
        }`}
      >
        Cluster Status: {status}
      </div>

      {/* Control Button */}
      <button
        className="block mx-auto px-5 py-2.5 bg-slate-800 text-slate-100 border border-slate-600 rounded-md cursor-pointer font-bold transition-all hover:bg-slate-700 hover:border-slate-500 active:scale-98"
        onClick={() =>
          setStatus((prev) => (prev === "Healthy" ? "Degraded" : "Healthy"))
        }
      >
        Simulate Cluster Event
      </button>
    </div>
  );
}
