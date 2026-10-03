// ═══════════════════ SENTERLINJE / ALIGNMENT ═══════════════════
// Parametrisk senterlinje definert av vendepunkt (PI) og ein radius per indre
// vendepunkt, slik vegprosjektering gjer det: rette linjer + EKSAKTE sirkelbogar
// (ikkje kvadratiske kurver som dagens polylinje/vegg-bue). Element:
//   { type:'alignment', pts:[PI0..PIn], radii:[R1..Rn-2] (mm), roadWidth (mm),
//     color, weightMm, [layer, z, ...] }
// Geometrien (rette + bogar, med stasjonering) vert rekna ut av alignCompute() og
// mellomlagra i el._geo (ikkje lagra — "_"-felt vert utelatne frå historikk/lagring).
// Tangentlengda ved eit PI er T = R·tan(Δ/2); der to tilstøytande bogar ikkje får
// plass innanfor segmentet vert radiusane klemte ned (el._geo ... clamped), og
// klemminga vert varsla i props-panelet.

let alignPts=[];            // PI under teikning
let alignRadius=50000;      // standard radius (mm) for nye vendepunkt
let alignRoadWidth=6000;    // standard vegbreidd (mm)

function alignCancel(){ alignPts=[]; }

// ─── GEOMETRI ───
function alignCompute(P,radii){
  const n=P.length, items=[];
  const info=new Array(n).fill(null);
  for(let i=1;i<n-1;i++){
    const a=P[i-1],b=P[i],c=P[i+1];
    const l1=Math.hypot(b.x-a.x,b.y-a.y), l2=Math.hypot(c.x-b.x,c.y-b.y);
    if(l1<1e-6||l2<1e-6) continue;
    const d1={x:(b.x-a.x)/l1,y:(b.y-a.y)/l1}, d2={x:(c.x-b.x)/l2,y:(c.y-b.y)/l2};
    const cross=d1.x*d2.y-d1.y*d2.x, dot=d1.x*d2.x+d1.y*d2.y;
    const delta=Math.atan2(Math.abs(cross),dot);       // avbøying 0..π
    const R=radii[i-1]||0;
    if(delta<1e-4||R<=0) continue;                     // rett igjennom / ingen bue
    info[i]={d1,d2,delta,R,reqR:R,T:R*Math.tan(delta/2),sgn:cross>0?1:-1,b,clamped:false};
  }
  // klemming: tangentlengdene må få plass innanfor kvart segment. Der to bogar deler
  // eit segment får kvar ein del proporsjonal med ønska tangentlengd (like ønskte
  // radiusar ⇒ likt delt), mot ein endepunkt-segment får bogen heile lengda.
  // Utleia frå dei OPPHAVLEGE ønska verdiane (ikkje sekvensielt), so resultatet er
  // symmetrisk og uavhengig av rekkjefølgje.
  const segL=k=>Math.hypot(P[k+1].x-P[k].x,P[k+1].y-P[k].y);
  const treq=info.map(f=>f?f.T:0);
  for(let i=1;i<n-1;i++){
    const f=info[i]; if(!f) continue;
    const prev=(i-1>=1)?info[i-1]:null, next=(i+1<=n-2)?info[i+1]:null;
    const limIn =prev?segL(i-1)*treq[i]/(treq[i]+treq[i-1]):segL(i-1);
    const limOut=next?segL(i)*treq[i]/(treq[i]+treq[i+1]):segL(i);
    const T=Math.min(treq[i],limIn,limOut);
    if(T<treq[i]-1e-9){ f.T=T; f.R=T/Math.tan(f.delta/2); f.clamped=true; }
  }
  let cur={x:P[0].x,y:P[0].y}, s=0;
  const pushLine=(a,b)=>{ const len=Math.hypot(b.x-a.x,b.y-a.y); if(len<1e-6) return; items.push({kind:'line',a:{x:a.x,y:a.y},b:{x:b.x,y:b.y},len,s0:s}); s+=len; };
  for(let i=1;i<n-1;i++){
    const f=info[i];
    if(!f){ pushLine(cur,P[i]); cur={x:P[i].x,y:P[i].y}; continue; }
    const A={x:f.b.x-f.d1.x*f.T,y:f.b.y-f.d1.y*f.T}, B={x:f.b.x+f.d2.x*f.T,y:f.b.y+f.d2.y*f.T};
    pushLine(cur,A);
    const nrm=f.sgn>0?{x:-f.d1.y,y:f.d1.x}:{x:f.d1.y,y:-f.d1.x};
    const C={x:A.x+nrm.x*f.R,y:A.y+nrm.y*f.R};
    const a0=Math.atan2(A.y-C.y,A.x-C.x), sweep=f.sgn*f.delta, len=f.R*f.delta;
    items.push({kind:'arc',c:C,r:f.R,a0,sweep,p0:A,p1:B,len,s0:s,pi:i,delta:f.delta,sgn:f.sgn,clamped:f.clamped,reqR:f.reqR});
    s+=len; cur=B;
  }
  pushLine(cur,P[n-1]);
  const g={items,total:s};
  g.flat=alignFlatten(g);
  return g;
}
function alignArcSteps(it){ return Math.max(4,Math.ceil(Math.abs(it.sweep)/(Math.PI/72))); } // ~2,5°
function alignFlatten(g){
  const pts=[];
  for(const it of g.items){
    if(it.kind==='line'){ if(!pts.length) pts.push({x:it.a.x,y:it.a.y}); pts.push({x:it.b.x,y:it.b.y}); }
    else{
      if(!pts.length) pts.push({x:it.p0.x,y:it.p0.y});
      const steps=alignArcSteps(it);
      for(let k=1;k<=steps;k++){ const t=it.a0+it.sweep*k/steps; pts.push({x:it.c.x+Math.cos(t)*it.r,y:it.c.y+Math.sin(t)*it.r}); }
    }
  }
  return pts;
}
function alignGeo(el){
  const key=JSON.stringify([el.pts,el.radii]);
  if(el._geoKey!==key||!el._geo){ el._geo=alignCompute(el.pts,el.radii||[]); el._geoKey=key; }
  return el._geo;
}
// Parallellforskyving av senterlinja (positiv = venstre normal, same teikn som offsetPolyline).
// Eksakt: rette linjer forskyvast, bogar får radius r − sgn·off.
function alignOffsetFlat(g,off){
  const pts=[];
  for(const it of g.items){
    if(it.kind==='line'){
      const dx=it.b.x-it.a.x,dy=it.b.y-it.a.y,l=Math.hypot(dx,dy)||1,nx=-dy/l,ny=dx/l;
      if(!pts.length) pts.push({x:it.a.x+nx*off,y:it.a.y+ny*off});
      pts.push({x:it.b.x+nx*off,y:it.b.y+ny*off});
    }else{
      const r=Math.max(1,it.r-it.sgn*off), steps=alignArcSteps(it);
      if(!pts.length) pts.push({x:it.c.x+Math.cos(it.a0)*r,y:it.c.y+Math.sin(it.a0)*r});
      for(let k=1;k<=steps;k++){ const t=it.a0+it.sweep*k/steps; pts.push({x:it.c.x+Math.cos(t)*r,y:it.c.y+Math.sin(t)*r}); }
    }
  }
  return pts;
}
// Punkt + tangentretning ved avstand d (mm) langs senterlinja
function alignPointAt(g,d){
  d=Math.max(0,Math.min(g.total,d));
  for(const it of g.items){
    if(d<=it.s0+it.len+1e-9){
      const t=it.len>0?(d-it.s0)/it.len:0;
      if(it.kind==='line'){ const dx=it.b.x-it.a.x,dy=it.b.y-it.a.y; return {x:it.a.x+dx*t,y:it.a.y+dy*t,angle:Math.atan2(dy,dx)}; }
      const th=it.a0+it.sweep*t;
      return {x:it.c.x+Math.cos(th)*it.r,y:it.c.y+Math.sin(th)*it.r,angle:th+it.sgn*Math.PI/2};
    }
  }
  const l=g.items[g.items.length-1];
  if(!l) return {x:0,y:0,angle:0};
  return l.kind==='line'?{x:l.b.x,y:l.b.y,angle:Math.atan2(l.b.y-l.a.y,l.b.x-l.a.x)}:{x:l.p1.x,y:l.p1.y,angle:l.a0+l.sweep+l.sgn*Math.PI/2};
}
function alignBBox(el){
  const g=alignGeo(el), w=(el.roadWidth||0)/2;
  let a=1e15,b=1e15,c=-1e15,d=-1e15;
  for(const p of g.flat){ a=Math.min(a,p.x);b=Math.min(b,p.y);c=Math.max(c,p.x);d=Math.max(d,p.y); }
  if(a>c) return null;
  return {minx:a-w,miny:b-w,maxx:c+w,maxy:d+w};
}
function alignSegments(el){
  const g=alignGeo(el), out=[];
  g.items.forEach((it,i)=>{
    if(it.kind==='line') out.push({a:it.a,b:it.b,el,segIdx:i});
    else out.push({a:it.p0,b:it.p1,el,segIdx:i,arcChord:true}); // berre endepunkt (tangentpunkt) snappar
  });
  return out;
}
function alignHit(el,sp,tol){
  const g=alignGeo(el), half=((el.roadWidth||0)/2)*view.zoom+tol, f=g.flat;
  for(let k=0;k<f.length-1;k++){
    const a=w2s(f[k].x,f[k].y), b=w2s(f[k+1].x,f[k+1].y);
    if(distSeg(sp,a,b)<half) return true;
  }
  return false;
}
function alignStationLabel(sMm){
  const m=sMm/1000, km=Math.floor(m/1000), rest=Math.round(m-km*1000);
  return km+'+'+String(rest).padStart(3,'0');
}

