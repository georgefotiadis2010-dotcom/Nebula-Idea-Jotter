import React from 'react';
import {
  LayoutGrid,
  Link2,
  Network,
  Palette,
  Sparkles,
  StickyNote,
} from 'lucide-react';

interface LeftDockProps {
  viewMode: 'canvas' | 'grid';
  onToggleView: (mode: 'canvas' | 'grid') => void;
  onAddNote: () => void;
  onAddColor: () => void;
  onAddLink: () => void;
  onTidyLayout: () => void;
}

export const LeftDock: React.FC<LeftDockProps> = ({
  viewMode,
  onToggleView,
  onAddNote,
  onAddColor,
  onAddLink,
  onTidyLayout,
}) => {
  return (
    <nav
      aria-label="Creation tools"
      className="labs-surface fixed left-4 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1.5 rounded-full border border-white/[0.08] p-1.5"
    >
      {/* View Mode Switcher */}
      <button
        type="button"
        onClick={() => onToggleView('canvas')}
        aria-pressed={viewMode === 'canvas'}
        title="Spatial Canvas View"
        aria-label="Spatial Canvas View"
        className={[
          'flex h-9 w-9 items-center justify-center rounded-full transition-all',
          viewMode === 'canvas'
            ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/35'
            : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100',
        ].join(' ')}
      >
        <Network className="h-4 w-4" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={() => onToggleView('grid')}
        aria-pressed={viewMode === 'grid'}
        title="Bento Grid View"
        aria-label="Bento Grid View"
        className={[
          'flex h-9 w-9 items-center justify-center rounded-full transition-all',
          viewMode === 'grid'
            ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/35'
            : 'text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100',
        ].join(' ')}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
      </button>

      <span className="my-0.5 h-px w-5 bg-white/[0.08]" role="separator" />

      {/* Quick Create */}
      <button
        type="button"
        onClick={onAddNote}
        title="New Note"
        aria-label="New Note"
        className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <StickyNote className="h-4 w-4" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onAddColor}
        title="New Color Swatch"
        aria-label="New Color Swatch"
        className="flex h-9 w-9 items-center justify-center rounded-full text-amber-300/90 transition-colors hover:bg-white/[0.08] hover:text-amber-200"
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onAddLink}
        title="New Link Bookmark"
        aria-label="New Link Bookmark"
        className="flex h-9 w-9 items-center justify-center rounded-full text-sky-300/90 transition-colors hover:bg-white/[0.08] hover:text-sky-200"
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
      </button>

      {viewMode === 'canvas' && (
        <>
          <span className="my-0.5 h-px w-5 bg-white/[0.08]" role="separator" />
          <button
            type="button"
            onClick={onTidyLayout}
            title="Tidy & Auto-Arrange Canvas"
            aria-label="Tidy & Auto-Arrange Canvas"
            className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-300/90 transition-colors hover:bg-emerald-500/15 hover:text-emerald-200"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </nav>
  );
};
