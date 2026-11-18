import React, { useRef, useState } from 'react';
import { ChevronDown, Map as MapIcon } from 'lucide-react';
import type { NodeSize, VaultEdge, VaultNode, ViewportState } from '../types/vault';
import { getNodeDimensions } from '../utils/geometry';

interface MinimapProps {
  nodes: VaultNode[];
  edges: VaultEdge[];
  measuredSizes: Record<string, NodeSize>;
  viewport: ViewportState;
  containerSize: { width: number; height: number };
  onPanToWorld: (worldX: number, worldY: number) => void;
}

const MAP_W = 196;
const MAP_H = 128;

export const Minimap: React.FC<MinimapProps> = ({
  nodes,
  edges,
  measuredSizes,
  viewport,
  containerSize,
  onPanToWorld,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Compute world bounds covering both all nodes and the current viewport
  const vpWorldLeft = -viewport.x / viewport.zoom;
  const vpWorldTop = -viewport.y / viewport.zoom;
  const vpWorldW = containerSize.width / viewport.zoom;
  const vpWorldH = containerSize.height / viewport.zoom;

  let minX = vpWorldLeft;
  let minY = vpWorldTop;
  let maxX = vpWorldLeft + vpWorldW;
  let maxY = vpWorldTop + vpWorldH;

  for (const n of nodes) {
    const size = getNodeDimensions(n, measuredSizes);
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + size.width);
    maxY = Math.max(maxY, n.y + size.height);
  }

  const pad = 160;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  const worldW = Math.max(1, maxX - minX);
  const worldH = Math.max(1, maxY - minY);
  const scale = Math.min(MAP_W / worldW, MAP_H / worldH);

  const offsetX = (MAP_W - worldW * scale) / 2;
  const offsetY = (MAP_H - worldH * scale) / 2;

  const toMapX = (wx: number) => offsetX + (wx - minX) * scale;
  const toMapY = (wy: number) => offsetY + (wy - minY) * scale;

  const panFromPointer = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const wx = (mx - offsetX) / scale + minX;
    const wy = (my - offsetY) / scale + minY;
    onPanToWorld(wx, wy);
  };

  const nodeMap = new Map<string, VaultNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  return (
    <aside
      aria-label="Canvas minimap"
      className="glass-bubble fixed bottom-4 right-4 z-40 overflow-hidden rounded-[24px] border border-white/[0.12]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-2.5 py-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
          <MapIcon className="h-3 w-3 text-sky-400" aria-hidden="true" />
          Minimap
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand minimap' : 'Collapse minimap'}
          className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {!collapsed && (
        <svg
          ref={svgRef}
          width={MAP_W}
          height={MAP_H}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            panFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
            e.stopPropagation();
            panFromPointer(e.clientX, e.clientY);
          }}
          className="block cursor-crosshair bg-[#0B0D10]/70"
        >
          {/* Tethers */}
          {edges.map((edge) => {
            const s = nodeMap.get(edge.sourceId);
            const t = nodeMap.get(edge.targetId);
            if (!s || !t) return null;
            const sSize = getNodeDimensions(s, measuredSizes);
            const tSize = getNodeDimensions(t, measuredSizes);
            return (
              <line
                key={edge.id}
                x1={toMapX(s.x + sSize.width / 2)}
                y1={toMapY(s.y + sSize.height / 2)}
                x2={toMapX(t.x + tSize.width / 2)}
                y2={toMapY(t.y + tSize.height / 2)}
                stroke="rgba(148, 163, 184, 0.35)"
                strokeWidth={1}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((n) => {
            const size = getNodeDimensions(n, measuredSizes);
            const fill =
              n.type === 'color'
                ? n.hex
                : n.type === 'link'
                  ? '#38BDF8'
                  : n.type === 'image'
                    ? '#A78BFA'
                    : '#71717A';

            return (
              <rect
                key={n.id}
                x={toMapX(n.x)}
                y={toMapY(n.y)}
                width={Math.max(4, size.width * scale)}
                height={Math.max(3, size.height * scale)}
                rx={1.5}
                fill={fill}
                fillOpacity={0.85}
              />
            );
          })}

          {/* Current Viewport Bounds */}
          <rect
            x={toMapX(vpWorldLeft)}
            y={toMapY(vpWorldTop)}
            width={Math.max(8, vpWorldW * scale)}
            height={Math.max(8, vpWorldH * scale)}
            fill="rgba(56, 189, 248, 0.08)"
            stroke="#38BDF8"
            strokeWidth={1.2}
            rx={2}
          />
        </svg>
      )}
    </aside>
  );
};
