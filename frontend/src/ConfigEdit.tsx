import React from "react";

interface EnvMapping {
  sourceKey: string;
  envKey: string;
}

interface ConfigEditPod {
  name: string;
  namespace: string;
}

interface InjectEnvMapsModalProps {
  configEditPod: ConfigEditPod | null;
  setConfigEditPod: (pod: ConfigEditPod | null) => void;
  configs: any[];
  GO_API: string;
  fetchClusterPods: () => void;
  editConfigName: string;
  setEditConfigName: (val: string) => void;
  editConfigType: string;
  setEditConfigType: (val: string) => void;
  editMappings: EnvMapping[];
  setEditMappings: (val: EnvMapping[]) => void;
}

export default function InjectEnvMapsModal({
  configEditPod,
  setConfigEditPod,
  configs,
  GO_API,
  fetchClusterPods,
  editConfigName,
  setEditConfigName,
  editConfigType,
  setEditConfigType,
  editMappings,
  setEditMappings,
}: InjectEnvMapsModalProps) {
  if (!configEditPod) return null;

  const handleApplyAndRecycle = async () => {
    const activeMappings = editMappings
      .filter((m) => m.sourceKey.trim() !== "")
      .map((m) => ({
        source_key: m.sourceKey,
        env_key: m.envKey,
      }));

    try {
      const res = await fetch(`${GO_API}/api/cluster/pods/update-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pod_name: configEditPod.name,
          namespace: configEditPod.namespace,
          config_type: editConfigType,
          config_name: editConfigName,
          mappings: activeMappings,
        }),
      });

      if (res.ok) {
        setConfigEditPod(null);
        setEditConfigName("");
        setEditConfigType("");
        setEditMappings([{ sourceKey: "", envKey: "" }]);
        fetchClusterPods();
      } else {
        const errorMsg = await res.text();
        alert(`Injection Fault: ${errorMsg}`);
      }
    } catch (err) {
      console.error("Network connectivity issue:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[#FBF5DD] border border-[#E7E1B1] w-full max-w-md rounded-xl p-6 shadow-2xl space-y-4 font-sans">
        <div>
          <h3 className="text-base font-black text-[#0D530E]">
            Inject Environment Maps: {configEditPod.name}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Injects new environment variables into this running pod without
            altering the underlying configuration maps.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Select Target Cluster Resource
            </label>
            <select
              value={
                editConfigName ? `${editConfigType}:${editConfigName}` : ""
              }
              onChange={(e) => {
                const val = e.target.value;
                if (!val) {
                  setEditConfigName("");
                  setEditConfigType("");
                  setEditMappings([{ sourceKey: "", envKey: "" }]);
                  return;
                }

                const [type, name] = val.split(":");
                setEditConfigName(name);
                setEditConfigType(type);
              }}
              className="w-full bg-white border border-[#E7E1B1] 
                          text-[#0D530E] rounded-lg px-2 py-1.5 text-xs 
                          outline-none focus:border-[#306D29]"
            >
              <option value="">
                -- Select ConfigMap or Secret to Attach --
              </option>
              {configs.map((cfg: any) => {
                const rawType = (
                  cfg.type ||
                  cfg.kind ||
                  "configmap"
                ).toLowerCase();
                const cleanType = rawType.includes("secret")
                  ? "secret"
                  : "configmap";
                return (
                  <option key={cfg.name} value={`${cleanType}:${cfg.name}`}>
                    {cfg.name} ({cleanType.toUpperCase()})
                  </option>
                );
              })}
            </select>
          </div>

          {editConfigName && (
            <div className="space-y-2 pt-2 border-t border-[#E7E1B1]/40">
              <div className="flex justify-between items-center">
                <span className="text-[9px] font-bold text-slate-500 uppercase">
                  Map Keys
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEditMappings([
                      ...editMappings,
                      { sourceKey: "", envKey: "" },
                    ])
                  }
                  className="text-[10px] text-[#306D29] font-bold cursor-pointer"
                >
                  + Add Key Row
                </button>
              </div>

              {editMappings.map((mapping, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-2 gap-2 items-end relative pb-1"
                >
                  <div>
                    <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">
                      Select Cluster Key
                    </label>
                    <select
                      required
                      value={mapping.sourceKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        const updated = [...editMappings];
                        updated[idx].sourceKey = val;
                        updated[idx].envKey = val
                          .toUpperCase()
                          .replace(/[-\s.]/g, "_")
                          .replace(/[^A-Z0-9_]/g, "");
                        setEditMappings(updated);
                      }}
                      className="w-full bg-white border border-[#E7E1B1] text-[#0D530E] rounded-lg px-2 py-1 text-xs outline-none"
                    >
                      <option value="">-- Source Key --</option>
                      {Object.keys(
                        configs.find((c: any) => c.name === editConfigName)
                          ?.data || {},
                      ).map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <div className="flex-1">
                      <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">
                        Inject Into Code As
                      </label>
                      <input
                        type="text"
                        required
                        value={mapping.envKey}
                        onChange={(e) => {
                          const updated = [...editMappings];
                          updated[idx].envKey = e.target.value
                            .toUpperCase()
                            .toUpperCase()
                            .replace(/[-\s.]/g, "_")
                            .replace(/[^A-Z0-9_]/g, "");
                          setEditMappings(updated);
                        }}
                        className="w-full bg-white border border-[#E7E1B1] text-[#0D530E] font-mono rounded-lg px-2 py-1 text-xs outline-none"
                      />
                    </div>
                    {editMappings.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditMappings(
                            editMappings.filter((_, mIdx) => mIdx !== idx),
                          )
                        }
                        className="text-red-600 text-xs font-bold pt-4 px-1 cursor-pointer"
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

        {/* form actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-[#E7E1B1]/40">
          <button
            type="button"
            onClick={() => {
              setConfigEditPod(null);
              setEditConfigName("");
              setEditConfigType("");
              setEditMappings([{ sourceKey: "", envKey: "" }]);
            }}
            className="px-4 py-2 text-xs font-bold bg-[#E7E1B1] text-[#0D530E] rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyAndRecycle}
            className="px-4 py-2 text-xs font-bold bg-[#306D29] text-[#FBF5DD] rounded-lg cursor-pointer"
          >
            Apply & Recycle Pod
          </button>
        </div>
      </div>
    </div>
  );
}
