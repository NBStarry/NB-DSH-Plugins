import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const id = (v) => typeof v === 'string' && v.length > 0 && v.length <= 256 && !/\s/.test(v);
function timestamp(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && (value >= 1e9 && value < 1e10 || value >= 1e12 && value < 1e13))
        return new Date(value < 1e10 ? value * 1000 : value).toISOString();
    if (typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)))
        return new Date(value).toISOString();
}
export function stewardBridge(ctx, bot, config, manager) {
    const get = () => ctx.get('stewardDecisionConsumer');
    const current = (owner) => { const live = get(); return !!live && (live === owner || typeof owner.instanceToken === 'symbol' && live.instanceToken === owner.instanceToken); };
    const self = () => config.stewardDecisions === true && config.access.c2cMode === 'allowlist' && config.access.c2cAllow.length === 1 ? config.access.c2cAllow[0] : undefined;
    let online = false, closed = false, epoch = 0, detach;
    let route;
    let confirmed, challenge;
    function clearIdentity() { confirmed = undefined; challenge = undefined; }
    function revoke() { clearIdentity(); ++epoch; route = undefined; const old = detach; detach = undefined; try {
        old?.();
    }
    catch { /* local teardown must not break the official gateway */ } }
    function attach(consumer) {
        revoke();
        const peer = self(), app = config.appId;
        if (!online || closed || !current(consumer) || !id(peer) || !id(app) || typeof consumer?.attach !== 'function' || typeof consumer.receive !== 'function')
            return;
        const key = createHash('sha256').update(JSON.stringify([app, peer])).digest('hex');
        const ticket = epoch;
        const live = () => !!route && !closed && ticket === epoch && current(consumer) && config.appId === app && self() === peer;
        try {
            const end = consumer.attach({ bindingKey: key,
                beginVerification() { if (!live())
                    return null; clearIdentity(); const code = randomBytes(24).toString('base64url'); const expiresAt = Date.now() + 300000; challenge = { digest: createHash('sha256').update(code).digest(), expiresAt }; return { code, expiresAt }; },
                current() { return live() && confirmed ? { confirmed: true, scope: 'c2c', unique: true, appId: app, userOpenId: peer, bindingId: confirmed } : null; },
                revoke() { if (live())
                    clearIdentity(); },
                async sendSelfDecision(req) {
                    if (!route || !current(consumer) || closed || ticket !== epoch || config.appId !== app || self() !== peer || !req || !confirmed || req.bindingId !== confirmed || Object.keys(req).sort().join(',') !== 'bindingId,expiresAt,operationId,questionId,templateId' || req.templateId !== 'weekly-stat-v1' || !uuid.test(req.operationId) || !uuid.test(req.questionId) || !Number.isSafeInteger(req.expiresAt) || req.expiresAt <= Date.now())
                        return { state: 'blocked' };
                    try {
                        const r = await bot.sendText({ scope: 'c2c', targetId: peer }, `#${req.questionId.slice(0, 8)} 这两天按什么口径出周报？\n选项：合计 / 日均`);
                        if (!confirmed || confirmed !== req.bindingId || closed || ticket !== epoch || !current(consumer) || config.appId !== app || self() !== peer || !id(r?.id))
                            return { state: 'unknown' };
                        const at = timestamp(r.timestamp), ref = r.ext_info?.ref_idx;
                        return { state: 'accepted', messageId: r.id, ...at && { timestamp: at }, ...id(ref) && { reference: ref } };
                    }
                    catch {
                        return { state: 'unknown' };
                    }
                } });
            if (typeof end === 'function') {
                detach = end;
                route = { consumer, peer, key, app };
            }
        }
        catch {
            revoke();
        }
    }
    // The optional dependency lives on a child fiber, not the QQ gateway fiber.
    let binding;
    ctx.inject(['stewardDecisionConsumer'], scope => {
        const consumer = scope.get('stewardDecisionConsumer');
        const active = { consumer };
        scope.effect(() => {
            binding = active;
            if (online)
                attach(consumer);
            return () => { if (binding === active) {
                binding = undefined;
                revoke();
            } };
        });
    });
    function offline() { online = false; revoke(); }
    function ready() { if (closed || online)
        return; online = true; if (binding)
        attach(binding.consumer); }
    return { offline, ready, async verification(c, next) {
            const m = c.message;
            // Recognize *marked enum replies* before native consumers, even when no proof survived restart.
            const peer = self();
            const option = typeof m.content === 'string' && /^(?:#([0-9a-f]{8}) )?(合计|日均)$/u.exec(m.content);
            if (option && (option[1] || id(m.refMsgIdx)) && id(peer) && id(config.appId) && m.kind === 'c2c' && m.rawEventType === 'C2C_MESSAGE_CREATE' && m.author?.id === peer && !m.author.isBot && c.replyTarget.scope === 'c2c' && c.replyTarget.targetId === peer) {
                const key = createHash('sha256').update(JSON.stringify([config.appId, peer])).digest('hex');
                const reference = id(m.refMsgIdx) ? m.refMsgIdx : undefined, shortCode = option[1];
                let owned, reader;
                try {
                    reader = get();
                    owned = reader?.ownsReply?.({ bindingKey: key, ...reference && { reference }, ...shortCode && { shortCode } });
                }
                catch { /* unknown ownership: never fall through */ }
                if (owned === false)
                    return next();
                c.stop('steward-marked-answer');
                const r = route;
                if (owned !== true || !confirmed || !online || !r || r.key !== key || !current(r.consumer) || !id(m.messageId) || m.attachments?.length || (m.refMsgIdx !== undefined && !reference))
                    return;
                const rec = manager.getSessionRecord('c2c', peer);
                if (rec && (manager.questionChannel?.hasPending(rec.sessionKey) || manager.approvalChannel?.hasPending(rec.sessionKey)))
                    return;
                const at = timestamp(m.timestamp);
                await r.consumer.receive({ bindingKey: key, eventId: m.messageId, choiceId: option[2] === '合计' ? 'total' : 'mean', ...at && { timestamp: at }, ...reference && { reference }, ...shortCode && { shortCode } });
                return;
            }
            // Reserved exact command never reaches history, native answers, debug message logging or agent.
            const match = typeof m.content === 'string' && /^总管核对 ([A-Za-z0-9_-]{32})$/u.exec(m.content);
            if (typeof m.content !== 'string' || !/^\s*总管核对(?:\s|$)/u.test(m.content))
                return next();
            c.stop('steward-verification');
            if (!match)
                return;
            const r = route;
            if (!challenge || challenge.expiresAt <= Date.now() || !r || !online || !current(r.consumer) || config.appId !== r.app || self() !== r.peer || m.kind !== 'c2c' || m.rawEventType !== 'C2C_MESSAGE_CREATE' || m.author?.id !== r.peer || m.author.isBot || c.replyTarget.scope !== 'c2c' || c.replyTarget.targetId !== r.peer || !id(m.messageId) || m.attachments?.length || m.refMsgIdx !== undefined)
                return;
            const rec = manager.getSessionRecord('c2c', r.peer);
            if (rec && (manager.questionChannel?.hasPending(rec.sessionKey) || manager.approvalChannel?.hasPending(rec.sessionKey)))
                return;
            if (timingSafeEqual(challenge.digest, createHash('sha256').update(match[1]).digest())) {
                challenge = undefined;
                confirmed = randomUUID();
            }
        }, dispose() { closed = true; offline(); }, async inbound(c, next) {
            const r = route, m = c.message;
            if (!confirmed || !r || config.appId !== r.app || !current(r.consumer) || self() !== r.peer || m.kind !== 'c2c' || m.rawEventType !== 'C2C_MESSAGE_CREATE' || m.author?.id !== r.peer || m.author.isBot || c.replyTarget.scope !== 'c2c' || c.replyTarget.targetId !== r.peer || !id(m.messageId))
                return next();
            const record = manager.getSessionRecord('c2c', r.peer);
            if (record && (manager.questionChannel?.hasPending(record.sessionKey) || manager.approvalChannel?.hasPending(record.sessionKey)))
                return next();
            const match = /^(?:#([0-9a-f]{8}) )?(合计|日均)$/u.exec(m.content);
            if (!match || m.attachments?.length || (m.refMsgIdx !== undefined && !id(m.refMsgIdx)))
                return next();
            if (match[1] || m.refMsgIdx !== undefined)
                return next(); // marked replies already classified before native routing
            const at = timestamp(m.timestamp);
            const claimed = await r.consumer.receive({ bindingKey: r.key, eventId: m.messageId, choiceId: match[2] === '合计' ? 'total' : 'mean', ...at && { timestamp: at }, ...match[1] && { shortCode: match[1] }, ...m.refMsgIdx && { reference: m.refMsgIdx } });
            if (claimed === true)
                c.stop('steward-decision');
            else
                await next();
        } };
}
//# sourceMappingURL=steward.js.map