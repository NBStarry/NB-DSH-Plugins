import z from '@deepseek-ai/schemastery';
import { createMobileRuntime } from './mobile-runtime.mjs';
import { registerConfiguration } from './configuration.mjs';
import { registerTrustConfiguration } from './trust-configuration.mjs';

export const name = 'mobile-connection';
export const inject = ['webServer', 'connection'];
export const Config = z.object({
  connectionEnabled: z.boolean().default(false),
  authority: z.string().default(''),
  socketParent: z.string().default(''),
  tailscaleExecutable: z.string().default(''),
});

// The management routes remain visible while the connection is disabled; no
// listener, Serve process, or token retrieval starts until explicit enablement.
export function apply(ctx, config = {}) {
  ctx.effect(() => {
    const runtime = createMobileRuntime({
      webServer: ctx.webServer,
      connection: ctx.connection,
      connectionEnabled: config.connectionEnabled === true,
      authority: config.authority,
      socketParent: config.socketParent,
      tailscaleExecutable: config.tailscaleExecutable,
    });
    const offConfiguration = registerConfiguration({ connection: ctx.connection, getEditor: () => ctx.get('configEditor') });
    let offTrust;
    try { offTrust = registerTrustConfiguration({ connection: ctx.connection, getEditor: () => ctx.get('configEditor'), getStatus: runtime.status }); }
    catch (error) { try { void Promise.resolve(offConfiguration()).catch(() => {}); } catch {} throw error; }
    void runtime.start();
    return async () => {
      let off, trust;
      try { off = offConfiguration(); } catch { off = Promise.reject(Error('unavailable')); }
      try { trust = offTrust(); } catch { trust = Promise.reject(Error('unavailable')); }
      const results = await Promise.allSettled([Promise.resolve(off), Promise.resolve(trust), runtime.stop()]);
      if (results.some(result => result.status === 'rejected')) throw Error('unavailable');
    };
  }, 'mobile-connection: private controller');
}
