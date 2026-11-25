import {createHash} from 'node:crypto';
import {createConsumer} from '../tencent/index.mjs';
const templateId='weekly-stat-v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const key=b=>createHash('sha256').update(JSON.stringify([b.appId,b.userOpenId])).digest('hex');
// All three capabilities (owner.current, localConfirm and deliver) are injected by the trusted composition, not input data.
export function grantLab({db,core,owner,localConfirm,deliver,now=Date.now}){
 const current=()=>{const b=owner?.current?.();return b?.confirmed===true&&b.unique===true&&b.scope==='c2c'&&[b.appId,b.userOpenId,b.bindingId].every(x=>typeof x==='string'&&x.trim())?b:null};
 db.exec('CREATE TABLE IF NOT EXISTS local_once(q TEXT PRIMARY KEY,k TEXT NOT NULL,epoch TEXT NOT NULL,expiry INTEGER NOT NULL,spent INTEGER NOT NULL DEFAULT 0,revoked INTEGER NOT NULL DEFAULT 0)');
 db.exec('CREATE TABLE IF NOT EXISTS local_candidate(q TEXT PRIMARY KEY,expiry INTEGER NOT NULL)');
 const row=q=>db.prepare('SELECT * FROM local_once WHERE q=?').get(q);
 const valid=(r,b)=>!!r&&!!b&&!r.revoked&&r.expiry>now()&&r.k===key(b)&&r.epoch===b.bindingId;
 const c=createConsumer({db,core,bindings:{current},allowActive:()=>true,now,deliver:x=>{if(!valid(row(x.questionId),current())||!row(x.questionId).spent)throw Error('grant unavailable');return deliver(x)}});
 const service=Object.freeze({instanceToken:c.instanceToken,receive:c.receive,attach(cap){return c.attach({bindingKey:cap.bindingKey,sendSelfDecision:req=>{
   const b=current(),r=row(req.questionId);if(!valid(r,b)||req.templateId!==templateId||req.expiresAt!==r.expiry||!db.prepare('UPDATE local_once SET spent=1 WHERE q=? AND spent=0 AND revoked=0 AND expiry>?').run(req.questionId,now()).changes)return {state:'blocked'};
   return cap.sendSelfDecision(req);
 }})}});
 return {service,stop:c.stop,prepareLocal({taskId,sessionId}){const b=current();if(!b)return null;const expiry=now()+300000;
   const q=core.openQuestion({taskId,sessionId,bindingId:b.bindingId,kind:'business',prompt:'这两天按什么口径出周报？',choices:['合计','日均'],expiresAt:expiry});
   db.prepare('INSERT INTO local_candidate VALUES(?,?)').run(q,expiry);return q;
 },async confirmLocal(q){const expiry=db.prepare('SELECT expiry FROM local_candidate WHERE q=?').get(q)?.expiry;const b=current();if(!b||!uuid.test(q)||!Number.isSafeInteger(expiry)||expiry<=now()||expiry>now()+300000||core.questionState(q,b.bindingId)!=='draft'||row(q))return false;
   const k=key(b),epoch=b.bindingId;const consent=await localConfirm(Object.freeze({questionId:q,templateId,prompt:'这两天按什么口径出周报？',choices:Object.freeze(['合计','日均']),recipient:'官方连接已核验的唯一本人私聊',limit:1,expiresAt:expiry}));
   const fresh=current();if(consent!==true||!fresh||key(fresh)!==k||fresh.bindingId!==epoch||expiry<=now()||core.questionState(q,epoch)!=='draft')return false;
   return !!db.prepare('INSERT OR IGNORE INTO local_once(q,k,epoch,expiry) VALUES(?,?,?,?)').run(q,k,epoch,expiry).changes;
 },revokeLocal(q){return !!db.prepare('UPDATE local_once SET revoked=1 WHERE q=?').run(q).changes},async notify(q){const b=current(),r=row(q);if(!valid(r,b))return {state:'blocked'};return c.notify({questionId:q,bindingId:b.bindingId,expiresAt:r.expiry,templateId})}};
}
