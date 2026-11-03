/** Offline production-loop dependencies, mounted by the test-only Loader tree. */
import type { Context } from '@deepseek-ai/cordis';
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit';
import { LlmAdapter } from '@deepseek-ai/dsh-llm';

class OfflineCodex extends LlmAdapter {
  async resolveModel(provider: string, model: string) {
    return {
      provider, id: model, name: model,
      ...model === 'unsupported' ? {} : {
        serviceTiers: model === 'priority-only' ? ['priority'] as const : ['default', 'priority'] as const,
      },
    };
  }
  async *stream(): AsyncGenerator<never> {
    throw new Error('Offline tests must never dispatch a model request');
  }
}

export async function apply(ctx: Context) {
  await mountAgentLoopTestDependencies(ctx);
  ctx.effect(() => ctx.get('llm')!.registerAdapter(['openai-codex', 'other'], new OfflineCodex()));
}
