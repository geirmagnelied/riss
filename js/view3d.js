// ═══════════════════ 3D-VISING (same vindauge som 2D) ═══════════════════
// 2D↔3D-bryter i topplinja. 3D-visinga byggjer scena frå DEI SAME elementa som
// 2D-teikninga (ingen eigen 3D-modell å halde i synk):
//   • element.z       = underkant/kote (mm)        — t.d. kotelinjer får z frå KOTEHØYDE
//   • element.height  = ekstrudert høgd (mm)       — veggar (standard 2,5 m), polygon/fyll/rektangel
//   • senterlinje     = vegband på kote z (lengdeprofil kjem seinare)
// Overgangen er "saumlaus": 3D-kameraet startar rett ovanfrå med NØYAKTIG same utsnitt
// som 2D-visinga, og tiltar så (animert) til perspektiv; tilbake til 2D animerast kameraet
// ned til planvising og 2D-utsnittet tek over det 3D-utsnittet du hamna på.
//
// Three.js (r128 UMD — siste versjon med OrbitControls som vanleg script, kompatibelt med
// at heile appen brukar klassiske script og inline onclick) vert lasta lat første gong.
// Einingar: scena er i METER, sentrert på teikninga (flyttal-presisjon over store utstrekningar).
// Koordinatar: x→X, plan-y (Y-ned i 2D)→Z, kote→Y(opp). Sett ovanfrå = 2D-bildet (nord opp).

let wallHeight=2500; // mm — standard høgd på nye veggar (kan endrast i topplinja med veggverktøyet)
const V3={active:false,ready:false,busy:false,host:null,renderer:null,scene:null,camera:null,controls:null,
  group:null,grid:null,center:{x:0,y:0},exag:1,anim:null,raf:0,fov:45,rebuildTimer:null};
const V3M=0.001; // mm → m
function v3Active(){ return V3.active; }

