// ═══════════════════ LAG ═══════════════════
// Ekte lagmodell (før: `layer` var berre ein merkelapp på nokre element).
// layers = [{name, visible, locked}] — element peikar på lag via namn
// (`el.layer`; manglande = «Standard»). Nye element får gjeldande lag (stempla i
// render(), sjå stampLayers()). Skjulte lag vert ikkje teikna, snappa mot,
// treft av klikk eller eksporterte; låste lag vert vist og snappa mot, men
// kan ikkje veljast/flyttast.

const DEFAULT_LAYER='Standard';
let layers=[{name:DEFAULT_LAYER,visible:true,locked:false}];
let curLayer=DEFAULT_LAYER;

function layerObj(name){ return layers.find(l=>l.name===name); }
function elLayer(el){ return el.layer||DEFAULT_LAYER; }
function layerVisible(el){ const l=layerObj(elLayer(el)); return !l||l.visible; }
function layerLocked(el){ const l=layerObj(elLayer(el)); return !!(l&&l.locked); }
function ensureLayer(name){
  if(!name) return DEFAULT_LAYER;
  if(!layerObj(name)) layers.push({name,visible:true,locked:false});
  return name;
}
// Kalla frå render(): gir nye element gjeldande lag, og opprettar lag som element
// refererer til men som ikkje finst (t.d. etter import eller opning av gamal teikning).
function stampLayers(){
  let changed=false;
  for(const el of elements){
    if(!el.layer){ el.layer=curLayer; changed=true; }
    else if(!layerObj(el.layer)){ layers.push({name:el.layer,visible:true,locked:false}); changed=true; }
  }
  if(changed) layersRefreshUI();
}

function layersReset(newLayers,newCur){
  layers=(newLayers&&newLayers.length)?newLayers:[{name:DEFAULT_LAYER,visible:true,locked:false}];
  curLayer=layerObj(newCur)?newCur:DEFAULT_LAYER;
  if(!layerObj(DEFAULT_LAYER)) layers.unshift({name:DEFAULT_LAYER,visible:true,locked:false});
  layersRefreshUI();
}

function layerSetCurrent(name){
  const l=layerObj(name); if(!l) return;
  l.visible=true; l.locked=false; curLayer=name;
  layersRefreshUI(); render();
}
function layerToggleVisible(name){
  const l=layerObj(name); if(!l) return;
  if(name===curLayer && l.visible){ showToast('Gjeldande lag kan ikkje skjulast — vel eit anna lag fyrst'); return; }
  l.visible=!l.visible;
  if(!l.visible) for(const id of [...selection]){ const el=elements.find(e=>e.id===id); if(el&&elLayer(el)===name) selection.delete(id); }
  updateProps(); layersRefreshUI(); render();
}
function layerToggleLock(name){
  const l=layerObj(name); if(!l) return;
  if(name===curLayer && !l.locked){ showToast('Gjeldande lag kan ikkje låsast — vel eit anna lag fyrst'); return; }
  l.locked=!l.locked;
  if(l.locked) for(const id of [...selection]){ const el=elements.find(e=>e.id===id); if(el&&elLayer(el)===name) selection.delete(id); }
  updateProps(); layersRefreshUI(); render();
}
function layerAdd(){
  const name=(prompt('Namn på nytt lag:')||'').trim();
  if(!name) return;
  if(layerObj(name)){ showToast('Det finst alt eit lag med det namnet'); return; }
  layers.push({name,visible:true,locked:false}); curLayer=name;
  layersRefreshUI(); render();
}
function layerRename(name){
  if(name===DEFAULT_LAYER){ showToast('«Standard» kan ikkje endrast namn'); return; }
  const nn=(prompt('Nytt namn på laget:',name)||'').trim();
  if(!nn||nn===name) return;
  if(layerObj(nn)){ showToast('Det finst alt eit lag med det namnet'); return; }
  layerObj(name).name=nn;
  for(const el of elements) if(el.layer===name) el.layer=nn;
  if(curLayer===name) curLayer=nn;
  layersRefreshUI(); render();
}
function layerDelete(name){
  if(name===DEFAULT_LAYER){ showToast('«Standard» kan ikkje slettast'); return; }
  const cnt=elements.filter(e=>e.layer===name).length;
  if(cnt && !confirm('Laget «'+name+'» har '+cnt+' element. Dei vert flytta til «Standard». Slette laget?')) return;
  for(const el of elements) if(el.layer===name) el.layer=DEFAULT_LAYER;
  layers=layers.filter(l=>l.name!==name);
  if(curLayer===name) curLayer=DEFAULT_LAYER;
  layersRefreshUI(); render();
}
function layerSelectAll(name){
  setTool('select');
  selection.clear();
  for(const el of elements) if(elLayer(el)===name && layerVisible(el) && !layerLocked(el)) selection.add(el.id);
  updateProps(); render();
  showToast(selection.size+' element valt på laget «'+name+'»');
}
// Flytt valde element til gjeldande lag
function layerMoveSelectionToCurrent(){
  let n=0;
  for(const el of elements) if(selection.has(el.id)){ el.layer=curLayer; n++; }
  layersRefreshUI(); render();
  if(n) showToast(n+' element flytta til «'+curLayer+'»');
}

