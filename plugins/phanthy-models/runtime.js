import { GatewayProcess } from './gateway-process.js';

export const PROVIDER = 'phanthy';
export const PROVIDERS = Object.freeze([PROVIDER]);
const POOLS = Object.freeze([{ suffix: '', label: 'auto', pool: 'auto' }, { suffix: '-cloud', label: 'cloud desktop', pool: 'cloud_desktop' }, { suffix: '-non-cloud', label: 'non-cloud', pool: 'non_cloud' }]);
export const NO_RETRIES = Object.freeze({ mode: 'normal', maxRetries: 0, retryableCodes: [], initialDelayMs: 1000, maxDelayMs: 30000, jitterRatio: 0 });

function requireSessionId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || /[^A-Za-z0-9._:-]/.test(value)) throw new Error('Phanthy requires a valid sessionId');
  return value;
}

// No default catalog or guessed model capacity: each entry must be user-supplied.
export function validateModels(value) {
  if (!Array.isArray(value)) throw new Error('Phanthy models must be an array');
  const seen = new Set();
  const models = value.map((m) => {
    if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id.trim() || m.id !== m.id.trim() || seen.has(m.id)) throw new Error('Phanthy model IDs must be unique, non-empty strings');
    if (!Number.isSafeInteger(m.contextWindow) || m.contextWindow <= 0 || !Number.isSafeInteger(m.maxTokens) || m.maxTokens <= 0 || m.maxTokens > m.contextWindow) throw new Error('Each Phanthy model needs a verified contextWindow and a positive request output budget maxTokens no greater than the context');
    if (m.name !== undefined && (typeof m.name !== 'string' || !m.name.trim())) throw new Error('Invalid Phanthy model name');
    if (m.input !== undefined && (!Array.isArray(m.input) || m.input.length === 0 || !m.input.includes('text') || m.input.some((v) => v !== 'text' && v !== 'image') || new Set(m.input).size !== m.input.length)) throw new Error('Phanthy input must contain text and optionally image');
    if (m.reasoning !== undefined && m.reasoning !== 'adaptive') throw new Error('Phanthy reasoning must be adaptive when configured');
    seen.add(m.id);
    return { id: m.id, name: m.name ?? m.id, contextWindow: m.contextWindow, maxTokens: m.maxTokens, input: [...(m.input ?? ['text'])], ...(m.reasoning ? { reasoning: m.reasoning } : {}) };
  });
  const aliases = new Set();
  for (const model of models) for (const { suffix } of POOLS) {
    const id = model.id + suffix;
    if (aliases.has(id)) throw new Error(`Phanthy model ID collision: ${id}`);
    aliases.add(id);
  }
  return models;
}

