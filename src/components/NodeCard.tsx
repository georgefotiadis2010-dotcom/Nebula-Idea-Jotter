import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  FoldVertical,
  Globe,
  Heading,
  Image as ImageIcon,
  Orbit,
  Palette,
  RefreshCw,
  StickyNote,
  Trash2,
  UnfoldVertical,
  Unlink,
} from 'lucide-react';
import type { NodeSize, PortCorner, VaultNode } from '../types/vault';
import { copyTextToClipboard, getContrastFallbackColor } from '../utils/clipboard';
import { playCopy } from '../utils/sound';

interface NodeCardProps {
  node: VaultNode;
  zoom: number;
  isDragging: boolean;
  isMatched: boolean;
  isDimmed: boolean;
  isWireTarget: boolean;
  isWiringActive: boolean;
  gridMode?: boolean;
  autoFocus?: boolean;
  isConnected?: boolean;
  clusterDots?: string[];
  onAutoFocusHandled?: () => void;
  onHoverNode?: (nodeId: string | null) => void;
  onOrbitCluster?: (titleId: string) => void;
  onToggleCollapseCluster?: (titleId: string) => void;
  onDetachNode?: (nodeId: string) => void;
  onStartDrag: (nodeId: string, clientX: number, clientY: number) => void;
  onMoveDrag: (clientX: number, clientY: number) => void;
  onEndDrag: () => void;
  onStartWire: (nodeId: string, port: PortCorner, clientX: number, clientY: number) => void;
  onUpdateNode: (nodeId: string, patch: Partial<VaultNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onMeasure: (nodeId: string, size: NodeSize) => void;
}

const PORT_POSITIONS: { port: PortCorner; className: string; label: string }[] = [
  { port: 'tr', className: '-right-2.5 top-1/2 -translate-y-1/2', label: 'Drag thread to connect' },
  { port: 'tl', className: '-left-2.5 top-1/2 -translate-y-1/2', label: 'Drag thread to connect' },
];

/** Subtle natural tabletop card tilt (-1.3deg to +1.3deg) */
function getTabletopTilt(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const normalized = ((h >>> 0) % 27) - 13; // -13..13
  return normalized * 0.1;
}

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  zoom,
  isDragging,
  isMatched,
  isDimmed,
  isWireTarget,
  isWiringActive,
  gridMode = false,
  autoFocus,
  isConnected = false,
  clusterDots,
  onAutoFocusHandled,
  onHoverNode,
  onOrbitCluster,
  onToggleCollapseCluster,
  onDetachNode,
  onStartDrag,
  onMoveDrag,
  onEndDrag,
  onStartWire,
  onUpdateNode,
  onDeleteNode,
  onMeasure,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(
    () => node.type === 'title' && !node.heading.trim()
  );
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el || gridMode) return;

    const report = () => {
      onMeasure(node.id, {
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, gridMode, onMeasure]);

  useEffect(() => {
    if (!autoFocus) return;
    if (node.type === 'text' && textareaRef.current) {
      textareaRef.current.focus();
      onAutoFocusHandled?.();
    } else if (node.type === 'title' && titleInputRef.current) {
      titleInputRef.current.focus();
      onAutoFocusHandled?.();
    }
  }, [autoFocus, node.type, onAutoFocusHandled]);

  const textContent = node.type === 'text' ? node.content : '';
  const textMono = node.type === 'text' ? node.monospace : false;
  useLayoutEffect(() => {
    if (node.type === 'text' && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(68, ta.scrollHeight)}px`;
    }
  }, [node.type, textContent, textMono, node.width, gridMode]);

  const triggerCopy = async (text: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      playCopy();
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || gridMode) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea')) return;

    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onStartDrag(node.id, e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.stopPropagation();
    onMoveDrag(e.clientX, e.clientY);
  };

  const handleLostCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (isDragging) {
      onEndDrag();
    }
  };

  const resizeStartRef = useRef<{ startX: number; startW: number; aspect: number } | null>(null);
  const handleResizeDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || node.type !== 'image') return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const aspect =
      node.naturalWidth && node.naturalHeight ? node.naturalHeight / node.naturalWidth : 0.68;
    resizeStartRef.current = {
      startX: e.clientX,
      startW: node.width,
      aspect,
    };
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !resizeStartRef.current) return;
    e.stopPropagation();
    const dx = (e.clientX - resizeStartRef.current.startX) / zoom;
    const nextW = Math.round(Math.max(180, Math.min(720, resizeStartRef.current.startW + dx)));
    onUpdateNode(node.id, {
      width: nextW,
      height: Math.round(nextW * resizeStartRef.current.aspect) + 34,
    });
  };

  const handleResizeUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    resizeStartRef.current = null;
  };

  const typeMeta = (() => {
    switch (node.type) {
      case 'title':
        return { icon: Heading, label: 'Big Idea', accent: 'text-rose-300', dot: 'bg-rose-400/90' };
      case 'color':
        return { icon: Palette, label: 'Color', accent: 'text-amber-300', dot: 'bg-amber-400/80' };
      case 'link':
        return { icon: Globe, label: 'Link', accent: 'text-sky-300', dot: 'bg-sky-400/80' };
      case 'image':
        return { icon: ImageIcon, label: 'Image', accent: 'text-violet-300', dot: 'bg-violet-400/80' };
      default:
        return {
          icon: node.monospace ? Code2 : StickyNote,
          label: node.monospace ? 'Code' : 'Note',
          accent: node.monospace ? 'text-emerald-300' : 'text-zinc-300',
          dot: node.monospace ? 'bg-emerald-400/80' : 'bg-zinc-400/60',
        };
    }
  })();
  const TypeIcon = typeMeta.icon;

  const [isHovered, setIsHovered] = useState(false);
  const tilt = gridMode ? 0 : getTabletopTilt(node.id);
  const activeTilt = isDragging || isHovered ? 0 : tilt;
  const activeScale = isDragging ? 1.025 : 1;

  const isFloatingEditorial =
    !gridMode && node.type === 'title' && !isEditingTitle && Boolean(node.heading.trim());

  return (
    <div
      ref={cardRef}
      data-node-id={node.id}
      onMouseEnter={() => {
        setIsHovered(true);
        onHoverNode?.(node.id);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onHoverNode?.(null);
      }}
      onPointerDown={(e) => {
        if (!gridMode) e.stopPropagation();
      }}
      onDoubleClick={(e) => {
        if (!gridMode) e.stopPropagation();
      }}
      style={
        gridMode
          ? undefined
          : {
              transform: `translate3d(${node.x}px, ${node.y}px, 0) rotate(${activeTilt}deg) scale(${activeScale})`,
              width: isFloatingEditorial ? 'auto' : `${node.width}px`,
              maxWidth: isFloatingEditorial ? '460px' : undefined,
              minWidth: isFloatingEditorial ? '220px' : undefined,
            }
      }
      className={[
        'group rounded-2xl',
        isFloatingEditorial
          ? 'bg-transparent border border-transparent shadow-none'
          : 'tabletop-card border',
        gridMode ? 'relative w-full' : 'absolute left-0 top-0',
        isDragging
          ? isFloatingEditorial
            ? 'node-no-spring z-40'
            : 'node-no-spring tabletop-card-dragging z-40'
          : 'node-spring z-10',
        isWireTarget
          ? 'border-emerald-400/80 ring-2 ring-emerald-400/30'
          : isMatched && !isFloatingEditorial
            ? 'border-sky-400/80 ring-2 ring-sky-400/25 shadow-[0_0_28px_rgba(138,180,248,0.2)]'
            : isFloatingEditorial
              ? ''
              : 'border-white/[0.09] hover:border-white/[0.22]',
        isDimmed ? 'opacity-25 saturate-50' : 'opacity-100',
      ].join(' ')}
    >
      {/* 2 Tactile Side Thread Pins (canvas mode only) */}
      {!gridMode &&
        PORT_POSITIONS.map(({ port, className, label }) => (
          <button
            key={port}
            type="button"
            aria-label={label}
            title="Pull thread to connect"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              onStartWire(node.id, port, e.clientX, e.clientY);
            }}
            className={[
              'absolute z-30 flex h-5 w-5 items-center justify-center rounded-full border border-white/25 bg-[#191D26] shadow-md transition-all duration-150',
              'hover:scale-125 hover:border-sky-400 hover:bg-sky-500/25 hover:shadow-[0_0_12px_rgba(56,189,248,0.5)]',
              isWiringActive ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              className,
            ].join(' ')}
          >
            <span className="h-2 w-2 rounded-full bg-sky-400" />
          </button>
        ))}

      {/* Clean Borderless Drag Row */}
      <div
        role={gridMode ? undefined : 'button'}
        tabIndex={gridMode ? undefined : 0}
        aria-label={gridMode ? undefined : `${typeMeta.label} node handle`}
        onPointerDown={gridMode ? undefined : handlePointerDown}
        onPointerMove={gridMode ? undefined : handlePointerMove}
        onLostPointerCapture={gridMode ? undefined : handleLostCapture}
        className={[
          'flex items-center justify-between gap-2 px-3.5 pt-3 pb-1',
          gridMode ? '' : 'node-drag-handle',
          isDragging ? 'is-dragging' : '',
        ].join(' ')}
      >
        <div
          className={[
            'inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 transition-opacity',
            isFloatingEditorial
              ? 'bg-white/[0.06] opacity-0 group-hover:opacity-100'
              : 'bg-white/[0.05]',
          ].join(' ')}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${typeMeta.dot}`} aria-hidden="true" />
          <TypeIcon className={`h-3 w-3 shrink-0 ${typeMeta.accent}`} aria-hidden="true" />
          <span className="truncate text-[11px] font-medium text-zinc-300">
            {node.type === 'text' && node.title
              ? node.title
              : node.type === 'color' && node.label
                ? node.label
                : node.type === 'image' && node.fileName
                  ? node.fileName
                  : typeMeta.label}
          </span>
        </div>

        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {node.type === 'text' && (
            <button
              type="button"
              aria-pressed={node.monospace}
              aria-label="Toggle monospace font"
              title={node.monospace ? 'Switch to proportional font' : 'Switch to monospace font'}
              onClick={() => onUpdateNode(node.id, { monospace: !node.monospace })}
              className={[
                'flex h-6 w-6 items-center justify-center rounded-lg text-xs transition-colors',
                node.monospace
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100',
              ].join(' ')}
            >
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {node.type !== 'image' && (
            <button
              type="button"
              aria-label={`Copy ${typeMeta.label.toLowerCase()}`}
              title="Copy to clipboard"
              onClick={() => {
                if (node.type === 'title') triggerCopy(node.heading);
                else if (node.type === 'color') triggerCopy(node.hex);
                else if (node.type === 'link') triggerCopy(node.url);
                else if (node.type === 'text') triggerCopy(node.content);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-zinc-100"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          )}

          {!gridMode && isConnected && (
            <button
              type="button"
              aria-label="Detach from cluster"
              title="Detach from cluster"
              onClick={() => onDetachNode?.(node.id)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-amber-500/15 hover:text-amber-300"
            >
              <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            aria-label={`Delete ${typeMeta.label.toLowerCase()} node`}
            title="Delete node"
            onClick={() => onDeleteNode(node.id)}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Live status announcement for copy feedback */}
      <span className="sr-only" role="status">
        {copied ? 'Copied to clipboard' : ''}
      </span>

      {/* Body by Node Type */}
      {node.type === 'title' && (
        <div className="px-4 pb-4 pt-1">
          {isEditingTitle || !node.heading.trim() ? (
            <div className="space-y-1.5">
              <input
                ref={titleInputRef}
                type="text"
                value={node.heading}
                placeholder="Name your big idea..."
                onChange={(e) => onUpdateNode(node.id, { heading: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && node.heading.trim()) {
                    e.preventDefault();
                    setIsEditingTitle(false);
                  }
                }}
                onBlur={() => {
                  if (node.heading.trim()) setIsEditingTitle(false);
                }}
                className="font-editorial w-full border-b border-rose-400/40 bg-transparent pb-1 text-[28px] leading-tight text-white placeholder:text-zinc-500 focus:border-rose-300 focus:outline-none"
              />
              <input
                type="text"
                value={node.subtitle ?? ''}
                placeholder="Optional subtitle or theme... (Enter to set)"
                onChange={(e) => onUpdateNode(node.id, { subtitle: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && node.heading.trim()) {
                    e.preventDefault();
                    setIsEditingTitle(false);
                  }
                }}
                className="w-full bg-transparent text-xs text-zinc-400 placeholder:text-zinc-600 focus:outline-none"
              />
            </div>
          ) : (
            <div
              onPointerDown={gridMode ? undefined : handlePointerDown}
              onPointerMove={gridMode ? undefined : handlePointerMove}
              onLostPointerCapture={gridMode ? undefined : handleLostCapture}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsEditingTitle(true);
                requestAnimationFrame(() => titleInputRef.current?.focus());
              }}
              title="Drag to move · Double-click to edit"
              className="node-drag-handle w-full text-left"
            >
              <h2 className="font-editorial animate-editorial-reveal bg-gradient-to-br from-white via-zinc-100 to-rose-200/90 bg-clip-text text-[42px] leading-[1.03] font-normal text-transparent drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)]">
                {node.heading}
              </h2>
              <div className="animate-editorial-rule my-2.5 h-[1.5px] w-full bg-gradient-to-r from-rose-400/80 via-sky-400/50 to-transparent" />
              {node.subtitle?.trim() && (
                <p className="animate-editorial-reveal text-xs italic tracking-wide text-zinc-300/85">
                  {node.subtitle}
                </p>
              )}

              {/* Interactive Editorial Constellation Bar */}
              {!gridMode && clusterDots && clusterDots.length > 0 && (
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  className="mt-3 flex flex-wrap items-center gap-1.5"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-[#181B24]/85 px-2.5 py-1 text-[11px] font-medium text-zinc-300 backdrop-blur-md">
                    <span className="flex items-center -space-x-1">
                      {clusterDots.slice(0, 5).map((dotColor, i) => (
                        <span
                          key={i}
                          style={{ backgroundColor: dotColor }}
                          className="h-2.5 w-2.5 rounded-full ring-1 ring-[#101218]"
                        />
                      ))}
                    </span>
                    <span>
                      {clusterDots.length} {clusterDots.length === 1 ? 'idea' : 'ideas'}
                    </span>
                  </span>

                  {!node.collapsed && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOrbitCluster?.(node.id);
                      }}
                      title="Gather connected ideas into a radial orbit"
                      className="inline-flex h-6 items-center gap-1 rounded-full border border-sky-400/25 bg-sky-500/15 px-2.5 text-[11px] font-medium text-sky-200 backdrop-blur-md transition-all hover:bg-sky-500/25 active:scale-95"
                    >
                      <Orbit className="h-3 w-3" aria-hidden="true" />
                      Orbit
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCollapseCluster?.(node.id);
                    }}
                    title={node.collapsed ? 'Bloom ideas back onto tabletop' : 'Fold connected ideas into title'}
                    className={[
                      'inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium backdrop-blur-md transition-all active:scale-95',
                      node.collapsed
                        ? 'border-rose-400/35 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30'
                        : 'border-white/[0.12] bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-white',
                    ].join(' ')}
                  >
                    {node.collapsed ? (
                      <>
                        <UnfoldVertical className="h-3 w-3" aria-hidden="true" />
                        Bloom
                      </>
                    ) : (
                      <>
                        <FoldVertical className="h-3 w-3" aria-hidden="true" />
                        Fold
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {node.type === 'text' && (
        <div className="p-3.5">
          <textarea
            ref={textareaRef}
            value={node.content}
            placeholder="Write a note, code snippet, or lyrics..."
            spellCheck={!node.monospace}
            onChange={(e) => onUpdateNode(node.id, { content: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            rows={3}
            className={[
              'vault-scroll w-full resize-none bg-transparent text-[13px] leading-relaxed text-zinc-100 placeholder:text-zinc-500 focus:outline-none',
              node.monospace ? 'font-mono-code text-[12.5px] text-emerald-100/95' : '',
            ].join(' ')}
          />
        </div>
      )}

      {node.type === 'color' && (
        <div className="p-2.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => triggerCopy(node.hex)}
              title="Click to copy hex color"
              style={
                {
                  backgroundColor: node.hex,
                  '--swatch-bg': node.hex,
                  '--swatch-fallback-fg': getContrastFallbackColor(node.hex),
                } as React.CSSProperties
              }
              className="swatch-contrast-text flex h-24 w-full flex-col items-start justify-between rounded-xl border border-white/15 p-3 text-left transition-transform active:scale-[0.97]"
            >
              <span className="rounded-full bg-black/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm">
                {copied ? 'Copied!' : 'Tap to copy'}
              </span>
              <span className="font-mono-code text-base font-semibold tracking-tight">
                {node.hex}
              </span>
            </button>
            <button
              type="button"
              aria-label="Roll new random color"
              title="Roll a fun new color"
              onClick={(e) => {
                e.stopPropagation();
                const randHex = `#${Math.floor(Math.random() * 0xffffff)
                  .toString(16)
                  .padStart(6, '0')
                  .toUpperCase()}`;
                onUpdateNode(node.id, { hex: randHex });
              }}
              className="swatch-contrast-text absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/15 backdrop-blur-sm transition-transform hover:rotate-90 hover:bg-black/25 active:scale-90"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {node.type === 'link' && (
        <div className="flex flex-col gap-2.5 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-full border border-sky-400/20 bg-sky-400/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
              <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{node.domain}</span>
            </span>
            <a
              href={node.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${node.domain} in new tab`}
              title="Open link"
              className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.05] px-2.5 text-[11px] font-medium text-zinc-200 transition-colors hover:border-sky-400/40 hover:bg-sky-500/15 hover:text-sky-200"
            >
              Open
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
          <p className="line-clamp-2 break-words text-[12.5px] leading-snug text-zinc-300">
            {node.title || node.url}
          </p>
        </div>
      )}

      {node.type === 'image' && (
        <div className="relative p-2.5">
          <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/40">
            <img
              src={node.dataUrl}
              alt={node.fileName || 'Pasted image'}
              draggable={false}
              className="pointer-events-none block h-auto w-full select-none object-contain"
            />
          </div>
          {/* Bottom-right resize handle */}
          {!gridMode && (
            <button
              type="button"
              aria-label="Resize image frame"
              title="Drag to resize"
              onPointerDown={handleResizeDown}
              onPointerMove={handleResizeMove}
              onPointerUp={handleResizeUp}
              onLostPointerCapture={handleResizeUp}
              className="absolute bottom-4 right-4 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-lg border border-white/15 bg-[#151821]/90 text-zinc-300 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
            >
              <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
                <path
                  d="M 10 4 L 4 10 M 10 8 L 8 10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
