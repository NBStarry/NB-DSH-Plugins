import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import { resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { createAdapter, PROVIDER, validateModels } from './runtime.js';

export const name = 'phanthy-models';
export const inject = ['llm'];

// No login, endpoint probe, or process spawn occurs during activation.
export function apply(ctx, config = {}) {
  const models = validateModels(config.models ?? []);
  if (!models.length) return;
  const defaultGateway = resolve(fileURLToPath(new URL('.', import.meta.url)), '../phanthy-dsh-gateway/gateway.py');
  const runtime = createAdapter({
    models, gatewayPath: config.gatewayPath ?? defaultGateway,
    python: config.python ?? 'python3', pool: config.pool ?? 'auto',
    PiAiAdapter, anthropicMessagesApi,
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments, (hostPath) => ctx.get('fs')?.processPathFromHostPath(hostPath), ref),
  });
  ctx.effect(() => {
    try {
      const unregister = ctx.llm.registerAdapter([PROVIDER], runtime.adapter);
      return () => { try { unregister(); } finally { runtime.dispose(); } };
    } catch (error) { runtime.dispose(); throw error; }
  });
}