function layersRefreshUI(){
  const list=document.getElementById('layerList'); if(!list) return;
  const counts={}; for(const el of elements){ const n=elLayer(el); counts[n]=(counts[n]||0)+1; }
  list.innerHTML='';
  for(const l of layers){
    const row=document.createElement('div');
    row.className='layer-row'+(l.name===curLayer?' cur':'');
    const esc=l.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    row.innerHTML=
      '<button class="lr-btn'+(l.visible?'':' off')+'" data-act="vis" title="Vis/skjul"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'+(l.visible?'':'<path d="M2.5 13.5l11-11"/>')+'</svg></button>'+
      '<button class="lr-btn'+(l.locked?' on':'')+'" data-act="lock" title="Lås/lås opp"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/>'+(l.locked?'<path d="M5.5 7V5a2.5 2.5 0 015 0v2"/>':'<path d="M5.5 7V5a2.5 2.5 0 014.6-1.3"/>')+'</svg></button>'+
      '<span class="lr-name" data-act="cur" title="Klikk = gjer til gjeldande lag · dobbeltklikk = endre namn">'+esc+'</span>'+
      '<span class="lr-count">'+(counts[l.name]||0)+'</span>'+
      '<button class="lr-btn" data-act="sel" title="Vel alle på laget"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2.5" y="2.5" width="11" height="11" rx="1.2" stroke-dasharray="2 1.6"/></svg></button>'+
      (l.name===DEFAULT_LAYER?'<span style="width:22px"></span>':'<button class="lr-btn" data-act="del" title="Slett lag"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>');
    row.addEventListener('click',e=>{
      const act=e.target.closest('[data-act]'); if(!act) return;
      const a=act.dataset.act;
      if(a==='vis') layerToggleVisible(l.name);
      else if(a==='lock') layerToggleLock(l.name);
      else if(a==='cur') layerSetCurrent(l.name);
      else if(a==='sel') layerSelectAll(l.name);
      else if(a==='del') layerDelete(l.name);
    });
    row.addEventListener('dblclick',e=>{ if(e.target.closest('[data-act="cur"]')) layerRename(l.name); });
    list.appendChild(row);
  }
  const lbl=document.getElementById('layerBtnLabel'); if(lbl) lbl.textContent=curLayer;
}
function layerPanelToggle(force){
  const p=document.getElementById('layerPanel'); if(!p) return;
  const show=force!==undefined?force:!p.classList.contains('show');
  p.classList.toggle('show',show);
  if(show) layersRefreshUI();
}

(function(){
  const st=document.createElement('style');
  st.textContent=
  '#layerPanel{position:absolute;left:12px;top:12px;width:268px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);z-index:26;display:none;overflow:hidden}'+
  '#layerPanel.show{display:block}'+
  '#layerPanel .lp-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border);font-family:"Space Grotesk",sans-serif;font-size:14px;font-weight:600;color:var(--ink)}'+
  '#layerPanel .lp-x{background:none;border:none;cursor:pointer;color:var(--text3);font-size:16px;line-height:1;padding:2px 6px}'+
  '#layerList{max-height:320px;overflow-y:auto;padding:6px}'+
  '.layer-row{display:flex;align-items:center;gap:2px;padding:3px 4px;border-radius:7px;border:1px solid transparent}'+
  '.layer-row:hover{background:var(--surface2)}'+
  '.layer-row.cur{background:var(--accent-bg);border-color:rgba(194,65,12,.25)}'+
  '.lr-btn{background:none;border:none;cursor:pointer;color:var(--text2);padding:4px;border-radius:5px;display:flex}'+
  '.lr-btn:hover{background:var(--border);color:var(--ink)}'+
  '.lr-btn.off{color:var(--text3)}.lr-btn.on{color:var(--accent)}'+
  '.lr-name{flex:1;font-family:Inter,sans-serif;font-size:13px;color:var(--ink);cursor:pointer;padding:3px 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;user-select:none}'+
  '.lr-count{font-family:"JetBrains Mono",monospace;font-size:10px;color:var(--text3);padding:0 4px}'+
  '#layerPanel .lp-foot{display:flex;gap:6px;padding:8px;border-top:1px solid var(--border)}'+
  '#layerPanel .lp-foot button{flex:1;height:30px;border-radius:7px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-family:Inter,sans-serif;font-size:12px;font-weight:500;cursor:pointer}'+
  '#layerPanel .lp-foot button:hover{background:var(--border);color:var(--ink)}';
  document.head.appendChild(st);

  // Knapp i topplinja (etter angre/gjer om)
  const anchor=document.getElementById('undoRedoWrap')||document.querySelector('#topbar .scale-control');
  if(anchor){
    const b=document.createElement('button');
    b.className='tb-action'; b.id='layerBtn'; b.title='Lag';
    b.innerHTML='<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2l6 3-6 3-6-3 6-3z"/><path d="M2 8l6 3 6-3M2 11l6 3 6-3"/></svg><span id="layerBtnLabel" style="max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+DEFAULT_LAYER+'</span>';
    b.onclick=()=>layerPanelToggle();
    anchor.after(b);
  }
  // Panel (inne i teikneflata, so han skjuler seg saman med ho i kart-modus)
  const host=document.getElementById('canvas-host');
  if(host){
    const p=document.createElement('div');
    p.id='layerPanel';
    p.innerHTML=
      '<div class="lp-head"><span>Lag</span><button class="lp-x" onclick="layerPanelToggle(false)" title="Lukk">×</button></div>'+
      '<div id="layerList"></div>'+
      '<div class="lp-foot"><button onclick="layerAdd()">+ Nytt lag</button><button onclick="layerMoveSelectionToCurrent()" title="Flytt valde element til gjeldande lag">Flytt val hit</button></div>';
    host.appendChild(p);
    // ikkje la klikk i panelet gå gjennom til teikneflata
    p.addEventListener('pointerdown',e=>e.stopPropagation());
    p.addEventListener('dblclick',e=>e.stopPropagation());
    p.addEventListener('contextmenu',e=>e.stopPropagation());
  }
})();