// ─── TEIKNING ───
function drawAlignment(c,el,isPreview){
  const g=alignGeo(el), flat=g.flat;
  if(flat.length<2) return;
  const w=el.roadWidth||0, sel=selection.has(el.id);
  const trace=pts=>{ c.beginPath(); pts.forEach((p,i)=>{ const s=w2s(p.x,p.y); if(i) c.lineTo(s.x,s.y); else c.moveTo(s.x,s.y); }); };
  const baseLW=c.lineWidth;
  c.save();
  if(w>0){
    const L=alignOffsetFlat(g,w/2), R=alignOffsetFlat(g,-w/2);
    c.beginPath();
    L.forEach((p,i)=>{ const s=w2s(p.x,p.y); if(i) c.lineTo(s.x,s.y); else c.moveTo(s.x,s.y); });
    for(let i=R.length-1;i>=0;i--){ const s=w2s(R[i].x,R[i].y); c.lineTo(s.x,s.y); }
    c.closePath();
    c.save(); c.globalAlpha=(isPreview?.35:.5); c.fillStyle=el.fillColor||'#c4c0b8'; c.fill(); c.restore();
    c.lineWidth=baseLW; trace(L); c.stroke(); trace(R); c.stroke();
  }
  // senterlinje: strek-prikk
  c.lineWidth=Math.max(.75,baseLW*0.55); c.setLineDash([14,4,2,4]); trace(flat); c.stroke(); c.setLineDash([]);
  c.restore();

  // stasjonering (pel) — merke og tekst
  c.save();
  const stepM=[5,10,20,50,100,200,500,1000,2000,5000].find(m=>m*1000*view.zoom>=90)||10000;
  c.strokeStyle=el.color; c.fillStyle=el.color; c.lineWidth=1;
  c.font="10px 'JetBrains Mono',monospace"; c.textAlign='center'; c.textBaseline='bottom';
  const halfPx=Math.max(5,(w/2)*view.zoom+4);
  for(let m=0; m*1000<=g.total+1e-6; m+=stepM){
    const p=alignPointAt(g,m*1000), s=w2s(p.x,p.y), nx=-Math.sin(p.angle), ny=Math.cos(p.angle);
    c.beginPath(); c.moveTo(s.x-nx*halfPx,s.y-ny*halfPx); c.lineTo(s.x+nx*halfPx,s.y+ny*halfPx); c.stroke();
    c.save(); c.translate(s.x+nx*(halfPx+3),s.y+ny*(halfPx+3)); c.rotate(uprightAngle(p.angle));
    c.fillText(alignStationLabel(m*1000),0,0); c.restore();
  }
  c.restore();

  // radiusmerke ved kvar bue (når vald eller under teikning)
  if(sel||isPreview){
    c.save(); c.font="600 10px 'JetBrains Mono',monospace"; c.textAlign='center'; c.textBaseline='middle';
    for(const it of g.items){ if(it.kind!=='arc') continue;
      const th=it.a0+it.sweep/2, mp=w2s(it.c.x+Math.cos(th)*it.r,it.c.y+Math.sin(th)*it.r);
      const label='R'+(it.r/1000).toFixed(it.r<10000?1:0)+(it.clamped?'!':'');
      const tw=c.measureText(label).width;
      c.fillStyle='rgba(251,250,247,.92)'; c.fillRect(mp.x-tw/2-3,mp.y-18,tw+6,13);
      c.fillStyle=it.clamped?'#b91c1c':'#c2410c'; c.fillText(label,mp.x,mp.y-11.5);
    }
    c.restore();
  }
}

