import type { NodeSize, PortCorner, VaultNode, ViewportState } from '../types/vault';

export const MAGNETIC_THRESHOLD = 220;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: ViewportState
): { x: number; y: number } {
  return {
    x: (screenX - viewport.x) / viewport.zoom,
    y: (screenY - viewport.y) / viewport.zoom,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  viewport: ViewportState
): { x: number; y: number } {
  return {
    x: worldX * viewport.zoom + viewport.x,
    y: worldY * viewport.zoom + viewport.y,
  };
}

export function getNodeDimensions(
  node: VaultNode,
  measuredSizes: Record<string, NodeSize>
): NodeSize {
  const measured = measuredSizes[node.id];
  if (measured && measured.width > 0 && measured.height > 0) {
    return measured;
  }
  const fallbackHeight =
    node.height ??
    (node.type === 'color' ? 148 : node.type === 'link' ? 124 : node.type === 'image' ? 220 : 140);
  return {
    width: node.width || 280,
    height: fallbackHeight,
  };
}

export function getPortPosition(
  node: VaultNode,
  port: PortCorner,
  measuredSizes: Record<string, NodeSize>
): { x: number; y: number } {
  const { width, height } = getNodeDimensions(node, measuredSizes);
  switch (port) {
    case 'tl':
    case 'bl':
      return { x: node.x, y: node.y + height / 2 };
    case 'tr':
    case 'br':
      return { x: node.x + width, y: node.y + height / 2 };
  }
}

/** Shortest Euclidean distance between two node bounding boxes */
export function getNodesBoundingDistance(
  a: VaultNode,
  b: VaultNode,
  measuredSizes: Record<string, NodeSize>
): number {
  const sizeA = getNodeDimensions(a, measuredSizes);
  const sizeB = getNodeDimensions(b, measuredSizes);

  const dx = Math.max(0, a.x - (b.x + sizeB.width), b.x - (a.x + sizeA.width));
  const dy = Math.max(0, a.y - (b.y + sizeB.height), b.y - (a.y + sizeA.height));

  return Math.hypot(dx, dy);
}

/** Pick the closest pair of corner ports between two nodes */
export function getClosestPorts(
  a: VaultNode,
  b: VaultNode,
  measuredSizes: Record<string, NodeSize>
): { sourcePort: PortCorner; targetPort: PortCorner; distance: number } {
  const corners: PortCorner[] = ['tl', 'tr', 'bl', 'br'];
  let bestSource: PortCorner = 'tr';
  let bestTarget: PortCorner = 'tl';
  let bestDist = Infinity;

  for (const sp of corners) {
    const p1 = getPortPosition(a, sp, measuredSizes);
    for (const tp of corners) {
      const p2 = getPortPosition(b, tp, measuredSizes);
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestSource = sp;
        bestTarget = tp;
      }
    }
  }

  return { sourcePort: bestSource, targetPort: bestTarget, distance: bestDist };
}

function portDirection(port?: PortCorner): { dx: number; dy: number } {
  switch (port) {
    case 'tl':
      return { dx: -1, dy: -0.6 };
    case 'tr':
      return { dx: 1, dy: -0.6 };
    case 'bl':
      return { dx: -1, dy: 0.6 };
    case 'br':
      return { dx: 1, dy: 0.6 };
    default:
      return { dx: 0, dy: 0 };
  }
}

export function buildBezierPath(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  port1?: PortCorner,
  port2?: PortCorner
): { d: string; midX: number; midY: number } {
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const tension = Math.min(140, Math.max(44, dist * 0.38));

  let c1x: number;
  let c1y: number;
  let c2x: number;
  let c2y: number;

  if (port1) {
    const dir1 = portDirection(port1);
    c1x = p1.x + dir1.dx * tension;
    c1y = p1.y + dir1.dy * tension * 0.5;
  } else {
    const dx = p2.x - p1.x;
    c1x = p1.x + dx * 0.4;
    c1y = p1.y;
  }

  if (port2) {
    const dir2 = portDirection(port2);
    c2x = p2.x + dir2.dx * tension;
    c2y = p2.y + dir2.dy * tension * 0.5;
  } else {
    const dx = p2.x - p1.x;
    c2x = p2.x - dx * 0.4;
    c2y = p2.y;
  }

  const d = `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;

  // Cubic Bezier midpoint at t = 0.5
  const midX = 0.125 * p1.x + 0.375 * c1x + 0.375 * c2x + 0.125 * p2.x;
  const midY = 0.125 * p1.y + 0.375 * c1y + 0.375 * c2y + 0.125 * p2.y;

  return { d, midX, midY };
}
