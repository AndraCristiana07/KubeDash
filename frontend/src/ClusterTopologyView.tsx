import React, { useState, useEffect } from "react";

interface TopologyNode {
  id: string;
  name: string;
  type: "ingress" | "service" | "deployment";
  namespace: string;
}

interface TopologyLink {
  source: string;
  target: string;
}

export default function ClusterTopologyView({
  goApiUrl,
  activeNamespace,
}: {
  goApiUrl: string;
  activeNamespace: string;
}) {
  const [nodes, setNodes] = useState<TopologyNode[]>([]);
  const [links, setLinks] = useState<TopologyLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    const fetchTopology = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${goApiUrl}/api/cluster/topology?namespace=${activeNamespace}`,
        );
        const data = await res.json();
        setNodes(data.nodes || []);
        setLinks(data.links || []);
      } catch (err) {
        console.error("Topology mapping breakdown:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTopology();
  }, [activeNamespace, goApiUrl]);

  if (loading) {
    return (
      <div className="p-12 text-center text-xs font-mono text-[#306D29] animate-pulse">
        Assembling cluster network tier map...
      </div>
    );
  }

  // group nodes by type
  const ingresses = nodes.filter((n) => n.type === "ingress");
  const services = nodes.filter((n) => n.type === "service");
  const deployments = nodes.filter((n) => n.type === "deployment");

  // map coordinates inside canvas
  const nodePositions: Record<string, { x: number; y: number }> = {};
  const heightBound = 400;

  ingresses.forEach((n, i) => {
    nodePositions[n.id] = {
      x: 100,
      y: ((i + 1) * heightBound) / (ingresses.length + 1),
    };
  });
  services.forEach((n, i) => {
    nodePositions[n.id] = {
      x: 400,
      y: ((i + 1) * heightBound) / (services.length + 1),
    };
  });
  deployments.forEach((n, i) => {
    nodePositions[n.id] = {
      x: 700,
      y: ((i + 1) * heightBound) / (deployments.length + 1),
    };
  });

  return (
    <div className="w-full bg-white border border-[#E7E1B1] rounded-xl p-6 shadow-2xs text-[#0D530E]">
      <div className="mb-4">
        <h3 className="text-sm font-bold tracking-tight">
          Active Infrastructure Architecture Dependency Model
        </h3>
        <p className="text-[11px] text-slate-400 font-mono">
          Ingress Routing Matrix ── Service Endpoints ── Deployment Control
          Layers
        </p>
      </div>

      <div className="relative overflow-x-auto border border-[#E7E1B1]/40 rounded-lg bg-[#FBF5DD]/10 p-2">
        <svg
          viewBox="0 0 800 400"
          className="w-full max-w-4xl h-auto block select-none"
        >
          {/* connextor paths */}
          {links.map((link, idx) => {
            const start = nodePositions[link.source];
            const end = nodePositions[link.target];
            if (!start || !end) return null;

            const isHighlighted =
              hoveredNode === link.source || hoveredNode === link.target;

            return (
              <path
                key={idx}
                d={`M ${start.x} ${start.y} C ${(start.x + end.x) / 2} ${start.y}, ${(start.x + end.x) / 2} ${end.y}, ${end.x} ${end.y}`}
                fill="none"
                stroke={isHighlighted ? "#0D530E" : "#E7E1B1"}
                strokeWidth={isHighlighted ? "2.5" : "1.25"}
                className="transition-all duration-200"
                strokeDasharray={
                  link.source.startsWith("ing") ? "4 4" : undefined
                }
              />
            );
          })}

          {/* nodes */}
          {nodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;

            const isTypeColor =
              node.type === "ingress"
                ? "fill-purple-500 stroke-purple-600"
                : node.type === "service"
                  ? "fill-sky-500 stroke-sky-600"
                  : "fill-emerald-500 stroke-emerald-600";

            const isFaded = hoveredNode !== null && hoveredNode !== node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="cursor-pointer transition-opacity duration-200"
                style={{ opacity: isFaded ? 0.35 : 1 }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <circle r="7" className={`${isTypeColor} stroke-2`} />
                <text
                  y="-12"
                  textAnchor="middle"
                  className="font-mono text-[10px] font-bold fill-slate-700 pointer-events-none drop-shadow-xs"
                >
                  {node.name}
                </text>
                <text
                  y="18"
                  textAnchor="middle"
                  className="font-mono text-[8px] uppercase tracking-wider fill-slate-400 pointer-events-none"
                >
                  {node.type}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