// ─── VERKTØY ───
function alignPointerDown(wp){
  let np=wp;
  if(shiftLock&&alignPts.length) np=computeLineEnd(alignPts[alignPts.length-1]);
  alignPts.push({x:np.x,y:np.y});
  cursorWorld=np;
  setModeHint('Klikk neste vendepunkt (PI) · <kbd>Shift</kbd> låser vinkel · dobbeltklikk / <kbd>Enter</kbd> / <kbd>Esc</kbd> avsluttar');
  renderOverlay();
}
function alignCommit(){
  const pts=[];
  for(const p of alignPts){ const q=pts[pts.length-1]; if(!q||Math.hypot(p.x-q.x,p.y-q.y)>1) pts.push({x:p.x,y:p.y}); }
  alignPts=[];
  hideReadout(); setModeHint('');
  if(pts.length<2) return false;
  const radii=Array(Math.max(0,pts.length-2)).fill(alignRadius);
  elements.push({id:uid(),type:'alignment',pts,radii,roadWidth:alignRoadWidth,color:curColor,weightMm:0.35});
  selection.clear();
  render();
  return true;
}
function alignLiveSegments(){
  if(tool!=='align'||!alignPts.length) return [];
  const segs=[];
  for(let i=0;i<alignPts.length-1;i++) segs.push({a:alignPts[i],b:alignPts[i+1],el:null,segIdx:i,live:true});
  if(rawCursorWorld) segs.push({a:alignPts[alignPts.length-1],b:rawCursorWorld,el:null,segIdx:alignPts.length-1,live:true,active:true});
  return segs;
}
function alignOverlay(){
  if(tool!=='align'||!alignPts.length) return;
  const pts=alignPts.map(p=>({x:p.x,y:p.y}));
  let tail=cursorWorld;
  if(tail&&shiftLock) tail=computeLineEnd(alignPts[alignPts.length-1]);
  if(tail) pts.push({x:tail.x,y:tail.y});
  if(pts.length>=2){
    const prev={id:'_align_preview',type:'alignment',pts,radii:Array(Math.max(0,pts.length-2)).fill(alignRadius),roadWidth:alignRoadWidth,color:curColor,weightMm:0.35};
    octx.save(); octx.strokeStyle=curColor; octx.fillStyle=curColor; octx.lineWidth=penPx(prev); octx.lineCap='round'; octx.lineJoin='round';
    drawAlignment(octx,prev,true);
    octx.restore();
  }
  for(const p of alignPts){ const s=w2s(p.x,p.y); octx.fillStyle=curColor; octx.beginPath(); octx.arc(s.x,s.y,3.5,0,7); octx.fill(); }
}
function alignOnToolChange(t){
  const ctl=document.getElementById('alignControls');
  if(ctl) ctl.style.display=t==='align'?'flex':'none';
  if(t==='align') setModeHint('Klikk startpunkt for senterlinja · radius og breidd i topplinja');
}

