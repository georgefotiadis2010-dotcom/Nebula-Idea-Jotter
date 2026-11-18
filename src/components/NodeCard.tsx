import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  GripHorizontal,
  Image as ImageIcon,
  Palette,
  StickyNote,
  Trash2,
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
  autoFocus?: boolean;
  onAutoFocusHandled?: () => void;
  onStartDrag: (nodeId: string, clientX: number, clientY: number) => void;
  onMoveDrag: (clientX: number, clientY: number) => void;
  onEndDrag: () => void;
  onStartWire: (nodeId: string, port: PortCorner, clientX: number, clientY: number) => void;
  onUpdateNode: (nodeId: string, patch: Partial<VaultNode>) => void;
  onDeleteNode: (nodeId: string) => void;
  onMeasure: (nodeId: string, size: NodeSize) => void;
}

const PORT_POSITIONS: { port: PortCorner; className: string; label: string }[] = [
  { port: 'tl', className: 'left-[10%] top-[10%]', label: 'Top-left connection port' },
  { port: 'tr', className: 'right-[10%] top-[10%]', label: 'Top-right connection port' },
  { port: 'bl', className: 'bottom-[10%] left-[10%]', label: 'Bottom-left connection port' },
  { port: 'br', className: 'bottom-[10%] right-[10%]', label: 'Bottom-right connection port' },
];

