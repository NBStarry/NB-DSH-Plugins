// Fingerprint-verified compatibility adapter, NOT a public DSH strategy API.
// It changes verified dynamically-dispatched methods; no Service is constructed,
// no second event listener is added and no preset/session is recomposed.
// Host version numbers only admit a generation (see host-version.js); the
// method fingerprints below decide whether the policy may activate.
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { compactWithOverflowFallback } from './overflow.js';
import { createPolicyEngine } from './engine.js';
import { resolveConfig } from './policy.js';

const KEY = Symbol.for('dsh-compaction-policy.global-adapter.v2');
const METHODS = ['compactIfNeeded', 'compactRegion', 'regionDependencies', 'summarize', 'compactNow'];
const raw = value => value?.[Symbol.for('cordis.original')] ?? value;
const rootOf = ctx => raw(ctx?.root);
const hash = fn => createHash('sha256').update(Function.prototype.toString.call(fn)).digest('hex');

/** Marks a host/environment mismatch that must disable the policy, not the host. */
export class UnsupportedHostError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'UnsupportedHostError';
    this.code = 'DSH_COMPACTION_POLICY_UNSUPPORTED_HOST';
  }
}

// Verified against the shipped Basic implementation shared byte-for-byte by
// DSH 0.2.0-rc.2, 0.2.1-rc.1 and 0.2.1-rc.2. The name is version-neutral on
// purpose: an upstream build whose methods still fingerprint identically
// needs no plugin change, whatever its version label says.
export const VERIFIED_BASIC_METHOD_HASHES = Object.freeze({
  compactIfNeeded: 'fd7625c4d66b8286fca1098ddd0b98f2afcf3e9d93ae821836f7df13d21404c3',
  compactRegion: 'a247e99c98e56c0236fae5eaa00a2de25f2bff26f8069fb8f637b759cf5a4efa',
  regionDependencies: '808f10f4e9550664dfd4054f624deb2b45283bef7fb6541fbce9f41a9a7dea13',
  summarize: 'ae745613f2a453b5beeb5de758b30c06bf7b8ff40498de404b7b63423f1cdb07',
  compactNow: '5c34231543f1d21c8e77404aae5f1b0bca4fbbce0514f8ae7fd6cb3bf7a4240a',
});
// Historical name, retained for existing importers/tests.
export const RC2_METHOD_HASHES = VERIFIED_BASIC_METHOD_HASHES;

// DSH 0.2.2-alpha.2 changes only compactIfNeeded among the five seams.
// Accept complete reviewed tuples, not independently mixed method hashes.
export const ALPHA2_METHOD_HASHES = Object.freeze({
  ...VERIFIED_BASIC_METHOD_HASHES,
  compactIfNeeded: 'e636f930c50bcb06d280923ff970acde8645921826d6ea6ce07a8a8301736d4d',
  compactPressure: 'b54fea7b67c72f32a563384d0c00d0025337df2f7e7905b091df8eae78863212',
});
export const VERIFIED_BASIC_METHOD_HASH_SETS = Object.freeze([
  VERIFIED_BASIC_METHOD_HASHES,
  ALPHA2_METHOD_HASHES,
]);

function acceptedHashSets(expectedHashes) {
  return Array.isArray(expectedHashes) ? expectedHashes : [expectedHashes];
}
function matchesHashSet(methods, expectedHashes) {
  return acceptedHashSets(expectedHashes).some(set => METHODS.every(name => typeof set[name] === 'string')
    && (methods.compactPressure === undefined || typeof set.compactPressure === 'string')
    && Object.entries(set).every(([name, expected]) =>
      typeof methods[name] === 'function' && hash(methods[name]) === expected));
}

/** Hash one host method exactly as the activation gate does. */
export function methodHash(fn) {
  return typeof fn === 'function' ? hash(fn) : null;
}

/**
 * Structural + fingerprint contract for the host seams the policy subclasses
 * and bridges. Throws UnsupportedHostError; never mutates the host.
 */
