/**
 * OpenAIAdapter — AiProviderPort implementation using function-calling for
 * structured output. Same contract as the Anthropic adapter: output is
 * Zod-parsed with a bounded repair loop before resolving, so downstream
 * code never sees provider differences.
 */
import OpenAI from 'openai';
import { z } from 'zod';
import type { AiCompletionMeta, AiProviderPort, PipelineStep } from '../ports/index.js';
import { PROMPT_TEMPLATES } from '../ai/prompts/index.js';
import { modelFor } from '../ai/models.js';

const MAX_REPAIRS = 2;

export class OpenAIAdapter implements AiProviderPort {
  private client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    this.client = new OpenAI({ apiKey });
  }

  async complete<T>(
    step: PipelineStep,
    input: unknown,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; meta: AiCompletionMeta }> {
    const template = PROMPT_TEMPLATES[step];
    const model = modelFor('openai', step);
    let tokensUsed = 0;
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
      const repairNote =
        attempt === 0
          ? ''
          : `\n\nYour previous output failed validation:\n${lastError}\nReturn corrected arguments that satisfy the schema exactly.`;

      const response = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: template.system },
          { role: 'user', content: template.render(input) + repairNote },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'submit_result',
              description: `Submit the structured result for the ${step} step`,
              parameters: template.jsonSchema,
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'submit_result' } },
      });

      tokensUsed += response.usage?.total_tokens ?? 0;
      const call = response.choices[0]?.message.tool_calls?.[0];
      let raw: unknown;
      try {
        raw = call?.type === 'function' ? JSON.parse(call.function.arguments) : undefined;
      } catch {
        raw = undefined;
      }
      const parsed = schema.safeParse(raw);

      if (parsed.success) {
        return { data: parsed.data, meta: { model, promptVersion: template.version, tokensUsed } };
      }
      lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    }

    throw new Error(`AI step "${step}" (openai) failed schema validation after ${MAX_REPAIRS + 1} attempts: ${lastError}`);
  }
}
