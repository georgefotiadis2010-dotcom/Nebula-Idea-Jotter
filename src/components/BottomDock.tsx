import React from 'react';
import {
  LayoutGrid,
  Link2,
  Network,
  Palette,
  Sparkles,
  StickyNote,
} from 'lucide-react';

interface BottomDockProps {
  viewMode: 'canvas' | 'grid';
  onToggleView: (mode: 'canvas' | 'grid') => void;
  onAddNote: () => void;
  onAddColor: () => void;
  onAddLink: () => void;
  onTidyLayout: () => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  viewMode,
  onToggleView,
  onAddNote,
  onAddColor,
  onAddLink,
  onTidyLayout,
}) => {
  return (
    <nav
      aria-label="Tabletop actions"
      className="labs-surface fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/[0.1] px-2 py-1.5"
    >
      {/* Quick-Create Tabletop Artifacts */}
      <button
        type="button"
        onClick={onAddNote}
        title="Add Note"
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <StickyNote className="h-3.5 w-3.5 text-zinc-300" aria-hidden="true" />
        <span className="hidden sm:inline">Note</span>
      </button>

      <button
        type="button"
        onClick={onAddColor}
        title="Add Color Chip"
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <Palette className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
        <span className="hidden sm:inline">Swatch</span>
      </button>

      <button
        type="button"
        onClick={onAddLink}
        title="Add Link Clipping"
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <Link2 className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />
        <span className="hidden sm:inline">Link</span>
      </button>

      <span className="mx-1 h-4 w-px bg-white/[0.1]" role="separator" />

      {/* View Mode Switcher */}
      <button
        type="button"
        onClick={() => onToggleView('canvas')}
        aria-pressed={viewMode === 'canvas'}
        title="Tabletop Canvas"
        className={[
          'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all',
          viewMode === 'canvas'
            ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35'
            : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100',
        ].join(' ')}
      >
        <Network className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden md:inline">Tabletop</span>
      </button>

      <button
        type="button"
        onClick={() => onToggleView('grid')}
        aria-pressed={viewMode === 'grid'}
        title="Grid View"
        className={[
          'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all',
          viewMode === 'grid'
            ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/35'
            : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100',
        ].join(' ')}
      >
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden md:inline">Grid</span>
      </button>

      {viewMode === 'canvas' && (
        <>
          <span className="mx-1 h-4 w-px bg-white/[0.1]" role="separator" />
          <button
            type="button"
            onClick={onTidyLayout}
            title="Tidy Tabletop"
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 text-xs font-medium text-emerald-200 ring-1 ring-emerald-400/25 transition-colors hover:bg-emerald-500/25"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Tidy</span>
          </button>
        </>
      )}
    </nav>
  );
};
