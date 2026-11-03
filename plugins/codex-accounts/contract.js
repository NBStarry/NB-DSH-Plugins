/** Browser-safe strict wire definitions shared by Host and Client. */
import { z } from 'zod';

const PACKAGE = '@nbstarry/dsh-codex-accounts';
export const configSchema = z.strictObject({
  firstSnapshotTimeoutMs: z.number().int().positive().max(120000).default(10000),
}).prefault({});
export const safeNativeCodes = new Set([
  'PI_AI_ACCOUNTS_UNAVAILABLE', 'PI_AI_ACCOUNTS_READ_ONLY', 'PI_AI_ACCOUNTS_REVISION_CONFLICT',
  'PI_AI_ACCOUNT_UNAVAILABLE', 'PI_AI_LOGIN_IN_PROGRESS', 'PI_AI_ATTEMPT_STALE',
  'PI_AI_INVALID_ACCOUNT_LABEL', 'PI_AI_ACCOUNT_CONFIG_INVALID',
]);
const text = z.string().min(1);
export const snapshotSchema = z.strictObject({
  revision: text, activeRef: text.nullable(), writable: z.boolean(),
  accounts: z.array(z.strictObject({
    ref: text, label: z.string(), maskedAccountId: z.string().nullable(),
    status: z.enum(['ready', 'expired', 'unavailable']),
  })),
  attempt: z.strictObject({
    id: text, targetLabel: z.string(), phase: z.enum(['running', 'authorized', 'cancelled', 'failed']),
    notice: z.strictObject({ message: z.string(), url: z.string().optional(), code: z.string().optional() }).optional(),
    prompt: z.strictObject({
      kind: z.enum(['select', 'text', 'secret']), message: z.string(),
      options: z.array(z.strictObject({ id: text, label: z.string() })).optional(),
    }).optional(),
  }).optional(),
});
const requests = {
  beginLogin: z.strictObject({ label: z.string().max(100).optional() }),
  selectAccount: z.strictObject({ ref: text, expectedRevision: text }),
  answer: z.strictObject({ attemptId: text, value: z.string() }),
  cancel: z.strictObject({ attemptId: text }),
};
const codec = (name, schema) => ({ mode: 'strict', typeSymbol: `${PACKAGE}#${name}`, create: () => schema });
export const descriptors = ['accounts', 'beginLogin', 'selectAccount', 'answer', 'cancel', 'watch'].map(method => ({
  id: `${PACKAGE}#codexAccounts/${method}`, service: 'codexAccounts', namespace: 'codexAccounts', method,
  invocation: { kind: 'direct' },
  parameters: requests[method] === undefined ? [] : [{
    name: 'request', wire: 'request', source: 'json', codec: codec(`${method}:request`, requests[method]),
  }],
  ...method === 'watch' ? { mode: 'stream', cancellation: { parameter: 'signal' } } : {},
  result: codec('Snapshot', snapshotSchema),
}));
export const contribution = { package: PACKAGE, face: 'host', schemas: [],
  model: { services: [], events: [], objects: [] }, invocations: descriptors };
export const remoteContribution = { package: PACKAGE, descriptors };
