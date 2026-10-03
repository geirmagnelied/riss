// ═══════════════════ HANDTAK (grips) ═══════════════════
// Når nøyaktig eitt element er valt i peikarverktøyet vert redigerbare punkt vist:
//  • kvart hjørne/vendepunkt (kvadrat) — dra for å flytte berre det punktet (snappar)
//  • kvar bue sitt styrepunkt (sirkel) på polylinje/vegg — dra for å endre buen
//  • midt på kvar sirkelboge i ei senterlinje (rombe) — dra for å endre radius
// Gjeld: linje, polylinje, polygon/fyll, vegg, senterlinje. Utan dette kunne ein berre
// flytte HEILE element — nødvendig for parametriske ting som vegar.

let gripDrag=null; // {id, kind, idx, orig}
const GRIP_TYPES_PTS=['polyline','poly','fill','wall','alignment'];

function gripCancel(){ gripDrag=null; snapExcludeId=null; }

function gripTarget(){
  if(selection.size!==1||tool!=='select') return null;
  const el=elements.find(e=>selection.has(e.id));
  if(!el||!layerVisible(el)||layerLocked(el)) return null;
  if(el.type==='line'||GRIP_TYPES_PTS.includes(el.type)) return el;
  return null;
}
function gripList(el){
  const out=[];
  if(el.type==='line'){
    out.push({kind:'pt',idx:0,x:el.x1,y:el.y1},{kind:'pt',idx:1,x:el.x2,y:el.y2});
    return out;
  }
  el.pts.forEach((p,i)=>out.push({kind:'pt',idx:i,x:p.x,y:p.y}));
  if((el.type==='polyline'||el.type==='wall')&&el.segs){
    el.segs.forEach((s,i)=>{ if(s&&s.type==='arc'&&s.bulge) out.push({kind:'bulge',idx:i,x:s.bulge.x,y:s.bulge.y}); });
  }
  if(el.type==='alignment'){
    const g=alignGeo(el);
    for(const it of g.items) if(it.kind==='arc'){
      const th=it.a0+it.sweep/2;
      out.push({kind:'radius',idx:it.pi,x:it.c.x+Math.cos(th)*it.r,y:it.c.y+Math.sin(th)*it.r});
    }
  }
  return out;
}
// kalla frå handleSelectDown — returnerer true viss eit handtak vart teke
function gripStart(sp,wp){
  const el=gripTarget(); if(!el) return false;
  for(const gp of gripList(el)){
    const s=w2s(gp.x,gp.y);
    if(Math.hypot(s.x-sp.x,s.y-sp.y)<=9){
      gripDrag={id:el.id,kind:gp.kind,idx:gp.idx,orig:JSON.parse(JSON.stringify(el))};
      snapExcludeId=el.id;
      hidePetPalette();
      return true;
    }
  }
  return false;
}
function gripMove(wp){
  if(!gripDrag) return;
  const el=elements.find(e=>e.id===gripDrag.id); if(!el){ gripCancel(); return; }
  if(gripDrag.kind==='pt'){
    if(el.type==='line'){ if(gripDrag.idx===0){el.x1=wp.x;el.y1=wp.y;} else {el.x2=wp.x;el.y2=wp.y;} }
    else el.pts[gripDrag.idx]={x:wp.x,y:wp.y};
  } else if(gripDrag.kind==='bulge'){
    el.segs[gripDrag.idx]={type:'arc',bulge:{x:wp.x,y:wp.y}};
  } else if(gripDrag.kind==='radius'){
    // radius frå avstanden PI→peikar: E = R·(sec(Δ/2) − 1)  ⇒  R = E·cos(Δ/2) / (1 − cos(Δ/2))
    const q=rawCursorWorld||wp, b=el.pts[gripDrag.idx];
    const arc=alignGeo(el).items.find(it=>it.kind==='arc'&&it.pi===gripDrag.idx);
    const delta=arc?arc.delta:null;
    if(delta){
      const E=Math.hypot(q.x-b.x,q.y-b.y), ch=Math.cos(delta/2);
      let R=E*ch/Math.max(1e-6,1-ch);
      R=Math.max(1000,Math.min(5e6,R));
      el.radii[gripDrag.idx-1]=R;
      if(typeof alignUpdateProps==='function') alignUpdateProps();
    }
  }
  render();
}
function gripEnd(){ gripCancel(); render(); }

// Teiknar handtaka i overlegget (kalla frå renderOverlay)
function gripsOverlay(){
  const el=gripTarget(); if(!el) return;
  octx.save();
  for(const gp of gripList(el)){
    const s=w2s(gp.x,gp.y);
    octx.lineWidth=1.6; octx.fillStyle='#fff';
    if(gp.kind==='pt'){ octx.strokeStyle='#2563eb'; octx.beginPath(); octx.rect(s.x-4.5,s.y-4.5,9,9); octx.fill(); octx.stroke(); }
    else if(gp.kind==='bulge'){ octx.strokeStyle='#0891b2'; octx.beginPath(); octx.arc(s.x,s.y,5,0,7); octx.fill(); octx.stroke(); }
    else{ octx.strokeStyle='#c2410c'; octx.beginPath(); octx.moveTo(s.x,s.y-6); octx.lineTo(s.x+6,s.y); octx.lineTo(s.x,s.y+6); octx.lineTo(s.x-6,s.y); octx.closePath(); octx.fill(); octx.stroke(); }
  }
  octx.restore();
}
