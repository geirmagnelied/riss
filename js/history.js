// ═══════════════════ ANGRE / GJER OM ═══════════════════
// Øyeblikksbilete-basert historikk: heile tilstanden (elements + layers) vert
// serialisert og samanlikna etter kvar avslutta handling. Det fangar ALLE
// endringsvegar (verktøy, flytting, sletting, import, handtak, modalar) utan å
// måtte røre kvart enkelt `elements.push(...)`-sted. Mellombels visingstilstand
// (selSeg, alt med "_"-prefiks) er utelaten frå bileta, so val av segment ikkje
// vert eigne angresteg.
//
// Utløysarar: (1) pointerup/keyup → kort forsinking, (2) render() utan nedtrykt
// peikar → debounce. Medan peikaren er nede (dra) vert ingenting lagra, so éi
// drageøkt = eitt angresteg uansett kor lenge ho varer.

const HIST={stack:[],idx:-1,maxCount:100,maxChars:150e6,chars:0,pointerDown:false,timer:null,restoring:false};

function histSerialize(){
  return JSON.stringify({e:elements,l:(typeof layers!=='undefined'?layers:null),c:(typeof curLayer!=='undefined'?curLayer:null)},
    (k,v)=>(k==='selSeg'||k[0]==='_')?undefined:v);
}
function histInit(){
  HIST.stack=[histSerialize()]; HIST.idx=0; HIST.chars=HIST.stack[0].length;
  updateUndoUI();
}
function histCheckpoint(){
  if(HIST.restoring||HIST.pointerDown) return;
  if(HIST.idx<0){ histInit(); return; }
  const s=histSerialize();
  if(HIST.stack[HIST.idx]===s) return;
  // forkast gjer-om-grein
  for(let i=HIST.stack.length-1;i>HIST.idx;i--) HIST.chars-=HIST.stack[i].length;
  HIST.stack.length=HIST.idx+1;
  HIST.stack.push(s); HIST.idx++; HIST.chars+=s.length;
  while(HIST.stack.length>1 && (HIST.stack.length>HIST.maxCount || HIST.chars>HIST.maxChars)){
    HIST.chars-=HIST.stack[0].length; HIST.stack.shift(); HIST.idx--;
  }
  updateUndoUI();
}
function histSchedule(ms){
  clearTimeout(HIST.timer);
  HIST.timer=setTimeout(histCheckpoint,ms);
}
// kalla frå render() — berre når ingen peikar er nede
function histOnRender(){ if(!HIST.pointerDown) histSchedule(180); }

function histRestore(snapshot){
  HIST.restoring=true;
  const d=JSON.parse(snapshot);
  elements=d.e;
  if(d.l && typeof layers!=='undefined'){ layers=d.l; curLayer=d.c||curLayer; if(typeof layersRefreshUI==='function') layersRefreshUI(); }
  // avbryt pågåande teikning/handtak-drag
  linePts=[];lineSegs=[];wallPts=[];wallSegs=[];polyPoints=[];
  pendingLinePt=null;pendingWallPt=null;arcDragging=false;
  stage=0;p1=null;dimStage=0;dimP1=dimP2=null;movingSel=false;
  if(typeof alignCancel==='function') alignCancel();
  if(typeof gripCancel==='function') gripCancel();
  const ids=new Set(elements.map(e=>e.id));
  selection=new Set([...selection].filter(id=>ids.has(id)));
  updateProps(); render();
  HIST.restoring=false;
}
function undo(){
  clearTimeout(HIST.timer); histCheckpoint(); // fang uferdig endring fyrst
  if(HIST.idx<=0){ showToast('Ingenting å angre'); return; }
  HIST.idx--; histRestore(HIST.stack[HIST.idx]); updateUndoUI();
}
function redo(){
  clearTimeout(HIST.timer); histCheckpoint();
  if(HIST.idx>=HIST.stack.length-1){ showToast('Ingenting å gjere om'); return; }
  HIST.idx++; histRestore(HIST.stack[HIST.idx]); updateUndoUI();
}
function updateUndoUI(){
  const u=document.getElementById('undoBtn'), r=document.getElementById('redoBtn');
  if(u) u.disabled = HIST.idx<=0;
  if(r) r.disabled = HIST.idx>=HIST.stack.length-1;
}

// pointer-sporing (capture-fase, so det skjer før appen sine eigne handterarar)
window.addEventListener('pointerdown',()=>{ HIST.pointerDown=true; },true);
window.addEventListener('pointerup',()=>{ HIST.pointerDown=false; histSchedule(60); },true);
window.addEventListener('pointercancel',()=>{ HIST.pointerDown=false; histSchedule(60); },true);
window.addEventListener('keyup',()=>{ histSchedule(60); },true);

// Angre/gjer om-knappar i topplinja (injisert, so index.html slepp å kjenne detaljane)
(function(){
  const anchor=document.querySelector('#topbar .scale-control');
  if(!anchor) return;
  const wrap=document.createElement('div');
  wrap.id='undoRedoWrap';
  wrap.style.cssText='display:flex;gap:4px';
  wrap.innerHTML=
    '<button class="tb-action" id="undoBtn" title="Angre (Ctrl+Z)" style="padding:0 10px" onclick="undo()"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 3L2.5 6.5 6 10"/><path d="M2.5 6.5H10a3.5 3.5 0 010 7H6"/></svg></button>'+
    '<button class="tb-action" id="redoBtn" title="Gjer om (Ctrl+Y)" style="padding:0 10px" onclick="redo()"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3l3.5 3.5L10 10"/><path d="M13.5 6.5H6a3.5 3.5 0 000 7h4"/></svg></button>';
  anchor.after(wrap);
  const st=document.createElement('style');
  st.textContent='.tb-action:disabled{opacity:.35;cursor:default}.tb-action:disabled:hover{background:var(--surface);color:var(--text2);border-color:var(--border)}';
  document.head.appendChild(st);
})();
