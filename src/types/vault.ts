export type NodeType = 'title' | 'text' | 'color' | 'link' | 'image';

export type FilterType = 'all' | NodeType;

export type PortCorner = 'tl' | 'tr' | 'bl' | 'br';

export interface BaseVaultNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height?: number;
  createdAt: number;
  updatedAt: number;
}

export interface TitleVaultNode extends BaseVaultNode {
  type: 'title';
  heading: string;
  subtitle?: string;
  collapsed?: boolean;
}

export interface TextVaultNode extends BaseVaultNode {
  type: 'text';
  content: string;
  monospace: boolean;
  title?: string;
}

export interface ColorVaultNode extends BaseVaultNode {
  type: 'color';
  hex: string;
  label?: string;
}

export interface LinkVaultNode extends BaseVaultNode {
  type: 'link';
  url: string;
  domain: string;
  title?: string;
}

export interface ImageVaultNode extends BaseVaultNode {
  type: 'image';
  dataUrl: string;
  fileName?: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

export type VaultNode = TitleVaultNode | TextVaultNode | ColorVaultNode | LinkVaultNode | ImageVaultNode;

export interface VaultEdge {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePort?: PortCorner;
  targetPort?: PortCorner;
  label?: string;
  createdAt: number;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface VaultBoardData {
  version: number;
  nodes: VaultNode[];
  edges: VaultEdge[];
  viewport: ViewportState;
  exportedAt?: number;
}

export interface NodeSize {
  width: number;
  height: number;
}
