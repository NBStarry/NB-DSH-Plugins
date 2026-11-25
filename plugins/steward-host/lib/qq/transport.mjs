import { createHash } from 'node:crypto';

const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const bound = b => b?.confirmed === true && [b.appId, b.userOpenId, b.bindingId].every(nonempty);

// verify is supplied by the sole gateway owner. Never take its result from request JSON.
export async function normalizeReply(raw, { verify, binding, lookupReference }) {
  if (!bound(binding)) return null;
  const verified = await verify(raw);
  const d = verified?.event?.d;
  if (verified?.appId !== binding.appId || verified.event?.t !== 'C2C_MESSAGE_CREATE' ||
      !nonempty(d?.id) || !nonempty(d.content) || d.author?.user_openid !== binding.userOpenId) return null;
  const eventId = createHash('sha256').update(JSON.stringify(['qq-c2c',binding.appId,binding.userOpenId,d.id])).digest('hex');
  const reply = { bindingId: binding.bindingId, eventId, text: d.content, kind: 'business' };
  // Normalized reference metadata from the authenticated gateway, not user text.
  if (verified.reference !== undefined) {
    if (!nonempty(verified.reference)) return null;
    const id = await lookupReference(binding.bindingId, verified.reference);
    if (!nonempty(id)) return null; // unknown reference must not fall back to the sole open question
    reply.questionId = id;
  }
  return reply;
}

// Transport seam: post is an authenticated, app-bound capability of the existing gateway. No default network path.
export async function sendQuestion({ binding, question, allowActive = false, passive, now = Date.now(), post }) {
  if (!bound(binding) || question?.bindingId !== binding.bindingId || !nonempty(question.prompt) || !nonempty(question.questionId)) return {state:'blocked',reason:'unbound-or-invalid'};
  const body = {msg_type:0, content:`#${question.questionId.slice(0,8)} ${question.prompt}${Array.isArray(question.choices) ? '\n选项：'+question.choices.join(' / ') : ''}`};
  if (passive !== undefined) {
    if (passive?.bindingId !== binding.bindingId || !nonempty(passive.msgId) || !Number.isFinite(now) || !Number.isFinite(passive.receivedAt) || now < passive.receivedAt || now-passive.receivedAt >= 300000 || !Number.isInteger(passive.seq) || passive.seq < 1 || passive.seq > 4) return {state:'blocked',reason:'invalid-reply-window'};
    Object.assign(body,{msg_id:passive.msgId,msg_seq:passive.seq});
  } else if (allowActive !== true) return {state:'blocked',reason:'active-not-enabled'};
  let response;
  try { response = await post(binding.appId, `/v2/users/${encodeURIComponent(binding.userOpenId)}/messages`, body); }
  catch { return {state:'unknown'}; }
  const s=response?.status, code=response?.body?.code;
  if (!Number.isInteger(s) || s < 200 || s >= 500 || s === 408) return {state:'unknown'};
  if (s >= 300 || (code !== undefined && code !== 0)) return {state:'rejected', ...(Number.isInteger(code)?{code}:{})};
  const id=response.body?.id, ref=response.body?.ext_info?.ref_idx;
  return nonempty(id) ? {state:'accepted',messageId:id,...(nonempty(ref)?{reference:ref}:{})} : {state:'unknown'};
}
