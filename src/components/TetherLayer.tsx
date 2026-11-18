import React, { useMemo, useState } from 'react';
import type { NodeSize, PortCorner, VaultEdge, VaultNode } from '../types/vault';
import { getNodeDimensions } from '../utils/geometry';

export interface MagneticPreview {
  sourceId: string;
  targetId: string;
}

export interface WireDraft {
  sourceId: string;
  sourcePort: PortCorner;
  cursorWorld: { x: number; y: number };
  hoverTargetId: string | null;
}

interface TetherLayerProps {
  nodes: VaultNode[];
  edges: VaultEdge[];
  measuredSizes: Record<string, NodeSize>;
  magneticPreview: MagneticPreview | null;
  detachEdgeIds: Set<string>;
  justDockedEdgeId: string | null;
  wireDraft: WireDraft | null;
  dimmedNodeIds: Set<string>;
  focusedClusterNodeIds: Set<string> | null;
  onSeverEdge: (edgeId: string) => void;
  onUpdateEdgeLabel: (edgeId: string, label: string) => void;
}

function getNodeAccentColor(node: VaultNode): string {
  switch (node.type) {
    case 'title':
      return '#F472B6';
    case 'color':
      return node.hex;
    case 'link':
      return '#38BDF8';
    case 'image':
      return '#C084FC';
    case 'text':
      return node.monospace ? '#34D399' : '#FBBF24';
  }
}

