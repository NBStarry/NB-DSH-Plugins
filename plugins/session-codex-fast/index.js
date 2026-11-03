/** Host policy: only future native agent creation, never adoption of live agents. */
import z from '@deepseek-ai/schemastery';
import { defaultNewSession } from './policy.js';

export const name = 'codex-fast';
export const inject = ['llm'];

/** Native Plugin settings persist this policy through the Loader. */
export const Config = z.object({
  defaultForNewSessions: z.boolean().default(true).description('Enable Fast for new Codex sessions / 新 Codex 会话默认开启 Fast'),
});

/**
 * Register an awaited creation policy; disposing only removes future behavior.
 * @param {object} ctx - Cordis context with llm capability lookup.
 * @param {object} config - Validated configuration.
 */
export function apply(ctx, config) {
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort());
  ctx.on('agent/created', async payload => {
    const signal = payload.signal === undefined ? lifetime.signal
      : AbortSignal.any([payload.signal, lifetime.signal]);
    try { await defaultNewSession(ctx, config, { ...payload, signal }); }
    catch (error) {
      if (!lifetime.signal.aborted) throw error;
      // Unloading withdraws only this policy's metadata lookup, not the Agent.
    }
  });
}