export function createAdapter({ models: rawModels, gatewayPath, python, pool, PiAiAdapter, anthropicMessagesApi, resolveAttachments, resolveImageAccess, spawnProcess, startupMs }) {
  const models = validateModels(rawModels);
  // Legacy pool is accepted for configuration compatibility, but selection is
  // now exclusively per model alias: the unsuffixed model always means auto.
  if (pool !== undefined && !['auto', 'cloud_desktop', 'non_cloud'].includes(pool)) throw new Error('Invalid Phanthy pool');
  const routes = new Map();
  for (const model of models) for (const choice of POOLS) {
    const id = model.id + choice.suffix;
    routes.set(id, { id, model, pool: choice.pool, name: `${model.name} (${choice.label})`,
      gateway: new GatewayProcess({ gatewayPath, python, pool: choice.pool, spawnProcess, startupMs }) });
  }
  const checkProvider = (provider) => {
    if (provider !== PROVIDER) throw new Error('Phanthy adapter does not own this provider');
  };
  const materialize = (baseURL) => [...routes.values()].map(({ id, name, model: m }) => ({
    id, name, api: 'anthropic-messages', provider: PROVIDER,
    baseUrl: baseURL, input: m.input, reasoning: m.reasoning === 'adaptive',
    ...(m.reasoning === 'adaptive' ? {
      compat: { forceAdaptiveThinking: true },
      thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
    } : {}),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.contextWindow, maxTokens: m.maxTokens,
  }));
  const makePi = (baseURL, key) => {
    const api = anthropicMessagesApi();
    // Keep the alias in pi-ai's model and replay identity. Rewrite only the
    // serialized request after pi-ai has transformed same/cross-model history.
    const withUpstreamModel = (model, options) => {
      const route = routes.get(model.id);
      if (!route) throw new Error('Unknown Phanthy model');
      const sessionId = requireSessionId(options.sessionId);
      const headers = new Headers(options.headers);
      headers.set('x-phanthy-session', sessionId);
      return { ...options, headers: Object.fromEntries(headers), onPayload: async (payload) => ({ ...payload, model: route.model.id }) };
    };
    const piProvider = {
      id: PROVIDER, name: 'Phanthy', baseUrl: baseURL,
      auth: { apiKey: { name: 'Local gateway', resolve: ({ credential }) => Promise.resolve({ auth: credential?.key === undefined ? {} : { apiKey: credential.key }, source: 'Local gateway' }) } },
      getModels: () => materialize(baseURL),
      stream: (model, context, options) => api.stream(model, context, withUpstreamModel(model, options)),
      streamSimple: (model, context, options) => api.streamSimple(model, context, withUpstreamModel(model, options)),
    };
    const profile = {
      provider: PROVIDER, displayName: 'Phanthy', piProvider,
      modelErrors: new Map(), configuredMaxTokens: new Map([...routes].map(([id, route]) => [id, route.model.maxTokens])),
      streamIdleTimeoutMs: 300000, maxRequestImageBytes: 20971520,
      requestImagePixelBudget: 4194304, requestImageMaxBytes: 1048576,
      retryPolicy: NO_RETRIES, cacheRetention: 'none',
    };
    const profiles = new Map([[PROVIDER, profile]]);
    return new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: async () => key,
      auth: {}, resolveAttachments, resolveImageAccess,
    });
  };
  // Metadata instances never do network I/O; online instances are per gateway.
  const metadata = makePi('http://127.0.0.1:1', undefined);
  let disposed = false;
  const getOnline = async (route) => {
    const endpoint = await route.gateway.start();
    if (disposed) throw new Error('Phanthy gateway has been disposed');
    if (!route.online || route.onlineEndpoint !== endpoint) {
      route.onlineEndpoint = endpoint;
      route.online = makePi(endpoint.baseURL, endpoint.key);
    }
    return route.online;
  };
  const waitForOnline = (route, signal) => {
    if (!signal) return getOnline(route);
    if (signal.aborted) return Promise.reject(new Error('Phanthy request aborted'));
    return new Promise((resolve, reject) => {
      const aborted = () => { cleanup(); reject(new Error('Phanthy request aborted')); };
      const cleanup = () => signal.removeEventListener('abort', aborted);
      signal.addEventListener('abort', aborted, { once: true });
      getOnline(route).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    });
  };
  const adapter = {
    providerInfo(provider) { checkProvider(provider); return { id: PROVIDER, name: 'Phanthy' }; },
    providerRetryPolicy(provider) { checkProvider(provider); return NO_RETRIES; },
    imageRequestPricing(provider) { checkProvider(provider); return undefined; },
    imageRequestTarget(provider, model, image) { checkProvider(provider); return metadata.imageRequestTarget(provider, model, image); },
    listModels(provider) { checkProvider(provider); return metadata.listModels(provider); },
    async resolveModel(provider, model, signal) {
      checkProvider(provider);
      const info = await metadata.resolveModel(provider, model, signal);
      return info.reasoning ? { ...info, reasoning: { ...info.reasoning, defaultEffort: 'medium' } } : info;
    },
    async prepareCall(provider, model, signal) {
      checkProvider(provider);
      const info = await this.resolveModel(provider, model, signal);
      return { model: info, stream: (options) => this.stream(options) };
    },
    async *stream(options) {
      checkProvider(options.provider);
      requireSessionId(options.sessionId);
      const info = await this.resolveModel(options.provider, options.model, options.signal);
      const reasoningEffort = options.reasoningEffort ?? info.reasoning?.defaultEffort;
      if (reasoningEffort !== undefined && !info.reasoning?.efforts.some(({ id }) => id === reasoningEffort)) throw new Error('Unsupported Phanthy reasoning effort');
      if (options.signal?.aborted) throw new Error('Phanthy request aborted');
      const route = routes.get(options.model);
      if (!route) throw new Error('Unknown Phanthy model');
      const current = await waitForOnline(route, options.signal);
      if (options.signal?.aborted) throw new Error('Phanthy request aborted');
      yield* current.stream({ ...options, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) });
    },
  };
  return { adapter, dispose: () => {
    if (disposed) return;
    disposed = true;
    for (const route of routes.values()) {
      route.online = undefined; route.onlineEndpoint = undefined;
      route.gateway.dispose();
    }
  } };
}
