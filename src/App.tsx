import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import { CommandBar } from './components/CommandBar';
import { Minimap } from './components/Minimap';
import { NodeCard } from './components/NodeCard';
import { TetherLayer, type MagneticPreview, type WireDraft } from './components/TetherLayer';
import type {
  FilterType,
  NodeSize,
  PortCorner,
  VaultBoardData,
  VaultEdge,
  VaultNode,
  ViewportState,
} from './types/vault';
import {
  fileToDataUrl,
  getImageDimensions,
  looksLikeCode,
  parseHexColor,
  parseUrlPayload,
} from './utils/clipboard';
import {
  clampZoom,
  getClosestPorts,
  getNodeDimensions,
  getNodesBoundingDistance,
  screenToWorld,
} from './utils/geometry';

const DOCK_THRESHOLD = 190;
const DETACH_THRESHOLD = 520;
import { getSoundMuted, playPop, playSnap, playSnip, setSoundMuted } from './utils/sound';
import {
  createStarterBoard,
  exportBoardJson,
  loadBoard,
  parseImportedBoardJson,
  saveBoard,
} from './utils/storage';

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable;
}

export function App() {
  const [nodes, setNodes] = useState<VaultNode[]>([]);
  const [edges, setEdges] = useState<VaultEdge[]>([]);
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const [isLoaded, setIsLoaded] = useState(false);

  const [measuredSizes, setMeasuredSizes] = useState<Record<string, NodeSize>>({});
  const [containerSize, setContainerSize] = useState({ width: 1280, height: 800 });

  // Search & filter
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Audio mute
  const [isMuted, setIsMuted] = useState(() => getSoundMuted());

  // View mode & smooth viewport easing
  const [viewMode, setViewMode] = useState<'canvas' | 'grid'>('canvas');
  const [isSmoothViewport, setIsSmoothViewport] = useState(false);
  const [hoveredTitleId, setHoveredTitleId] = useState<string | null>(null);

  // Interactions
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [magneticPreview, setMagneticPreview] = useState<MagneticPreview | null>(null);
  const [detachEdgeIds, setDetachEdgeIds] = useState<Set<string>>(() => new Set());
  const [justDockedEdgeId, setJustDockedEdgeId] = useState<string | null>(null);
  const [wireDraft, setWireDraft] = useState<WireDraft | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [autoFocusNodeId, setAutoFocusNodeId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const lastCursorScreenRef = useRef<{ x: number; y: number } | null>(null);
  const dragOffsetRef = useRef<{ nodeId: string; offsetX: number; offsetY: number } | null>(null);
  const panStartRef = useRef<{ startX: number; startY: number; vpX: number; vpY: number } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Refs for latest state inside event listeners
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(viewport);
  const measuredSizesRef = useRef(measuredSizes);
  const magneticPreviewRef = useRef(magneticPreview);
  const detachEdgeIdsRef = useRef(detachEdgeIds);
  const dockRippleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
    viewportRef.current = viewport;
    measuredSizesRef.current = measuredSizes;
    magneticPreviewRef.current = magneticPreview;
    detachEdgeIdsRef.current = detachEdgeIds;
  }, [nodes, edges, viewport, measuredSizes, magneticPreview, detachEdgeIds]);

  const triggerDockRipple = useCallback((edgeId: string) => {
    setJustDockedEdgeId(edgeId);
    if (dockRippleTimerRef.current) window.clearTimeout(dockRippleTimerRef.current);
    dockRippleTimerRef.current = window.setTimeout(() => setJustDockedEdgeId(null), 720);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 2400);
  }, []);

  // Load persisted board on mount
  useEffect(() => {
    loadBoard().then((data) => {
      setNodes(data.nodes);
      setEdges(data.edges);
      setViewport(data.viewport);
      setIsLoaded(true);
    });
  }, []);

  // Auto-save board (debounced 250ms)
  useEffect(() => {
    if (!isLoaded) return;
    const timer = window.setTimeout(() => {
      const data: VaultBoardData = {
        version: 1,
        nodes,
        edges,
        viewport,
      };
      saveBoard(data);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [nodes, edges, viewport, isLoaded]);

  // Track canvas container dimensions
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mouse-anchored wheel zoom (0.25x to 2.5x)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      setViewport((prev) => {
        const factor = Math.exp(-e.deltaY * 0.0018);
        const nextZoom = clampZoom(prev.zoom * factor);
        if (nextZoom === prev.zoom) return prev;

        const wx = (mx - prev.x) / prev.zoom;
        const wy = (my - prev.y) / prev.zoom;

        return {
          x: mx - wx * nextZoom,
          y: my - wy * nextZoom,
          zoom: nextZoom,
        };
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Spacebar panning & Cmd/Ctrl+K search shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (e.code === 'Space' && !e.repeat && !isEditableElement(document.activeElement)) {
        e.preventDefault();
        setSpacePressed(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
      }
    };

    const onBlur = () => setSpacePressed(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const getSpawnWorldPoint = useCallback((clientPos?: { x: number; y: number }) => {
    const el = canvasRef.current;
    const rect = el?.getBoundingClientRect() ?? { left: 0, top: 0, width: 1280, height: 800 };
    const pt = clientPos ?? lastCursorScreenRef.current ?? {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    return screenToWorld(pt.x - rect.left, pt.y - rect.top, viewportRef.current);
  }, []);

  // Smart Clipboard Paste (Cmd/Ctrl + V)
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (isEditableElement(document.activeElement)) return;

      const clipboard = e.clipboardData;
      if (!clipboard) return;

      const worldPt = getSpawnWorldPoint();
      const now = Date.now();

      // 1. Check for pasted image files/screenshots
      const imageFile = Array.from(clipboard.files || []).find((f) => f.type.startsWith('image/'));
      if (imageFile) {
        e.preventDefault();
        try {
          const dataUrl = await fileToDataUrl(imageFile);
          const dims = await getImageDimensions(dataUrl);
          const targetW = Math.min(380, Math.max(220, dims.width));
          const newNode: VaultNode = {
            id: makeId('img'),
            type: 'image',
            x: Math.round(worldPt.x - targetW / 2),
            y: Math.round(worldPt.y - 100),
            width: targetW,
            dataUrl,
            fileName: imageFile.name || 'Pasted Screenshot',
            naturalWidth: dims.width,
            naturalHeight: dims.height,
            createdAt: now,
            updatedAt: now,
          };
          setNodes((prev) => [...prev, newNode]);
          playPop();
          showToast('Spawned image frame');
        } catch {
          showToast('Could not read pasted image');
        }
        return;
      }

      // 2. Check plain text payload
      const text = clipboard.getData('text/plain');
      if (!text || !text.trim()) return;

      e.preventDefault();

      // Hex color?
      const hex = parseHexColor(text);
      if (hex) {
        const newNode: VaultNode = {
          id: makeId('clr'),
          type: 'color',
          x: Math.round(worldPt.x - 110),
          y: Math.round(worldPt.y - 70),
          width: 220,
          hex,
          label: 'Color Swatch',
          createdAt: now,
          updatedAt: now,
        };
        setNodes((prev) => [...prev, newNode]);
        playPop();
        showToast(`Spawned swatch ${hex}`);
        return;
      }

      // URL?
      const link = parseUrlPayload(text);
      if (link) {
        const newNode: VaultNode = {
          id: makeId('lnk'),
          type: 'link',
          x: Math.round(worldPt.x - 140),
          y: Math.round(worldPt.y - 60),
          width: 280,
          url: link.url,
          domain: link.domain,
          title: link.title,
          createdAt: now,
          updatedAt: now,
        };
        setNodes((prev) => [...prev, newNode]);
        playPop();
        showToast(`Spawned bookmark (${link.domain})`);
        return;
      }

      // Text / Code / Lyrics
      const isCode = looksLikeCode(text);
      const newNode: VaultNode = {
        id: makeId('txt'),
        type: 'text',
        x: Math.round(worldPt.x - 150),
        y: Math.round(worldPt.y - 65),
        width: isCode ? 340 : 290,
        content: text,
        monospace: isCode,
        createdAt: now,
        updatedAt: now,
      };
      setNodes((prev) => [...prev, newNode]);
      playPop();
      showToast(isCode ? 'Spawned code snippet' : 'Spawned text note');
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [getSpawnWorldPoint, showToast]);

  // Node measurement callback
  const handleMeasureNode = useCallback((nodeId: string, size: NodeSize) => {
    setMeasuredSizes((prev) => {
      const existing = prev[nodeId];
      if (existing && existing.width === size.width && existing.height === size.height) {
        return prev;
      }
      return { ...prev, [nodeId]: size };
    });
  }, []);

  // Node CRUD
  const handleUpdateNode = useCallback((nodeId: string, patch: Partial<VaultNode>) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? ({ ...n, ...patch, updatedAt: Date.now() } as VaultNode) : n))
    );
  }, []);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId));
    playSnip();
  }, []);

  const handleSeverEdge = useCallback((edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    playSnip();
  }, []);

  const handleUpdateEdgeLabel = useCallback((edgeId: string, label: string) => {
    setEdges((prev) =>
      prev.map((e) => (e.id === edgeId ? { ...e, label: label || undefined } : e))
    );
  }, []);

  const handleDetachNode = useCallback(
    (nodeId: string) => {
      setEdges((prev) => prev.filter((e) => e.sourceId !== nodeId && e.targetId !== nodeId));
      playSnip();
      showToast('Detached from cluster');
    },
    [showToast]
  );

  const hasEdgeBetween = useCallback((aId: string, bId: string) => {
    return edgesRef.current.some(
      (e) =>
        (e.sourceId === aId && e.targetId === bId) ||
        (e.sourceId === bId && e.targetId === aId)
    );
  }, []);

  // Node Dragging & Magnetic Proximity Linking (<= 220px)
  const handleStartNodeDrag = useCallback((nodeId: string, clientX: number, clientY: number) => {
    const el = canvasRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const worldPt = screenToWorld(clientX - rect.left, clientY - rect.top, viewportRef.current);
    const node = nodesRef.current.find((n) => n.id === nodeId);
    if (!node) return;

    dragOffsetRef.current = {
      nodeId,
      offsetX: worldPt.x - node.x,
      offsetY: worldPt.y - node.y,
    };
    setDraggingNodeId(nodeId);
  }, []);

  const handleMoveNodeDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragOffsetRef.current;
      const el = canvasRef.current;
      if (!drag || !el) return;

      const rect = el.getBoundingClientRect();
      const worldPt = screenToWorld(clientX - rect.left, clientY - rect.top, viewportRef.current);
      const nextX = Math.round(worldPt.x - drag.offsetX);
      const nextY = Math.round(worldPt.y - drag.offsetY);

      let draggedNode: VaultNode | null = null;
      const updatedNodes = nodesRef.current.map((n) => {
        if (n.id === drag.nodeId) {
          draggedNode = { ...n, x: nextX, y: nextY };
          return draggedNode;
        }
        return n;
      });
      setNodes(updatedNodes);

      if (draggedNode) {
        // 1. Magnetic Dock preview: find closest unconnected card within DOCK_THRESHOLD
        let bestTargetId: string | null = null;
        let bestDist = Infinity;
        for (const other of updatedNodes) {
          if (other.id === drag.nodeId) continue;
          if (hasEdgeBetween(drag.nodeId, other.id)) continue;
          const dist = getNodesBoundingDistance(draggedNode, other, measuredSizesRef.current);
          if (dist <= DOCK_THRESHOLD && dist < bestDist) {
            bestDist = dist;
            bestTargetId = other.id;
          }
        }
        setMagneticPreview(
          bestTargetId ? { sourceId: drag.nodeId, targetId: bestTargetId } : null
        );

        // 2. Pull-to-Detach preview: any existing edge stretched past DETACH_THRESHOLD
        const toDetach = new Set<string>();
        for (const e of edgesRef.current) {
          if (e.sourceId !== drag.nodeId && e.targetId !== drag.nodeId) continue;
          const otherId = e.sourceId === drag.nodeId ? e.targetId : e.sourceId;
          const other = updatedNodes.find((n) => n.id === otherId);
          if (!other) continue;
          const dist = getNodesBoundingDistance(draggedNode, other, measuredSizesRef.current);
          if (dist > DETACH_THRESHOLD) {
            toDetach.add(e.id);
          }
        }
        setDetachEdgeIds(toDetach);
      }
    },
    [hasEdgeBetween]
  );

  const handleEndNodeDrag = useCallback(() => {
    const detachIds = detachEdgeIdsRef.current;
    if (detachIds.size > 0) {
      setEdges((prev) => prev.filter((e) => !detachIds.has(e.id)));
      playSnip();
      showToast('Detached from cluster');
    }

    const preview = magneticPreviewRef.current;
    if (preview) {
      const source = nodesRef.current.find((n) => n.id === preview.sourceId);
      const target = nodesRef.current.find((n) => n.id === preview.targetId);
      if (source && target && !hasEdgeBetween(source.id, target.id)) {
        const { sourcePort, targetPort } = getClosestPorts(
          source,
          target,
          measuredSizesRef.current
        );
        const newEdge: VaultEdge = {
          id: makeId('edge'),
          sourceId: source.id,
          targetId: target.id,
          sourcePort,
          targetPort,
          createdAt: Date.now(),
        };
        setEdges((prev) => [...prev, newEdge]);
        triggerDockRipple(newEdge.id);
        playSnap();
      }
    }

    dragOffsetRef.current = null;
    setDraggingNodeId(null);
    setMagneticPreview(null);
    setDetachEdgeIds(new Set());
  }, [hasEdgeBetween, showToast, triggerDockRipple]);

  // Manual Corner-Port Wiring
  const handleStartWire = useCallback(
    (sourceId: string, sourcePort: PortCorner, clientX: number, clientY: number) => {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cursorWorld = screenToWorld(
        clientX - rect.left,
        clientY - rect.top,
        viewportRef.current
      );

      setWireDraft({ sourceId, sourcePort, cursorWorld, hoverTargetId: null });

      const onMove = (ev: PointerEvent) => {
        const pt = screenToWorld(
          ev.clientX - rect.left,
          ev.clientY - rect.top,
          viewportRef.current
        );
        const hitEl = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetCard = hitEl?.closest<HTMLElement>('[data-node-id]');
        const candidateId = targetCard?.dataset.nodeId ?? null;
        const hoverTargetId =
          candidateId && candidateId !== sourceId && !hasEdgeBetween(sourceId, candidateId)
            ? candidateId
            : null;

        setWireDraft({ sourceId, sourcePort, cursorWorld: pt, hoverTargetId });
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);

        const hitEl = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetCard = hitEl?.closest<HTMLElement>('[data-node-id]');
        const targetId = targetCard?.dataset.nodeId ?? null;

        if (targetId && targetId !== sourceId && !hasEdgeBetween(sourceId, targetId)) {
          const source = nodesRef.current.find((n) => n.id === sourceId);
          const target = nodesRef.current.find((n) => n.id === targetId);
          if (source && target) {
            const closest = getClosestPorts(source, target, measuredSizesRef.current);
            const newEdge: VaultEdge = {
              id: makeId('edge'),
              sourceId,
              targetId,
              sourcePort,
              targetPort: closest.targetPort,
              createdAt: Date.now(),
            };
            setEdges((prev) => [...prev, newEdge]);
            triggerDockRipple(newEdge.id);
            playSnap();
          }
        }
        setWireDraft(null);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [hasEdgeBetween, triggerDockRipple]
  );

  // Canvas Panning (empty-canvas drag, Space+Drag, or middle-mouse drag)
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    lastCursorScreenRef.current = { x: e.clientX, y: e.clientY };

    const isMiddle = e.button === 1;
    const isLeftPan = e.button === 0 && (spacePressed || e.target === e.currentTarget);
    if (!isMiddle && !isLeftPan) return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    panStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      vpX: viewport.x,
      vpY: viewport.y,
    };
    setIsPanning(true);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    lastCursorScreenRef.current = { x: e.clientX, y: e.clientY };
    if (!panStartRef.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return;

    const dx = e.clientX - panStartRef.current.startX;
    const dy = e.clientY - panStartRef.current.startY;
    setViewport((prev) => ({
      ...prev,
      x: panStartRef.current!.vpX + dx,
      y: panStartRef.current!.vpY + dy,
    }));
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panStartRef.current) {
      panStartRef.current = null;
      setIsPanning(false);
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Double-click empty canvas to spawn a blank editable text node
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const worldPt = getSpawnWorldPoint({ x: e.clientX, y: e.clientY });
    const now = Date.now();
    const newNode: VaultNode = {
      id: makeId('txt'),
      type: 'text',
      x: Math.round(worldPt.x - 145),
      y: Math.round(worldPt.y - 55),
      width: 290,
      content: '',
      monospace: false,
      createdAt: now,
      updatedAt: now,
    };
    setNodes((prev) => [...prev, newNode]);
    setAutoFocusNodeId(newNode.id);
    playPop();
  };

  // Drag & Drop files (Images or .json board import)
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsFileDragOver(false);

    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    const jsonFile = files.find(
      (f) => f.name.toLowerCase().endsWith('.json') || f.type === 'application/json'
    );
    if (jsonFile) {
      try {
        const text = await jsonFile.text();
        const imported = parseImportedBoardJson(text);
        setNodes(imported.nodes);
        setEdges(imported.edges);
        setViewport(imported.viewport);
        playSnap();
        showToast(`Imported ${imported.nodes.length} nodes`);
      } catch {
        showToast('Invalid .json board file');
      }
      return;
    }

    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      const baseWorld = getSpawnWorldPoint({ x: e.clientX, y: e.clientY });
      const now = Date.now();
      const spawned: VaultNode[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        try {
          const dataUrl = await fileToDataUrl(file);
          const dims = await getImageDimensions(dataUrl);
          const targetW = Math.min(380, Math.max(220, dims.width));
          spawned.push({
            id: makeId('img'),
            type: 'image',
            x: Math.round(baseWorld.x - targetW / 2 + i * 32),
            y: Math.round(baseWorld.y - 100 + i * 32),
            width: targetW,
            dataUrl,
            fileName: file.name,
            naturalWidth: dims.width,
            naturalHeight: dims.height,
            createdAt: now,
            updatedAt: now,
          });
        } catch {
          // Skip unreadable image
        }
      }

      if (spawned.length > 0) {
        setNodes((prev) => [...prev, ...spawned]);
        playPop();
        showToast(`Added ${spawned.length} image${spawned.length > 1 ? 's' : ''}`);
      }
    }
  };

  // Import via file picker
  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const imported = parseImportedBoardJson(text);
      setNodes(imported.nodes);
      setEdges(imported.edges);
      setViewport(imported.viewport);
      playSnap();
      showToast(`Imported ${imported.nodes.length} nodes`);
    } catch {
      showToast('Invalid .json board file');
    }
  };

  // Pan viewport smoothly to center a world coordinate
  const smoothTimerRef = useRef<number | null>(null);
  const triggerSmoothViewport = useCallback(() => {
    setIsSmoothViewport(true);
    if (smoothTimerRef.current) window.clearTimeout(smoothTimerRef.current);
    smoothTimerRef.current = window.setTimeout(() => setIsSmoothViewport(false), 450);
  }, []);

  const panToWorld = useCallback(
    (wx: number, wy: number) => {
      triggerSmoothViewport();
      setViewport((prev) => ({
        ...prev,
        x: containerSize.width / 2 - wx * prev.zoom,
        y: containerSize.height / 2 - wy * prev.zoom,
      }));
    },
    [containerSize.width, containerSize.height, triggerSmoothViewport]
  );

  // Quick-add actions from BottomDock
  const handleAddTitle = useCallback(() => {
    const center = getSpawnWorldPoint({
      x: containerSize.width / 2 + (Math.random() - 0.5) * 60,
      y: containerSize.height / 2 + (Math.random() - 0.5) * 60,
    });
    const now = Date.now();
    const newNode: VaultNode = {
      id: makeId('ttl'),
      type: 'title',
      x: Math.round(center.x - 165),
      y: Math.round(center.y - 55),
      width: 330,
      heading: '',
      subtitle: '',
      createdAt: now,
      updatedAt: now,
    };
    setNodes((prev) => [...prev, newNode]);
    setAutoFocusNodeId(newNode.id);
    playPop();
  }, [containerSize.width, containerSize.height, getSpawnWorldPoint]);

  const handleAddNote = useCallback(() => {
    const center = getSpawnWorldPoint({
      x: containerSize.width / 2 + (Math.random() - 0.5) * 60,
      y: containerSize.height / 2 + (Math.random() - 0.5) * 60,
    });
    const now = Date.now();
    const newNode: VaultNode = {
      id: makeId('txt'),
      type: 'text',
      x: Math.round(center.x - 145),
      y: Math.round(center.y - 65),
      width: 290,
      content: '',
      monospace: false,
      createdAt: now,
      updatedAt: now,
    };
    setNodes((prev) => [...prev, newNode]);
    setAutoFocusNodeId(newNode.id);
    playPop();
  }, [containerSize.width, containerSize.height, getSpawnWorldPoint]);

  const handleAddColor = useCallback(() => {
    const palette = ['#8AB4F8', '#81C995', '#FDD663', '#F28B82', '#C58AF9', '#78D9EC'];
    const hex = palette[Math.floor(Math.random() * palette.length)];
    const center = getSpawnWorldPoint({
      x: containerSize.width / 2 + (Math.random() - 0.5) * 80,
      y: containerSize.height / 2 + (Math.random() - 0.5) * 80,
    });
    const now = Date.now();
    setNodes((prev) => [
      ...prev,
      {
        id: makeId('clr'),
        type: 'color',
        x: Math.round(center.x - 110),
        y: Math.round(center.y - 70),
        width: 220,
        hex,
        label: 'Color Swatch',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    playPop();
  }, [containerSize.width, containerSize.height, getSpawnWorldPoint]);

  const handleAddLink = useCallback(() => {
    const raw = window.prompt('Paste a URL (https://...)');
    if (!raw) return;
    const parsed = parseUrlPayload(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!parsed) {
      showToast('Invalid URL');
      return;
    }
    const center = getSpawnWorldPoint({
      x: containerSize.width / 2 + (Math.random() - 0.5) * 60,
      y: containerSize.height / 2 + (Math.random() - 0.5) * 60,
    });
    const now = Date.now();
    setNodes((prev) => [
      ...prev,
      {
        id: makeId('lnk'),
        type: 'link',
        x: Math.round(center.x - 140),
        y: Math.round(center.y - 60),
        width: 280,
        url: parsed.url,
        domain: parsed.domain,
        title: parsed.title,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    playPop();
  }, [containerSize.width, containerSize.height, getSpawnWorldPoint, showToast]);

  const handleSurpriseMe = useCallback(() => {
    const prompts = [
      'What if this idea worked offline in 10ms?',
      'Combine two unexpected textures: warm paper + neon telemetry.',
      'Sketch the 3-word pitch for this board.',
      'Wildcard constraint: zero menus, gesture-first!',
      'Pick 1 hero color and build everything around it.',
    ];
    const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#C77DFF', '#FF9F1C'];
    const center = getSpawnWorldPoint({
      x: containerSize.width / 2 + (Math.random() - 0.5) * 140,
      y: containerSize.height / 2 + (Math.random() - 0.5) * 100,
    });
    const now = Date.now();
    const spawnColor = Math.random() < 0.4;

    if (spawnColor) {
      const hex = colors[Math.floor(Math.random() * colors.length)];
      setNodes((prev) => [
        ...prev,
        {
          id: makeId('clr'),
          type: 'color',
          x: Math.round(center.x - 110),
          y: Math.round(center.y - 70),
          width: 220,
          hex,
          label: 'Spark Swatch',
          createdAt: now,
          updatedAt: now,
        },
      ]);
      showToast(`Sparked ${hex}`);
    } else {
      const text = prompts[Math.floor(Math.random() * prompts.length)];
      setNodes((prev) => [
        ...prev,
        {
          id: makeId('txt'),
          type: 'text',
          x: Math.round(center.x - 145),
          y: Math.round(center.y - 60),
          width: 290,
          content: text,
          monospace: false,
          title: 'Spark Prompt',
          createdAt: now,
          updatedAt: now,
        },
      ]);
      showToast('Sparked a creative prompt');
    }
    playPop();
  }, [containerSize.width, containerSize.height, getSpawnWorldPoint, showToast]);

  // Tidy / Auto-arrange nodes into a clean studio grid
  const handleTidyLayout = useCallback(() => {
    if (nodesRef.current.length === 0) return;
    const cols = Math.max(2, Math.min(4, Math.ceil(Math.sqrt(nodesRef.current.length))));
    const gapX = 56;
    const gapY = 48;
    const colWidths = new Array<number>(cols).fill(290);
    const rowHeights: number[] = [];

    nodesRef.current.forEach((n, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const size = getNodeDimensions(n, measuredSizesRef.current);
      colWidths[col] = Math.max(colWidths[col], size.width);
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, size.height);
    });

    const startX = 140;
    const startY = 130;
    const colOffsets: number[] = [startX];
    for (let c = 1; c < cols; c++) {
      colOffsets[c] = colOffsets[c - 1] + colWidths[c - 1] + gapX;
    }
    const rowOffsets: number[] = [startY];
    for (let r = 1; r < rowHeights.length; r++) {
      rowOffsets[r] = rowOffsets[r - 1] + rowHeights[r - 1] + gapY;
    }

    setNodes((prev) =>
      prev.map((n, idx) => ({
        ...n,
        x: Math.round(colOffsets[idx % cols]),
        y: Math.round(rowOffsets[Math.floor(idx / cols)]),
      }))
    );
    triggerSmoothViewport();
    setViewport({ x: 0, y: 0, zoom: 1 });
    playSnap();
    showToast('Tidied canvas layout');
  }, [showToast, triggerSmoothViewport]);

  // Search & Type Filter matching
  const { matchedIds, dimmedIds, matchedNodesList } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasSearch = q.length > 0;
    const hasFilter = activeFilter !== 'all';

    const matched = new Set<string>();
    const dimmed = new Set<string>();
    const orderedMatches: VaultNode[] = [];

    for (const n of nodes) {
      const matchesType = !hasFilter || n.type === activeFilter;
      let matchesQuery = true;

      if (hasSearch) {
        if (n.type === 'title') {
          matchesQuery =
            n.heading.toLowerCase().includes(q) ||
            (n.subtitle?.toLowerCase().includes(q) ?? false);
        } else if (n.type === 'text') {
          matchesQuery =
            n.content.toLowerCase().includes(q) ||
            (n.title?.toLowerCase().includes(q) ?? false);
        } else if (n.type === 'color') {
          matchesQuery =
            n.hex.toLowerCase().includes(q) ||
            (n.label?.toLowerCase().includes(q) ?? false);
        } else if (n.type === 'link') {
          matchesQuery =
            n.url.toLowerCase().includes(q) ||
            n.domain.toLowerCase().includes(q) ||
            (n.title?.toLowerCase().includes(q) ?? false);
        } else if (n.type === 'image') {
          matchesQuery = n.fileName?.toLowerCase().includes(q) ?? false;
        }
      }

      if (matchesType && matchesQuery) {
        if (hasSearch) {
          matched.add(n.id);
          orderedMatches.push(n);
        }
      } else {
        dimmed.add(n.id);
      }
    }

    return { matchedIds: matched, dimmedIds: dimmed, matchedNodesList: orderedMatches };
  }, [nodes, searchQuery, activeFilter]);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    setActiveMatchIndex(0);
  }, []);

  // Pan to first match when search query changes
  const firstMatchedNode = searchQuery.trim() ? matchedNodesList[0] ?? null : null;
  useEffect(() => {
    if (firstMatchedNode) {
      const size = getNodeDimensions(firstMatchedNode, measuredSizesRef.current);
      panToWorld(firstMatchedNode.x + size.width / 2, firstMatchedNode.y + size.height / 2);
    }
  }, [firstMatchedNode, panToWorld]);

  const handleCycleMatch = () => {
    if (matchedNodesList.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % matchedNodesList.length;
    setActiveMatchIndex(nextIdx);
    const target = matchedNodesList[nextIdx];
    const size = getNodeDimensions(target, measuredSizes);
    panToWorld(target.x + size.width / 2, target.y + size.height / 2);
  };

  // Constellation cluster highlighting when hovering a Big Idea Title node
  const focusedClusterNodeIds = useMemo<Set<string> | null>(() => {
    if (!hoveredTitleId || draggingNodeId || wireDraft) return null;
    const cluster = new Set<string>([hoveredTitleId]);
    for (const e of edges) {
      if (e.sourceId === hoveredTitleId) cluster.add(e.targetId);
      if (e.targetId === hoveredTitleId) cluster.add(e.sourceId);
    }
    return cluster.size > 1 ? cluster : null;
  }, [hoveredTitleId, edges, draggingNodeId, wireDraft]);

  const handleHoverNode = useCallback((nodeId: string | null) => {
    if (!nodeId) {
      setHoveredTitleId(null);
      return;
    }
    const target = nodesRef.current.find((n) => n.id === nodeId);
    setHoveredTitleId(target?.type === 'title' ? nodeId : null);
  }, []);

  // Compute connected dot colors & folded child IDs for Title clusters
  const { clusterDotsByTitle, hiddenByCollapseIds } = useMemo(() => {
    const dotsMap: Record<string, string[]> = {};
    const hidden = new Set<string>();
    const nodeMap = new Map<string, VaultNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    const getColor = (n: VaultNode) => {
      if (n.type === 'color') return n.hex;
      if (n.type === 'link') return '#38BDF8';
      if (n.type === 'image') return '#C084FC';
      if (n.type === 'title') return '#F472B6';
      return n.monospace ? '#34D399' : '#FBBF24';
    };

    for (const n of nodes) {
      if (n.type !== 'title') continue;
      const connected: VaultNode[] = [];
      for (const e of edges) {
        if (e.sourceId === n.id) {
          const other = nodeMap.get(e.targetId);
          if (other) connected.push(other);
        } else if (e.targetId === n.id) {
          const other = nodeMap.get(e.sourceId);
          if (other) connected.push(other);
        }
      }
      dotsMap[n.id] = connected.map(getColor);
      if (n.collapsed) {
        for (const child of connected) {
          if (child.type !== 'title') hidden.add(child.id);
        }
      }
    }
    return { clusterDotsByTitle: dotsMap, hiddenByCollapseIds: hidden };
  }, [nodes, edges]);

  const visibleCanvasNodes = useMemo(
    () => nodes.filter((n) => !hiddenByCollapseIds.has(n.id)),
    [nodes, hiddenByCollapseIds]
  );

  const connectedNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      set.add(e.sourceId);
      set.add(e.targetId);
    }
    return set;
  }, [edges]);

  // Orbit: arrange all connected ideas into a radial constellation around a Big Idea Title
  const handleOrbitCluster = useCallback(
    (titleId: string) => {
      const titleNode = nodesRef.current.find((n) => n.id === titleId);
      if (!titleNode) return;

      const connectedIds: string[] = [];
      for (const e of edgesRef.current) {
        if (e.sourceId === titleId && !connectedIds.includes(e.targetId)) {
          connectedIds.push(e.targetId);
        } else if (e.targetId === titleId && !connectedIds.includes(e.sourceId)) {
          connectedIds.push(e.sourceId);
        }
      }
      if (connectedIds.length === 0) return;

      const tSize = getNodeDimensions(titleNode, measuredSizesRef.current);
      const centerX = titleNode.x + tSize.width / 2;
      const centerY = titleNode.y + tSize.height / 2;
      const radius = Math.max(290, 175 + connectedIds.length * 36);

      const nextPos = new Map<string, { x: number; y: number }>();
      connectedIds.forEach((id, idx) => {
        const angle = (idx / connectedIds.length) * Math.PI * 2 - Math.PI / 2;
        const child = nodesRef.current.find((n) => n.id === id);
        if (!child) return;
        const cSize = getNodeDimensions(child, measuredSizesRef.current);
        nextPos.set(id, {
          x: Math.round(centerX + Math.cos(angle) * radius - cSize.width / 2),
          y: Math.round(centerY + Math.sin(angle) * radius - cSize.height / 2),
        });
      });

      setNodes((prev) =>
        prev.map((n) => {
          const p = nextPos.get(n.id);
          return p ? { ...n, x: p.x, y: p.y } : n;
        })
      );
      playSnap();
      showToast('Gathered ideas into orbit');
    },
    [showToast]
  );

  const handleToggleCollapseCluster = useCallback(
    (titleId: string) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === titleId && n.type === 'title' ? { ...n, collapsed: !n.collapsed } : n
        )
      );
      playPop();
    },
    []
  );

  // Node counts by type
  const counts = useMemo<Record<FilterType, number>>(() => {
    const c: Record<FilterType, number> = {
      all: nodes.length,
      title: 0,
      text: 0,
      color: 0,
      link: 0,
      image: 0,
    };
    for (const n of nodes) c[n.type]++;
    return c;
  }, [nodes]);

  const dotSpacing = 24 * viewport.zoom;
  const dotRadius = Math.max(0.75, Math.min(1.4, viewport.zoom));

  return (
    <div
      className="tabletop-bg relative h-screen w-screen overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        setIsFileDragOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsFileDragOver(false);
      }}
      onDrop={handleDrop}
    >
      {/* Top Glassmorphic Command Bar */}
      <CommandBar
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onCycleMatch={handleCycleMatch}
        matchCount={matchedNodesList.length}
        activeMatchIndex={activeMatchIndex}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        zoom={viewport.zoom}
        onResetZoom={() => setViewport({ x: 0, y: 0, zoom: 1 })}
        isMuted={isMuted}
        onToggleMute={() => {
          const next = !isMuted;
          setIsMuted(next);
          setSoundMuted(next);
        }}
        onExportJson={() => {
          exportBoardJson({ version: 1, nodes, edges, viewport });
          showToast('Exported board .json');
        }}
        onImportFile={handleImportFile}
        onResetBoard={() => {
          const starter = createStarterBoard();
          setNodes(starter.nodes);
          setEdges(starter.edges);
          setViewport(starter.viewport);
          playPop();
          showToast('Reset to starter board');
        }}
        searchInputRef={searchInputRef}
        counts={counts}
      />

      {/* Floating Bottom-Center Tabletop Dock */}
      <BottomDock
        viewMode={viewMode}
        onToggleView={setViewMode}
        onAddTitle={handleAddTitle}
        onAddNote={handleAddNote}
        onAddColor={handleAddColor}
        onAddLink={handleAddLink}
        onSurpriseMe={handleSurpriseMe}
        onTidyLayout={handleTidyLayout}
      />

      {viewMode === 'grid' ? (
        /* Smooth Bento Grid View */
        <main className="vault-scroll h-full w-full overflow-y-auto px-20 pb-16 pt-24">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {nodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                zoom={1}
                gridMode
                isDragging={false}
                isMatched={matchedIds.has(node.id)}
                isDimmed={dimmedIds.has(node.id)}
                isWireTarget={false}
                isWiringActive={false}
                autoFocus={autoFocusNodeId === node.id}
                onAutoFocusHandled={() => setAutoFocusNodeId(null)}
                onStartDrag={handleStartNodeDrag}
                onMoveDrag={handleMoveNodeDrag}
                onEndDrag={handleEndNodeDrag}
                onStartWire={handleStartWire}
                onUpdateNode={handleUpdateNode}
                onDeleteNode={handleDeleteNode}
                onMeasure={handleMeasureNode}
              />
            ))}
          </div>
        </main>
      ) : (
        /* Infinite Spatial Canvas */
        <div
          ref={canvasRef}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerUp}
          onDoubleClick={handleCanvasDoubleClick}
          style={{
            backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.14) ${dotRadius}px, transparent ${dotRadius}px)`,
            backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            cursor: isPanning ? 'grabbing' : spacePressed ? 'grab' : 'default',
          }}
          className="relative h-full w-full select-none"
        >
          {/* Hardware-Accelerated World Layer */}
          <div
            style={{
              transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
              transformOrigin: '0 0',
            }}
            className={[
              'pointer-events-none absolute left-0 top-0 h-px w-px will-change-transform',
              isSmoothViewport ? 'viewport-smooth' : '',
            ].join(' ')}
          >
            {/* Synchronized SVG Tether Overlay */}
            <TetherLayer
              nodes={visibleCanvasNodes}
              edges={edges}
              measuredSizes={measuredSizes}
              magneticPreview={magneticPreview}
              detachEdgeIds={detachEdgeIds}
              justDockedEdgeId={justDockedEdgeId}
              wireDraft={wireDraft}
              dimmedNodeIds={dimmedIds}
              focusedClusterNodeIds={focusedClusterNodeIds}
              onSeverEdge={handleSeverEdge}
              onUpdateEdgeLabel={handleUpdateEdgeLabel}
            />

            {/* Spatial HTML Nodes */}
            <div className="pointer-events-auto">
              {visibleCanvasNodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  zoom={viewport.zoom}
                  isDragging={draggingNodeId === node.id}
                  isMatched={
                    matchedIds.has(node.id) ||
                    (focusedClusterNodeIds?.has(node.id) ?? false)
                  }
                  isDimmed={
                    dimmedIds.has(node.id) ||
                    (focusedClusterNodeIds !== null && !focusedClusterNodeIds.has(node.id))
                  }
                  isWireTarget={wireDraft?.hoverTargetId === node.id}
                  isWiringActive={wireDraft !== null}
                  isConnected={connectedNodeIds.has(node.id)}
                  autoFocus={autoFocusNodeId === node.id}
                  clusterDots={node.type === 'title' ? clusterDotsByTitle[node.id] : undefined}
                  onAutoFocusHandled={() => setAutoFocusNodeId(null)}
                  onHoverNode={handleHoverNode}
                  onOrbitCluster={handleOrbitCluster}
                  onToggleCollapseCluster={handleToggleCollapseCluster}
                  onDetachNode={handleDetachNode}
                  onStartDrag={handleStartNodeDrag}
                  onMoveDrag={handleMoveNodeDrag}
                  onEndDrag={handleEndNodeDrag}
                  onStartWire={handleStartWire}
                  onUpdateNode={handleUpdateNode}
                  onDeleteNode={handleDeleteNode}
                  onMeasure={handleMeasureNode}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Bottom-Right Minimap (canvas mode only) */}
      {viewMode === 'canvas' && (
        <Minimap
          nodes={nodes}
          edges={edges}
          measuredSizes={measuredSizes}
          viewport={viewport}
          containerSize={containerSize}
          onPanToWorld={panToWorld}
        />
      )}

      {/* File Drop Overlay */}
      {isFileDragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[#0B0D10]/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-dashed border-sky-400/60 bg-[#12151B]/95 px-8 py-6 text-center shadow-2xl">
            <p className="text-sm font-semibold text-sky-200">Drop to spawn on canvas</p>
            <p className="mt-1 text-xs text-zinc-400">
              Supports image files or exported SnippetVault <code className="font-mono-code">.json</code> boards
            </p>
          </div>
        </div>
      )}

      {/* Subtle Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-[#181C24]/95 px-4 py-1.5 text-xs font-medium text-zinc-200 shadow-lg backdrop-blur-md"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
