import React from "react";

interface QuickViewConfig {
  name: string;
  type: string;
  namespace: string;
}

interface ConfigQuickViewModalProps {
  quickViewConfig: QuickViewConfig | null;
  setQuickViewConfig: (config: QuickViewConfig | null) => void;
  isLoadingQuickView: boolean;
  quickViewData: Record<string, string> | null;
}

export default function ConfigQuickViewModal({
  quickViewConfig,
  setQuickViewConfig,
  isLoadingQuickView,
  quickViewData,
}: ConfigQuickViewModalProps) {
  if (!quickViewConfig) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center 
            justify-center bg-black/40 backdrop-blur-xs animate-fade-in"
    >
      <div
        className="bg-[#FBF5DD] border border-[#E7E1B1] w-full 
              max-w-sm rounded-xl p-5 shadow-2xl space-y-3 font-mono"
      >
        <div
          className="flex justify-between items-start 
                border-b border-[#E7E1B1]/60 pb-2"
        >
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Resource Quick-Peek ({quickViewConfig.namespace})
            </div>
            <h3 className="text-sm font-black text-[#0D530E] flex items-center gap-1.5 mt-0.5">
              <span>{quickViewConfig.type === "secret" ? "🔒" : "⚙️"}</span>
              <span>{quickViewConfig.name}</span>
            </h3>
          </div>
          <button
            onClick={() => setQuickViewConfig(null)}
            className="text-slate-400 hover:text-red-700 font-bold 
                  transition-colors text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* config content */}
        <div
          className="bg-white border border-[#E7E1B1] rounded-lg p-3 
                text-[11px] max-h-48 overflow-y-auto space-y-2"
        >
          {isLoadingQuickView ? (
            <div className="text-slate-400 italic py-4 text-center">
              Querying cluster configurations...
            </div>
          ) : quickViewData ? (
            Object.entries(quickViewData).map(([key, value]) => (
              <div
                key={key}
                className="border-b border-[#E7E1B1]/20 pb-1.5 last:border-0 last:pb-0"
              >
                <span className="text-[#306D29] font-bold block">{key}:</span>
                <span
                  className="text-slate-600 font-medium break-all 
                        block pl-2 bg-slate-50/50 rounded mt-0.5 py-0.5 px-1"
                >
                  {quickViewConfig.type === "secret"
                    ? "•••••••• (Encrypted Secret)"
                    : value}
                </span>
              </div>
            ))
          ) : (
            <div className="text-red-600 italic py-2 text-center">
              No data found or mapping dropped.
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={() => setQuickViewConfig(null)}
            className="px-3 py-1 text-[10px] font-bold bg-[#E7E1B1] 
                  hover:bg-[#E7E1B1]/60 text-[#0D530E] rounded-md 
                  transition-all cursor-pointer"
          >
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
}
