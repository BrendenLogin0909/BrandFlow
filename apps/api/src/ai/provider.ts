/**
 * AI provider selection.
 *
 * AI_PROVIDER env: 'anthropic' | 'openai' | 'mock' | unset (auto-detect).
 * Auto-detect prefers Anthropic when a real key is present, then OpenAI,
 * then falls back to the offline mock (responses labelled as samples).
 */
import type { AiProviderPort } from '../ports/index.js';
import { AnthropicAdapter } from '../adapters/anthropic-adapter.js';
import { OpenAIAdapter } from '../adapters/openai-adapter.js';
import { MockAiAdapter } from '../adapters/mock-ai-adapter.js';

export type ActiveProvider = 'anthropic' | 'openai' | 'mock';

let instance: AiProviderPort | null = null;
let active: ActiveProvider | null = null;

function realKey(value: string | undefined, prefix: string): boolean {
  const key = value ?? '';
  return key.startsWith(prefix) && key.length > 20 && !key.includes('...');
}

export function resolveProvider(): ActiveProvider {
  const forced = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (forced === 'anthropic' || forced === 'openai' || forced === 'mock')
    return forced as ActiveProvider;
  if (realKey(process.env.ANTHROPIC_API_KEY, 'sk-ant-')) return 'anthropic';
  if (realKey(process.env.OPENAI_API_KEY, 'sk-')) return 'openai';
  return 'mock';
}

export function activeProviderName(): ActiveProvider {
  return active ?? resolveProvider();
}

export function isRealAiConfigured(): boolean {
  return resolveProvider() !== 'mock';
}

export function getAiProvider(): AiProviderPort {
  if (!instance) {
    active = resolveProvider();
    instance =
      active === 'anthropic'
        ? new AnthropicAdapter()
        : active === 'openai'
          ? new OpenAIAdapter()
          : new MockAiAdapter();
  }
  return instance;
}
