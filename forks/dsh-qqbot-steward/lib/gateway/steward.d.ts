import type { Context } from '@deepseek-ai/cordis';
import type { QQBot, MiddlewareContext } from '@tencent-connect/qqbot-nodejs';
import type { ImQQBotConfig } from '../config.ts';
import type { SessionManager } from '../session/index.ts';
export declare function stewardBridge(ctx: Context, bot: QQBot, config: ImQQBotConfig, manager: SessionManager): {
    offline: () => void;
    ready: () => void;
    verification(c: MiddlewareContext, next: () => Promise<void>): Promise<void>;
    dispose(): void;
    inbound(c: MiddlewareContext, next: () => Promise<void>): Promise<void>;
};
//# sourceMappingURL=steward.d.ts.map