// ─── PROPS-PANEL (radiusar/breidd for vald senterlinje) ───
function alignUpdateProps(){
  const body=document.getElementById('propsBody'); if(!body) return;
  let box=document.getElementById('alignProps');
  const sel=selection.size===1?elements.find(e=>selection.has(e.id)):null;
  if(!sel||sel.type!=='alignment'){ if(box) box.remove(); return; }
  if(!box){ box=document.createElement('div'); box.id='alignProps'; body.insertBefore(box,document.getElementById('selActions')); }
  const g=alignGeo(sel), n=sel.pts.length;
  let h='<div class="prop-row"><span class="prop-label">Vegbreidd (m)</span><input class="ap-in" data-k="width" type="number" step="0.5" min="0" value="'+((sel.roadWidth||0)/1000)+'"></div>';
  h+='<div class="prop-row"><span class="prop-label">Lengd</span><span class="ap-val">'+(g.total/1000).toFixed(1)+' m</span></div>';
  for(let i=1;i<n-1;i++){
    const arc=g.items.find(it=>it.kind==='arc'&&it.pi===i);
    const warn=arc&&arc.clamped?'<span class="ap-warn" title="Radien er klemt ned fordi tilstøytande bogar ikkje får plass">klemt til R'+(arc.r/1000).toFixed(1)+'</span>':'';
    h+='<div class="prop-row"><span class="prop-label">Radius PI '+i+' (m)</span><input class="ap-in" data-k="r" data-pi="'+i+'" type="number" step="5" min="0" value="'+(((sel.radii||[])[i-1]||0)/1000)+'">'+warn+'</div>';
  }
  box.innerHTML=h;
  box.querySelectorAll('.ap-in').forEach(inp=>{
    inp.addEventListener('change',()=>{
      const v=parseFloat(inp.value); if(isNaN(v)||v<0) return;
      if(inp.dataset.k==='width') sel.roadWidth=v*1000;
      else{ sel.radii=sel.radii||[]; sel.radii[parseInt(inp.dataset.pi)-1]=v*1000; }
      render(); alignUpdateProps();
    });
    inp.addEventListener('keydown',e=>e.stopPropagation());
  });
}

