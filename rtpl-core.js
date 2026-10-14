/* RTPL teaching prototype. Synthetic data. No platform/model connection. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RTPLCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CONFIG = Object.freeze({version:'DEMO-1.0', filingMinutes:2880, reviewMinutes:1440});
  const EFFECTS = ['Service score','Customer rating','Bonus','Future allocation'];
  function number(n) { if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw Error('A non-negative finite number is required.'); return n; }
  function budget(i) {
    number(i.distance); number(i.legalSpeed); number(i.conditionSpeed);
    if (i.legalSpeed===0 || i.conditionSpeed===0) throw Error('Speed must be positive.');
    return Math.ceil(i.distance/Math.min(i.legalSpeed,i.conditionSpeed)*60 + number(i.signals)+number(i.wait)+number(i.access)+number(i.handover));
  }
  // Explanatory breakdown of the same floor, so the interface can show every allowance.
  function budgetParts(i) {
    const total=budget(i), speed=Math.min(i.legalSpeed,i.conditionSpeed);
    return {travel:i.distance/speed*60,speed,signals:i.signals,wait:i.wait,access:i.access,handover:i.handover,total};
  }
  function initial(i, proposed, now=0) {
    number(proposed); number(now);
    if (!i.fresh) return {status:'HOLD',deadline:null,floor:null,policy:'P01',reason:'Stale or missing safety inputs. Hold dispatch for review.'};
    const floor=now+budget(i);
    return {status:'READY',deadline:Math.max(floor,proposed),floor,policy:'P02',reason:proposed<floor?'Extend to the condition-adjusted minimum time budget.':'Keep the proposed deadline because it passes this floor.'};
  }
  function recheckBundle(orders, now, remaining) {
    number(now);
    // Validate the whole batch before publishing any changed deadline.
    const checked=orders.map(o=>{
      number(o.deadline);
      const r=remaining[o.id];
      if (!r || !r.fresh) return null;
      return {id:o.id,deadline:Math.max(o.deadline,now+budget(r)),previous:o.deadline};
    });
    if (checked.some(x=>x===null)) return {status:'HOLD',orders:orders.map(o=>({...o})),policy:'P01',reason:'Do not publish a partial bundle update. Retain deadlines and request review.'};
    return {status:'READY',orders:checked,policy:'P02',reason:'All affected accepted orders checked. Their deadlines never move earlier.'};
  }
  function union(intervals) {
    const sorted=intervals.map(([a,b])=>{number(a);number(b);if(b<a)throw Error('Interval ends before it starts.');return[a,b];}).sort((a,b)=>a[0]-b[0]);
    const out=[];
    for(const x of sorted){const last=out[out.length-1];if(last&&x[0]<=last[1])last[1]=Math.max(last[1],x[1]);else out.push([...x]);}
    return out;
  }
  const length=xs=>union(xs).reduce((s,[a,b])=>s+b-a,0);
  function subtract(a,b) {
    let out=union(a);
    for(const [x,y] of union(b))out=out.flatMap(([l,r])=>y<=l||x>=r?[[l,r]]:[...(x>l?[[l,Math.min(x,r)]]:[]),...(y<r?[[Math.max(y,l),r]]:[])]);
    return union(out);
  }
  function assess({deadline,completed,events=[],covered=[],riderEvidence=null,safeRoute=false,causalComplete=true}) {
    number(deadline);number(completed);
    const ids=new Set();
    const verified=events.filter(e=>{
      if(ids.has(e.id))return false;ids.add(e.id);
      number(e.start);number(e.end);if(e.end<e.start)throw Error('Invalid event interval.');
      return e.verified===true && e.reliable===true && typeof e.source==='string' && e.source.trim().length>0;
    });
    // Credit only observed external intervals, once, minus existing coverage.
    const external=union(verified.map(e=>[e.start,Math.min(e.end,completed)]).filter(([a,b])=>b>=a));
    const creditIntervals=subtract(external,covered);
    const late=Math.max(0,completed-deadline), credit=Math.min(late,length(creditIntervals)), residual=Math.max(0,late-credit);
    const evidence = riderEvidence && riderEvidence.verified===true && riderEvidence.reliable===true && riderEvidence.source && riderEvidence.end>=riderEvidence.start;
    // Responsibility must cover the residual period, not merely coincide with late completion.
    const attributed = residual>0 && evidence && length(subtract([[deadline+credit,completed]],[[riderEvidence.start,riderEvidence.end]]))===0;
    let policy,reason,branch,eligible=false;
    if(residual===0){policy='P03';branch=late===0?'ON_TIME':'COVERED_BY_OUTSIDE_DELAY';reason=late===0?'Delivery completed by the effective deadline.':'Verified outside delay covers the remaining lateness.';}
    else if(safeRoute){policy='P05';branch='SAFE_ALTERNATIVE';reason='A verified legal safe alternative remains protected.';}
    else if(!causalComplete || !attributed){policy='P04';branch=!causalComplete?'CAUSE_RECORD_INCOMPLETE':'RIDER_CAUSE_NOT_ESTABLISHED';reason='Rider responsibility is not reliably established. Apply protection automatically.';}
    else{policy='P04';branch='RIDER_CAUSE_SUPPORTED';eligible=true;reason='Reliable causal evidence supports assessment of the residual delay. Explain the evidence and offer appeal.';}
    return {late,credit,residual,creditIntervals,verifiedEventCount:verified.length,eligible,protected:!eligible,policy,branch,reason,appeal:{status:'NONE'},effects:Object.fromEntries(EFFECTS.map(x=>[x,eligible?'ASSESSMENT ELIGIBLE':'PROTECTED']))};
  }
  function appeal(decision, submitted, completed) {
    number(submitted);number(completed);
    if(submitted<completed)throw Error('Appeal cannot precede completion.');
    if(submitted-completed>CONFIG.filingMinutes)throw Error('Demo filing period expired. Request exceptional review.');
    if(decision.appeal.status==='PENDING')return decision;
    return {...decision,appeal:{status:'PENDING',submitted,reviewDue:submitted+CONFIG.reviewMinutes},effects:Object.fromEntries(EFFECTS.map(x=>[x,decision.eligible?'SUSPENDED':'PROTECTED'])),policy:'P06',reason:'Disputed effects remain suspended while an authorised reviewer considers the appeal.'};
  }
  function review(decision,{authorised,outcome,reason,at}) {
    if(!authorised)throw Error('Reviewer authority is required.');
    if(decision.appeal.status!=='PENDING')throw Error('No pending appeal.');
    if(!['UPHOLD','REVERSE'].includes(outcome))throw Error('Choose uphold or reverse.');
    if(typeof reason!=='string'||reason.trim().length<12)throw Error('Record a meaningful reason of at least 12 characters.');
    number(at);if(at<decision.appeal.submitted)throw Error('Review cannot precede the appeal.');
    if(outcome==='UPHOLD'&&!decision.eligible)throw Error('Cannot uphold an adverse effect without reliable initial causal evidence.');
    const eligible=outcome==='UPHOLD'&&decision.eligible;
    return {...decision,eligible,protected:!eligible,appeal:{...decision.appeal,status:outcome,reviewed:at,reason:reason.trim(),overdue:at>decision.appeal.reviewDue},effects:Object.fromEntries(EFFECTS.map(x=>[x,eligible?'ASSESSMENT ELIGIBLE':'PROTECTED'])),policy:'P06',reason:'Human review '+outcome.toLowerCase()+': '+reason.trim()};
  }
  function audit(order,decision) {
    return {case:order.id,configuration:CONFIG.version,protectedDeadline:order.deadline,policy:decision.policy,late:decision.late,credit:decision.credit,residual:decision.residual,protected:decision.protected,appeal:decision.appeal.status,effects:{...decision.effects}};
  }
  return {CONFIG,EFFECTS,budget,budgetParts,initial,recheckBundle,union,length,subtract,assess,appeal,review,audit};
});
