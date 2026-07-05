/**
 * AI provider selection: real Anthropic adapter when an API key is
 * configured, otherwise the offline mock (responses labelled as samples).
 */
import type { AiProviderPort } from '../ports/index.js';
import { AnthropicAdapter } from '../adapters/anthropic-adapter.js';
import { MockAiAdapter } from '../adapters/mock-ai-adapter.js';

let instance: AiProviderPort | null = null;

export function isRealAiConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY ?? '';
  // exclude the .env.example placeholder ("sk-ant-...") and obvious junk
  return key.startsWith('sk-ant-') && key.length > 20 && !key.includes('...');
}

export function getAiProvider(): AiProviderPort {
  if (!instance) instance = isRealAiConfigured() ? new AnthropicAdapter() : new MockAiAdapter();
  return instance;
}
