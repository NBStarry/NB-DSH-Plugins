import {normalizeReply, sendQuestion} from './transport.mjs';

// One owner, one private persistent database. A reserved-but-unfinished send is always unknown.
export class QQChannel {
  constructor(db, {bindings, core, verify, post, now=Date.now}) {
    Object.assign(this,{db,bindings,core,verify,post,now});
    db.exec('CREATE TABLE IF NOT EXISTS qq_reject(b TEXT,e TEXT,reason TEXT,PRIMARY KEY(b,e))');
    db.exec("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS qq_notice(q TEXT PRIMARY KEY,b TEXT NOT NULL,state TEXT NOT NULL,message TEXT,ref TEXT,sent INTEGER,expires INTEGER NOT NULL,UNIQUE(b,message),UNIQUE(b,ref))");
  }
  get(id){ return this.db.prepare('SELECT * FROM qq_notice WHERE q=?').get(id); }
  recover(id){
    const r=this.get(id); if(r?.state!=='accepted' || this.bindings.current()?.bindingId!==r.b || this.now()>=r.expires) return false;
    if(this.core.questionState(id,r.b)==='draft') this.core.markDelivered(id,r.b);
    return this.core.questionState(id,r.b)==='open';
  }
  async notify(question,{allowActive=false,passive}={}) {
    const b=this.bindings.current(), id=question.questionId;
    if(!b || !this.post || b.bindingId!==question.bindingId) return {state:'blocked'};
    const old=this.get(id);
    if(old) { if(old.b!==b.bindingId) return {state:'blocked'}; this.recover(id);return {state:old.state,replayed:true}; }
    if((!allowActive&&!passive) || !Number.isSafeInteger(question.expiresAt) || question.expiresAt<=this.now() || this.core.questionState(id,b.bindingId)!=='draft') return {state:'blocked'};
    // Autocommit BEFORE calling the capability. Even process.exit inside post cannot lose this fence.
    this.db.prepare("INSERT INTO qq_notice(q,b,state,expires) VALUES(?,?,'unknown',?)").run(id,b.bindingId,question.expiresAt);
    let platformTime=null;
    const receipt=await sendQuestion({binding:b,question,passive,allowActive,now:this.now(),post:async(...args)=>{
      const response=await this.post(...args);platformTime=instant(response?.body?.timestamp);return response;
    }});
    this.db.prepare('UPDATE qq_notice SET state=?,message=?,ref=?,sent=? WHERE q=?').run(receipt.state,receipt.messageId??null,receipt.reference??null,platformTime,id);
    if(receipt.state==='accepted') this.recover(id);
    return receipt;
  }
  async receive(raw, deliver) {
    const b=this.bindings.current();if(!b || !this.verify) return {action:'reject',reason:'unbound'};
    const v=await this.verify(raw);
    const reply=await normalizeReply(raw,{binding:b,verify:()=>v,lookupReference:(scope,ref)=>this.db.prepare("SELECT q FROM qq_notice WHERE b=? AND ref=? AND state='accepted'").get(scope,ref)?.q});
    if(!reply || this.bindings.current()?.bindingId!==b.bindingId) return {action:'reject',reason:'unverified-or-unmatched'};
    const seen=this.core.receipt(b.bindingId,reply.eventId) ?? this.db.prepare('SELECT reason FROM qq_reject WHERE b=? AND e=?').get(b.bindingId,reply.eventId);
    if(seen) return {action:'skip',reason:seen.reason??seen.result};
    const deny=reason=>{this.db.prepare('INSERT OR IGNORE INTO qq_reject VALUES(?,?,?)').run(b.bindingId,reply.eventId,reason);return {action:'reject',reason}};
    if(!reply.questionId && !reply.text.startsWith('#')) {
      const at=instant(v.event.d.timestamp), now=this.now();
      if(at===null || at>now) return deny('use-question-reference');
      // Include historical windows; never turn a late answer into a vote on a newer question.
      const rows=this.db.prepare("SELECT q,sent FROM qq_notice WHERE b=? AND state='accepted' AND expires>? AND (sent IS NULL OR sent<?) LIMIT 2").all(b.bindingId,at,at);
      const open=this.core.listOpenQuestions(b.bindingId);
      if(rows.length!==1 || rows[0].sent===null || open.length!==1 || open[0].questionId!==rows[0].q) return deny('use-question-reference');
      reply.questionId=rows[0].q;
    }
    let receiptQuestionId=reply.questionId;
    if(!receiptQuestionId){
      const short=/^#([0-9a-f]{8})\s/u.exec(reply.text);
      const matches=short && this.core.listOpenQuestions(b.bindingId).filter(q=>q.questionId.startsWith(short[1]));
      if(!matches || matches.length!==1) return deny('invalid-or-ambiguous-reference');
      // Receipt lookup only. Core must see a textual short code, not an authoritative platform reference.
      receiptQuestionId=matches[0].questionId;
    }
    const persisted=this.get(receiptQuestionId);
    if(persisted?.state!=='accepted'||persisted.b!==b.bindingId) return deny('no-trusted-receipt');
    return this.core.reply(reply,deliver);
  }
}
function instant(s){ if(typeof s!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(s)) return null; const n=Date.parse(s);return Number.isSafeInteger(n)?n:null; }
