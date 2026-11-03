import { classify } from './hierarchy.js';

const modes = new Set(['coordinator', 'balanced']);
export const coordinationScope = 'profile-wide';
export const coordinationBoundary = 'Root execution constraints are behavioral guidance, not an OS sandbox; custom prompts and higher-priority instructions still apply.';

export function createCoordinationManager(ctx, config) {
  let changing = false;
  function authorize(agent) {
    if (classify(ctx, agent).kind !== 'root') throw new Error('Only the exact live depth-zero Team Lead may inspect or change coordination mode.');
  }
  function entry() {
    const matches = ctx.configEditor.entries().filter(e => e.options.name === '@local/dsh-team-only');
    if (matches.length !== 1) throw new Error('Expected exactly one active Team-only configuration entry.');
    return matches[0];
  }
  function status(agent) {
    authorize(agent);
    const row = entry();
    const mode = config.mode.get();
    if (!modes.has(mode)) throw new Error('Current coordination mode is unknown.');
    return { mode, scope: coordinationScope, boundary: coordinationBoundary, entryAvailable: !!row };
  }
  async function operate(agent, args, signal) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Expected an object.');
    const allowed = args.action === 'set' ? ['action', 'mode', 'expectedMode'] : ['action'];
    if (Object.keys(args).some(k => !allowed.includes(k))) throw new Error('Unexpected coordination mode field.');
    if (args.action === 'status') return status(agent);
    if (args.action !== 'set' || !modes.has(args.mode) || !modes.has(args.expectedMode)) throw new Error('Use status or set with mode and expectedMode.');
    if (changing) throw new Error('Another coordination mode change is in progress.');
    const requested = args.mode, expected = args.expectedMode;
    changing = true;
    try {
      signal?.throwIfAborted();
      const before = status(agent);
      const selectedEntry = entry();
      if (before.mode !== expected) throw new Error('Coordination mode changed; read status and retry.');
      if (before.mode === requested) return { changed: false, ...before };
      await ctx.configEditor.edit(selectedEntry, (current, inherited) => {
        signal?.throwIfAborted();
        authorize(agent);
        if (entry() !== selectedEntry) throw new Error('Configuration entry was replaced; retry.');
        const effective = current.mode ?? inherited.mode ?? 'coordinator';
        if (effective !== expected || config.mode.get() !== expected) throw new Error('Coordination mode changed; read status and retry.');
        return { ...current, mode: requested };
      });
      const after = status(agent);
      if (after.mode !== requested) throw new Error('Mode change was persisted but reconciliation is unconfirmed; check status before retrying.');
      return { changed: true, ...after, promptsPreserved: true };
    } finally { changing = false; }
  }
  return { status, operate };
}