/** Deterministic organic 8-value border-radius pair per node ID for irregular water-bubble shapes */
function getBubbleShape(id: string): { r1: string; r2: string; duration: string } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const pick = (shift: number, min: number, span: number) =>
    min + (((h >>> shift) & 0xff) % span);

  const tl1 = pick(0, 34, 24);
  const tr1 = 100 - tl1 + (pick(4, 0, 9) - 4);
  const br1 = pick(8, 36, 24);
  const bl1 = 100 - br1 + (pick(12, 0, 9) - 4);

  const vtl1 = pick(16, 36, 24);
  const vtr1 = pick(20, 34, 24);
  const vbr1 = 100 - vtr1 + (pick(2, 0, 9) - 4);
  const vbl1 = 100 - vtl1 + (pick(6, 0, 9) - 4);

  const r1 = `${tl1}% ${tr1}% ${br1}% ${bl1}% / ${vtl1}% ${vtr1}% ${vbr1}% ${vbl1}%`;
  const r2 = `${tl1 + 5}% ${tr1 - 5}% ${br1 - 4}% ${bl1 + 4}% / ${vtl1 - 5}% ${vtr1 + 5}% ${vbr1 - 4}% ${vbl1 + 4}%`;
  const duration = `${8 + (pick(10, 0, 5))}s`;

  return { r1, r2, duration };
}

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  zoom,
  isDragging,
  isMatched,
  isDimmed,
  isWireTarget,
  isWiringActive,
  autoFocus,
  onAutoFocusHandled,
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
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  // Measure rendered card dimensions for accurate tethers & minimap
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

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
  }, [node.id, onMeasure]);

  // Auto-focus newly double-clicked text node
  useEffect(() => {
    if (autoFocus && node.type === 'text' && textareaRef.current) {
      textareaRef.current.focus();
      onAutoFocusHandled?.();
    }
  }, [autoFocus, node.type, onAutoFocusHandled]);

  // Auto-expand textarea height when content or monospace changes
  const textContent = node.type === 'text' ? node.content : '';
  const textMono = node.type === 'text' ? node.monospace : false;
  useLayoutEffect(() => {
    if (node.type === 'text' && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = `${Math.max(68, ta.scrollHeight)}px`;
    }
  }, [node.type, textContent, textMono, node.width]);

  const triggerCopy = async (text: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      playCopy();
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1600);
    }
  };

  // Drag handle pointer events (with pointer capture)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
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

  // Image resize handle
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
      case 'color':
        return { icon: Palette, label: 'Color', accent: 'text-amber-300' };
      case 'link':
        return { icon: Globe, label: 'Link', accent: 'text-sky-300' };
      case 'image':
        return { icon: ImageIcon, label: 'Image', accent: 'text-violet-300' };
      default:
        return {
          icon: node.monospace ? Code2 : StickyNote,
          label: node.monospace ? 'Code' : 'Note',
          accent: node.monospace ? 'text-emerald-300' : 'text-zinc-300',
        };
    }
  })();
  const TypeIcon = typeMeta.icon;

  const ambientGlow = (() => {
    if (node.type === 'color') return `${node.hex}26`;
    if (node.type === 'link') return 'rgba(138, 180, 248, 0.14)';
    if (node.type === 'image') return 'rgba(192, 132, 252, 0.14)';
    if (node.type === 'text' && node.monospace) return 'rgba(110, 231, 183, 0.12)';
    return 'rgba(138, 180, 248, 0.08)';
  })();

  const bubbleShape = getBubbleShape(node.id);

  return (
    <div
      ref={cardRef}
      data-node-id={node.id}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={
        {
          transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
          width: `${Math.max(node.width, node.type === 'color' ? 230 : 270)}px`,
          '--bubble-r1': bubbleShape.r1,
          '--bubble-r2': bubbleShape.r2,
          animationDuration: bubbleShape.duration,
        } as React.CSSProperties
      }
      className={[
        'water-bubble group absolute left-0 top-0 border',
        isDragging ? 'node-no-spring water-bubble-dragging z-40' : 'node-spring z-10',
        isWireTarget
          ? 'border-emerald-400/80 ring-2 ring-emerald-400/35'
          : isMatched
            ? 'border-sky-400/75 ring-2 ring-sky-400/30 shadow-[0_0_36px_rgba(138,180,248,0.28)]'
            : 'border-white/[0.18] hover:border-white/[0.32]',
        isDimmed ? 'opacity-25 saturate-50' : 'opacity-100',
      ].join(' ')}
    >
      {/* Curved water-bubble specular reflection & ambient tint */}
      <div
        aria-hidden="true"
        style={{
          background: `radial-gradient(120% 80% at 24% 8%, ${ambientGlow}, transparent 68%)`,
          borderRadius: 'inherit',
        }}
        className="pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[14%] top-[7%] h-3 w-[34%] -rotate-12 rounded-full bg-white/25 blur-[2px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[16%] bottom-[8%] h-2 w-[22%] -rotate-6 rounded-full bg-sky-300/20 blur-[2px]"
      />

      {/* 4 Corner Connection Ports */}
      {PORT_POSITIONS.map(({ port, className, label }) => (
        <button
          key={port}
          type="button"
          aria-label={label}
          title="Drag to connect node"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.stopPropagation();
            onStartWire(node.id, port, e.clientX, e.clientY);
          }}
          className={[
            'absolute z-30 flex h-4 w-4 items-center justify-center rounded-full border border-white/35 bg-[#141821]/90 backdrop-blur-md transition-all duration-150',
            'hover:scale-125 hover:border-sky-400 hover:bg-sky-400/25',
            isWiringActive ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            className,
          ].join(' ')}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
        </button>
      ))}

      {/* Dedicated Drag Handle Header */}
      <div
        role="button"
        tabIndex={0}
        aria-label={`${typeMeta.label} node handle`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onLostPointerCapture={handleLostCapture}
        className={[
          'node-drag-handle relative z-10 flex items-center justify-between gap-2 px-7 pt-5 pb-1',
          isDragging ? 'is-dragging' : '',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 py-1 ring-1 ring-white/[0.08]">
          <GripHorizontal className="h-3 w-3 shrink-0 text-zinc-300" aria-hidden="true" />
          <TypeIcon className={`h-3 w-3 shrink-0 ${typeMeta.accent}`} aria-hidden="true" />
          <span className="truncate text-[11px] font-medium tracking-wide text-zinc-200">
            {node.type === 'text' && node.title
              ? node.title
              : node.type === 'color' && node.label
                ? node.label
                : node.type === 'image' && node.fileName
                  ? node.fileName
                  : typeMeta.label}
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-75 transition-opacity group-hover:opacity-100">
          {node.type === 'text' && (
            <button
              type="button"
              aria-pressed={node.monospace}
              aria-label="Toggle monospace font"
              title={node.monospace ? 'Switch to proportional font' : 'Switch to monospace font'}
              onClick={() => onUpdateNode(node.id, { monospace: !node.monospace })}
              className={[
                'flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors',
                node.monospace
                  ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/30'
                  : 'text-zinc-300 hover:bg-white/[0.12] hover:text-white',
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
                if (node.type === 'color') triggerCopy(node.hex);
                else if (node.type === 'link') triggerCopy(node.url);
                else if (node.type === 'text') triggerCopy(node.content);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/[0.12] hover:text-white"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          )}

          <button
            type="button"
            aria-label={`Delete ${typeMeta.label.toLowerCase()} node`}
            title="Delete node"
            onClick={() => onDeleteNode(node.id)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-rose-500/25 hover:text-rose-200"
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
      {node.type === 'text' && (
        <div className="relative z-10 px-7 pb-6 pt-1.5">
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
        <div className="relative z-10 px-6 pb-6 pt-2">
          <button
            type="button"
            onClick={() => triggerCopy(node.hex)}
            title="Click to copy hex color"
            style={
              {
                backgroundColor: node.hex,
                '--swatch-bg': node.hex,
                '--swatch-fallback-fg': getContrastFallbackColor(node.hex),
                borderRadius: '46% 54% 48% 52% / 52% 44% 56% 48%',
              } as React.CSSProperties
            }
            className="swatch-contrast-text flex h-28 w-full flex-col items-center justify-center gap-1.5 border border-white/25 p-4 text-center shadow-[inset_0_3px_8px_rgba(255,255,255,0.45),inset_0_-6px_14px_rgba(0,0,0,0.2)] transition-transform active:scale-[0.97]"
          >
            <span className="font-mono-code text-base font-semibold tracking-tight">
              {node.hex}
            </span>
            <span className="rounded-full bg-black/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-md">
              {copied ? 'Copied' : 'Tap to copy'}
            </span>
          </button>
        </div>
      )}

      {node.type === 'link' && (
        <div className="relative z-10 flex flex-col gap-2.5 px-7 pb-7 pt-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-400/15 px-2.5 py-0.5 text-[11px] font-medium text-sky-200">
              <Globe className="h-3 w-3" aria-hidden="true" />
              {node.domain}
            </span>
            <a
              href={node.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${node.domain} in new tab`}
              title="Open link"
              className="inline-flex h-7 items-center gap-1 rounded-full border border-white/20 bg-white/[0.1] px-2.5 text-[11px] font-medium text-zinc-100 transition-colors hover:border-sky-400/45 hover:bg-sky-400/20 hover:text-sky-100"
            >
              Open
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
          <p className="line-clamp-2 break-all text-[12.5px] leading-snug text-zinc-200/90">
            {node.title || node.url}
          </p>
        </div>
      )}

      {node.type === 'image' && (
        <div className="relative z-10 px-5 pb-6 pt-1.5">
          <div
            style={{ borderRadius: '38% 62% 48% 52% / 44% 42% 58% 56%' }}
            className="overflow-hidden border border-white/15 bg-black/35"
          >
            <img
              src={node.dataUrl}
              alt={node.fileName || 'Pasted image'}
              draggable={false}
              className="pointer-events-none block h-auto w-full select-none object-contain"
            />
          </div>
          {/* Bottom-right resize handle */}
          <button
            type="button"
            aria-label="Resize image frame"
            title="Drag to resize"
            onPointerDown={handleResizeDown}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeUp}
            onLostPointerCapture={handleResizeUp}
            className="absolute bottom-6 right-6 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-full border border-white/25 bg-[#141821]/85 text-zinc-200 opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100"
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
        </div>
      )}
    </div>
  );
};
