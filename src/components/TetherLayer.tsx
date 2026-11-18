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
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
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
              <stop offset="0%" stopColor={getNodeAccentColor(source)} stopOpacity={0.85} />
              <stop offset="100%" stopColor={getNodeAccentColor(target)} stopOpacity={0.85} />
            </linearGradient>
          );
        })}
      </defs>

      {/* Existing Gradient & Flowing Pulse Tethers */}
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
        const c1 = getNodeAccentColor(source);
        const c2 = getNodeAccentColor(target);

        return (
          <g
            key={edge.id}
            style={{ opacity: isDimmed ? 0.14 : 1, transition: 'opacity 200ms ease' }}
          >
            {/* Soft ambient halo */}
            <path
              d={d}
              fill="none"
              stroke={isHovered ? 'rgba(244, 63, 94, 0.32)' : `url(#tether-grad-${edge.id})`}
              strokeOpacity={isHovered ? 1 : 0.2}
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
              strokeDasharray={isHovered ? '5 4' : undefined}
            />
            {/* Flowing light pulse along the noodle */}
            {!isHovered && (
              <path
                d={d}
                fill="none"
                stroke="#FFFFFF"
                strokeOpacity={0.55}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeDasharray="3 18"
                className="tether-magnetic-preview"
              />
            )}
            {/* Glowing socket rings at endpoints */}
            <circle cx={p1.x} cy={p1.y} r={4.5} fill="#101218" stroke={isHovered ? '#F43F5E' : c1} strokeWidth={2} />
            <circle cx={p2.x} cy={p2.y} r={4.5} fill="#101218" stroke={isHovered ? '#F43F5E' : c2} strokeWidth={2} />

            {/* Wide invisible hit target for easy clicking to sever */}
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={20}
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onMouseEnter={() => setHoveredEdgeId(edge.id)}
              onMouseLeave={() => setHoveredEdgeId((prev) => (prev === edge.id ? null : prev))}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onSeverEdge(edge.id);
                setHoveredEdgeId(null);
              }}
            >
              <title>Click to snip connection</title>
            </path>

            {/* Snip indicator badge on hover */}
            {isHovered && (
              <g transform={`translate(${midX}, ${midY})`} style={{ pointerEvents: 'none' }}>
                <circle r={11} fill="#18181B" stroke="#F43F5E" strokeWidth={1.75} />
                <path
                  d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5"
                  stroke="#F43F5E"
                  strokeWidth={1.75}
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
              strokeWidth={2.25}
              strokeDasharray="6 6"
              strokeLinecap="round"
              className="tether-magnetic-preview"
            />
            <circle cx={p1.x} cy={p1.y} r={5} fill="#38BDF8" />
            <circle cx={p2.x} cy={p2.y} r={5} fill="#38BDF8" />
            <circle cx={p2.x} cy={p2.y} r={10} fill="none" stroke="#38BDF8" strokeWidth={1.25} opacity={0.45} />
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
