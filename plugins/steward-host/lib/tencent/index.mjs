import {createHash,randomUUID} from 'node:crypto';
import {QQChannel} from '../qq/channel.mjs';
const template='weekly-stat-v1';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const str=v=>typeof v==='string'&&v.length>0&&v.length<=512;
function key(b){return b?.confirmed===true&&[b.appId,b.userOpenId,b.bindingId].every(str)?createHash('sha256').update(JSON.stringify([b.appId,b.userOpenId])).digest('hex'):null;}

// Trusted, same-realm service, never register as a Remote or model tool. Inbound receives only the owner's projected enum.
export function createConsumer({db,core,bindings,deliver,allowActive=()=>false,now=Date.now}){
  const events=new WeakMap(), channel=new QQChannel(db,{core,bindings,now,verify:e=>events.get(e)});
  db.exec('CREATE TABLE IF NOT EXISTS tencent_attempt(q TEXT PRIMARY KEY,op TEXT UNIQUE NOT NULL)');
  let attached=null, stopped=false;
  const local=()=>{const b=bindings.current();return !stopped&&attached&&key(b)===attached.key&&b.bindingId===attached.epoch?b:null};
  const reject={state:'blocked'};
  const instance=Symbol();
  return {
    get instanceToken(){return instance},
    attach(cap){const b=bindings.current();if(stopped||attached||!key(b)||cap?.bindingKey!==key(b)||typeof cap.sendSelfDecision!=='function') throw Error('owner attachment unavailable');
      const record=attached={key:cap.bindingKey,epoch:b.bindingId,send:p=>cap.sendSelfDecision(p)};return ()=>{if(attached===record)attached=null};},
    stop(){attached=null;stopped=true},
    async notify(q){const b=local(),a=attached;if(!b||q?.bindingId!==b.bindingId||q.templateId!==template||!uuid(q.questionId)||!Number.isSafeInteger(q.expiresAt)||q.expiresAt<=now())return reject;
      const id=q.questionId,existing=channel.get(id);if(existing){if(existing.b!==b.bindingId)return reject;channel.recover(id);return {state:existing.state,replayed:true}};
      if(allowActive()!==true||core.questionState(id,b.bindingId)!=='draft')return reject;
      const op=randomUUID();db.exec('BEGIN IMMEDIATE');try{db.prepare("INSERT INTO qq_notice(q,b,state,expires) VALUES(?,?,'unknown',?)").run(id,b.bindingId,q.expiresAt);db.prepare('INSERT INTO tencent_attempt VALUES(?,?)').run(id,op);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
      let r;try{r=await a.send({questionId:id,operationId:op,expiresAt:q.expiresAt,templateId:template})}catch{return {state:'unknown'}}
      if(attached!==a||!local())return {state:'unknown'};
      const accepted=r?.state==='accepted'&&str(r.messageId);const state=accepted?'accepted':r?.state==='blocked'?'blocked':'unknown';
      const stamp=typeof r?.timestamp==='string'?Date.parse(r.timestamp):NaN;
      db.prepare('UPDATE qq_notice SET state=?,message=?,ref=?,sent=? WHERE q=?').run(state,accepted?r.messageId:null,accepted&&str(r.reference)?r.reference:null,accepted&&Number.isFinite(stamp)?stamp:null,id);
      if(accepted)channel.recover(id);return {state};},
    async receive(e){const b=local(),a=attached;if(!b||e?.bindingKey!==a.key||!str(e.eventId)||!['total','mean'].includes(e.choiceId))return false;
      // Match ownership independently of current openness: a stale business answer must not become an agent prompt.
      const durableEvent=createHash('sha256').update(JSON.stringify(['qq-c2c',b.appId,b.userOpenId,e.eventId])).digest('hex');
      if(core.receipt(b.bindingId,durableEvent)||db.prepare('SELECT 1 FROM qq_reject WHERE b=? AND e=?').get(b.bindingId,durableEvent))return true;
      let belongs;
      if(e.reference!==undefined){belongs=str(e.reference)&&db.prepare('SELECT 1 FROM qq_notice WHERE b=? AND ref=?').get(b.bindingId,e.reference)}
      else if(e.shortCode!==undefined){belongs=typeof e.shortCode==='string'&&/^[0-9a-f]{8}$/.test(e.shortCode)&&db.prepare('SELECT 1 FROM qq_notice WHERE b=? AND substr(q,1,8)=?').get(b.bindingId,e.shortCode)}
      else belongs=core.listOpenQuestions(b.bindingId).some(q=>channel.get(q.questionId)?.state==='accepted');
      if(!belongs)return false;
      const text=(e.shortCode?'#'+e.shortCode+' ':'')+(e.choiceId==='total'?'合计':'日均');
      // QQChannel's internal projection is scoped to this invocation; never expose verify or accept raw caller-supplied platform envelopes.
      const token={};events.set(token,{appId:b.appId,event:{t:'C2C_MESSAGE_CREATE',d:{author:{user_openid:b.userOpenId},id:e.eventId,timestamp:e.timestamp,content:text}},...(e.reference!==undefined?{reference:e.reference}:{})});
      try{await channel.receive(token,request=>{if(attached!==a||!local())throw Error('owner changed');return deliver(request)});return true}finally{events.delete(token)}
    }
  };
}
