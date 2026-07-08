/**
 * Ports — every external dependency sits behind one of these interfaces.
 * See docs/02-technical-architecture.md §5. Swapping a vendor means writing
 * one new adapter; domain services and routes never import vendor SDKs.
 */
import type { z } from 'zod';
import type { InternalDesignDocument, ValidationReport } from '@brandflow/design-schema';

// ---------- AiProviderPort ----------

export type PipelineStep =
  | 'brand_analysis'
  | 'brand_profile_draft'
  | 'content_strategy'
  | 'post_ideas'
  | 'post_copy'
  | 'visual_concept'
  | 'design_fill'
  | 'design_freeform'
  | 'design_patch'
  | 'compliance_review'
  | 'accessibility_review';

export interface AiCompletionMeta {
  model: string;
  promptVersion: string;
  tokensUsed: number;
}

export interface AiProviderPort {
  /**
   * Run one pipeline step. `input` is the fully assembled prompt payload
   * (built exclusively via buildBrandContext); the result is parsed against
   * `schema` with the repair loop applied before this resolves.
   */
  complete<T>(step: PipelineStep, input: unknown, schema: z.ZodType<T>): Promise<{ data: T; meta: AiCompletionMeta }>;
}

// ---------- DesignEnginePort ----------

export interface DesignEnginePort {
  /** Convert the authoritative internal document to the editor's native format. */
  toEngineFormat(doc: InternalDesignDocument): unknown;
  /** Convert editor output back; must preserve ids, locks, geometry, tokens. */
  fromEngineFormat(engineDoc: unknown, base: InternalDesignDocument): InternalDesignDocument;
  validate(doc: InternalDesignDocument): ValidationReport;
  duplicate(doc: InternalDesignDocument, newId: string): InternalDesignDocument;
  applyBrandTokens(doc: InternalDesignDocument, tokens: InternalDesignDocument['brandTokens']): InternalDesignDocument;
}

// ---------- RendererPort ----------

export interface RendererPort {
  renderPreviewPng(doc: InternalDesignDocument, pageIndex: number): Promise<Buffer>;
  exportPng(doc: InternalDesignDocument, pageIndex: number, scale?: number): Promise<Buffer>;
  exportPdf(doc: InternalDesignDocument): Promise<Buffer>;
}

// ---------- StoragePort ----------

export interface StoragePort {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, expiresSeconds: number): Promise<string>;
}

// ---------- AuthPort ----------

export interface AuthPort {
  hashPassword(plain: string): Promise<string>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
  issueTokens(userId: string): Promise<{ accessToken: string; refreshToken: string }>;
  verifyAccessToken(token: string): Promise<{ userId: string }>;
}

// ---------- AssetProviderPort ----------

export interface IconSearchResult {
  provider: 'lucide' | 'tabler' | 'internal';
  name: string;
  svg: string;
  licence: string;
}

export interface AssetProviderPort {
  searchIcons(query: string, style?: string, limit?: number): Promise<IconSearchResult[]>;
  getIcon(provider: string, name: string): Promise<IconSearchResult | null>;
}
