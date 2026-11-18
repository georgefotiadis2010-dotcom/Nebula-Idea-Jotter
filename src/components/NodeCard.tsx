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
  { port: 'tl', className: '-left-1.5 -top-1.5', label: 'Top-left connection port' },
  { port: 'tr', className: '-right-1.5 -top-1.5', label: 'Top-right connection port' },
  { port: 'bl', className: '-bottom-1.5 -left-1.5', label: 'Bottom-left connection port' },
  { port: 'br', className: '-bottom-1.5 -right-1.5', label: 'Bottom-right connection port' },
];

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

  return (
    <div
      ref={cardRef}
      data-node-id={node.id}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
        width: `${node.width}px`,
      }}
      className={[
        'group absolute left-0 top-0 rounded-xl border bg-[#12151B]/95 backdrop-blur-md shadow-[0_12px_36px_rgba(0,0,0,0.48)]',
        isDragging ? 'node-no-spring z-40 shadow-[0_24px_56px_rgba(0,0,0,0.65)]' : 'node-spring z-10',
        isWireTarget
          ? 'border-emerald-400/80 ring-2 ring-emerald-400/35'
          : isMatched
            ? 'border-sky-400/75 ring-2 ring-sky-400/30 shadow-[0_0_28px_rgba(56,189,248,0.18)]'
            : 'border-white/[0.08] hover:border-white/[0.16]',
        isDimmed ? 'opacity-25 saturate-50' : 'opacity-100',
      ].join(' ')}
    >
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
            'absolute z-30 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-white/25 bg-[#0B0D10] transition-all duration-150',
            'hover:scale-125 hover:border-sky-400 hover:bg-sky-400/20',
            isWiringActive ? 'opacity-100 scale-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            className,
          ].join(' ')}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
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
          'node-drag-handle flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2',
          isDragging ? 'is-dragging' : '',
        ].join(' ')}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
          <TypeIcon className={`h-3.5 w-3.5 shrink-0 ${typeMeta.accent}`} aria-hidden="true" />
          <span className="truncate text-[11px] font-medium tracking-wide text-zinc-400">
            {node.type === 'text' && node.title
              ? node.title
              : node.type === 'color' && node.label
                ? node.label
                : node.type === 'image' && node.fileName
                  ? node.fileName
                  : typeMeta.label}
          </span>
        </div>

        <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
          {node.type === 'text' && (
            <button
              type="button"
              aria-pressed={node.monospace}
              aria-label="Toggle monospace font"
              title={node.monospace ? 'Switch to proportional font' : 'Switch to monospace font'}
              onClick={() => onUpdateNode(node.id, { monospace: !node.monospace })}
              className={[
                'flex h-6 w-6 items-center justify-center rounded-md text-xs transition-colors',
                node.monospace
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200',
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
              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.07] hover:text-zinc-100"
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
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
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
        <div className="p-3">
          <textarea
            ref={textareaRef}
            value={node.content}
            placeholder="Write a note, code snippet, or lyrics..."
            spellCheck={!node.monospace}
            onChange={(e) => onUpdateNode(node.id, { content: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
            rows={3}
            className={[
              'vault-scroll w-full resize-none bg-transparent text-[13px] leading-relaxed text-zinc-100 placeholder:text-zinc-600 focus:outline-none',
              node.monospace ? 'font-mono-code text-[12.5px] text-emerald-100/95' : '',
            ].join(' ')}
          />
        </div>
      )}

      {node.type === 'color' && (
        <div className="p-2.5">
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
            className="swatch-contrast-text flex h-24 w-full flex-col items-start justify-between rounded-lg border border-white/10 p-3 text-left transition-transform active:scale-[0.98]"
          >
            <span className="rounded-md bg-black/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-xs">
              {copied ? 'Copied' : 'Click to copy'}
            </span>
            <span className="font-mono-code text-base font-semibold tracking-tight">
              {node.hex}
            </span>
          </button>
        </div>
      )}

      {node.type === 'link' && (
        <div className="flex flex-col gap-2.5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-medium text-sky-300">
              <Globe className="h-3 w-3" aria-hidden="true" />
              {node.domain}
            </span>
            <a
              href={node.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${node.domain} in new tab`}
              title="Open link"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[11px] font-medium text-zinc-200 transition-colors hover:border-sky-400/40 hover:bg-sky-500/15 hover:text-sky-200"
            >
              Open
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
          <p className="line-clamp-2 break-all text-[12.5px] leading-snug text-zinc-300">
            {node.title || node.url}
          </p>
        </div>
      )}

      {node.type === 'image' && (
        <div className="relative p-2">
          <div className="overflow-hidden rounded-lg border border-white/[0.06] bg-black/40">
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
            className="absolute bottom-3 right-3 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-md border border-white/15 bg-[#0B0D10]/85 text-zinc-300 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
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
