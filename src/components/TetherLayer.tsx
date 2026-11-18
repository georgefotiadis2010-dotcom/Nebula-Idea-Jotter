import React, { useMemo, useState } from 'react';
import type { NodeSize, PortCorner, VaultEdge, VaultNode } from '../types/vault';
import {
  buildBezierPath,
  buildTaperedRibbonPath,
  getClosestPorts,
  getNodeDimensions,
  getPortPosition,
} from '../utils/geometry';

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
  wireDraft,
  dimmedNodeIds,
  focusedClusterNodeIds,
  onSeverEdge,
  onUpdateEdgeLabel,
}) => {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');

  const nodeMap = useMemo(() => {
    const m = new Map<string, VaultNode>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  // Compute connected components for Shared Cluster Halos
  const clusters = useMemo(() => {
    const adj = new Map<string, string[]>();
    for (const n of nodes) adj.set(n.id, []);
    for (const e of edges) {
      if (!nodeMap.has(e.sourceId) || !nodeMap.has(e.targetId)) continue;
      adj.get(e.sourceId)?.push(e.targetId);
      adj.get(e.targetId)?.push(e.sourceId);
    }

    const visited = new Set<string>();
    const result: { nodes: VaultNode[]; color: string }[] = [];

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
        result.push({ nodes: comp, color });
      }
    }
    return result;
  }, [nodes, edges, nodeMap]);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <filter id="tether-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="cluster-halo-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="38" />
        </filter>

        {edges.map((edge) => {
          const source = nodeMap.get(edge.sourceId);
          const target = nodeMap.get(edge.targetId);
          if (!source || !target) return null;
          const closest = getClosestPorts(source, target, measuredSizes);
          const p1 = getPortPosition(source, edge.sourcePort ?? closest.sourcePort, measuredSizes);
          const p2 = getPortPosition(target, edge.targetPort ?? closest.targetPort, measuredSizes);
          return (
            <linearGradient
              key={`grad-${edge.id}`}
              id={`tether-grad-${edge.id}`}
              gradientUnits="userSpaceOnUse"
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
            >
              <stop offset="0%" stopColor={getNodeAccentColor(source)} stopOpacity={0.9} />
              <stop offset="100%" stopColor={getNodeAccentColor(target)} stopOpacity={0.9} />
            </linearGradient>
          );
        })}
      </defs>

      {/* Shared Fluid Cluster Halos behind connected card groups */}
      <g filter="url(#cluster-halo-blur)" className="cluster-halo">
        {clusters.map((cluster, idx) => {
          const anyHighlighted =
            focusedClusterNodeIds === null ||
            cluster.nodes.some((n) => focusedClusterNodeIds.has(n.id));
          return (
            <g key={idx} style={{ opacity: anyHighlighted ? 1 : 0.15, transition: 'opacity 240ms ease' }}>
              {cluster.nodes.map((n) => {
                const size = getNodeDimensions(n, measuredSizes);
                const pad = 42;
                return (
                  <rect
                    key={n.id}
                    x={n.x - pad}
                    y={n.y - pad}
                    width={size.width + pad * 2}
                    height={size.height + pad * 2}
                    rx={68}
                    fill={cluster.color}
                    fillOpacity={0.11}
                  />
                );
              })}
            </g>
          );
        })}
      </g>

      {/* Existing Tapered Ribbons, Elastic Curves & Labeled Pills */}
      {edges.map((edge) => {
        const source = nodeMap.get(edge.sourceId);
        const target = nodeMap.get(edge.targetId);
        if (!source || !target) return null;

        const closest = getClosestPorts(source, target, measuredSizes);
        const sPort = edge.sourcePort ?? closest.sourcePort;
        const tPort = edge.targetPort ?? closest.targetPort;

        const p1 = getPortPosition(source, sPort, measuredSizes);
        const p2 = getPortPosition(target, tPort, measuredSizes);
        const { d, midX, midY, c1, c2 } = buildBezierPath(p1, p2, sPort, tPort);

        const isDetaching = detachEdgeIds.has(edge.id);
        const isHovered = hoveredEdgeId === edge.id || editingEdgeId === edge.id || isDetaching;
        const isTitleEdge = source.type === 'title' || target.type === 'title';
        const startHalfW = source.type === 'title' ? 7 : isTitleEdge ? 2 : 3;
        const endHalfW = target.type === 'title' ? 7 : isTitleEdge ? 2 : 3;
        const ribbonD = isTitleEdge
          ? buildTaperedRibbonPath(p1, p2, c1, c2, startHalfW, endHalfW)
          : null;

        const isInCluster =
          focusedClusterNodeIds === null ||
          (focusedClusterNodeIds.has(edge.sourceId) && focusedClusterNodeIds.has(edge.targetId));
        const isDimmed =
          (dimmedNodeIds.has(edge.sourceId) && dimmedNodeIds.has(edge.targetId)) || !isInCluster;

        const c1Color = getNodeAccentColor(source);
        const c2Color = getNodeAccentColor(target);
        const isJustDocked = justDockedEdgeId === edge.id;

        return (
          <g
            key={edge.id}
            style={{ opacity: isDimmed ? 0.14 : 1, transition: 'opacity 200ms ease' }}
            onMouseEnter={() => setHoveredEdgeId(edge.id)}
            onMouseLeave={() => setHoveredEdgeId((prev) => (prev === edge.id ? null : prev))}
          >
            {/* Tapered soft ribbon fill when connected to a Big Idea Title */}
            {ribbonD && (
              <path
                d={ribbonD}
                fill={isHovered ? 'rgba(244, 63, 94, 0.22)' : `url(#tether-grad-${edge.id})`}
                fillOpacity={isHovered ? 1 : focusedClusterNodeIds ? 0.28 : 0.16}
              />
            )}

            {/* Ambient glow */}
            <path
              d={d}
              fill="none"
              stroke={isHovered ? 'rgba(244, 63, 94, 0.35)' : `url(#tether-grad-${edge.id})`}
              strokeOpacity={isHovered ? 1 : 0.24}
              strokeWidth={isHovered ? 8 : 6}
              strokeLinecap="round"
            />

            {/* Main gradient noodle */}
            <path
              d={d}
              fill="none"
              stroke={isHovered ? '#F43F5E' : `url(#tether-grad-${edge.id})`}
              strokeWidth={isHovered ? 2.5 : 2}
              strokeLinecap="round"
              strokeDasharray={isHovered ? '6 5' : undefined}
            />

            {/* Flowing light pulse along the noodle */}
            {!isHovered && (
              <path
                d={d}
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity={focusedClusterNodeIds ? 0.8 : 0.52}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeDasharray="3 18"
                className="tether-magnetic-preview"
              />
            )}

            {/* Fluid Dock Ripple-Bloom animation on new link */}
            {isJustDocked && (
              <g transform={`translate(${midX}, ${midY})`}>
                <circle
                  r={18}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth={2.5}
                  className="dock-ripple-ring"
                />
                <circle
                  r={12}
                  fill="none"
                  stroke="#F472B6"
                  strokeWidth={2}
                  className="dock-ripple-ring"
                />
              </g>
            )}

            {/* Glowing socket rings at endpoints */}
            <circle cx={p1.x} cy={p1.y} r={4.5} fill="#101218" stroke={isHovered ? '#F43F5E' : c1Color} strokeWidth={2} />
            <circle cx={p2.x} cy={p2.y} r={4.5} fill="#101218" stroke={isHovered ? '#F43F5E' : c2Color} strokeWidth={2} />

            {/* Wide invisible hit target */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={22}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setEditingEdgeId(edge.id);
                setDraftLabel(edge.label ?? '');
              }}
            />

            {/* Pull-to-detach badge */}
            {isDetaching && (
              <foreignObject x={midX - 55} y={midY - 14} width={110} height={28}>
                <div className="flex h-full items-center justify-center">
                  <span className="rounded-full border border-rose-400/50 bg-[#181218]/95 px-2.5 py-0.5 text-[10px] font-semibold text-rose-300 shadow-lg">
                    Release to detach
                  </span>
                </div>
              </foreignObject>
            )}

            {/* Midpoint Relationship Pill (shows existing label, or hover controls to label / snip) */}
            {!isDetaching && (edge.label || hoveredEdgeId === edge.id || editingEdgeId === edge.id) && (
              <foreignObject
                x={midX - 90}
                y={midY - 16}
                width={180}
                height={32}
                style={{ overflow: 'visible', pointerEvents: 'auto' }}
              >
                <div className="flex h-full items-center justify-center">
                  {editingEdgeId === edge.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        onUpdateEdgeLabel(edge.id, draftLabel.trim());
                        setEditingEdgeId(null);
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 rounded-full border border-sky-400/50 bg-[#151822]/95 px-2 py-0.5 shadow-lg backdrop-blur-md"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={draftLabel}
                        placeholder="inspires..."
                        onChange={(e) => setDraftLabel(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Escape') setEditingEdgeId(null);
                        }}
                        onBlur={() => {
                          onUpdateEdgeLabel(edge.id, draftLabel.trim());
                          setEditingEdgeId(null);
                        }}
                        className="w-24 bg-transparent text-center text-[11px] font-medium text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                      />
                    </form>
                  ) : (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 rounded-full border border-white/15 bg-[#151822]/90 px-2 py-0.5 text-[11px] font-medium text-zinc-200 shadow-md backdrop-blur-md"
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEdgeId(edge.id);
                          setDraftLabel(edge.label ?? '');
                        }}
                        title="Label this connection"
                        className="max-w-[110px] truncate px-1 text-[10.5px] text-zinc-200 hover:text-sky-300"
                      >
                        {edge.label || '+ label'}
                      </button>
                      {hoveredEdgeId === edge.id && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSeverEdge(edge.id);
                            setHoveredEdgeId(null);
                          }}
                          title="Snip connection"
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-rose-500/20 text-[10px] text-rose-300 hover:bg-rose-500/40"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </foreignObject>
            )}
          </g>
        );
      })}

      {/* Magnetic Dock Fluid Aura Preview */}
      {magneticPreview && (() => {
        const source = nodeMap.get(magneticPreview.sourceId);
        const target = nodeMap.get(magneticPreview.targetId);
        if (!source || !target) return null;

        const { sourcePort, targetPort } = getClosestPorts(source, target, measuredSizes);
        const p1 = getPortPosition(source, sourcePort, measuredSizes);
        const p2 = getPortPosition(target, targetPort, measuredSizes);
        const { d, midX, midY, c1, c2 } = buildBezierPath(p1, p2, sourcePort, targetPort);
        const ribbonD = buildTaperedRibbonPath(p1, p2, c1, c2, 8, 8);
        const targetSize = getNodeDimensions(target, measuredSizes);

        return (
          <g filter="url(#tether-glow)">
            {/* Fluid target dock halo */}
            <rect
              x={target.x - 14}
              y={target.y - 14}
              width={targetSize.width + 28}
              height={targetSize.height + 28}
              rx={26}
              fill="rgba(56, 189, 248, 0.08)"
              stroke="#38BDF8"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <path d={ribbonD} fill="rgba(56, 189, 248, 0.16)" />
            <path
              d={d}
              fill="none"
              stroke="#38BDF8"
              strokeWidth={2.5}
              strokeDasharray="6 6"
              strokeLinecap="round"
              className="tether-magnetic-preview"
            />
            <foreignObject x={midX - 50} y={midY - 14} width={100} height={28}>
              <div className="flex h-full items-center justify-center">
                <span className="rounded-full border border-sky-400/50 bg-[#121620]/95 px-2.5 py-0.5 text-[10px] font-semibold text-sky-200 shadow-lg">
                  Drop to dock
                </span>
              </div>
            </foreignObject>
          </g>
        );
      })()}

      {/* Manual Thread-Pin Wire Preview */}
      {wireDraft && (() => {
        const source = nodeMap.get(wireDraft.sourceId);
        if (!source) return null;

        const p1 = getPortPosition(source, wireDraft.sourcePort, measuredSizes);
        let p2 = wireDraft.cursorWorld;
        let targetPort: PortCorner | undefined;

        if (wireDraft.hoverTargetId) {
          const target = nodeMap.get(wireDraft.hoverTargetId);
          if (target) {
            const closest = getClosestPorts(source, target, measuredSizes);
            targetPort = closest.targetPort;
            p2 = getPortPosition(target, targetPort, measuredSizes);
          }
        }

        const { d } = buildBezierPath(p1, p2, wireDraft.sourcePort, targetPort);
        const strokeColor = wireDraft.hoverTargetId ? '#34D399' : '#38BDF8';

        return (
          <g filter="url(#tether-glow)">
            <path
              d={d}
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={wireDraft.hoverTargetId ? undefined : '5 4'}
            />
            <circle cx={p1.x} cy={p1.y} r={4.5} fill={strokeColor} />
            <circle cx={p2.x} cy={p2.y} r={5.5} fill={strokeColor} />
          </g>
        );
      })()}
    </svg>
  );
};
