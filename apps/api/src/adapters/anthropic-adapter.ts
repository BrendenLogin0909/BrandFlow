/**
 * AnthropicAdapter — AiProviderPort implementation using structured tool-use
 * output. Each pipeline step has a versioned prompt template; output is
 * Zod-parsed with a repair loop (max 2 attempts) before resolving.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { AiCompletionMeta, AiProviderPort, PipelineStep } from '../ports/index.js';
import { PROMPT_TEMPLATES } from '../ai/prompts/index.js';
import { modelFor } from '../ai/models.js';

const MAX_REPAIRS = 2;

export class AnthropicAdapter implements AiProviderPort {
  private client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    this.client = new Anthropic({ apiKey });
  }

  async complete<T>(
    step: PipelineStep,
    input: unknown,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; meta: AiCompletionMeta }> {
    const template = PROMPT_TEMPLATES[step];
    const model = modelFor('anthropic', step);
    let tokensUsed = 0;
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
      const repairNote =
        attempt === 0
          ? ''
          : `\n\nYour previous output failed validation:\n${lastError}\nReturn corrected JSON that satisfies the schema exactly.`;

      const response = await this.client.messages.create({
        model,
        max_tokens: 8192,
        system: template.system,
        messages: [{ role: 'user', content: template.render(input) + repairNote }],
        tools: [
          {
            name: 'submit_result',
            description: `Submit the structured result for the ${step} step`,
            input_schema: template.jsonSchema as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: 'submit_result' },
      });

      tokensUsed += response.usage.input_tokens + response.usage.output_tokens;
      const toolUse = response.content.find((b) => b.type === 'tool_use');
      const parsed = schema.safeParse(toolUse && 'input' in toolUse ? toolUse.input : undefined);

      if (parsed.success) {
        return {
          data: parsed.data,
          meta: { model, promptVersion: template.version, tokensUsed },
        };
      }
      lastError = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('\n');
    }

    throw new AiOutputError(step, lastError);
  }
}

export class AiOutputError extends Error {
  constructor(
    public step: PipelineStep,
    public violations: string,
  ) {
    super(`AI step "${step}" failed schema validation after ${MAX_REPAIRS + 1} attempts`);
    this.name = 'AiOutputError';
  }
}