async function v3LoadLibs(){
  if(typeof THREE==='undefined') await loadScriptOnce('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js');
  if(typeof THREE==='undefined') throw new Error('Three.js vart ikkje lasta');
  if(!THREE.OrbitControls) await loadScriptOnce('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
  if(!THREE.OrbitControls) throw new Error('OrbitControls vart ikkje lasta');
}

function v3Init(){
  if(V3.ready) return;
  const parent=document.getElementById('canvas-host');
  const wrap=document.createElement('div');
  wrap.id='view3dHost';
  parent.appendChild(wrap);
  V3.host=wrap;
  // Hindre at 2D-handterarane på #canvas-host (verktøy, panorering, zoom) får 3D-hendingar
  for(const ev of ['pointerdown','pointermove','pointerup','dblclick','contextmenu','wheel','click'])
    wrap.addEventListener(ev,e=>e.stopPropagation(),{passive:ev!=='wheel'});

  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(window.devicePixelRatio||1);
  renderer.setClearColor(0xfbfaf7);
  wrap.appendChild(renderer.domElement);
  renderer.domElement.style.display='block';
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(V3.fov,1,0.1,100000);
  camera.up.set(0,1,0);
  const controls=new THREE.OrbitControls(camera,renderer.domElement); // laga MED up=(0,1,0) — OrbitControls hugsar up frå konstruksjonstidspunktet
  controls.enableDamping=true; controls.dampingFactor=0.12;
  controls.screenSpacePanning=true;
  controls.maxPolarAngle=Math.PI*0.495;
  scene.add(new THREE.HemisphereLight(0xffffff,0x8a867c,0.95));
  const sun=new THREE.DirectionalLight(0xffffff,0.8); sun.position.set(-0.5,1,0.6); scene.add(sun);
  V3.group=new THREE.Group(); scene.add(V3.group);
  Object.assign(V3,{renderer,scene,camera,controls});

  // knapperad i 3D-visinga
  const bar=document.createElement('div');
  bar.id='v3Bar';
  bar.innerHTML=
    '<button data-a="plan" title="Sjå rett ovanfrå">Plan</button>'+
    '<button data-a="persp" title="Perspektiv">Perspektiv</button>'+
    '<button data-a="fit" title="Tilpass til alt innhald">Tilpass</button>'+
    '<span class="v3sep"></span><label>Høgde ×</label>'+
    '<select id="v3Exag"><option value="1">1</option><option value="2">2</option><option value="5">5</option><option value="10">10</option></select>';
  wrap.appendChild(bar);
  bar.addEventListener('click',e=>{ const a=e.target.closest('button'); if(a) v3Preset(a.dataset.a); });
  bar.querySelector('#v3Exag').addEventListener('change',e=>{ V3.exag=parseFloat(e.target.value)||1; V3.group.scale.y=V3.exag; });
  const hint=document.createElement('div'); hint.id='v3Hint';
  hint.textContent='Dra = roter · scroll = zoom · høgreklikk-dra = panorer';
  wrap.appendChild(hint);

  window.addEventListener('resize',v3Resize);
  V3.ready=true;
}

function v3Resize(){
  if(!V3.ready||!V3.active) return;
  const w=V3.host.clientWidth, h=V3.host.clientHeight;
  if(!w||!h) return;
  V3.renderer.setSize(w,h); V3.camera.aspect=w/h; V3.camera.updateProjectionMatrix();
}

// ─── SCENEBYGGING ───
const v3P=(x,y,z)=>new THREE.Vector3((x-V3.center.x)*V3M,(z||0)*V3M,(y-V3.center.y)*V3M);
function v3Disposable(o){ if(o.geometry) o.geometry.dispose(); if(o.material){ (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose()); } }
function v3Clear(){
  const g=V3.group;
  while(g.children.length){ const o=g.children.pop(); o.traverse(v3Disposable); }
  if(V3.grid){ V3.scene.remove(V3.grid); v3Disposable(V3.grid); V3.grid=null; }
}
function v3Line(pts,z,color,closed){
  const v=pts.map(p=>v3P(p.x,p.y,z)); if(closed&&v.length) v.push(v[0].clone());
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(v),new THREE.LineBasicMaterial({color}));
}
function v3Shape(pts){ return new THREE.Shape(pts.map(p=>new THREE.Vector2((p.x-V3.center.x)*V3M,-(p.y-V3.center.y)*V3M))); }
// (sx,sy,ekstrudering) → rotateX(−90°) → (sx, ekstrudering, −sy): plan-polygon i XZ, høgd oppover
function v3Prism(pts,z,h,color){
  const geo=new THREE.ExtrudeGeometry(v3Shape(pts),{depth:Math.max(1,h)*V3M,bevelEnabled:false});
  geo.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color,roughness:.85,metalness:0,side:THREE.DoubleSide}));
  m.position.y=(z||0)*V3M;
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(geo,25),new THREE.LineBasicMaterial({color:0x2a2622}));
  edges.position.y=m.position.y;
  const grp=new THREE.Group(); grp.add(m); grp.add(edges); return grp;
}
function v3Flat(pts,z,color,opacity){
  const geo=new THREE.ShapeGeometry(v3Shape(pts)); geo.rotateX(-Math.PI/2);
  const m=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false}));
  m.position.y=(z||0)*V3M+0.002; return m;
}
function v3WallOutline(el){
  const cs=wallCenterOffset(el), half=el.thickness/2;
  const A=offsetWallChain(el.pts,el.segs,cs+half,16), B=offsetWallChain(el.pts,el.segs,cs-half,16);
  return A.concat(B.slice().reverse());
}
function v3Ribbon(el){
  const g=alignGeo(el), w=el.roadWidth||0;
  const L=alignOffsetFlat(g,w/2), R=alignOffsetFlat(g,-w/2), n=Math.min(L.length,R.length);
  const pos=[], idx=[];
  for(let i=0;i<n;i++){ const a=v3P(L[i].x,L[i].y,el.z), b=v3P(R[i].x,R[i].y,el.z); pos.push(a.x,a.y+0.003,a.z,b.x,b.y+0.003,b.z); }
  for(let i=0;i<n-1;i++){ const k=i*2; idx.push(k,k+1,k+2,k+1,k+3,k+2); }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:el.fillColor||0x8f8b82,roughness:.95,side:THREE.DoubleSide}));
}
function v3ElementObjects(el){
  const out=[], z=el.z||0, hasH=el.height>0;
  const col=el.color||'#14181d';
  switch(el.type){
    case 'line': case 'arrow': out.push(v3Line([{x:el.x1,y:el.y1},{x:el.x2,y:el.y2}],z,col)); break;
    case 'polyline': out.push(v3Line(wallPolylinePoints(el.pts,el.segs,12),z,col)); break;
    case 'pen': out.push(v3Line(el.pts,z,col)); break;
    case 'rect': {
      const pts=[{x:el.x1,y:el.y1},{x:el.x2,y:el.y1},{x:el.x2,y:el.y2},{x:el.x1,y:el.y2}];
      if(hasH) out.push(v3Prism(pts,z,el.height,col)); else out.push(v3Line(pts,z,col,true));
      break; }
    case 'ellipse': {
      const cx=(el.x1+el.x2)/2, cy=(el.y1+el.y2)/2, rx=Math.abs(el.x2-el.x1)/2, ry=Math.abs(el.y2-el.y1)/2, pts=[];
      for(let i=0;i<48;i++){ const t=i/48*Math.PI*2; pts.push({x:cx+Math.cos(t)*rx,y:cy+Math.sin(t)*ry}); }
      if(hasH) out.push(v3Prism(pts,z,el.height,col)); else out.push(v3Line(pts,z,col,true));
      break; }
    case 'poly': case 'fill': {
      const closed=el.closed||el.type==='fill';
      if(closed&&el.pts.length>=3){
        if(hasH) out.push(v3Prism(el.pts,z,el.height,el.bgColor||col));
        else{ out.push(v3Flat(el.pts,z,el.bgColor||col,el.type==='fill'?Math.max(.25,(el.opacity??70)/100*.7):.12)); out.push(v3Line(el.pts,z,col,true)); }
      } else out.push(v3Line(el.pts,z,col));
      break; }
    case 'wall': {
      const outline=v3WallOutline(el), h=el.height>0?el.height:2500;
      out.push(v3Prism(outline,z,h,col)); break; }
    case 'alignment': {
      if((el.roadWidth||0)>0) out.push(v3Ribbon(el));
      out.push(v3Line(alignGeo(el).flat,(el.z||0)+3,col)); break; }
  }
  return out;
}
function v3Build(){
  v3Clear();
  let n=0;
  for(const el of elements){
    if(!layerVisible(el)) continue;
    try{ for(const o of v3ElementObjects(el)){ V3.group.add(o); n++; } }
    catch(err){ console.warn('3D: hoppar over element',el.type,err.message); }
  }
  // rutenett (grunnplan) i same storleik som innhaldet
  const box=new THREE.Box3().setFromObject(V3.group);
  const size=box.isEmpty()?100:Math.max(box.max.x-box.min.x,box.max.z-box.min.z,20);
  const step=Math.pow(10,Math.floor(Math.log10(size/10)));
  const divs=Math.min(200,Math.ceil(size*1.6/step));
  V3.grid=new THREE.GridHelper(divs*step,divs,0xc4c0b8,0xe2dfd8);
  V3.grid.position.y=-0.01; V3.scene.add(V3.grid);
  V3.group.scale.y=V3.exag;
  return n;
}

