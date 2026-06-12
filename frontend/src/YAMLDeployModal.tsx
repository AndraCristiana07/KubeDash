import React, { useState } from "react";
import CodeIcon from "@mui/icons-material/Code";
import FolderIcon from "@mui/icons-material/Folder";

interface YamlDeployModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetNamespace: string;
  handleManualRefresh: () => void;
  toast: any;
  GO_API: string;
}

export default function YamlDeployModal({
  isOpen,
  onClose,
  targetNamespace,
  handleManualRefresh,
  toast,
  GO_API,
}: YamlDeployModalProps) {
  const [yamlContent, setYamlContent] = useState<string>("");
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setYamlContent(event.target.result as string);
          toast.success(
            (t: any) => (
              <div className="flex items-start gap-3 justify-between w-full">
                <span className="text-xs text-[#0D530E] font-medium leading-relaxed">
                  Loaded manifest configuration: {file.name}
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
              id: file.name,
              style: {
                background: "#FBF5DD",
                border: "1px solid #E7E1B1",
                borderLeft: "4px solid #306D29",
                maxWidth: "420px",
                width: "100%",
              },
            },
          );
        }
      };
      reader.readAsText(file);
    }
  };

  const handleApplyManifest = async () => {
    if (!yamlContent.trim()) {
      toast.error("Manifest entry context cannot be empty.");
      return;
    }

    setIsSubmitting(true);
    const loadId = toast.loading(
      "Applying configuration to cluster context...",
    );

    try {
      const response = await fetch(`${GO_API}/api/cluster/manifests/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          yaml_string: yamlContent,
          namespace: targetNamespace || "default",
        }),
      });

      const resData = await response.json();
      if (!response.ok)
        throw new Error(
          resData.error || "Manifest application transaction failed",
        );

      toast.success(
        (t: any) => (
          <div className="flex items-start gap-3 justify-between w-full">
            <span className="text-xs text-[#0D530E] font-medium leading-relaxed">
              Successfully deployed pod {resData.applied.join(", ")}
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
          id: loadId,
          style: {
            background: "#FBF5DD",
            border: "1px solid #E7E1B1",
            borderLeft: "4px solid #306D29",
            maxWidth: "420px",
            width: "100%",
          },
        },
      );
      setYamlContent("");
      handleManualRefresh();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Engine state initialization anomaly", {
        id: loadId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-[#FBF5DD] border border-[#E7E1B1] w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] font-mono">
        <div className="bg-[#0D530E] text-[#FBF5DD] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CodeIcon className="text-amber-400 text-sm" />
            <h3 className="text-sm font-black uppercase tracking-wider">
              Manifest Deployment
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[#FBF5DD]/70 hover:text-white cursor-pointer font-sans font-bold text-sm"
            title=""
          >
            ✕
          </button>
        </div>

        {/* form body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 flex flex-col items-stretch">
          <p className="text-xs text-slate-500 font-sans leading-relaxed">
            Drop a configuration file (
            <span className="font-bold text-[#0D530E]">.yaml</span>) directly
            into the zone below or paste your raw code into the container frame.
          </p>

          {/* drag and drop area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={() => setIsDragActive(false)}
            onDrop={handleFileDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-all flex flex-col items-center justify-center min-h-[110px] cursor-pointer ${
              isDragActive
                ? "border-[#0D530E] bg-[#306D29]/5"
                : "border-[#E7E1B1] bg-[#E7E1B1]/10 hover:bg-[#E7E1B1]/20"
            }`}
          >
            <span className="text-2xl mb-1">
              <FolderIcon fontSize="inherit" className="text-yellow-300" />
            </span>
            <span className="text-[10px] font-bold text-[#0D530E] uppercase tracking-wide">
              {isDragActive
                ? "Release File to Load"
                : "Drag & Drop YAML File Here"}
            </span>
          </div>

          {/* text editor area */}
          <div className="flex-1 flex flex-col items-stretch min-h-[250px]">
            <textarea
              value={yamlContent}
              onChange={(e) => setYamlContent(e.target.value)}
              placeholder={`apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: worker-node\nspec:\n...`}
              className="w-full flex-1 p-4 bg-slate-900 text-emerald-400 rounded-xl font-mono text-xs focus:outline-hidden focus:ring-1 focus:ring-[#306D29] leading-relaxed resize-none shadow-inner border border-slate-950 tab-2"
            />
          </div>
        </div>

        {/* actions button */}
        <div className="bg-[#E7E1B1]/20 px-6 py-4 border-t border-[#E7E1B1] flex items-center justify-between gap-3">
          <button
            onClick={() => setYamlContent("")}
            disabled={!yamlContent || isSubmitting}
            className="px-3 py-1 text-xs text-red-700 font-bold border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg transition-colors cursor-pointer disabled:opacity-30"
          >
            Clear
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-sans font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApplyManifest}
              disabled={isSubmitting || !yamlContent.trim()}
              className="px-4 py-2 text-xs font-bold text-white bg-[#306D29] hover:bg-[#0D530E] rounded-lg shadow-sm transition-all disabled:opacity-40"
            >
              {isSubmitting ? "Orchestrating..." : "Execute Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
