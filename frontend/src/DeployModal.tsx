import React from "react";

interface EnvMapping {
  sourceKey: string;
  envKey: string;
}

interface DeployWorkloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToYaml: () => void;
  targetNamespace: string;
  configs: any[];
  isDeploying: boolean;
  handleDeployPod: (e: React.SubmitEvent<HTMLFormElement>) => void;
  newPodName: string;
  setNewPodName: (val: string) => void;
  newPodImage: string;
  setNewPodImage: (val: string) => void;
  attachConfigName: string;
  setAttachConfigName: (val: string) => void;
  setAttachConfigType: (val: string) => void;
  envMappings: EnvMapping[];
  setEnvMappings: (val: EnvMapping[]) => void;
}

export default function DeployWorkloadModal({
  isOpen,
  onClose,
  onSwitchToYaml,
  targetNamespace,
  configs,
  isDeploying,
  handleDeployPod,
  newPodName,
  setNewPodName,
  newPodImage,
  setNewPodImage,
  attachConfigName,
  setAttachConfigName,
  setAttachConfigType,
  envMappings,
  setEnvMappings,
}: DeployWorkloadModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center 
            bg-black/40 backdrop-blur-sm"
    >
      <div
        className="bg-[#FBF5DD] border border-[#E7E1B1] w-full max-w-md 
              rounded-xl p-6 shadow-2xl space-y-4 animate-fade-in max-h-[90vh] overflow-y-auto"
      >
        <div>
          <div>
            <h3 className="text-base font-black text-[#0D530E]">
              Deploy New Workspace Workload
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">
              Namespace context scope:{" "}
              <span className="font-bold underline text-[#306D29]">
                {targetNamespace || "default"}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClose();
              onSwitchToYaml();
            }}
            className="px-2 py-1 text-[10px] font-black tracking-wide uppercase font-mono bg-amber-600/10 text-amber-800 border border-amber-600/30 hover:bg-amber-600 hover:text-white rounded-md transition-all cursor-pointer shadow-2xs shrink-0"
            title="Shift deployment methodology framework schema configurations over to direct text template scripts uploader"
          >
            Apply YAML Manifest
          </button>
        </div>

        <form onSubmit={handleDeployPod} className="space-y-4">
          {/* pod name */}
          <div className="space-y-1">
            <label
              className="text-[10px] font-bold uppercase tracking-wider 
                    text-[#0D530E]/70"
            >
              Pod Identity Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g., custom-web-server"
              value={newPodName}
              onChange={(e) =>
                setNewPodName(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                )
              }
              className="w-full bg-[#E7E1B1]/20 border border-[#E7E1B1] 
                    focus:border-[#306D29] text-[#0D530E] font-medium rounded-lg 
                    px-3 py-2 text-sm placeholder-slate-400 outline-none transition-all"
            />
          </div>

          {/* container image */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#0D530E]/70">
              Container Image
            </label>
            <input
              type="text"
              required
              placeholder="e.g., nginx:alpine or redis"
              value={newPodImage}
              onChange={(e) => setNewPodImage(e.target.value)}
              className="w-full bg-[#E7E1B1]/20 border border-[#E7E1B1] 
                    focus:border-[#306D29] text-[#0D530E] font-medium rounded-lg 
                    px-3 py-2 text-sm placeholder-slate-400 outline-none transition-all"
            />
          </div>

          {/* optional cluster config mapping */}
          <div className="border border-[#E7E1B1] bg-[#E7E1B1]/20 p-3 rounded-lg space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#0D530E]">
              Link Cluster Variables (Optional)
            </div>

            {configs.length === 0 ? (
              <div className="text-[10px] text-slate-500 italic">
                No configs available in this namespace boundary to map.
              </div>
            ) : (
              <div className="space-y-2">
                {/* choose object */}
                <div>
                  <select
                    value={attachConfigName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setAttachConfigName(val);
                      const chosen = configs.find((c: any) => c.name === val);
                      setAttachConfigType(chosen ? chosen.type : "");
                      if (!val) setEnvMappings([{ sourceKey: "", envKey: "" }]);
                    }}
                    className="w-full bg-white border border-[#E7E1B1] 
                          text-[#0D530E] rounded-lg px-2 py-1.5 text-xs 
                          outline-none focus:border-[#306D29]"
                  >
                    <option value="">
                      -- Do not attach any resource variables --
                    </option>
                    {configs.map((cfg: any) => (
                      <option key={cfg.name} value={cfg.name}>
                        {cfg.name} ({cfg.type.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* choose target keys */}
                {attachConfigName && (
                  <div className="space-y-3 pt-2 border-t border-[#E7E1B1]/40">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                        Map Resource Keys to Container
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setEnvMappings([
                            ...envMappings,
                            { sourceKey: "", envKey: "" },
                          ])
                        }
                        className="text-[10px] text-[#306D29] hover:text-[#0D530E] font-bold cursor-pointer"
                      >
                        + Add Variable Mapping
                      </button>
                    </div>

                    {envMappings.map((mapping, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end relative pb-1 animate-fadeIn"
                      >
                        <div>
                          <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">
                            Select Cluster Key
                          </label>
                          <select
                            required
                            value={mapping.sourceKey}
                            onChange={(e) => {
                              const selectedKey = e.target.value;
                              const updated = [...envMappings];
                              updated[idx].sourceKey = selectedKey;
                              // set variable name inside container to match source
                              updated[idx].envKey = selectedKey
                                .toUpperCase()
                                .replace(/[^A-Z0-9_]/g, "");
                              setEnvMappings(updated);
                            }}
                            className="w-full bg-white border border-[#E7E1B1] text-[#0D530E] rounded-lg px-2 py-1 text-xs outline-none"
                          >
                            <option value="">-- Choose Key --</option>
                            {Object.keys(
                              configs.find(
                                (c: any) => c.name === attachConfigName,
                              )?.data || {},
                            ).map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <div className="flex-1">
                            <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">
                              Inject Into Code As
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g., DB_PASS"
                              value={mapping.envKey}
                              onChange={(e) => {
                                const updated = [...envMappings];
                                updated[idx].envKey = e.target.value
                                  .toUpperCase()
                                  .replace(/[^A-Z0-9_]/g, "");
                                setEnvMappings(updated);
                              }}
                              className="w-full bg-white border border-[#E7E1B1] text-[#0D530E] font-mono rounded-lg px-2 py-1 text-xs outline-none focus:border-[#306D29]"
                            />
                          </div>
                          {/* row delete */}
                          {envMappings.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setEnvMappings(
                                  envMappings.filter((_, mIdx) => mIdx !== idx),
                                )
                              }
                              className="text-red-600 hover:text-red-800 text-xs font-bold pt-4 px-1 cursor-pointer"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* action pperations */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                setAttachConfigName("");
                setAttachConfigType("");
                setEnvMappings([{ sourceKey: "", envKey: "" }]);
              }}
              className="px-4 py-2 text-xs font-bold bg-[#E7E1B1] 
                    hover:bg-[#E7E1B1]/60 text-[#0D530E] rounded-lg 
                    cursor-pointer transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isDeploying}
              className="px-4 py-2 text-xs font-bold bg-[#306D29] 
                    hover:bg-[#0D530E] disabled:bg-slate-300 text-[#FBF5DD] 
                    rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
            >
              {isDeploying ? "Deploying..." : "Launch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