// ─── KAMERA ───
const v3Ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
// φ = høgdevinkel over horisonten (90° = rett ovanfrå), θ = retning (0 = frå sør, nord opp)
function v3SetCam(target,dist,phi,theta){
  const c=Math.cos(phi), s=Math.sin(phi);
  V3.camera.position.set(target.x+dist*Math.sin(theta)*c,target.y+dist*s,target.z+dist*Math.cos(theta)*c);
  V3.camera.up.set(-Math.sin(theta)*s,c,-Math.cos(theta)*s);
  V3.camera.lookAt(target);
}
function v3Pose(){
  const t=V3.controls.target, cp=V3.camera.position;
  const d=cp.clone().sub(t), dist=d.length()||1;
  return {target:t.clone(),dist,phi:Math.asin(Math.max(-1,Math.min(1,d.y/dist))),theta:Math.atan2(d.x,d.z)};
}
function v3FrameFrom2D(){
  const c=s2w(CW/2,CH/2), visM=(CH/view.zoom)*V3M;
  return {target:new THREE.Vector3((c.x-V3.center.x)*V3M,0,(c.y-V3.center.y)*V3M),dist:(visM/2)/Math.tan(V3.fov*Math.PI/360)};
}
function v3AnimateTo(to,ms,done){
  const from=v3Pose();
  let dth=to.theta-from.theta; while(dth>Math.PI)dth-=2*Math.PI; while(dth<-Math.PI)dth+=2*Math.PI;
  V3.controls.enabled=false;
  V3.anim={t0:performance.now(),ms,from,to,dth,done};
}
function v3Step(now){
  const a=V3.anim; if(!a) return;
  const t=Math.min(1,(now-a.t0)/a.ms), e=v3Ease(t), f=a.from, o=a.to;
  const target=f.target.clone().lerp(o.target,e);
  v3SetCam(target,f.dist+(o.dist-f.dist)*e,f.phi+(o.phi-f.phi)*e,f.theta+a.dth*e);
  V3.controls.target.copy(target); // hald kontrollen i takt (utgangspunkt for ein ny animasjon/utgang midt i overgangen)
  if(t>=1){
    V3.anim=null;
    V3.camera.up.set(0,1,0);                    // same orientering som OrbitControls forventar
    V3.controls.target.copy(target);
    V3.controls.enabled=true; V3.controls.update();
    if(a.done) a.done();
  }
}
function v3Loop(now){
  V3.raf=requestAnimationFrame(v3Loop);
  if(!V3.active) return;
  if(V3.anim) v3Step(now); else V3.controls.update();
  V3.renderer.render(V3.scene,V3.camera);
}
function v3Preset(a){
  if(!V3.ready||!V3.active||V3.anim) return;
  const p=v3Pose();
  if(a==='plan') v3AnimateTo({target:p.target,dist:p.dist,phi:Math.PI/2-1e-3,theta:0},550);
  else if(a==='persp') v3AnimateTo({target:p.target,dist:p.dist,phi:0.62,theta:0.6},650);
  else if(a==='fit'){
    const box=new THREE.Box3().setFromObject(V3.group);
    if(box.isEmpty()) return;
    const sph=box.getBoundingSphere(new THREE.Sphere());
    const dist=Math.max(5,sph.radius/Math.sin(V3.fov*Math.PI/360)*1.05);
    v3AnimateTo({target:sph.center.clone(),dist,phi:Math.max(.35,Math.min(1.3,p.phi)),theta:p.theta},600);
  }
}

