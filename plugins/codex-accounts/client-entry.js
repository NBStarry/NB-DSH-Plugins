/** One Client artifact: mount the adapter, then its settings-card consumer. */
import * as adapter from './client-adapter.js';
import * as card from './client.js';
import { configSchema } from './contract.js';

export const inject = ['remote', 'slots', 'locale'];
export const Config = configSchema;

export async function apply(ctx, config) {
  await ctx.plugin(adapter, config);
  await ctx.plugin(card);
}