export function assertBasicCompactionContract({ BasicCompactionEngine: Basic, toolPairingBalancedBefore,
  toolPairingBalancedAfter }, expectedHashes = VERIFIED_BASIC_METHOD_HASH_SETS) {
  if (typeof Basic !== 'function' || Basic.prototype === null || typeof Basic.prototype !== 'object') {
    throw new UnsupportedHostError('compaction-policy: BasicCompactionEngine is not a constructable host class');
  }
  if (typeof toolPairingBalancedBefore !== 'function' || typeof toolPairingBalancedAfter !== 'function') {
    throw new UnsupportedHostError('compaction-policy: host tool-pairing helpers are missing');
  }
  const names = new Set([...METHODS, 'compactPressure', ...acceptedHashSets(expectedHashes).flatMap(set => Object.keys(set))]);
  const originals = Object.fromEntries([...names].map(name => [name, Basic.prototype[name]]));
  if (!matchesHashSet(originals, expectedHashes)) {
    const candidates = acceptedHashSets(expectedHashes);
    const mismatch = [...names].find(name => candidates.every(set => set[name] === undefined || methodHash(originals[name]) !== set[name]));
    throw new UnsupportedHostError(`compaction-policy: ${mismatch ?? 'Basic method tuple'} differs from the verified host; refusing an unknown version or foreign method patch`);
  }
  return originals;
}

export const GLOBAL_DEFAULTS = Object.freeze({
  thresholdRatio: .9,
  // The unoccupied 10% is the proactive reserve. Do not subtract the output
  // cap AGAIN; it remains unchanged on real requests (not a guarantee of fit).
  outputReserveCap: 0,
  headroomTokens: 0,
  pruneToolResults: false,
});

function waitForPending(pending, signal) {
  if (!signal) return pending.catch(() => {});
  return new Promise((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener('abort', onAbort); reject(signal.reason); };
    const done = () => {
      signal.removeEventListener('abort', onAbort);
      if (signal.aborted) reject(signal.reason); else resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    pending.then(done, done);
  });
}

function registry() {
  let value = globalThis[KEY];
  if (value === undefined) {
    value = { abi: 1, managers: new WeakMap() };
    Object.defineProperty(globalThis, KEY, { value, configurable: false, writable: false });
  }
  if (value?.abi !== 1 || !(value.managers instanceof WeakMap)) throw new UnsupportedHostError('compaction-policy: incompatible adapter registry');
  return value.managers;
}

/** Install for one Cordis runtime root. Existing/future EXACT official Basic
 * engines are eligible; custom subclasses/instance overrides are left alone.
 * dispose() deactivates immediately and drains our in-flight calls before
 * restoration. An unrelated wrapper is never overwritten on disposal.
 */