// ─── INN/UT ───
async function v3Enter(){
  if(V3.active||V3.busy) return;
  V3.busy=true;
  try{
    showToast('Lastar 3D…');
    await v3LoadLibs();
    v3Init();
    // sentrer scena på innhaldet (ein gong per 3D-økt)
    let a=1e15,b=1e15,c=-1e15,d=-1e15;
    for(const el of elements){ if(!layerVisible(el)||el.type==='text'||el.type==='label'||el.type==='dim') continue; const bb=bbox(el); if(bb){a=Math.min(a,bb.minx);b=Math.min(b,bb.miny);c=Math.max(c,bb.maxx);d=Math.max(d,bb.maxy);} }
    V3.center=a>c?{x:0,y:0}:{x:(a+c)/2,y:(b+d)/2};
    V3.host.style.display='block';
    V3.active=true;
    v3Resize();
    v3Build();
    const fr=v3FrameFrom2D();
    // klippeplan etter utsnitt
    V3.camera.near=Math.max(0.05,fr.dist*0.002); V3.camera.far=Math.max(2000,fr.dist*400); V3.camera.updateProjectionMatrix();
    V3.controls.enabled=false;
    v3SetCam(fr.target,fr.dist,Math.PI/2-1e-3,0);      // nøyaktig same utsnitt som 2D
    V3.renderer.render(V3.scene,V3.camera);            // fyrste bilete før 2D vert skjult (ingen blink)
    document.getElementById('canvas').style.visibility='hidden';
    document.getElementById('overlay').style.visibility='hidden';
    document.getElementById('empty-hint').style.visibility='hidden';
    document.getElementById('toolrail').classList.add('v3-disabled');
    v3SyncToggle();
    cancelAnimationFrame(V3.raf); V3.raf=requestAnimationFrame(v3Loop);
    V3.controls.target.copy(fr.target);
    // animert tilt til perspektiv
    v3AnimateTo({target:fr.target,dist:fr.dist*1.15,phi:0.66,theta:0.35},800);
  }catch(err){
    console.error(err); showToast('Klarte ikkje å opne 3D: '+err.message);
    if(V3.host) V3.host.style.display='none'; V3.active=false; v3SyncToggle();
  }finally{ V3.busy=false; }
}
function v3ExitFinish(){
  // 2D-utsnittet tek over der 3D-kameraet enda (same framing)
  const p=v3Pose();
  const visMm=2*p.dist*Math.tan(V3.fov*Math.PI/360)/V3M;
  view.zoom=Math.max(.02,Math.min(8,CH/visMm));
  const wx=V3.center.x+p.target.x/V3M, wy=V3.center.y+p.target.z/V3M;
  view.panX=CW/2-wx*view.zoom; view.panY=CH/2-wy*view.zoom;
  V3.active=false;
  cancelAnimationFrame(V3.raf);
  V3.host.style.display='none';
  document.getElementById('canvas').style.visibility='';
  document.getElementById('overlay').style.visibility='';
  document.getElementById('empty-hint').style.visibility='';
  document.getElementById('toolrail').classList.remove('v3-disabled');
  updateZoom(); v3SyncToggle(); render();
}
function v3Exit(immediate){
  if(!V3.active||V3.busy) return;
  if(immediate||!V3.ready){ V3.anim=null; v3ExitFinish(); return; }
  const p=v3Pose();
  V3.anim=null;
  v3AnimateTo({target:p.target,dist:p.dist,phi:Math.PI/2-1e-3,theta:0},600,v3ExitFinish);
}
function v3Set(mode){ if(mode==='3d') v3Enter(); else v3Exit(false); }
function v3SyncToggle(){
  document.querySelectorAll('#viewToggle button').forEach(b=>b.classList.toggle('on',(b.dataset.v==='3d')===V3.active));
}
function v3OnModule(mod){
  const t=document.getElementById('viewToggle');
  if(t) t.style.display=mod==='skisse'?'flex':'none';
  if(mod!=='skisse'&&V3.active) v3Exit(true);
}
// kalla frå render(): hald 3D-scena oppdatert når elementa vert endra medan 3D er open
function v3OnRender(){
  if(!V3.active||V3.anim||V3.busy) return;
  clearTimeout(V3.rebuildTimer);
  V3.rebuildTimer=setTimeout(()=>{ if(V3.active) v3Build(); },150);
}

