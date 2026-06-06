import React, { useState } from "react";

export default function App() {
  const [status, setStatus] = useState<"Healthy" | "Degraded">("Healthy");
  const [activeTab, setActiveTab] = useState<"overview" | "settings">(
    "overview",
  );

  return (
    <div className="flex h-screen w-screen bg-slate-950 font-sans text-slate-100 overflow-hidden">
      {/* left sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between shrink-0">
        <div className="space-y-6">
          <div className="text-xs font-bold uppercase tracking-wider text-sky-400 px-2">
            KubeDash
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("overview")}
              className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "overview"
                  ? "bg-sky-600 text-white"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition-colors cursor-pointer ${
                activeTab === "settings"
                  ? "bg-sky-600 text-white"
                  : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              Settings
            </button>
          </nav>
        </div>
      </aside>

      <main className="flex-1 p-8 flex flex-col items-center justify-center">
        {activeTab === "overview" ? (
          <div className="text-center">
            <h1 className="text-3xl font-bold text-sky-400 mb-2">
              KubeDash Workspace
            </h1>
            <p className="text-slate-400 mb-6 text-sm">Responsive engine</p>

            <div
              className={` content-center px-4 py-2 rounded-full font-bold text-white mb-6 transition-colors duration-300 ${
                status === "Healthy" ? "bg-green-600" : "bg-red-600"
              }`}
            >
              Cluster Status: {status}
            </div>

            <button
              className=" content-center px-5 py-2.5 bg-slate-800 text-slate-100 border border-slate-600 rounded-md cursor-pointer font-bold transition-all hover:bg-slate-700 active:scale-98"
              onClick={() =>
                setStatus((prev) =>
                  prev === "Healthy" ? "Degraded" : "Healthy",
                )
              }
            >
              Simulate Cluster Event
            </button>
          </div>
        ) : (
          /* temp settings */
          <div className="text-center text-slate-400 text-sm">
            Cluster configurations will go here.
          </div>
        )}
      </main>
    </div>
  );
}
