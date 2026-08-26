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
import { modelFor, VISION_STEPS, visionModelFor } from '../ai/models.js';

const MAX_REPAIRS = 2;

export class OpenAIAdapter implements AiProviderPort {
  private client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    // fail fast instead of the SDK's 10-minute default — a hung call should
    // hit the repair loop, not freeze the request
    this.client = new OpenAI({ apiKey, timeout: 120_000, maxRetries: 1 });
  }

  async complete<T>(
    step: PipelineStep,
    input: unknown,
    schema: z.ZodType<T>,
  ): Promise<{ data: T; meta: AiCompletionMeta }> {
    const template = PROMPT_TEMPLATES[step];
    const model = modelFor('openai', step);
    if (VISION_STEPS.has(step)) {
      const choice = visionModelFor('openai');
      if (choice.fellBackFrom)
        console.warn(
          `[ai] step "${step}" needs image input but ${choice.fellBackFrom} is text-only — using ${choice.model} instead`,
        );
    }
    const images = template.images?.(input) ?? [];
    let tokensUsed = 0;
    let lastError = '';

    for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
      const repairNote =
        attempt === 0
          ? ''
          : `\n\nYour previous output failed validation:\n${lastError}\nReturn corrected arguments that satisfy the schema exactly.`;

      const userText = template.render(input) + repairNote;
      const userContent: OpenAI.Chat.ChatCompletionUserMessageParam['content'] = images.length
        ? [
            ...images.map(
              (img): OpenAI.Chat.ChatCompletionContentPart => ({
                type: 'image_url',
                image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
              }),
            ),
            { type: 'text' as const, text: userText },
          ]
        : userText;

      const response = await this.client.chat.completions.create({
        model,
        // marketing copy doesn't need deep deliberation; default reasoning
        // effort on gpt-5-class models makes drafts take minutes
        ...(model.startsWith('gpt-5')
          ? { reasoning_effort: (process.env.AI_OPENAI_REASONING ?? 'low') as 'low' }
          : {}),
        messages: [
          { role: 'system', content: template.system },
          { role: 'user', content: userContent },
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