(function(){
  const st=document.createElement('style');
  st.textContent='.ap-in{width:84px;height:28px;border:1px solid var(--border);border-radius:6px;padding:0 8px;font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--ink);background:var(--surface);outline:none}.ap-in:focus{border-color:var(--accent)}.ap-val{font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--text2)}.ap-warn{font-size:11px;color:#b91c1c;margin-left:6px}#alignProps .prop-row{align-items:center;justify-content:space-between}';
  document.head.appendChild(st);

  // verktøyknapp i verktøyraila (etter vegg)
  const wallBtn=document.querySelector('.tool[data-tool="wall"]');
  if(wallBtn){
    const b=document.createElement('button');
    b.className='tool'; b.dataset.tool='align'; b.onclick=()=>setTool('align');
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 20c7 0 3-8 9-8s2-8 9-8"/><circle cx="3" cy="20" r="1.4" fill="currentColor" stroke="none"/><circle cx="21" cy="4" r="1.4" fill="currentColor" stroke="none"/></svg><span class="kbd">C</span><span class="tip">Senterlinje / veg <kbd>C</kbd></span>';
    wallBtn.after(b);
  }
  // radius/breidd-felt i topplinja (synlege berre med verktøyet)
  const wc=document.getElementById('wallControls');
  if(wc){
    const d=document.createElement('div');
    d.className='scale-control'; d.id='alignControls'; d.style.display='none';
    const inStyle='width:46px;border:none;background:transparent;font-family:\'JetBrains Mono\',monospace;font-size:13px;color:var(--ink);outline:none';
    d.innerHTML='<label>Radius</label><input id="alignRadiusIn" type="number" min="1" step="5" value="50" oninput="alignRadius=(parseFloat(this.value)||50)*1000" style="'+inStyle+'"><span style="color:var(--text3);font-size:11px">m</span><div class="topbar-divider"></div><label>Breidd</label><input id="alignWidthIn" type="number" min="0" step="0.5" value="6" oninput="alignRoadWidth=Math.max(0,parseFloat(this.value)||0)*1000" style="'+inStyle+'"><span style="color:var(--text3);font-size:11px">m</span>';
    wc.after(d);
  }
})();