// ─── HØGDE-/KOTEFELT i props-panelet (verdiar i meter, lagra i mm) ───
function heightUpdateProps(){
  const body=document.getElementById('propsBody'); if(!body) return;
  let box=document.getElementById('heightProps');
  const sel=elements.filter(e=>selection.has(e.id)&&!['text','label','dim'].includes(e.type));
  if(!sel.length){ if(box) box.remove(); return; }
  const canExtrude=sel.some(e=>['wall','poly','fill','rect','ellipse'].includes(e.type));
  if(!box){ box=document.createElement('div'); box.id='heightProps'; body.insertBefore(box,document.getElementById('selActions')); }
  const f=sel[0], zM=((f.z||0)/1000), hM=f.height>0?f.height/1000:(f.type==='wall'?2.5:0);
  box.innerHTML=
    '<div class="prop-row"><span class="prop-label">Underkant / kote z (m)</span><input class="ap-in" data-k="z" type="number" step="0.1" value="'+zM+'"></div>'+
    (canExtrude?'<div class="prop-row"><span class="prop-label">Høgd (m) — vist i 3D</span><input class="ap-in" data-k="h" type="number" step="0.1" min="0" value="'+hM+'"></div>':'');
  box.querySelectorAll('.ap-in').forEach(inp=>{
    inp.addEventListener('change',()=>{
      const v=parseFloat(inp.value); if(isNaN(v)) return;
      for(const el of sel){
        if(inp.dataset.k==='z') el.z=v*1000;
        else if(['wall','poly','fill','rect','ellipse'].includes(el.type)) el.height=Math.max(0,v*1000);
      }
      render();
    });
    inp.addEventListener('keydown',e=>e.stopPropagation());
  });
}

