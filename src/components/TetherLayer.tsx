import React, { useState } from 'react';
import type { NodeSize, PortCorner, VaultEdge, VaultNode } from '../types/vault';
import { buildBezierPath, getClosestPorts, getPortPosition } from '../utils/geometry';

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
  wireDraft: WireDraft | null;
  dimmedNodeIds: Set<string>;
  onSeverEdge: (edgeId: string) => void;
}

export const TetherLayer: React.FC<TetherLayerProps> = ({
  nodes,
  edges,
  measuredSizes,
  magneticPreview,
  wireDraft,
  dimmedNodeIds,
  onSeverEdge,
}) => {
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const nodeMap = new Map<string, VaultNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 h-px w-px overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <filter id="tether-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Existing Tethers */}
      {edges.map((edge) => {
        const source = nodeMap.get(edge.sourceId);
        const target = nodeMap.get(edge.targetId);
        if (!source || !target) return null;

        const closest = getClosestPorts(source, target, measuredSizes);
        const sPort = edge.sourcePort ?? closest.sourcePort;
        const tPort = edge.targetPort ?? closest.targetPort;

        const p1 = getPortPosition(source, sPort, measuredSizes);
        const p2 = getPortPosition(target, tPort, measuredSizes);
        const { d, midX, midY } = buildBezierPath(p1, p2, sPort, tPort);

        const isHovered = hoveredEdgeId === edge.id;
        const isDimmed = dimmedNodeIds.has(edge.sourceId) && dimmedNodeIds.has(edge.targetId);

        return (
          <g
            key={edge.id}
            style={{ opacity: isDimmed ? 0.16 : 1, transition: 'opacity 200ms ease' }}
          >
            {/* Subtle base glow */}
            <path
              d={d}
              fill="none"
              stroke={isHovered ? 'rgba(244, 63, 94, 0.28)' : 'rgba(56, 189, 248, 0.10)'}
              strokeWidth={isHovered ? 7 : 5}
              strokeLinecap="round"
            />
            {/* Visible crisp bezier line */}
            <path
              d={d}
              fill="none"
              stroke={isHovered ? '#F43F5E' : 'rgba(148, 163, 184, 0.45)'}
              strokeWidth={isHovered ? 2.25 : 1.65}
              strokeLinecap="round"
              strokeDasharray={isHovered ? '5 4' : undefined}
            />
            {/* Endpoint dots */}
            <circle
              cx={p1.x}
              cy={p1.y}
              r={isHovered ? 3.5 : 2.5}
              fill={isHovered ? '#F43F5E' : '#38BDF8'}
              opacity={0.85}
            />
            <circle
              cx={p2.x}
              cy={p2.y}
              r={isHovered ? 3.5 : 2.5}
              fill={isHovered ? '#F43F5E' : '#38BDF8'}
              opacity={0.85}
            />
            {/* Wide invisible hit target for easy clicking to sever */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={18}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onMouseEnter={() => setHoveredEdgeId(edge.id)}
              onMouseLeave={() => setHoveredEdgeId((prev) => (prev === edge.id ? null : prev))}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSeverEdge(edge.id);
                setHoveredEdgeId(null);
              }}
            >
              <title>Click to sever tether</title>
            </path>

            {/* Snip indicator badge on hover */}
            {isHovered && (
              <g
                transform={`translate(${midX}, ${midY})`}
                style={{ pointerEvents: 'none' }}
              >
                <circle r={10} fill="#18181B" stroke="#F43F5E" strokeWidth={1.5} />
                <path
                  d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5"
                  stroke="#F43F5E"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                />
              </g>
            )}
          </g>
        );
      })}

      {/* Magnetic Proximity Preview Tether (< 220px) */}
      {magneticPreview && (() => {
        const source = nodeMap.get(magneticPreview.sourceId);
        const target = nodeMap.get(magneticPreview.targetId);
        if (!source || !target) return null;

        const { sourcePort, targetPort } = getClosestPorts(source, target, measuredSizes);
        const p1 = getPortPosition(source, sourcePort, measuredSizes);
        const p2 = getPortPosition(target, targetPort, measuredSizes);
        const { d } = buildBezierPath(p1, p2, sourcePort, targetPort);

        return (
          <g filter="url(#tether-glow)">
            <path
              d={d}
              fill="none"
              stroke="#38BDF8"
              strokeWidth={2}
              strokeDasharray="6 6"
              strokeLinecap="round"
              className="tether-magnetic-preview"
            />
            <circle cx={p1.x} cy={p1.y} r={4.5} fill="#38BDF8" />
            <circle cx={p2.x} cy={p2.y} r={4.5} fill="#38BDF8" />
            <circle
              cx={p2.x}
              cy={p2.y}
              r={9}
              fill="none"
              stroke="#38BDF8"
              strokeWidth={1.25}
              opacity={0.45}
            />
          </g>
        );
      })()}

      {/* Manual Port-Drag Wire Preview */}
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
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeDasharray={wireDraft.hoverTargetId ? undefined : '5 4'}
            />
            <circle cx={p1.x} cy={p1.y} r={4} fill={strokeColor} />
            <circle cx={p2.x} cy={p2.y} r={5} fill={strokeColor} />
          </g>
        );
      })()}
    </svg>
  );
};
