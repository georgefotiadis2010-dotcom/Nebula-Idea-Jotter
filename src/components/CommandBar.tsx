import React, { useEffect, useRef } from 'react';
import {
  Download,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { FilterType } from '../types/vault';

interface CommandBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onCycleMatch: () => void;
  matchCount: number;
  activeMatchIndex: number;
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  zoom: number;
  onResetZoom: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  onExportJson: () => void;
  onImportFile: (file: File) => void;
  onResetBoard: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  counts: Record<FilterType, number>;
}

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'text', label: 'Notes' },
  { id: 'color', label: 'Colors' },
  { id: 'link', label: 'Links' },
  { id: 'image', label: 'Images' },
];

export const CommandBar: React.FC<CommandBarProps> = ({
  searchQuery,
  onSearchChange,
  onCycleMatch,
  matchCount,
  activeMatchIndex,
  activeFilter,
  onFilterChange,
  zoom,
  onResetZoom,
  isMuted,
  onToggleMute,
  onExportJson,
  onImportFile,
  onResetBoard,
  searchInputRef,
  counts,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Roving-tabindex fallback when native `focusgroup` is unsupported
  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar || 'focusGroup' in HTMLElement.prototype) return;

    const getItems = () =>
      Array.from(bar.querySelectorAll<HTMLElement>('button:not([disabled]), input'));

    const init = () => {
      const items = getItems();
      items.forEach((el, idx) => {
        if (!el.hasAttribute('data-roving-init')) {
          el.tabIndex = idx === 0 ? 0 : -1;
          el.setAttribute('data-roving-init', '1');
        }
      });
    };
    init();

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const items = getItems();
      if (items.includes(target)) {
        items.forEach((el) => {
          el.tabIndex = el === target ? 0 : -1;
        });
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;

      const items = getItems();
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (idx === -1) return;

      e.preventDefault();
      let nextIdx = idx;
      if (e.key === 'ArrowRight') nextIdx = (idx + 1) % items.length;
      else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + items.length) % items.length;
      else if (e.key === 'Home') nextIdx = 0;
      else if (e.key === 'End') nextIdx = items.length - 1;

      items[nextIdx]?.focus();
    };

    bar.addEventListener('focusin', onFocusIn);
    bar.addEventListener('keydown', onKeyDown);
    return () => {
      bar.removeEventListener('focusin', onFocusIn);
      bar.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-label="SnippetVault controls"
        {...({ focusgroup: 'toolbar wrap' } as Record<string, string>)}
        className="glass-bubble pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-full border border-white/[0.12] px-4 py-2"
      >
        {/* Brand */}
        <div className="flex items-center gap-2 pr-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-500/15 text-sky-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <span className="hidden text-xs font-semibold tracking-tight text-zinc-100 sm:inline">
            SnippetVault
          </span>
        </div>

        <span role="separator" aria-orientation="vertical" className="h-5 w-px bg-white/[0.08]" />

        {/* Live Search */}
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-500"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matchCount > 0) {
                e.preventDefault();
                onCycleMatch();
              } else if (e.key === 'Escape') {
                onSearchChange('');
                e.currentTarget.blur();
              }
            }}
            placeholder="Search nodes..."
            aria-label="Search nodes"
            className="h-8 w-40 rounded-lg border border-white/[0.07] bg-white/[0.03] pl-8 pr-14 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-sky-400/50 focus:bg-white/[0.05] focus:outline-none sm:w-52"
          />
          {searchQuery ? (
            <div className="absolute right-1.5 flex items-center gap-1">
              <span className="font-mono-code text-[10px] text-zinc-400">
                {matchCount > 0 ? `${activeMatchIndex + 1}/${matchCount}` : '0'}
              </span>
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onSearchChange('')}
                className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <kbd className="pointer-events-none absolute right-2 hidden rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono-code text-[10px] text-zinc-500 sm:inline-block">
              ⌘K
            </kbd>
          )}
        </div>

        <span role="separator" aria-orientation="vertical" className="hidden h-5 w-px bg-white/[0.08] md:block" />

        {/* Type Filters */}
        <div role="group" aria-label="Filter by node type" className="flex items-center gap-1">
          {FILTERS.map((f) => {
            const active = activeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => onFilterChange(f.id)}
                className={[
                  'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35'
                    : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200',
                ].join(' ')}
              >
                <span>{f.label}</span>
                <span className="font-mono-code text-[10px] opacity-65">{counts[f.id]}</span>
              </button>
            );
          })}
        </div>

        <span role="separator" aria-orientation="vertical" className="h-5 w-px bg-white/[0.08]" />

        {/* Viewport & Audio & Board Actions */}
        <div role="group" aria-label="Canvas actions" className="flex items-center gap-1">
          <button
            type="button"
            onClick={onResetZoom}
            title="Reset zoom & center (100%)"
            aria-label="Reset zoom to 100%"
            className="inline-flex h-7 min-w-[3.2rem] items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 font-mono-code text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            aria-pressed={isMuted}
            aria-label={isMuted ? 'Unmute micro-sounds' : 'Mute micro-sounds'}
            title={isMuted ? 'Unmute micro-sounds' : 'Mute micro-sounds'}
            onClick={onToggleMute}
            className={[
              'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
              isMuted
                ? 'bg-white/[0.04] text-zinc-500 hover:text-zinc-300'
                : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white',
            ].join(' ')}
          >
            {isMuted ? (
              <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onExportJson}
            title="Export board as .json"
            aria-label="Export board as JSON"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import .json board (or drop file on canvas)"
            aria-label="Import JSON board"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportFile(file);
              e.currentTarget.value = '';
            }}
          />

          <button
            type="button"
            onClick={onResetBoard}
            title="Reset to starter board"
            aria-label="Reset starter board"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.08] hover:text-rose-300"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};