// Dokumentet har overflow:hidden, men kan likevel scrollast programmatisk (fokus/scrollIntoView
// på ein knapp når topplinja er breiare enn vindauget). Då ville heile appen glide sidevegs.
// Nullstill berre scroll på sjølve dokumentet — ikkje indre scrollbare område (laglista m.fl.).
window.addEventListener('scroll',e=>{
  if(e.target===document||e.target===document.documentElement||e.target===document.body){
    const se=document.scrollingElement||document.documentElement;
    if(se.scrollLeft||se.scrollTop){ se.scrollLeft=0; se.scrollTop=0; }
    if(document.body.scrollLeft||document.body.scrollTop){ document.body.scrollLeft=0; document.body.scrollTop=0; }
  }
},true);

(function(){
  const st=document.createElement('style');
  st.textContent=
    '#view3dHost{position:absolute;inset:0;z-index:10;display:none;background:#fbfaf7}'+
    '#v3Bar{position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--shadow);padding:5px 8px;z-index:3;font-family:Inter,sans-serif;font-size:12px;color:var(--text2)}'+
    '#v3Bar button{height:28px;padding:0 11px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text2);font-size:12px;font-weight:500;cursor:pointer}'+
    '#v3Bar button:hover{background:var(--border);color:var(--ink)}'+
    '#v3Bar .v3sep{width:1px;height:20px;background:var(--border);margin:0 6px}'+
    '#v3Bar select{height:28px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--ink);font-family:"JetBrains Mono",monospace;font-size:12px}'+
    '#v3Hint{position:absolute;left:14px;bottom:14px;background:rgba(20,24,29,.78);color:#fff;font-family:Inter,sans-serif;font-size:12px;padding:7px 12px;border-radius:7px;pointer-events:none}'+
    '#toolrail.v3-disabled .tool,#toolrail.v3-disabled .rail-w,#toolrail.v3-disabled .rail-swatch-stack{opacity:.3;pointer-events:none}'+
    '#viewToggle{display:flex;flex-shrink:0;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;height:34px}'+
    '#undoRedoWrap,#layerBtn{flex-shrink:0}'+
    '#viewToggle button{border:none;background:var(--surface);color:var(--text2);font-family:"JetBrains Mono",monospace;font-size:12px;font-weight:600;padding:0 13px;cursor:pointer}'+
    '#viewToggle button.on{background:var(--ink);color:#fff}'+
    '#viewToggle button:not(.on):hover{background:var(--surface2);color:var(--ink)}';
  document.head.appendChild(st);

  const anchor=document.getElementById('layerBtn')||document.getElementById('undoRedoWrap')||document.querySelector('#topbar .scale-control');
  if(anchor){
    const t=document.createElement('div');
    t.id='viewToggle';
    t.innerHTML='<button data-v="2d" class="on" title="Plan (2D)">2D</button><button data-v="3d" title="3D-vising (orbit)">3D</button>';
    t.addEventListener('click',e=>{ const b=e.target.closest('button'); if(b) v3Set(b.dataset.v); });
    anchor.after(t);
  }
  // høgdefelt for veggverktøyet
  const wc=document.getElementById('wallControls');
  if(wc){
    const sep=document.createElement('div'); sep.className='topbar-divider';
    const lab=document.createElement('label'); lab.textContent='Høgd';
    const inp=document.createElement('input'); inp.type='number'; inp.min='0.5'; inp.step='0.1'; inp.value='2.5';
    inp.style.cssText="width:42px;border:none;background:transparent;font-family:'JetBrains Mono',monospace;font-size:13px;color:var(--ink);outline:none";
    inp.oninput=()=>{ wallHeight=Math.max(500,(parseFloat(inp.value)||2.5)*1000); };
    const u=document.createElement('span'); u.style.cssText='color:var(--text3);font-size:11px'; u.textContent='m';
    wc.append(sep,lab,inp,u);
  }
})();