export function installGlobalAdapter({ BasicCompactionEngine: Basic, toolPairingBalancedBefore,
  toolPairingBalancedAfter, ctx, policy = {}, expectedHashes = VERIFIED_BASIC_METHOD_HASH_SETS }) {
  const root = rootOf(ctx);
  if (!root) throw new UnsupportedHostError('compaction-policy: a Cordis runtime root is required');
  const config = resolveConfig({ ...GLOBAL_DEFAULTS, ...policy });
  if (Object.keys(config.basic).length) throw new Error('compaction-policy: global mode preserves each existing Basic config; basic overrides are not supported');
  const managers = registry();
  const verifiedOriginals = managers.has(Basic?.prototype)
    ? null
    : assertBasicCompactionContract({ BasicCompactionEngine: Basic, toolPairingBalancedBefore, toolPairingBalancedAfter }, expectedHashes);
  let manager = managers.get(Basic.prototype);
  if (!manager) {
    const originals = verifiedOriginals;
    const patchedNames = ['compactIfNeeded', 'compactRegion', 'summarize', ...(originals.compactPressure ? ['compactPressure'] : [])];
    const descriptors = Object.fromEntries(patchedNames.map(name => [name, Object.getOwnPropertyDescriptor(Basic.prototype, name)]));
    if (patchedNames.some(name => !descriptors[name]?.writable || !descriptors[name]?.configurable)) {
      throw new UnsupportedHostError('compaction-policy: unsupported method descriptor');
    }
    // Capture lexical super targets BEFORE changing the live prototype.
    // Neither this bridge nor its policy subclass may be constructed.
    class Bridge { constructor() { throw new Error('compaction-policy: method bridge cannot construct a service'); } }
    for (const name of [...METHODS, ...(originals.compactPressure ? ['compactPressure'] : [])]) Object.defineProperty(Bridge.prototype, name, {
      value: name === 'compactIfNeeded'
        ? function (...args) { return originals.compactIfNeeded.apply(this.nativeReceiver, args); }
        : originals[name],
    });
    Object.freeze(Bridge.prototype);
    manager = { descriptors, originals, roots: new Map(), wrappers: {}, Bridge, scope: new AsyncLocalStorage() };
    const m = manager;
    m.unchanged = () => Object.keys(m.originals).every(name => {
      if (!Object.hasOwn(m.wrappers, name)) return Basic.prototype[name] === m.originals[name];
      const current = Object.getOwnPropertyDescriptor(Basic.prototype, name);
      const original = m.descriptors[name];
      return current?.value === m.wrappers[name] && current.writable === original.writable
        && current.configurable === original.configurable && current.enumerable === original.enumerable;
    });
    m.ownerFor = receiver => {
      const engine = raw(receiver);
      if (!engine || Object.getPrototypeOf(engine) !== Basic.prototype
        || Object.keys(m.originals).some(name => Object.hasOwn(engine, name)) || !m.unchanged()) return undefined;
      return m.roots.get(rootOf(engine.ctx));
    };
    m.restore = () => {
      if (m.roots.size) return 'active-other-roots';
      if (!m.unchanged()) {
        return 'inactive-foreign-wrapper-retained';
      }
      for (const name of Object.keys(m.wrappers)) Object.defineProperty(Basic.prototype, name, m.descriptors[name]);
      managers.delete(Basic.prototype);
      return 'restored';
    };
    m.wrapper = function (...args) {
      const receiver = this;
      const engine = raw(receiver);
      const owner = m.ownerFor(receiver);
      const [agent, trigger, signal] = args;
      if (!owner) { m.restore(); return m.originals.compactIfNeeded.apply(receiver, args); }
      // Preserve the async method's cancellation contract even when a second
      // pressure call would otherwise be deduplicated before facade dispatch.
      try { signal?.throwIfAborted(); } catch (error) { return Promise.reject(error); }
      const pending = owner.pending.get(agent.session);
      if (pending) {
        if (trigger === 'pressure') return Promise.resolve(null);
        if (!owner.active) return Promise.reject(new Error('compaction-policy: adapter is disposing'));
        const queued = waitForPending(pending, signal).then(() => {
          signal?.throwIfAborted();
          if (!owner.active) throw new Error('compaction-policy: adapter disposed while the operation was waiting');
          return m.wrapper.apply(receiver, args);
        });
        owner.inFlight.add(queued);
        queued.then(() => owner.inFlight.delete(queued), () => owner.inFlight.delete(queued));
        return queued;
      }
      if (!owner.active) return m.originals.compactIfNeeded.apply(receiver, args);
      let facade = owner.facades.get(engine);
      if (!facade) {
        const Policy = createPolicyEngine({ BasicCompactionEngine: m.Bridge, toolPairingBalancedBefore, toolPairingBalancedAfter });
        facade = Object.create(Policy.prototype);
        facade.policyConfig = owner.config;
        owner.facades.set(engine, facade);
      }
      const call = Object.create(facade);
      // Retain caller-context injection and exact existing summary config.
      call.ctx = receiver.ctx;
      call.config = engine.config;
      call.nativeReceiver = receiver;
      const scope = { engine, agent, session: agent.session, signal, owner };
      const promise = Promise.resolve().then(() => m.scope.run(scope, () => call.compactIfNeeded(...args)));
      owner.pending.set(agent.session, promise);
      owner.inFlight.add(promise);
      const cleanup = () => { owner.pending.delete(agent.session); owner.inFlight.delete(promise); };
      promise.then(cleanup, cleanup);
      return promise;
    };
    m.wrappers.compactIfNeeded = m.wrapper;
    if (originals.compactPressure) m.wrappers.compactPressure = function (agent, header, signal, requireBelowThreshold) {
      const owner = m.ownerFor(this);
      if (!owner?.active) return originals.compactPressure.call(this, agent, header, signal, requireBelowThreshold);
      const existing = m.scope.getStore();
      if (existing?.owner === owner && existing.engine === raw(this) && existing.agent === agent
        && existing.session === agent.session && existing.signal === signal) {
        return originals.compactPressure.call(this, agent, header, signal, requireBelowThreshold);
      }
      const scope = { engine: raw(this), agent, session: agent.session, signal, owner };
      const promise = m.scope.run(scope, () => originals.compactPressure.call(this, agent, header, signal, requireBelowThreshold));
      owner.inFlight.add(promise);
      promise.then(() => owner.inFlight.delete(promise), () => owner.inFlight.delete(promise));
      return promise;
    };
    m.wrappers.compactRegion = function (start, end, agent, signal) {
      const scope = m.scope.getStore();
      const owner = m.ownerFor(this);
      const compact = (from, to) => originals.compactRegion.call(this, from, to, agent, signal);
      if (!owner || scope?.owner !== owner || scope.engine !== raw(this) || scope.agent !== agent
        || scope.session !== agent.session || scope.signal !== signal) return compact(start, end);
      const attempt = {};
      return m.scope.run({ ...scope, attempt }, () => compactWithOverflowFallback({
        session: agent.session, start, end, signal, meter: this.ctx.tokenMeter,
        pairing: { before: toolPairingBalancedBefore, after: toolPairingBalancedAfter }, compact, attempt,
      }));
    };
    m.wrappers.summarize = function (input, agent, signal) {
      const scope = m.scope.getStore();
      if (!scope?.attempt || scope.engine !== raw(this) || scope.agent !== agent
        || scope.session !== agent.session || scope.signal !== signal) return originals.summarize.call(this, input, agent, signal);
      return originals.summarize.call(this, input, agent, signal).catch(error => {
        if (!signal?.aborted) scope.attempt.error = error;
        throw error;
      });
    };
    const installed = [];
    try {
      for (const name of patchedNames) {
        Object.defineProperty(Basic.prototype, name, { ...descriptors[name], value: m.wrappers[name] });
        installed.push(name);
      }
    } catch (error) {
      for (const name of installed.reverse()) {
        if (Object.getOwnPropertyDescriptor(Basic.prototype, name)?.value === m.wrappers[name]) {
          Object.defineProperty(Basic.prototype, name, descriptors[name]);
        }
      }
      throw new UnsupportedHostError('compaction-policy: unable to install verified method wrappers', { cause: error });
    }
    managers.set(Basic.prototype, m);
  } else {
    if (!manager.unchanged()) throw new UnsupportedHostError('compaction-policy: foreign wrapper above adapter; refusing another install');
    // Another package copy must accept the same complete original tuple, not just ABI.
    if (!matchesHashSet(manager.originals, expectedHashes)) {
      throw new UnsupportedHostError('compaction-policy: incompatible original host methods');
    }
    if (!manager.unchanged()) throw new UnsupportedHostError('compaction-policy: incompatible or changed host method');
  }
  if (manager.roots.has(root)) throw new Error('compaction-policy: already installed or draining in this runtime');
  const owner = { active: true, config, facades: new WeakMap(), pending: new WeakMap(), inFlight: new Set() };
  manager.roots.set(root, owner);
  let disposal;
  return {
    status(engine, session) {
      const original = raw(engine);
      if (!original || Object.getPrototypeOf(original) !== Basic.prototype || Object.keys(manager.originals).some(name => Object.hasOwn(original, name))) {
        return { reason: 'not-an-unmodified-official-basic-engine' };
      }
      if (rootOf(original.ctx) !== root) return { reason: 'outside-runtime' };
      if (!manager.unchanged()) {
        return { reason: 'host-method-changed-after-activation' };
      }
      return owner.facades.get(original)?.status(session) ?? { reason: 'not-measured' };
    },
    reset(engine, session) {
      const original = raw(engine);
      const facade = owner.facades.get(original);
      if (!facade) return;
      const call = Object.create(facade);
      call.ctx = engine.ctx;
      call.config = original.config;
      return call.reset(session);
    },
    dispose() {
      if (disposal) return disposal;
      owner.active = false;
      disposal = (async () => {
        await Promise.allSettled([...owner.inFlight]);
        manager.roots.delete(root);
        return manager.restore();
      })();
      return disposal;
    },
  };
}
