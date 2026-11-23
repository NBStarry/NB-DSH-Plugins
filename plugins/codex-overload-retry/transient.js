/** Classify exact Codex transient failures; native retry alone owns recovery and budgets. */
export const name = 'codex-transient-retry';
export const inject = ['llm'];
const OVERLOAD = 'Codex error: Our servers are currently overloaded. Please try again later.';
const WEBSOCKET = new Set(['WebSocket error', 'Codex error: WebSocket error']);

export function apply(ctx) {
  ctx.on('llm/stream', async function* (options, next) {
    for await (const chunk of next()) {
      const failure = chunk.type === 'finish' && chunk.reason.kind === 'error' ? chunk.reason.failure : undefined;
      let code;
      if (options.provider === 'openai-codex' && !options.signal?.aborted && failure?.code === 'PI_AI_ERROR') {
        if (failure.message === OVERLOAD && (failure.status === undefined || failure.status === 503)) code = 'SERVER';
        else if (WEBSOCKET.has(failure.message) && failure.status === undefined) code = 'TRANSPORT';
      }
      yield code === undefined ? chunk : { ...chunk, reason: { ...chunk.reason, failure: { ...failure, code } } };
    }
  });
}
