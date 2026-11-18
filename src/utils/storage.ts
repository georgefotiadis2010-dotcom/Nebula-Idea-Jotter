import type { VaultBoardData, VaultEdge, VaultNode, ViewportState } from '../types/vault';

const DB_NAME = 'SnippetVaultDB';
const DB_VERSION = 1;
const STORE_NAME = 'board';
const BOARD_KEY = 'default';
const LS_FALLBACK_KEY = 'snippetvault_board_v1';

export function createStarterBoard(): VaultBoardData {
  const now = Date.now();
  const nodes: VaultNode[] = [
    {
      id: 'node-welcome',
      type: 'text',
      x: 160,
      y: 160,
      width: 310,
      content:
        'Welcome to SnippetVault.\n\n• Paste (⌘/Ctrl + V) anywhere to spawn text, #hex colors, URLs, or screenshots.\n• Double-click empty space for a quick note.\n• Drag within 220px to magnetically tether.',
      monospace: false,
      title: 'Studio Quickstart',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'node-color',
      type: 'color',
      x: 560,
      y: 130,
      width: 220,
      hex: '#38BDF8',
      label: 'Electric Sky',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'node-code',
      type: 'text',
      x: 540,
      y: 340,
      width: 320,
      content: `const tether = (a, b) => {\n  const d = Math.hypot(b.x - a.x, b.y - a.y);\n  return d <= 220;\n};`,
      monospace: true,
      title: 'magnetic-snap.ts',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'node-link',
      type: 'link',
      x: 180,
      y: 420,
      width: 280,
      url: 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API',
      domain: 'developer.mozilla.org',
      title: 'Web Audio API — MDN Reference',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const edges: VaultEdge[] = [
    {
      id: 'edge-1',
      sourceId: 'node-welcome',
      targetId: 'node-color',
      sourcePort: 'tr',
      targetPort: 'tl',
      createdAt: now,
    },
    {
      id: 'edge-2',
      sourceId: 'node-color',
      targetId: 'node-code',
      sourcePort: 'bl',
      targetPort: 'tr',
      createdAt: now,
    },
    {
      id: 'edge-3',
      sourceId: 'node-welcome',
      targetId: 'node-link',
      sourcePort: 'bl',
      targetPort: 'tl',
      createdAt: now,
    },
  ];

  return {
    version: 1,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open error'));
  });
}

export async function loadBoard(): Promise<VaultBoardData> {
  try {
    const db = await openDB();
    const data = await new Promise<VaultBoardData | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(BOARD_KEY);
      req.onsuccess = () => resolve(req.result as VaultBoardData | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) {
      return {
        version: data.version ?? 1,
        nodes: data.nodes,
        edges: data.edges,
        viewport: data.viewport ?? { x: 0, y: 0, zoom: 1 },
      };
    }
  } catch {
    // Fallback to localStorage below
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as VaultBoardData;
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
        return {
          version: parsed.version ?? 1,
          nodes: parsed.nodes,
          edges: parsed.edges,
          viewport: parsed.viewport ?? { x: 0, y: 0, zoom: 1 },
        };
      }
    }
  } catch {
    // Ignore parse/storage errors
  }

  return createStarterBoard();
}

export async function saveBoard(data: VaultBoardData): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, BOARD_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    // Fallback to localStorage
    try {
      localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(data));
    } catch {
      // Storage quota exceeded or blocked
    }
  }
}

export function exportBoardJson(data: VaultBoardData): void {
  const payload: VaultBoardData = {
    ...data,
    version: 1,
    exportedAt: Date.now(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `snippetvault-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseImportedBoardJson(rawText: string): VaultBoardData {
  const parsed = JSON.parse(rawText) as Partial<VaultBoardData>;
  if (!parsed || !Array.isArray(parsed.nodes)) {
    throw new Error('Invalid SnippetVault JSON: missing nodes array');
  }

  const validNodes: VaultNode[] = parsed.nodes.filter(
    (n): n is VaultNode =>
      Boolean(n && typeof n.id === 'string' && typeof n.type === 'string' && typeof n.x === 'number' && typeof n.y === 'number')
  );

  const nodeIds = new Set(validNodes.map((n) => n.id));
  const validEdges: VaultEdge[] = Array.isArray(parsed.edges)
    ? parsed.edges.filter(
        (e): e is VaultEdge =>
          Boolean(
            e &&
              typeof e.id === 'string' &&
              typeof e.sourceId === 'string' &&
              typeof e.targetId === 'string' &&
              nodeIds.has(e.sourceId) &&
              nodeIds.has(e.targetId) &&
              e.sourceId !== e.targetId
          )
      )
    : [];

  const vp: ViewportState =
    parsed.viewport &&
    typeof parsed.viewport.x === 'number' &&
    typeof parsed.viewport.y === 'number' &&
    typeof parsed.viewport.zoom === 'number'
      ? parsed.viewport
      : { x: 0, y: 0, zoom: 1 };

  return {
    version: 1,
    nodes: validNodes,
    edges: validEdges,
    viewport: vp,
  };
}
