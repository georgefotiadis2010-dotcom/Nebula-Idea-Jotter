import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  MoreHorizontal,
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
  { id: 'title', label: 'Titles' },
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div
        ref={menuRef}
        role="toolbar"
        aria-label="SnippetVault controls"
        className="labs-surface pointer-events-auto relative flex items-center gap-2 rounded-full border border-white/[0.1] px-3 py-1.5"
      >
        {/* Minimal Brand */}
        <div className="flex items-center gap-2 pl-1 pr-1">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <span className="hidden text-xs font-semibold tracking-tight text-zinc-100 sm:inline">
            SnippetVault
          </span>
        </div>

        <span role="separator" aria-orientation="vertical" className="h-4 w-px bg-white/[0.08]" />

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
            placeholder="Search..."
            aria-label="Search nodes"
            className="h-7 w-36 rounded-full bg-white/[0.04] pl-8 pr-12 text-xs text-zinc-100 placeholder:text-zinc-500 focus:bg-white/[0.07] focus:outline-none sm:w-48"
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
                className="flex h-4 w-4 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <kbd className="pointer-events-none absolute right-2 hidden rounded bg-white/[0.06] px-1.5 py-0.5 font-mono-code text-[9.5px] text-zinc-400 sm:inline-block">
              ⌘K
            </kbd>
          )}
        </div>

        <span role="separator" aria-orientation="vertical" className="h-4 w-px bg-white/[0.08]" />

        {/* Zoom Reset */}
        <button
          type="button"
          onClick={onResetZoom}
          title="Reset zoom (100%)"
          aria-label="Reset zoom to 100%"
          className="inline-flex h-7 items-center justify-center rounded-full px-2.5 font-mono-code text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
        >
          {Math.round(zoom * 100)}%
        </button>

        {/* Overflow Menu for Filters, Sound, Export/Import, Reset */}
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-label="Board options"
          title="Filters & board options"
          onClick={() => setMenuOpen((o) => !o)}
          className={[
            'flex h-7 w-7 items-center justify-center rounded-full transition-colors',
            menuOpen || activeFilter !== 'all'
              ? 'bg-sky-500/20 text-sky-300'
              : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white',
          ].join(' ')}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>

        {menuOpen && (
          <div className="labs-surface absolute right-0 top-11 z-50 w-60 rounded-2xl border border-white/[0.1] p-2.5 shadow-2xl">
            <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Filter Type
            </p>
            <div className="flex flex-wrap gap-1 pb-2.5">
              {FILTERS.map((f) => {
                const active = activeFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onFilterChange(f.id)}
                    className={[
                      'inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition-colors',
                      active
                        ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35'
                        : 'bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100',
                    ].join(' ')}
                  >
                    <span>{f.label}</span>
                    <span className="font-mono-code text-[10px] opacity-65">{counts[f.id]}</span>
                  </button>
                );
              })}
            </div>

            <div className="my-1 h-px bg-white/[0.08]" />

            <div className="flex flex-col gap-0.5 pt-1">
              <button
                type="button"
                onClick={onToggleMute}
                className="flex h-8 w-full items-center justify-between rounded-xl px-2.5 text-xs text-zinc-200 transition-colors hover:bg-white/[0.08]"
              >
                <span className="flex items-center gap-2">
                  {isMuted ? (
                    <VolumeX className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
                  )}
                  Micro-sounds
                </span>
                <span className="text-[11px] text-zinc-400">{isMuted ? 'Off' : 'On'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onExportJson();
                  setMenuOpen(false);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-xs text-zinc-200 transition-colors hover:bg-white/[0.08]"
              >
                <Download className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                Export .json
              </button>

              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                  setMenuOpen(false);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-xs text-zinc-200 transition-colors hover:bg-white/[0.08]"
              >
                <Upload className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                Import .json
              </button>

              <button
                type="button"
                onClick={() => {
                  onResetBoard();
                  setMenuOpen(false);
                }}
                className="flex h-8 w-full items-center gap-2 rounded-xl px-2.5 text-xs text-rose-300 transition-colors hover:bg-rose-500/15"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset board
              </button>
            </div>
          </div>
        )}

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
      </div>
    </header>
  );
};
