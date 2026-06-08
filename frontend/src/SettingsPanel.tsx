import React, { useState, useEffect } from "react";

interface SettingsPanelProps {
  GO_API: string;
  targetNamespace: string;
  setTargetNamespace: (ns: string) => void;
  refreshInterval: number;
  setRefreshInterval: (interval: number) => void;
  toast: any;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  GO_API,
  targetNamespace,
  setTargetNamespace,
  refreshInterval,
  setRefreshInterval,
  toast,
}) => {
  const [configs, setConfigs] = useState([]);
  const [selectedConfig, setSelectedConfig] = useState<any>(null);
  const [revealSecretKey, setRevealSecretKey] = useState<
    Record<string, boolean>
  >({});
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const fetchClusterConfigs = async () => {
    try {
      const res = await fetch(
        `${GO_API}/api/cluster/config?namespace=${targetNamespace}`,
      );
      if (res.ok) {
        const data = await res.json();
        setConfigs(data || []);
      }
    } catch (err) {
      console.error("Failed fetching config maps & secrets:", err);
    }
  };

  // give modified key-value maps back to the cluster state
  const handleUpdateConfigData = async () => {
    if (!selectedConfig) return;
    setIsSavingConfig(true);

    try {
      const res = await fetch(`${GO_API}/api/cluster/config/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedConfig),
      });

      if (res.ok) {
        toast.success(
          (t: any) => (
            <div className="text-xs text-[#0D530E] font-medium">
              Configuration variables successfully synced with cluster!
            </div>
          ),
          { style: { background: "#FBF5DD", borderLeft: "4px solid #306D29" } },
        );
        setSelectedConfig(null);
        fetchClusterConfigs();
      } else {
        const txt = await res.text();
        alert(`Sync aborted by cluster: ${txt}`);
      }
    } catch (err) {
      console.error("Network write exception:", err);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // re-fetch configuration
  useEffect(() => {
    fetchClusterConfigs();
  }, [targetNamespace, GO_API]);

  return (
    <div className="space-y-6">
      {/* engine configuration Card */}
      <div
        className="w-full max-w-2xl mx-auto bg-[#E7E1B1]/30 border 
            border-[#E7E1B1] rounded-xl p-6 space-y-6 shadow-sm"
      >
        <div>
          <h2 className="text-lg font-black text-[#0D530E]">
            Engine Configuration
          </h2>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Customize KubeDash telemetry capture parameters.
          </p>
        </div>

        <hr className="border-[#E7E1B1]" />

        <div className="space-y-4">
          {/* refresh interval */}
          <div
            className="flex items-center justify-between bg-[#FBF5DD]/50 
                p-4 rounded-xl border border-[#E7E1B1]"
          >
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[#0D530E]">
                Metrics Polling Frequency
              </div>
              <div className="text-xs text-slate-500">
                Sets how often the UI scrapes telemetry endpoints.
              </div>
            </div>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="bg-[#FBF5DD] border border-[#E7E1B1] text-[#0D530E] 
                rounded-lg px-3 py-1.5 text-xs font-semibold outline-none 
                focus:border-[#306D29] cursor-pointer"
            >
              <option value={2000}>High Speed (2s)</option>
              <option value={4000}>Default (4s)</option>
              <option value={10000}>Balanced (10s)</option>
              <option value={30000}>Eco Mode (30s)</option>
            </select>
          </div>
          {/* target namespace  */}
          <div
            className="flex items-center justify-between bg-[#FBF5DD]/50 
                p-4 rounded-xl border border-[#E7E1B1]"
          >
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-[#0D530E]">
                Target Namespace Context
              </div>
              <div className="text-xs text-slate-500">
                Filters core workloads to a designated isolation boundary.
              </div>
            </div>
            <input
              type="text"
              value={targetNamespace}
              onChange={(e) =>
                setTargetNamespace(e.target.value.toLowerCase().trim())
              }
              className="w-32 bg-[#FBF5DD] border border-[#E7E1B1] 
                text-[#0D530E] focus:border-[#306D29] rounded-lg px-3 py-1.5 
                text-xs outline-none font-mono text-center font-bold"
            />
          </div>
        </div>
      </div>
      {/* TODO: if it's set to all it doesn't work */}
      {/* TODO: put a loading cue while fetching  */}
      {/* configMap & Secrets */}
      <div
        className="w-full max-w-2xl mx-auto bg-[#E7E1B1]/30 border 
            border-[#E7E1B1] rounded-xl p-6 space-y-6 shadow-sm"
      >
        <div>
          <h2 className="text-lg font-black text-[#0D530E]">
            ConfigMaps & Secrets Live Matrix
          </h2>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Real-time variables in namespace:{" "}
            <span className="font-bold underline text-[#306D29]">
              {targetNamespace}
            </span>
          </p>
        </div>

        <hr className="border-[#E7E1B1]" />

        {/* resource selection Box Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
          {configs.length === 0 ? (
            <div className="col-span-2 text-center py-4 text-xs font-mono text-slate-400">
              No custom configuration objects or tokens detected.
            </div>
          ) : (
            configs.map((cfg: any) => (
              <button
                key={cfg.name}
                type="button"
                onClick={() =>
                  setSelectedConfig(JSON.parse(JSON.stringify(cfg)))
                }
                className={`p-3 text-left rounded-xl border text-xs 
                    transition-all flex justify-between items-center cursor-pointer ${
                      selectedConfig?.name === cfg.name
                        ? "bg-[#306D29] border-[#306D29] text-white font-bold shadow-sm"
                        : "bg-[#FBF5DD]/50 border-[#E7E1B1] text-[#0D530E] hover:bg-[#FBF5DD]"
                    }`}
              >
                <span className="truncate max-w-[155px] font-mono">
                  {cfg.name}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold 
                    uppercase tracking-wider ${
                      cfg.type === "secret"
                        ? "bg-red-600/10 text-red-700 border border-red-600/20"
                        : "bg-blue-600/10 text-blue-700 border border-blue-600/20"
                    }`}
                >
                  {cfg.type}
                </span>
              </button>
            ))
          )}
        </div>

        {/*configuration*/}
        {selectedConfig && (
          <div className="bg-[#FBF5DD]/60 border border-[#E7E1B1] rounded-xl p-4 space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-xs font-mono font-bold text-[#0D530E]">
                Editing Configuration Keys for:{" "}
                <span className="underline font-black">
                  {selectedConfig.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConfig(null)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {Object.keys(selectedConfig.data || {}).length === 0 ? (
                <div className="text-center py-4 text-xs italic text-slate-400 font-mono">
                  This configuration object contains no key-value data mappings.
                </div>
              ) : (
                Object.keys(selectedConfig.data).map((key) => {
                  const isSecretType = selectedConfig.type === "secret";
                  const isRevealed = revealSecretKey[key];

                  return (
                    <div key={key} className="space-y-1">
                      <label
                        className="block text-[10px] font-mono font-bold 
                            text-slate-500 uppercase tracking-wide"
                      >
                        {key}
                      </label>
                      <div className="relative flex items-center">
                        <input
                          type={
                            isSecretType && !isRevealed ? "password" : "text"
                          }
                          value={selectedConfig.data[key] || ""}
                          onChange={(e) => {
                            const targetValue = e.target.value;
                            setSelectedConfig((prev: any) => ({
                              ...prev,
                              data: { ...prev.data, [key]: targetValue },
                            }));
                          }}
                          className="w-full bg-white border border-[#E7E1B1] 
                            text-[#0D530E] font-mono focus:border-[#306D29] 
                            rounded-lg px-3 py-1.5 text-xs outline-none 
                            pr-12 transition-all"
                        />
                        {isSecretType && (
                          <button
                            type="button"
                            onClick={() =>
                              setRevealSecretKey((prev) => ({
                                ...prev,
                                [key]: !prev[key],
                              }))
                            }
                            className="absolute right-3 text-[10px] 
                                font-extrabold text-[#306D29] hover:text-[#0D530E] 
                                tracking-tight uppercase cursor-pointer"
                          >
                            {isRevealed ? "Hide" : "Show"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={handleUpdateConfigData}
              disabled={isSavingConfig}
              className="w-full text-center py-2 bg-[#306D29] hover:bg-[#0D530E] 
                text-white font-bold text-xs rounded-lg transition-all 
                shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSavingConfig
                ? "Synchronizing data with Cluster..."
                : "Save & Sync Properties"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
