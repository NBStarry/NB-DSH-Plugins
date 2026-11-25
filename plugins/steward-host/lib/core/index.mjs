import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

function text(x, max = 256) { if (typeof x !== 'string' || !x.trim() || x.length > max) throw Error('invalid text'); return x; }
const choicesOK = a => Array.isArray(a) && a.length > 0 && a.length <= 12 && a.every(x => text(x, 64));

// One trusted owner and one synthetic workspace per database. Never pass a channel event as grant.
export class Steward {
  #db; #busy = false;
  constructor(file = ':memory:', {budget = 8} = {}) {
    if (!Number.isSafeInteger(budget) || budget < 0) throw Error('invalid budget');
    this.#db = new DatabaseSync(file);
    try {
      this.#db.exec(`PRAGMA locking_mode=EXCLUSIVE; PRAGMA synchronous=FULL; BEGIN EXCLUSIVE;
        CREATE TABLE IF NOT EXISTS policy(paused INTEGER, remaining INTEGER);
        CREATE TABLE IF NOT EXISTS task(id TEXT PRIMARY KEY, title TEXT, session TEXT, active INTEGER);
        CREATE TABLE IF NOT EXISTS source(key TEXT PRIMARY KEY, task TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS question(id TEXT PRIMARY KEY, task TEXT, binding TEXT, prompt TEXT, choices TEXT, expires INTEGER, state TEXT);
        CREATE TABLE IF NOT EXISTS receipt(binding TEXT, event TEXT, q TEXT, op TEXT UNIQUE, result TEXT, PRIMARY KEY(binding,event));
        UPDATE question SET state='unknown' WHERE state='sending'; UPDATE receipt SET result='unknown' WHERE result='sending';`);
      this.#db.prepare('INSERT INTO policy SELECT 0, ? WHERE NOT EXISTS (SELECT 1 FROM policy)').run(budget);
      this.#db.exec('COMMIT');
    } catch(e) { this.#db.close(); throw e; }
  }
  #sql(s) { return this.#db.prepare(s); }
  #tx(fn) { this.#db.exec('BEGIN IMMEDIATE'); try { const r=fn(); this.#db.exec('COMMIT'); return r; } catch(e) { this.#db.exec('ROLLBACK'); throw e; } }
  close() { if (this.#busy) throw Error('delivery in progress'); this.#db.close(); }
  pause(value = true) { if (typeof value !== 'boolean') throw Error('invalid pause'); this.#sql('UPDATE policy SET paused=?').run(+value); }
  ingest({title}, {source, sourceKey, sessionId=null, assigned=false, linkedTaskId=null}) {
    if (!['feishu','dsh'].includes(source) || typeof assigned !== 'boolean') throw Error('invalid grant');
    const key=JSON.stringify([source,text(sourceKey)]); text(title, 512); if(sessionId!==null) text(sessionId);
    return this.#tx(()=>{
      const existing=this.#sql('SELECT task FROM source WHERE key=?').get(key)?.task;
      if(existing && linkedTaskId && existing!==linkedTaskId) throw Error('conflicting task link');
      const id=existing ?? linkedTaskId ?? randomUUID();
      if(existing || linkedTaskId!==null) {
        const old=this.#sql('SELECT * FROM task WHERE id=?').get(id);
        if(!old || (sessionId && old.session && old.session!==sessionId)) throw Error('unresolved or conflicting origin');
        // Only an assigned grant can establish a target or promote a candidate.
        if(assigned) this.#sql('UPDATE task SET active=1, session=coalesce(session,?) WHERE id=?').run(sessionId,id);
      } else this.#sql('INSERT INTO task VALUES(?,?,?,?)').run(id,title,assigned?sessionId:null,+assigned);
      if(!existing) this.#sql('INSERT INTO source VALUES(?,?)').run(key,id);
      return id;
    });
  }
  openQuestion({taskId,sessionId,bindingId,kind,prompt,choices,expiresAt=Date.now()+3600000}) {
    if(kind!=='business' || !choicesOK(choices) || !Number.isSafeInteger(expiresAt) || expiresAt<=Date.now()) throw Error('not an ordinary bounded question');
    const task=this.#sql('SELECT session,active FROM task WHERE id=?').get(text(taskId));
    if(!task?.active || task.session!==text(sessionId)) throw Error('no assigned original session');
    const id=randomUUID(); this.#sql('INSERT INTO question VALUES(?,?,?,?,?,?,?)').run(id,taskId,text(bindingId),text(prompt,512),JSON.stringify(choices),expiresAt,'draft'); return id;
  }
  listOpenQuestions(bindingId) { return this.#sql("SELECT id AS questionId,expires AS expiresAt FROM question WHERE binding=? AND state='open' AND expires>? ORDER BY id").all(text(bindingId),Date.now()); }
  questionState(questionId,bindingId) { return this.#sql('SELECT state FROM question WHERE id=? AND binding=? AND expires>?').get(text(questionId),text(bindingId),Date.now())?.state ?? null; }
  // Trusted outbound adapter acknowledges a notification in this exact channel scope.
  markDelivered(questionId,bindingId) { if(!this.#sql("UPDATE question SET state='open' WHERE id=? AND binding=? AND state='draft'").run(text(questionId),text(bindingId)).changes) throw Error('no matching draft'); }
  receipt(bindingId,eventId) { return this.#sql('SELECT q AS questionId,op AS operationId,result FROM receipt WHERE binding=? AND event=?').get(bindingId,eventId); }
  async reply(input,deliver) {
    const {bindingId,eventId,questionId,kind}=input; text(bindingId); text(eventId);
    const previous=this.receipt(bindingId,eventId);
    if(previous) return {action:'skip',reason:previous.result,...previous};
    const deny=(reason,action='reject')=>{this.#sql('INSERT INTO receipt VALUES(?,?,NULL,NULL,?)').run(bindingId,eventId,reason);return {action,reason};};
    if(kind!=='business' || Object.keys(input).some(k=>!['bindingId','eventId','questionId','text','kind'].includes(k))) return deny('unsupported-envelope');
    if(typeof input.text!=='string' || input.text.length>256) return deny('invalid-answer');
    const short=/^#([0-9a-f]{8})\s+(.+)$/u.exec(input.text);
    const explicit=Object.hasOwn(input,'questionId');
    if(short && explicit && (typeof questionId!=='string' || questionId.slice(0,8)!==short[1])) return deny('conflicting-reference');
    if(input.text.startsWith('#') && !short) return deny('invalid-short-reference');
    // A stale short code must not become a different question's code after it closes.
    if(short && !explicit && this.#sql('SELECT id FROM question WHERE binding=? AND substr(id,1,8)=? LIMIT 2').all(bindingId,short[1]).length>1) return deny('short-reference-collision','ambiguous');
    const answer=short?short[2]:input.text;
    const matches=this.#sql(`SELECT question.*,task.session FROM question JOIN task ON task.id=question.task WHERE state='open' AND binding=? AND expires>? ${explicit?'AND question.id=?':short?'AND substr(question.id,1,8)=?':''} LIMIT 2`).all(bindingId,Date.now(),...(explicit?[typeof questionId==='string'?questionId:'']:short?[short[1]]:[]));
    if(matches.length!==1) return deny(matches.length?'multiple-questions':'no-open-question',matches.length?'ambiguous':'reject');
    const q=matches[0]; if(!JSON.parse(q.choices).includes(answer)) return deny('not-an-offered-choice');
    const policy=this.#sql('SELECT * FROM policy').get(); if(policy.paused || !policy.remaining || this.#busy) return deny(policy.paused?'paused':this.#busy?'busy':'budget-exhausted');
    const operationId=randomUUID();
    this.#tx(()=>{this.#sql('UPDATE policy SET remaining=remaining-1').run();this.#sql("UPDATE question SET state='sending' WHERE id=?").run(q.id);this.#sql('INSERT INTO receipt VALUES(?,?,?,?,?)').run(bindingId,eventId,q.id,operationId,'sending');});
    this.#busy=true;
    try {
      let status='unknown';
      try { const ack=await deliver({operationId,questionId:q.id,taskId:q.task,sessionId:q.session,text:answer}); if(ack?.accepted===true && ack.operationId===operationId) status='accepted'; } catch { /* admission may already have happened */ }
      this.#tx(()=>{this.#sql('UPDATE question SET state=? WHERE id=?').run(status,q.id);this.#sql('UPDATE receipt SET result=? WHERE op=?').run(status,operationId);});
      return {action:status==='accepted'?'reply':'unknown',reason:status,questionId:q.id,operationId};
    } finally {this.#busy=false;}
  }
}