export const TetherLayer: React.FC<TetherLayerProps> = ({
  nodes,
  edges,
  measuredSizes,
  magneticPreview,
  detachEdgeIds,
  justDockedEdgeId,
  dimmedNodeIds,
  focusedClusterNodeIds,
  onUpdateEdgeLabel,
}) => {
  const [editingClusterEdgeId, setEditingClusterEdgeId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');

  const nodeMap = useMemo(() => {
    const m = new Map<string, VaultNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // Compute connected components as Tether-Free Cluster Islands
  const clusters = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) {
      if (!nodeMap.has(e.sourceId) || !nodeMap.has(e.targetId)) continue;
      adj.get(e.sourceId)?.push(e.targetId);
      adj.get(e.targetId)?.push(e.sourceId);
    }

    const visited = new Set<string>();
    const result: {
      id: string;
      nodes: VaultNode[];
      color: string;
      primaryEdgeId: string | null;
      label?: string;
      bounds: { minX: number; minY: number; maxX: number; maxY: number };
    }[] = [];

    for (const n of nodes) {
      if (visited.has(n.id)) continue;
      const comp: VaultNode[] = [];
      const queue = [n.id];
      visited.add(n.id);

      while (queue.length > 0) {
        const currId = queue.shift()!;
        const curr = nodeMap.get(currId);
        if (curr) comp.push(curr);
        for (const nb of adj.get(currId) ?? []) {
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }

      if (comp.length >= 2) {
        const titleNode = comp.find((c) => c.type === 'title');
        const color = titleNode ? '#F472B6' : getNodeAccentColor(comp[0]);
        const compIds = new Set(comp.map((c) => c.id));
        const clusterEdges = edges.filter(
          (e) => compIds.has(e.sourceId) && compIds.has(e.targetId)
        );
        const labeledEdge = clusterEdges.find((e) => e.label) ?? clusterEdges[0] ?? null;

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const member of comp) {
          const sz = getNodeDimensions(member, measuredSizes);
          minX = Math.min(minX, member.x);
          minY = Math.min(minY, member.y);
          maxX = Math.max(maxX, member.x + sz.width);
          maxY = Math.max(maxY, member.y + sz.height);
        }

        result.push({
          id: comp.map((c) => c.id).sort().join('|'),
          nodes: comp,
          color,
          primaryEdgeId: labeledEdge?.id ?? null,
          label: labeledEdge?.label,
          bounds: { minX, minY, maxX, maxY },
        });
      }
    }
    return result;
  }, [nodes, edges, nodeMap, measuredSizes]);

  // Center point for newly docked ripple bloom
  const justDockedCenter = useMemo(() => {
    if (!justDockedEdgeId) return null;
    const edge = edges.find((e) => e.id === justDockedEdgeId);
    if (!edge) return null;
    const s = nodeMap.get(edge.sourceId);
    const t = nodeMap.get(edge.targetId);
    if (!s || !t) return null;
    const sSize = getNodeDimensions(s, measuredSizes);
    const tSize = getNodeDimensions(t, measuredSizes);
    return {
      x: (s.x + sSize.width / 2 + t.x + tSize.width / 2) / 2,
      y: (s.y + sSize.height / 2 + t.y + tSize.height / 2) / 2,
    };
  }, [justDockedEdgeId, edges, nodeMap, measuredSizes]);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <filter id="cluster-halo-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="34" />
        </filter>
      </defs>

      {/* Tether-Free Shared Cluster Islands */}
      {clusters.map((cluster) => {
        const anyHighlighted =
          focusedClusterNodeIds === null ||
          cluster.nodes.some((n) => focusedClusterNodeIds.has(n.id));
        const allDimmed = cluster.nodes.every((n) => dimmedNodeIds.has(n.id));
        const isDetachingAny = cluster.nodes.some((n) =>
          edges.some(
            (e) =>
              detachEdgeIds.has(e.id) &&
              (e.sourceId === n.id || e.targetId === n.id)
          )
        );

        const pad = 28;
        const bx = cluster.bounds.minX - pad;
        const by = cluster.bounds.minY - pad;
        const bw = cluster.bounds.maxX - cluster.bounds.minX + pad * 2;
        const bh = cluster.bounds.maxY - cluster.bounds.minY + pad * 2;

        return (
          <g
            key={cluster.id}
            style={{
              opacity: allDimmed ? 0.14 : anyHighlighted ? 1 : 0.18,
              transition: 'opacity 240ms ease',
            }}
          >
            {/* Soft ambient nebula glow behind cluster members */}
            <g filter="url(#cluster-halo-blur)" className="cluster-halo">
              {cluster.nodes.map((n) => {
                const size = getNodeDimensions(n, measuredSizes);
                const auraPad = 34;
                return (
                  <rect
                    key={n.id}
                    x={n.x - auraPad}
                    y={n.y - auraPad}
                    width={size.width + auraPad * 2}
                    height={size.height + auraPad * 2}
                    rx={56}
                    fill={isDetachingAny ? '#F43F5E' : cluster.color}
                    fillOpacity={0.14}
                  />
                );
              })}
            </g>

            {/* Clean translucent island boundary around the group (zero lines between cards) */}
            <rect
              x={bx}
              y={by}
              width={bw}
              height={bh}
              rx={32}
              fill={isDetachingAny ? 'rgba(244, 63, 94, 0.04)' : 'rgba(255, 255, 255, 0.02)'}
              stroke={isDetachingAny ? '#F43F5E' : cluster.color}
              strokeOpacity={isDetachingAny ? 0.55 : 0.24}
              strokeWidth={1.5}
              strokeDasharray={isDetachingAny ? '6 5' : undefined}
            />

            {/* Optional Cluster Label Pill perched on top of the island */}
            {cluster.primaryEdgeId && (
              <foreignObject
                x={bx + bw / 2 - 90}
                y={by - 14}
                width={180}
                height={28}
                style={{ overflow: 'visible', pointerEvents: 'auto' }}
              >
                <div className="flex h-full items-center justify-center">
                  {editingClusterEdgeId === cluster.primaryEdgeId ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        onUpdateEdgeLabel(cluster.primaryEdgeId!, draftLabel.trim());
                        setEditingClusterEdgeId(null);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="flex items-center rounded-full border border-sky-400/50 bg-[#151822]/95 px-2.5 py-0.5 shadow-lg backdrop-blur-md"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={draftLabel}
                        placeholder="cluster theme..."
                        onChange={(e) => setDraftLabel(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Escape') setEditingClusterEdgeId(null);
                        }}
                        onBlur={() => {
                          onUpdateEdgeLabel(cluster.primaryEdgeId!, draftLabel.trim());
                          setEditingClusterEdgeId(null);
                        }}
                        className="w-28 bg-transparent text-center text-[11px] font-medium text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingClusterEdgeId(cluster.primaryEdgeId);
                        setDraftLabel(cluster.label ?? '');
                      }}
                      title="Name this cluster"
                      className="rounded-full border border-white/12 bg-[#151822]/90 px-2.5 py-0.5 text-[10.5px] font-medium text-zinc-300 shadow-md backdrop-blur-md transition-colors hover:border-white/25 hover:text-white"
                    >
                      {isDetachingAny
                        ? 'Release to leave cluster'
                        : cluster.label || `${cluster.nodes.length} linked`}
                    </button>
                  )}
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}

      {/* Fluid Dock Ripple-Bloom animation when two cards join a cluster */}
      {justDockedCenter && (
        <g transform={`translate(${justDockedCenter.x}, ${justDockedCenter.y})`}>
          <circle
            r={26}
            fill="none"
            stroke="#38BDF8"
            strokeWidth={2.5}
            className="dock-ripple-ring"
          />
          <circle
            r={16}
            fill="none"
            stroke="#F472B6"
            strokeWidth={2}
            className="dock-ripple-ring"
          />
        </g>
      )}

      {/* Magnetic Dock Target Aura Preview (zero lines!) */}
      {magneticPreview && (() => {
        const target = nodeMap.get(magneticPreview.targetId);
        if (!target) return null;
        const targetSize = getNodeDimensions(target, measuredSizes);

        return (
          <g>
            <rect
              x={target.x - 16}
              y={target.y - 16}
              width={targetSize.width + 32}
              height={targetSize.height + 32}
              rx={28}
              fill="rgba(56, 189, 248, 0.1)"
              stroke="#38BDF8"
              strokeWidth={1.75}
              strokeDasharray="6 4"
            />
            <foreignObject
              x={target.x + targetSize.width / 2 - 55}
              y={target.y - 30}
              width={110}
              height={26}
            >
              <div className="flex h-full items-center justify-center">
                <span className="rounded-full border border-sky-400/50 bg-[#121620]/95 px-2.5 py-0.5 text-[10px] font-semibold text-sky-200 shadow-lg">
                  Drop to group
                </span>
              </div>
            </foreignObject>
          </g>
        );
      })()}
    </svg>
  );
};
