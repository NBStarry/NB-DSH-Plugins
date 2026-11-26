import {grantLab} from './lib/grant-lab/index.mjs';
export function createRuntime({db,core,showLocal,deliver}){
 let ticket=null,owner=null,detach=null,pending=false,permitted=null,closed=false;
 db.exec("CREATE TABLE IF NOT EXISTS first_trial(slot INTEGER PRIMARY KEY CHECK(slot=1),task TEXT NOT NULL,session TEXT NOT NULL,phase TEXT NOT NULL,question TEXT)");
 const current=()=>owner?.current()??null;
 const g=grantLab({db,core,owner:{current},deliver:r=>{const c=owner,b=current();const valid=()=>{const x=current(),g=db.prepare('SELECT * FROM local_once WHERE q=?').get(r.questionId);if(closed||owner!==c||!b||!x?.unique||!x.confirmed||x.scope!=='c2c'||x.appId!==b.appId||x.userOpenId!==b.userOpenId||x.bindingId!==b.bindingId||g?.epoch!==x.bindingId||g.spent!==1||g.revoked||g.expiry<=Date.now())throw Error('authorization changed')};valid();return deliver(r,valid)},localConfirm:async info=>permitted===info.questionId});
 // This historical lookup is not an admission check. It returns no identity, question ID or capability.
 const owned=db.prepare("SELECT 1 FROM local_once g JOIN qq_notice n ON n.q=g.q AND n.b=g.epoch JOIN tencent_attempt a ON a.q=g.q WHERE g.k=? AND g.spent=1 AND (n.ref=? OR substr(g.q,1,8)=?) LIMIT 1");
 function ownsReply(input){if(closed)throw Error('ledger unavailable');if(!input||typeof input.bindingKey!=='string'||!/^[a-f0-9]{64}$/.test(input.bindingKey))return false;
 const ref=typeof input.reference==='string'&&input.reference.length<=256&&/^\S+$/.test(input.reference)?input.reference:null;
 const short=typeof input.shortCode==='string'&&/^[a-f0-9]{8}$/.test(input.shortCode)?input.shortCode:null;
 return (ref!==null||short!==null)&&!!owned.get(input.bindingKey,ref,short);}
 const service={instanceToken:Symbol(),ownsReply,attach(c){if(closed||owner||['current','beginVerification','sendSelfDecision','revoke'].some(k=>typeof c?.[k]!=='function'))throw Error('no verified owner');ticket=Symbol();owner=c;return ()=>{if(owner===c){detach?.();detach=null;owner=null;ticket=null;permitted=null}}},receive:e=>detach?g.service.receive(e):false};
 return {service,ready:()=>!closed&&!pending&&owner?ticket:null,async run(taskId,sessionId){if(closed||pending||!owner)return 'blocked';pending=true;const c=owner;
 try{if(!db.prepare("INSERT OR IGNORE INTO first_trial VALUES(1,?,?,'challenge',NULL)").run(taskId,sessionId).changes)return 'manual-review';const ch=c.beginVerification();if(!ch||!/^[-_A-Za-z0-9]{32}$/.test(ch.code)||c.current()!==null)return 'blocked';
 const ok=await showLocal({taskId,code:ch.code,expiresAt:ch.expiresAt});const b=c.current();if(ok!==true||closed||owner!==c||Date.now()>=ch.expiresAt||!b?.unique||!b.confirmed||b.scope!=='c2c')return 'blocked';
 detach?.();const epoch=b.bindingId;detach=g.service.attach({bindingKey:c.bindingKey,sendSelfDecision:req=>c.current()?.bindingId===epoch?c.sendSelfDecision({...req,bindingId:epoch}):{state:'blocked'}});
 const q=g.prepareLocal({taskId,sessionId});if(!q)return 'blocked';permitted=q;try{if(!await g.confirmLocal(q))return 'blocked'}finally{permitted=null}
 db.prepare("UPDATE first_trial SET phase='attempting',question=? WHERE slot=1").run(q);const result=await g.notify(q);db.prepare('UPDATE first_trial SET phase=? WHERE slot=1').run(result.state);return result.state;
 }finally{pending=false}},close(){closed=true;permitted=null;detach?.();owner?.revoke();owner=null;g.stop()}};
}
