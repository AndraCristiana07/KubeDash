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
  const [isLoading, setIsLoading] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [newBlockType, setNewBlockType] = useState("configmap");
  const [newBlockName, setNewBlockName] = useState("");
  const [newBlockKey, setNewBlockKey] = useState("");
  const [newBlockValue, setNewBlockValue] = useState("");
  const [isSubmittingBlock, setIsSubmittingBlock] = useState(false);
  const [newBlockNamespace, setNewBlockNamespace] = useState("default");
  const [newBlockFields, setNewBlockFields] = useState<
    { key: string; value: string }[]
  >([
    { key: "", value: "" }, // starts with one empty row ready to fill
  ]);

  const [isBulkMode, setIsBulkMode] = useState<boolean>(false);

  const fetchClusterConfigs = async () => {
    setIsLoading(true);
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
    } finally {
      setIsLoading(false);
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

  const handleCreateConfigBlock = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!newBlockName) return;

    // make array of fields into a single key-value dictionary
    const dataMap: Record<string, string> = {};
    newBlockFields.forEach((field) => {
      const cleanKey = field.key
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "");
      if (cleanKey) {
        dataMap[cleanKey] = field.value;
      }
    });

    if (Object.keys(dataMap).length === 0) {
      alert("Add at least one valid key-value pair before committing.");
      return;
    }

    setIsSubmittingBlock(true);

    let targetScope = newBlockNamespace.trim().toLowerCase();
    if (!targetScope || targetScope === "all") {
      targetScope = "default";
    }

    const payload = {
      type: newBlockType,
      name: newBlockName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, ""),
      namespace: targetScope,
      data: dataMap, // key-value dictionary mapping
    };

    try {
      const res = await fetch(`${GO_API}/api/cluster/config/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(
          (t: any) => (
            <div className="text-xs text-[#0D530E] font-medium">
              Successfully injected multi-variable{" "}
              {newBlockType === "secret" ? "Secret" : "ConfigMap"} into cluster!
            </div>
          ),
          { style: { background: "#FBF5DD", borderLeft: "4px solid #306D29" } },
        );

        setNewBlockName("");
        setNewBlockFields([{ key: "", value: "" }]); // reset back to a single blank row
        setIsCreating(false);
        fetchClusterConfigs();
      } else {
        const errText = await res.text();
        alert(`Provision aborted: ${errText}`);
      }
    } catch (err) {
      console.error("Network write fault:", err);
    } finally {
      setIsSubmittingBlock(false);
    }
  };

  const handleDeleteConfigBlock = async (name: string, type: string) => {
    const targetNs = targetNamespace === "all" ? "default" : targetNamespace;

    try {
      const res = await fetch(`${GO_API}/api/cluster/config/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config_name: name,
          config_type: type,
          namespace: targetNs,
        }),
      });

      if (res.ok) {
        const data = await res.json();

        toast.success(
          (t: any) => (
            <div className="flex items-start gap-3 justify-between w-full">
              <span className="text-xs text-[#0D530E] font-medium leading-relaxed">
                Configuration resource{" "}
                <span className="font-mono font-bold text-[#306D29]">
                  "{name}"
                </span>{" "}
                was deleted safely from the cluster workspace topology.
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(t.id);
                  toast.remove(t.id);
                }}
                className="text-[#306D29]/50 hover:text-[#0D530E] 
                p-0.5 rounded transition-colors focus:outline-none 
                cursor-pointer flex-shrink-0"
                aria-label="Close alert"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ),
          {
            duration: 5000,
            position: "top-right",
            style: {
              background: "#FBF5DD",
              border: "1px solid #E7E1B1",
              borderLeft: "4px solid #306D29",
              maxWidth: "420px",
              width: "100%",
            },
          },
        );

        setSelectedConfig(null);
        fetchClusterConfigs();
      } else {
        const data = await res.json();
        const errText = data.error || "Failed dropping configuration maps.";

        toast.error(
          (t: any) => (
            <div className="flex items-start gap-3 justify-between w-full">
              <span className="text-xs text-red-800 font-semibold leading-relaxed">
                Failed to delete configuration: {errText}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.dismiss(t.id);
                  toast.remove(t.id);
                }}
                className="text-red-700/50 hover:text-red-700 p-0.5 rounded 
                  transition-colors focus:outline-none 
                  cursor-pointer flex-shrink-0"
                aria-label="Close alert"
              >
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ),
          {
            duration: 6000,
            position: "top-right",
            style: {
              background: "#FBF5DD",
              border: "1px solid #E7E1B1",
              borderLeft: "4px solid #dc2626",
              maxWidth: "420px",
              width: "100%",
            },
          },
        );
      }
    } catch (err) {
      console.error("Deletion communication context trace error:", err);
      toast.error(
        (t: any) => (
          <div className="flex items-start gap-3 justify-between w-full">
            <span className="text-xs text-red-800 font-semibold">
              Network or cluster infrastructure timeout tracking deletion
              lifecycle.
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toast.dismiss(t.id);
                toast.remove(t.id);
              }}
              className="text-red-700/50 hover:text-red-700 p-0.5 
                rounded transition-colors focus:outline-none 
                cursor-pointer flex-shrink-0"
              aria-label="Close alert"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        ),
        {
          duration: 5000,
          position: "top-right",
          style: {
            background: "#FBF5DD",
            border: "1px solid #E7E1B1",
            borderLeft: "4px solid #dc2626",
            maxWidth: "420px",
            width: "100%",
          },
        },
      );
    }
  };

  useEffect(() => {
    if (targetNamespace && targetNamespace !== "all") {
      setNewBlockNamespace(targetNamespace);
    } else {
      setNewBlockNamespace("default");
    }
  }, [targetNamespace]);

  // re-fetch configuration
  useEffect(() => {
    fetchClusterConfigs();
  }, [targetNamespace, GO_API]);

  return (
    <div className="space-y-6">
      {/* engine configuration card */}
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
          {/* target namespace */}
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
      {/* TODO: set a tooltip for longer config names  */}
      {/* configMap & secrets */}
      <div
        className="w-full max-w-2xl mx-auto bg-[#E7E1B1]/30 
            border border-[#E7E1B1] rounded-xl p-6 space-y-6 shadow-sm"
      >
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-black text-[#0D530E]">
              ConfigMaps & Secrets Live Matrix
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">
              Real-time variables in namespace:{" "}
              <span className="font-bold underline text-[#306D29]">
                {targetNamespace || "all"}
              </span>
            </p>
          </div>
          {/* action toggle button */}
          <button
            type="button"
            onClick={() => {
              setIsCreating(!isCreating);
              setSelectedConfig(null); // close editor if switching to creation mode
              setIsBulkMode(false);
            }}
            className={`px-3 py-1.5 text-xs font-black rounded-lg cursor-pointer transition-all ${
              isCreating
                ? "bg-slate-400 text-white hover:bg-slate-500"
                : "bg-[#306D29] text-[#FBF5DD] hover:bg-[#0D530E] shadow-sm"
            }`}
          >
            {isCreating ? "✕ Close Wizard" : "+ New Block"}
          </button>
        </div>

        <hr className="border-[#E7E1B1]" />

        {/* creation panel for configMap/secret */}
        {isCreating && (
          <form
            onSubmit={handleCreateConfigBlock}
            className="bg-[#FBF5DD]/80 border border-[#E7E1B1] 
                rounded-xl p-4 space-y-4 animate-fadeIn"
          >
            <div
              className="text-xs font-black text-[#0D530E] 
                uppercase tracking-wider flex items-center gap-1"
            >
              Provision New Configuration Block
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* flag selector */}
              <div className="space-y-1">
                <label
                  className="block text-[10px] font-mono font-bold 
                    text-slate-500 uppercase tracking-wide"
                >
                  Resource Type
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewBlockType("configmap")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      newBlockType === "configmap"
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-white border-[#E7E1B1] text-[#0D530E] hover:bg-[#E7E1B1]/20"
                    }`}
                  >
                    ConfigMap
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewBlockType("secret")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      newBlockType === "secret"
                        ? "bg-red-600 border-red-600 text-white"
                        : "bg-white border-[#E7E1B1] text-[#0D530E] hover:bg-[#E7E1B1]/20"
                    }`}
                  >
                    Secret
                  </button>
                </div>
              </div>

              <div
                className={`space-y-1 ${targetNamespace === "all" ? "sm:col-span-1" : "sm:col-span-2"}`}
              >
                <label
                  className="block text-[10px] font-mono font-bold 
                    text-slate-500 uppercase tracking-wide"
                >
                  Resource Name
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    newBlockType === "secret"
                      ? `e.g., db_auth`
                      : `e.g., auth-service-props`
                  }
                  value={newBlockName}
                  onChange={(e) =>
                    setNewBlockName(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                  className="w-full bg-white border border-[#E7E1B1] 
                    text-[#0D530E] font-mono rounded-lg px-3 py-1.5 text-xs 
                    outline-none focus:border-[#306D29]"
                />
              </div>

              {/* render targetNamespace variable input field just when namespace is set to "all" */}
              {targetNamespace === "all" && (
                <div className="space-y-1 animate-fadeIn">
                  <label
                    className="block text-[10px] font-mono font-bold 
                        text-slate-500 uppercase tracking-wide"
                  >
                    Target Namespace
                  </label>
                  <input
                    type="text"
                    placeholder="default (if blank)"
                    value={newBlockNamespace === "all" ? "" : newBlockNamespace}
                    onChange={(e) =>
                      setNewBlockNamespace(e.target.value.toLowerCase().trim())
                    }
                    className="w-full bg-white border border-[#E7E1B1] 
                        text-[#0D530E] font-mono rounded-lg px-3 py-1.5 
                        text-xs outline-none focus:border-[#306D29]"
                  />
                </div>
              )}
            </div>

            {/* dynamic key-value data rows */}
            <div className="border-t border-[#E7E1B1]/60 pt-3 space-y-3">
              <div className="flex justify-between items-center">
                <label
                  className="text-[10px] font-mono font-bold 
                    text-slate-500 uppercase tracking-wide"
                >
                  {isBulkMode
                    ? "Raw Environment Variables Block (.env format)"
                    : "Configuration Properties Map"}
                </label>

                {/* format toggle */}
                <button
                  type="button"
                  onClick={() => setIsBulkMode(!isBulkMode)}
                  className="text-[10px] text-[#306D29] hover:text-[#0D530E] 
                    font-extrabold cursor-pointer underline decoration-dotted"
                >
                  {isBulkMode
                    ? "Switch to Individual Key Fields"
                    : "Paste Entire .env Document Block"}
                </button>
              </div>

              {isBulkMode ? (
                // bulk import
                <div className="space-y-1 animate-fadeIn">
                  <textarea
                    rows={6}
                    placeholder={
                      newBlockType === "secret"
                        ? `POSTGRES_PASSWORD=super_secure_db_pass_99\nJWT_KEY=a7b3c2d9e1f5g4h6_token`
                        : `DB_HOST=postgres-service.default.svc.cluster.local\nDB_PORT=5432\nLOG_LEVEL=DEBUG\nENABLE_CACHE=true`
                    }
                    onChange={(e) => {
                      const lines = e.target.value.split("\n");
                      const parsedFields = lines
                        .map((line) => {
                          if (line.trim().startsWith("#") || line.trim() === "")
                            return null;
                          const equalIndex = line.indexOf("=");
                          if (equalIndex === -1) return null;

                          const rawKey = line.substring(0, equalIndex).trim();
                          const rawValue = line
                            .substring(equalIndex + 1)
                            .trim();

                          if (!rawKey) return null;

                          return {
                            key: rawKey
                              .toUpperCase()
                              .replace(/[^A-Z0-9_]/g, ""),
                            value: rawValue,
                          };
                        })
                        .filter(
                          (field): field is { key: string; value: string } =>
                            field !== null,
                        );

                      setNewBlockFields(
                        parsedFields.length > 0
                          ? parsedFields
                          : [{ key: "", value: "" }],
                      );
                    }}
                    className="w-full bg-white border border-[#E7E1B1] text-[#0D530E] 
                      font-mono rounded-xl px-3 py-2 text-xs outline-none 
                      focus:border-[#306D29] leading-relaxed resize-y"
                  />
                  <p className="text-[9px] text-slate-400 font-mono italic">
                    Lines without a clear "=" character assignment layout will
                    be skipped. Values can contain extra "=" markers safely.
                  </p>
                </div>
              ) : (
                // single rows key-value insertion
                <>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setNewBlockFields([
                          ...newBlockFields,
                          { key: "", value: "" },
                        ])
                      }
                      className="text-[10px] text-[#306D29] hover:text-[#0D530E] 
                        font-bold cursor-pointer"
                    >
                      + Add Single Key Row
                    </button>
                  </div>

                  {newBlockFields.map((field, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3 
                        items-end relative animate-fadeIn"
                    >
                      <div className="space-y-1">
                        <input
                          type="text"
                          required
                          placeholder={
                            newBlockType === "secret"
                              ? `DB_PASSWORD`
                              : `DB_HOST`
                          }
                          value={field.key}
                          onChange={(e) => {
                            const updated = [...newBlockFields];
                            updated[idx].key = e.target.value
                              .toUpperCase()
                              .replace(/[^A-Z0-9_]/g, "");
                            setNewBlockFields(updated);
                          }}
                          className="w-full bg-white border border-[#E7E1B1] 
                            text-[#0D530E] font-mono rounded-lg px-3 py-1.5 
                            text-xs outline-none focus:border-[#306D29]"
                        />
                      </div>
                      <div className="space-y-1 flex items-center gap-2">
                        <input
                          type="text"
                          required
                          placeholder={
                            newBlockType === "secret"
                              ? `secret-password`
                              : `postgress`
                          }
                          value={field.value}
                          onChange={(e) => {
                            const updated = [...newBlockFields];
                            updated[idx].value = e.target.value;
                            setNewBlockFields(updated);
                          }}
                          className="w-full bg-white border border-[#E7E1B1] 
                            text-[#0D530E] font-mono rounded-lg px-3 py-1.5 
                            text-xs outline-none focus:border-[#306D29]"
                        />
                        {newBlockFields.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setNewBlockFields(
                                newBlockFields.filter(
                                  (_, fIdx) => fIdx !== idx,
                                ),
                              )
                            }
                            className="text-red-600 hover:text-red-800 text-xs font-bold px-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmittingBlock}
              className="w-full text-center py-2 bg-[#306D29] hover:bg-[#0D530E] 
                text-white font-bold text-xs rounded-lg transition-all 
                shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingBlock
                ? "Injecting object properties into cluster ecosystem..."
                : `Commit New ${newBlockType === "secret" ? "Secret" : "ConfigMap"} Object`}
            </button>
          </form>
        )}

        {/* resource selection box grid */}
        {!isCreating && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 
                overflow-y-auto pr-1 min-h-[80px] relative"
          >
            {isLoading ? (
              <div
                className="col-span-2 flex flex-col items-center 
                    justify-center py-6 space-y-2 animate-pulse"
              >
                <svg
                  className="animate-spin h-5 w-5 text-[#306D29]"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 
                    5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 
                    5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span
                  className="text-[10px] font-mono text-slate-500 
                    font-bold tracking-wide"
                >
                  Waiting for cluster configurations...
                </span>
              </div>
            ) : configs.length === 0 ? (
              <div
                className="col-span-2 text-center py-8 text-xs 
                    font-mono text-slate-400"
              >
                No custom configuration objects or tokens detected.
              </div>
            ) : (
              configs.map((cfg: any) => {
                const isCurrentlyInUse =
                  cfg.bound_pods && cfg.bound_pods.length > 0;

                return (
                  <div
                    key={cfg.name}
                    onClick={() =>
                      setSelectedConfig(JSON.parse(JSON.stringify(cfg)))
                    }
                    className={`group p-3 text-left rounded-xl border text-xs cursor-pointer 
                      transition-all flex justify-between items-center relative ${
                        selectedConfig?.name === cfg.name
                          ? "bg-[#306D29] border-[#306D29] text-white font-bold shadow-sm"
                          : "bg-[#FBF5DD]/50 border-[#E7E1B1] text-[#0D530E] hover:bg-[#FBF5DD]"
                      }`}
                  >
                    <button
                      type="button"
                      className="flex-1 text-left truncate max-w-[140px] 
                        cursor-pointer font-mono outline-none flex items-center gap-1.5"
                    >
                      {/* radar dot showing live usage status */}
                      {isCurrentlyInUse && (
                        <span className="flex h-1.5 w-1.5 flex-shrink-0 relative">
                          <span
                            className={`animate-ping absolute inline-flex h-full 
                              w-full rounded-full opacity-75 ${selectedConfig?.name === cfg.name ? "bg-white" : "bg-emerald-400"}`}
                          ></span>
                          <span
                            className={`relative inline-flex rounded-full h-1.5 w-1.5
                              ${selectedConfig?.name === cfg.name ? "bg-white" : "bg-emerald-500"}`}
                          ></span>
                        </span>
                      )}

                      <span
                        className={
                          isCurrentlyInUse && selectedConfig?.name !== cfg.name
                            ? "text-[#0D530E]"
                            : ""
                        }
                      >
                        {cfg.name}
                      </span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold 
                          uppercase tracking-wider ${
                            selectedConfig?.name === cfg.name
                              ? "bg-white/20 text-white border border-white/30"
                              : cfg.type === "secret"
                                ? "bg-red-600/10 text-red-700 border border-red-600/20"
                                : "bg-blue-600/10 text-blue-700 border border-blue-600/20"
                          }`}
                      >
                        {cfg.type}
                      </span>

                      {/* delete action */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation(); // stop selection trigger
                          if (
                            confirm(
                              `Are you sure you want to completely drop "${cfg.name}" from the cluster?`,
                            )
                          ) {
                            handleDeleteConfigBlock(cfg.name, cfg.type);
                          }
                        }}
                        className={`transition-colors cursor-pointer text-[11px] font-bold px-1 ${
                          selectedConfig?.name === cfg.name
                            ? "text-white/60 hover:text-white"
                            : "text-slate-400 hover:text-red-600"
                        }`}
                        title="Delete Resource Map"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* value editor */}
        {!isCreating && selectedConfig && (
          <div
            className="bg-[#FBF5DD]/60 border border-[#E7E1B1]/xl 
                rounded-xl p-4 space-y-4"
          >
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
                className="text-slate-400 hover:text-slate-600 
                    text-xs font-bold cursor-pointer"
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
                            className="absolute right-3 text-[10px] font-extrabold 
                                text-[#306D29] hover:text-[#0D530E] tracking-tight 
                                uppercase cursor-pointer"
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
