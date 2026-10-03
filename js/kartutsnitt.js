// ═══════════════════ KART: PROSJEKTADRESSE + UTSNITTSMENY ═══════════════════
// 1) Zoom til prosjektet sin eigedomsadresse når kartet vert opna i eit prosjekt
//    (adressa ligg i `projects.details` frå notatappen, geokoda via Geonorge).
// 2) Når brukar har valt eit utsnitt dukkar eit flytande vindauge opp oppe til
//    venstre med ein nedtrekksmeny:
//      • «Bruk som tegningsunderlag» — kartbilete (WMS, EPSG:258xx) + vektor
//        (OSM: bygningar og vegar) i 1:1 verkelege mm, plassert mot `geoRef`
//        (same koordinatregistrering som SOSI/DXF-import) og skissa sin målestokk.
//      • «Eksporter PDF» — målestokkriktig situasjonskart. I skrivebordsappen
//        vert fila lagra i «<oppdragsmappe>\2 Informasjonsflyt\Inn».
// Delte globalar frå hovudskriptet vert brukte ved køyretid: mapModule,
// currentProject, geoRef, elements, underlay, scaleRatio, view, CW/CH m.fl.

// ─── UTM (EUREF89/GRS80, Krüger-rekker) ───
const UTM_A=6378137, UTM_F=1/298.257222101, UTM_K0=0.9996;
const UTM_N=UTM_F/(2-UTM_F);
const UTM_AA=UTM_A/(1+UTM_N)*(1+UTM_N*UTM_N/4+Math.pow(UTM_N,4)/64);
const UTM_ALFA=[UTM_N/2-2*UTM_N*UTM_N/3+5*Math.pow(UTM_N,3)/16, 13*UTM_N*UTM_N/48-3*Math.pow(UTM_N,3)/5, 61*Math.pow(UTM_N,3)/240];
const UTM_BETA=[UTM_N/2-2*UTM_N*UTM_N/3+37*Math.pow(UTM_N,3)/96, UTM_N*UTM_N/48+Math.pow(UTM_N,3)/15, 17*Math.pow(UTM_N,3)/480];
const UTM_DELTA=[2*UTM_N-2*UTM_N*UTM_N/3-2*Math.pow(UTM_N,3), 7*UTM_N*UTM_N/3-8*Math.pow(UTM_N,3)/5, 56*Math.pow(UTM_N,3)/15];
const KART_SONE_KOORDSYS={32:22,33:23,35:25}; // UTM-sone → SOSI KOORDSYS-kode

function utmFraLatLon(lat,lon,sone){
  const rad=Math.PI/180, phi=lat*rad, lam=(lon-(sone*6-183))*rad;
  const e=2*Math.sqrt(UTM_N)/(1+UTM_N);
  const t=Math.sinh(Math.atanh(Math.sin(phi))-e*Math.atanh(e*Math.sin(phi)));
  const xi1=Math.atan2(t,Math.cos(lam)), eta1=Math.atanh(Math.sin(lam)/Math.sqrt(1+t*t));
  let xi=xi1, eta=eta1;
  for(let j=1;j<=3;j++){ xi+=UTM_ALFA[j-1]*Math.sin(2*j*xi1)*Math.cosh(2*j*eta1); eta+=UTM_ALFA[j-1]*Math.cos(2*j*xi1)*Math.sinh(2*j*eta1); }
  return {e:500000+UTM_K0*UTM_AA*eta, n:UTM_K0*UTM_AA*xi};
}
function latLonFraUtm(E,N,sone){
  const xi=N/(UTM_K0*UTM_AA), eta=(E-500000)/(UTM_K0*UTM_AA);
  let xi1=xi, eta1=eta;
  for(let j=1;j<=3;j++){ xi1-=UTM_BETA[j-1]*Math.sin(2*j*xi)*Math.cosh(2*j*eta); eta1-=UTM_BETA[j-1]*Math.cos(2*j*xi)*Math.sinh(2*j*eta); }
  const chi=Math.asin(Math.sin(xi1)/Math.cosh(eta1));
  let phi=chi; for(let j=1;j<=3;j++) phi+=UTM_DELTA[j-1]*Math.sin(2*j*chi);
  const lam=Math.atan2(Math.sinh(eta1),Math.cos(xi1));
  return {lat:phi*180/Math.PI, lon:(sone*6-183)+lam*180/Math.PI};
}
// Sone: følg geoRef viss teikninga alt er registrert, elles etter lengdegrad (Noreg: 32/33/35).
function kartVelSone(lon){
  if(typeof geoRef!=='undefined'&&geoRef&&geoRef.koordsys!=null){
    const s=Object.keys(KART_SONE_KOORDSYS).find(z=>KART_SONE_KOORDSYS[z]===geoRef.koordsys);
    if(s) return +s;
  }
  return lon<12?32:(lon<21?33:35);
}

// ─── Zoom til prosjektadresse ───
async function kartGeokodProsjekt(d){
  const forsok=[];
  if(d.propertyAddress){
    const p=new URLSearchParams({sok:d.propertyAddress,treffPerSide:'1'});
    if(d.propertyPostnr) p.set('postnummer',d.propertyPostnr); else if(d.propertyKommunenr) p.set('kommunenummer',d.propertyKommunenr);
    forsok.push(p);
    if(d.propertyKommunenr) forsok.push(new URLSearchParams({sok:d.propertyAddress,kommunenummer:d.propertyKommunenr,treffPerSide:'1'}));
    forsok.push(new URLSearchParams({sok:[d.propertyAddress,d.propertyPoststad||d.propertyKommune].filter(Boolean).join(' '),treffPerSide:'1'}));
  }
  if(d.propertyKommunenr&&d.propertyGnr&&d.propertyBnr){
    forsok.push(new URLSearchParams({kommunenummer:d.propertyKommunenr,gardsnummer:d.propertyGnr,bruksnummer:d.propertyBnr,treffPerSide:'1'}));
  }
  for(const p of forsok){
    try{
      const r=await fetch('https://ws.geonorge.no/adresser/v1/sok?'+p.toString());
      if(!r.ok) continue;
      const j=await r.json(), a=j.adresser&&j.adresser[0];
      if(a&&a.representasjonspunkt) return {lat:a.representasjonspunkt.lat, lon:a.representasjonspunkt.lon, tekst:[a.adressetekst,[a.postnummer,a.poststed].filter(Boolean).join(' ')].filter(Boolean).join(', ')};
    }catch(e){ /* prøv neste */ }
  }
  return null;
}
// Sentrerer kartet på prosjektet. true = kartet står no på prosjektadressa.
async function mapGotoProject(){
  if(!mapModule||typeof currentProject==='undefined'||!currentProject) return false;
  if(mapModule.projectId===currentProject.id) return !!mapModule.projectPos;
  const id=currentProject.id;
  mapModule.projectId=id; mapModule.projectPos=null;
  if(currentProject.detailsLoaded) await currentProject.detailsLoaded;
  if(!currentProject||currentProject.id!==id||!mapModule) return false;
  const pos=await kartGeokodProsjekt(currentProject.details||{});
  if(!currentProject||currentProject.id!==id||!mapModule) return false;
  if(!pos) return false;
  mapModule.projectPos=pos;
  mapModule.map.setView([pos.lat,pos.lon],18);
  if(mapModule.projectMarker) mapModule.map.removeLayer(mapModule.projectMarker);
  mapModule.projectMarker=L.circleMarker([pos.lat,pos.lon],{radius:7,color:'#14181d',weight:2,fillColor:'#c2410c',fillOpacity:.9})
    .bindTooltip(pos.tekst,{direction:'top',offset:[0,-6]}).addTo(mapModule.map);
  return true;
}

// ─── Kjelder (Geonorge WMS har CORS-opne svar, verifisert 4. okt. 2026) ───
const KART_WMS={
  topo:    {svc:'topo',        layer:'topo',          namn:'Kartverket Topografisk'},
  graatone:{svc:'topograatone',layer:'topograatone',  namn:'Kartverket Topografisk gråtone'},
  bygg:    {svc:'inspire_bu',  layer:'BU.Building',   namn:'Bygningar'},
  eigedom: {svc:'matrikkel',   layer:'eiendomsgrense',namn:'Eigedomsgrenser'},
  terreng: {svc:'terrengmodell',layer:'relieff',      namn:'Terrengskygge'},
};
function kartAktiveKjelder(){
  const lag=[KART_WMS[mapModule.activeBase]||KART_WMS.topo];
  for(const k of Object.keys(mapModule.overlays)) if(mapModule.map.hasLayer(mapModule.overlays[k])) lag.push(KART_WMS[k]);
  return lag;
}
async function kartHentWms(kjelde,sone,bb,pxW,pxH,dpi){
  const url='https://wms.geonorge.no/skwms1/wms.'+kjelde.svc+'?service=WMS&version=1.3.0&request=GetMap&layers='+encodeURIComponent(kjelde.layer)
    +'&styles=&crs=EPSG:258'+sone+'&bbox='+[bb.minE,bb.minN,bb.maxE,bb.maxN].map(v=>v.toFixed(2)).join(',')
    +'&width='+pxW+'&height='+pxH+'&format=image/png&transparent='+(kjelde===KART_WMS.topo||kjelde===KART_WMS.graatone?'false':'true')
    +(dpi?'&format_options=dpi:'+dpi+'&map_resolution='+dpi:'');
  const r=await fetch(url);
  const b=await r.blob();
  if(!r.ok||!b.type.startsWith('image')) throw new Error(kjelde.namn+': kartserveren svarte ikkje med eit bilete');
  return createImageBitmap(b);
}
async function kartLagRaster(bb,sone,pxW,pxH,dpi){
  const c=document.createElement('canvas'); c.width=pxW; c.height=pxH;
  const x=c.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,pxW,pxH);
  const kjelder=kartAktiveKjelder();
  const bilete=await Promise.all(kjelder.map((k,i)=>kartHentWms(k,sone,bb,pxW,pxH,dpi).catch(err=>{ if(i===0) throw err; console.warn(err); return null; })));
  for(const b of bilete) if(b) x.drawImage(b,0,0,pxW,pxH);
  return c;
}

// ─── Geometri: utsnitt → UTM-rektangel, papir og målestokk ───
const KART_MALESTOKKAR=[100,200,500,1000,2000,5000,10000];
const KART_PAPIR={A4:[297,210],A3:[420,297]};
const KART_RAND=10, KART_STRIPE=16; // mm

function kartUtsnittRam(bounds){
  const c=bounds.getCenter(), sone=kartVelSone(c.lng);
  const p=[bounds.getSouthWest(),bounds.getSouthEast(),bounds.getNorthWest(),bounds.getNorthEast()].map(q=>utmFraLatLon(q.lat,q.lng,sone));
  const ram={sone, minE:Math.min(...p.map(q=>q.e)), maxE:Math.max(...p.map(q=>q.e)), minN:Math.min(...p.map(q=>q.n)), maxN:Math.max(...p.map(q=>q.n))};
  ram.cE=(ram.minE+ram.maxE)/2; ram.cN=(ram.minN+ram.maxN)/2; ram.w=ram.maxE-ram.minE; ram.h=ram.maxN-ram.minN;
  return ram;
}
// Vel papirretning og målestokk. mal = 'auto' eller eit tal (t.d. 500).
function kartPapirOppsett(ram,papir,mal){
  const [a,b]=KART_PAPIR[papir]||KART_PAPIR.A3;
  const alt=[['land',a,b],['port',b,a]].map(([o,pw,ph])=>{
    const mapW=pw-2*KART_RAND, mapH=ph-2*KART_RAND-KART_STRIPE;
    return {o,pw,ph,mapW,mapH,treng:Math.max(ram.w*1000/mapW, ram.h*1000/mapH)};
  }).sort((p,q)=>p.treng-q.treng)[0];
  let skala=mal==='auto'?(KART_MALESTOKKAR.find(m=>m>=alt.treng)||Math.ceil(alt.treng/1000)*1000):mal;
  alt.skala=skala; alt.passar=skala>=alt.treng-1e-6;
  return alt;
}
function kartDato(){ return new Date().toLocaleDateString('sv-SE'); }

// ─── Vektor frå OSM (bygningar + vegar) ───
async function kartHentOsm(ram){
  const hj=[latLonFraUtm(ram.minE,ram.minN,ram.sone),latLonFraUtm(ram.maxE,ram.minN,ram.sone),latLonFraUtm(ram.minE,ram.maxN,ram.sone),latLonFraUtm(ram.maxE,ram.maxN,ram.sone)];
  const s=Math.min(...hj.map(p=>p.lat)), n=Math.max(...hj.map(p=>p.lat)), w=Math.min(...hj.map(p=>p.lon)), e=Math.max(...hj.map(p=>p.lon));
  const bbox=[s,w,n,e].map(v=>v.toFixed(6)).join(',');
  // Bygningar og vegar vert henta i kvar sin spørjing, slik at éi som feilar (offentlege Overpass-tenarar
  // gir innimellom 504 på tyngre spørjingar) ikkje tek med seg den andre. Fleire tenarar spørst samtidig, første gyldige svar vinn.
  const spor=async q=>{
    const ctl=new AbortController(), tm=setTimeout(()=>ctl.abort(),20000);
    const eit=async ep=>{
      const r=await fetch(ep,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:ctl.signal});
      const t=await r.text();
      if(!r.ok||t.trim()[0]!=='{') throw new Error('Overpass svarte med feil');
      return JSON.parse(t).elements||[];
    };
    try{ return await Promise.any(['https://overpass.openstreetmap.fr/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'].map(eit)); }
    finally{ clearTimeout(tm); ctl.abort(); }
  };
  const [bygg,veg]=await Promise.allSettled([
    spor('[out:json][timeout:25];way["building"]('+bbox+');out geom;'),
    spor('[out:json][timeout:25];way["highway"]('+bbox+');out geom;'),
  ]);
  const manglar=[]; if(bygg.status!=='fulfilled') manglar.push('bygningar'); if(veg.status!=='fulfilled') manglar.push('vegar');
  if(manglar.length===2) throw new Error('Overpass utilgjengeleg');
  const els=kartOsmTilElement([...(bygg.value||[]),...(veg.value||[])],ram);
  els.manglar=manglar;
  return els;
}
const KART_VEG_TJUKKLEIK={motorway:.5,trunk:.5,primary:.5,secondary:.5,tertiary:.35,residential:.35,unclassified:.35,living_street:.35,service:.25};
function kartOsmTilElement(osm,ram){
  const out=[], LAG_BYGG='Kart – bygningar', LAG_VEG='Kart – veg';
  for(const w of osm){
    if(w.type!=='way'||!w.geometry||w.geometry.length<2) continue;
    const pts=w.geometry.map(g=>{ const u=utmFraLatLon(g.lat,g.lon,ram.sone); return {x:u.e,y:u.n}; });
    if(w.tags&&w.tags.building){
      const f=pts[0], l=pts[pts.length-1];
      if(Math.hypot(f.x-l.x,f.y-l.y)>0.01||pts.length<4) continue; // berre lukka omriss
      pts.pop();
      out.push({type:'fill',pts,closed:true,color:'#d4720c',bgColor:'#d4720c',hatchColor:'#d4720c',hatch:'solid',opacity:70,weightMm:.35,noArea:true,layer:LAG_BYGG});
    } else if(w.tags&&w.tags.highway){
      if(w.tags.area==='yes'||w.tags.highway==='proposed'||w.tags.highway==='construction') continue;
      out.push({type:'polyline',pts,color:'#a09b90',weightMm:KART_VEG_TJUKKLEIK[w.tags.highway]||.18,layer:LAG_VEG});
    }
  }
  return out;
}

// ─── Flytande vindauge ───
let kartUtsnitt=null; // {bounds}
function kartInitPanel(){
  if(document.getElementById('extentPanel')) return;
  const st=document.createElement('style');
  st.textContent=
   '#extentPanel{position:absolute;left:212px;top:12px;z-index:1200;width:268px;background:var(--surface);border:1px solid var(--border2);border-radius:var(--radius-lg);box-shadow:var(--shadow-lg);display:none;font-family:Inter,sans-serif}'+
   '#extentPanel .ep-head{display:flex;align-items:center;justify-content:space-between;padding:9px 10px 9px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:13px;color:var(--ink)}'+
   '#extentPanel .ep-x{border:none;background:none;font-size:18px;line-height:1;color:var(--text3);cursor:pointer;padding:2px 6px;border-radius:5px}'+
   '#extentPanel .ep-x:hover{background:var(--surface2);color:var(--ink)}'+
   '#extentPanel .ep-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:10px}'+
   '#extentPanel .ep-info{font-family:"JetBrains Mono",monospace;font-size:11px;color:var(--text2);line-height:1.5}'+
   '#extentPanel label{font-family:"JetBrains Mono",monospace;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);display:block;margin-bottom:3px}'+
   '#extentPanel select{width:100%;height:32px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--ink);font-family:Inter,sans-serif;font-size:13px;padding:0 8px}'+
   '#extentPanel .ep-run{height:36px;border:none;border-radius:var(--radius);background:var(--ink);color:#fff;font-family:Inter,sans-serif;font-size:13px;font-weight:600;cursor:pointer}'+
   '#extentPanel .ep-run:disabled{opacity:.55;cursor:default}'+
   '#extentPanel .ep-status{font-size:12px;color:var(--text2);min-height:16px}'+
   '#extentPanel .ep-status.err{color:#b91c1c}';
  document.head.appendChild(st);
  const p=document.createElement('div'); p.id='extentPanel';
  p.innerHTML=
   '<div class="ep-head"><span>Valt utsnitt</span><button class="ep-x" title="Lukk" onclick="kartUtsnittLukk()">×</button></div>'+
   '<div class="ep-body">'+
     '<div class="ep-info" id="epInfo"></div>'+
     '<div><label for="epAction">Handling</label><select id="epAction" onchange="kartUtsnittOppdaterVal()">'+
       '<option value="underlag">Bruk som tegningsunderlag</option><option value="pdf">Eksporter PDF</option></select></div>'+
     '<div><label for="epScale">Målestokk</label><select id="epScale" onchange="kartUtsnittOppdaterVal()"><option value="auto">Automatisk (tilpass)</option>'+
       KART_MALESTOKKAR.map(m=>'<option value="'+m+'">1:'+m+'</option>').join('')+'</select></div>'+
     '<div id="epPaperRow"><label for="epPaper">Papirstorleik</label><select id="epPaper" onchange="kartUtsnittOppdaterVal()"><option value="A3">A3</option><option value="A4">A4</option></select></div>'+
     '<button class="ep-run" id="epRun" onclick="kartUtsnittUtfor()">Utfør</button>'+
     '<div class="ep-status" id="epStatus"></div>'+
   '</div>';
  document.getElementById('mapArea').appendChild(p);
  L.DomEvent.disableClickPropagation(p);
}
function kartUtsnittVis(bounds){
  const r=kartUtsnittRam(bounds);
  if(r.w<5||r.h<5){ showToast('Utsnittet er for lite — klikk og dra for å lage ei rute'); return; }
  kartInitPanel();
  kartUtsnitt={bounds};
  document.getElementById('extentPanel').style.display='block';
  document.getElementById('epStatus').textContent=''; document.getElementById('epStatus').className='ep-status';
  kartUtsnittOppdaterVal();
}
function kartUtsnittLukk(){ const p=document.getElementById('extentPanel'); if(p) p.style.display='none'; }
function kartUtsnittVal(){
  const sv=document.getElementById('epScale').value;
  return {handling:document.getElementById('epAction').value, mal:sv==='auto'?'auto':+sv, papir:document.getElementById('epPaper').value};
}
function kartUtsnittOppdaterVal(){
  if(!kartUtsnitt) return;
  const v=kartUtsnittVal(), ram=kartUtsnittRam(kartUtsnitt.bounds);
  document.getElementById('epPaperRow').style.display=v.handling==='pdf'?'':'none';
  const o=kartPapirOppsett(ram,v.papir,v.mal);
  const kj=kartAktiveKjelder().map(k=>k.namn).join(' + ');
  document.getElementById('epInfo').innerHTML=Math.round(ram.w)+' × '+Math.round(ram.h)+' m (UTM '+ram.sone+')<br>1:'+o.skala+(v.handling==='pdf'?' · '+v.papir+' '+(o.o==='land'?'liggjande':'ståande'):'')+(o.passar?'':' <b style="color:#b91c1c">— utsnittet passar ikkje</b>')+'<br>'+kj;
}
function kartStatus(tekst,feil){ const s=document.getElementById('epStatus'); s.textContent=tekst; s.className='ep-status'+(feil?' err':''); }

async function kartUtsnittUtfor(){
  if(!kartUtsnitt) return;
  const v=kartUtsnittVal(), btn=document.getElementById('epRun');
  btn.disabled=true;
  try{
    if(v.handling==='pdf') await kartEksporterPdf(v);
    else await kartBrukSomUnderlag(v);
  }catch(err){
    console.error(err); kartStatus('Feil: '+(err&&err.message||err),true);
  }
  btn.disabled=false;
}

// ─── Bruk som tegningsunderlag ───
async function kartBrukSomUnderlag(v){
  const ram=kartUtsnittRam(kartUtsnitt.bounds), o=kartPapirOppsett(ram,'A3',v.mal), code=KART_SONE_KOORDSYS[ram.sone];
  kartStatus('Hentar kartbilete og vektordata …');
  const lang=Math.max(ram.w,ram.h), pxM=Math.max(.5,Math.min(10,4000/lang));
  const pxW=Math.max(64,Math.round(ram.w*pxM)), pxH=Math.max(64,Math.round(ram.h*pxM));
  let vektorFeil=null;
  const vektorP=kartHentOsm(ram).catch(err=>{ vektorFeil=err; console.warn('OSM:',err); return []; }); // parallelt med kartbiletet
  const raster=await kartLagRaster(ram,ram.sone,pxW,pxH,null);
  const vektor=await vektorP;

  if(!geoRef) geoRef={koordsys:code, north0:ram.cN, east0:ram.cE, anchor:{x:0,y:0}};
  else if(geoRef.koordsys==null) geoRef.koordsys=code;
  const a=geoRef.anchor;
  const img=new Image();
  await new Promise((res,rej)=>{ img.onload=res; img.onerror=()=>rej(new Error('Kunne ikkje lage underlagsbilete')); img.src=raster.toDataURL('image/png'); });
  setModule('skisse');
  underlay={img, x:a.x+(ram.minE-geoRef.east0)*1000, y:a.y-(ram.maxN-geoRef.north0)*1000, w:ram.w*1000, h:ram.h*1000, opacity:.8};
  scaleRatio=o.skala; const sel=document.getElementById('scaleSelect'); if(sel){ if(![...sel.options].some(op=>+op.value===o.skala)){ const op=document.createElement('option'); op.value=o.skala; op.textContent='1:'+o.skala; sel.appendChild(op); } sel.value=String(o.skala); }
  for(const el of vektor) ensureLayer(el.layer);
  if(vektor.length) placeImportedGeometry(vektor,1,code,'OpenStreetMap');
  selection.clear(); updateProps();
  view.zoom=Math.min(CW/underlay.w,CH/underlay.h)*.9;
  view.panX=CW/2-(underlay.x+underlay.w/2)*view.zoom; view.panY=CH/2-(underlay.y+underlay.h/2)*view.zoom;
  updateZoom(); updateGeoRefUI(); render();
  kartUtsnittLukk();
  showToast('Underlag lagt inn i 1:'+o.skala+' ('+Math.round(ram.w)+' × '+Math.round(ram.h)+' m)'+(vektor.length?' · '+vektor.length+' vektorelement':'')+(vektorFeil?' — vektordata (OSM) var utilgjengeleg, berre kartbilete':(vektor.manglar&&vektor.manglar.length?' — '+vektor.manglar.join(' og ')+' (OSM) var utilgjengeleg':'')));
}

// ─── Eksporter PDF ───
function kartPdfBytes(jpeg,pxW,pxH,ptW,ptH,tittel){
  const enc=new TextEncoder(), del=[], off=[]; let pos=0;
  const push=b=>{ if(typeof b==='string') b=enc.encode(b); del.push(b); pos+=b.length; };
  const obj=(n,f)=>{ off[n]=pos; push(n+' 0 obj\n'); f(); push('\nendobj\n'); };
  push('%PDF-1.4\n');
  obj(1,()=>push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2,()=>push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3,()=>push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+ptW.toFixed(2)+' '+ptH.toFixed(2)+'] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>'));
  const inn='q '+ptW.toFixed(2)+' 0 0 '+ptH.toFixed(2)+' 0 0 cm /Im0 Do Q';
  obj(4,()=>push('<< /Length '+inn.length+' >>\nstream\n'+inn+'\nendstream'));
  obj(5,()=>{ push('<< /Type /XObject /Subtype /Image /Width '+pxW+' /Height '+pxH+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'); push(jpeg); push('\nendstream'); });
  obj(6,()=>push('<< /Title ('+tittel.replace(/[^\x20-\x7e]/g,'').replace(/[()\\]/g,'')+') /Producer (Riss) >>'));
  const xref=pos; push('xref\n0 7\n0000000000 65535 f \n');
  for(let n=1;n<=6;n++) push(String(off[n]).padStart(10,'0')+' 00000 n \n');
  push('trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
  const ut=new Uint8Array(pos); let p=0; for(const d of del){ ut.set(d,p); p+=d.length; }
  return ut;
}
function kartTegnSkalalinje(x,c,pxmm,skala,x0,y0){
  const nice=[5,10,20,50,100,200,500,1000,2000,5000].filter(L=>L*1000/skala<=60).pop()||5;
  const len=nice*1000/skala*pxmm, h=1.6*pxmm;
  x.save(); x.strokeStyle='#000'; x.lineWidth=.25*pxmm; x.fillStyle='#000'; x.font=(2.6*pxmm)+'px Inter,sans-serif'; x.textAlign='center'; x.textBaseline='bottom';
  for(let i=0;i<4;i++){ x.fillStyle=i%2?'#fff':'#000'; x.fillRect(x0+len*i/4,y0,len/4,h); x.strokeRect(x0+len*i/4,y0,len/4,h); }
  x.fillStyle='#000';
  [[0,'0'],[.5,String(nice/2)],[1,nice+' m']].forEach(([f,t])=>x.fillText(t,x0+len*f,y0-.6*pxmm));
  x.restore();
}
function kartTegnNordpil(x,pxmm,cx,cy){
  const r=6*pxmm;
  x.save(); x.fillStyle='rgba(255,255,255,.9)'; x.strokeStyle='#000'; x.lineWidth=.25*pxmm;
  x.beginPath(); x.arc(cx,cy,r,0,7); x.fill(); x.stroke();
  x.fillStyle='#000'; x.beginPath(); x.moveTo(cx,cy-r*.78); x.lineTo(cx+r*.34,cy+r*.5); x.lineTo(cx,cy+r*.22); x.lineTo(cx-r*.34,cy+r*.5); x.closePath(); x.fill();
  x.font='600 '+(3.2*pxmm)+'px Inter,sans-serif'; x.textAlign='center'; x.textBaseline='middle'; x.fillStyle='#fff'; x.fillText('N',cx,cy+r*.2);
  x.restore();
}
async function kartEksporterPdf(v){
  const ram=kartUtsnittRam(kartUtsnitt.bounds), o=kartPapirOppsett(ram,v.papir,v.mal);
  if(!o.passar) throw new Error('Utsnittet ('+Math.round(ram.w)+' × '+Math.round(ram.h)+' m) passar ikkje på '+v.papir+' i 1:'+o.skala+' — vel mindre målestokk eller større papir.');
  const DPI=200, pxmm=DPI/25.4;
  const kjelder=kartAktiveKjelder(), kartnamn=kjelder[0].namn;
  // kartflata er papirflata × målestokk, sentrert på valt utsnitt
  const mW=o.mapW*o.skala/1000, mH=o.mapH*o.skala/1000;
  const bb={minE:ram.cE-mW/2,maxE:ram.cE+mW/2,minN:ram.cN-mH/2,maxN:ram.cN+mH/2};
  const mapPxW=Math.round(o.mapW*pxmm), mapPxH=Math.round(o.mapH*pxmm);
  kartStatus('Hentar kartbilete …');
  const raster=await kartLagRaster(bb,ram.sone,mapPxW,mapPxH,DPI);
  kartStatus('Lagar PDF …');
  const W=Math.round(o.pw*pxmm), H=Math.round(o.ph*pxmm);
  const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
  const x=cv.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,W,H);
  const mx=KART_RAND*pxmm, my=KART_RAND*pxmm;
  x.drawImage(raster,mx,my,mapPxW,mapPxH);
  x.strokeStyle='#000'; x.lineWidth=.35*pxmm; x.strokeRect(mx,my,mapPxW,mapPxH);
  kartTegnNordpil(x,pxmm,mx+mapPxW-10*pxmm,my+10*pxmm);
  // infostripe under kartflata
  const sy=my+mapPxH, dato=kartDato(), prosjekt=(typeof currentProject!=='undefined'&&currentProject)?currentProject.name:'';
  x.fillStyle='#000'; x.textBaseline='top'; x.textAlign='left';
  x.font='600 '+(4.4*pxmm)+'px "Space Grotesk",Inter,sans-serif'; x.fillText('Situasjonskart',mx,sy+2*pxmm);
  x.font=(3*pxmm)+'px Inter,sans-serif';
  x.fillText((prosjekt?prosjekt+' · ':'')+'Målestokk 1:'+o.skala+' ('+v.papir+') · '+dato,mx,sy+7.6*pxmm);
  x.fillStyle='#444'; x.font=(2.4*pxmm)+'px Inter,sans-serif';
  x.fillText('Kartgrunnlag: '+kjelder.map(k=>k.namn).join(' + ')+' © Kartverket / Geonorge (NLOD) · EUREF89 UTM sone '+ram.sone,mx,sy+11.6*pxmm);
  kartTegnSkalalinje(x,cv,pxmm,o.skala,mx+mapPxW-62*pxmm,sy+9*pxmm);
  const blob=await new Promise(res=>cv.toBlob(res,'image/jpeg',.93));
  if(!blob) throw new Error('Klarte ikkje å lage biletet til PDF-en');
  const jpeg=new Uint8Array(await blob.arrayBuffer());
  const pdf=kartPdfBytes(jpeg,W,H,o.pw*72/25.4,o.ph*72/25.4,'Situasjonskart '+dato+' 1:'+o.skala);
  const filnamn='Situasjonskart '+dato+' 1-'+o.skala+' '+kartnamn+'.pdf';
  await kartLagrePdf(filnamn,pdf);
  kartUtsnittLukk();
}
// Skrivebordsappen (notatappen sin Electron-bru) → «<oppdragsmappe>\2 Informasjonsflyt\Inn».
// Elles (nettlesar, ikkje låst prosjektmappe) vert fila lasta ned på vanleg måte.
async function kartLagrePdf(filnamn,bytes){
  const d=(typeof currentProject!=='undefined'&&currentProject&&currentProject.details)||{};
  const api=window.resultatdokumentAPI;
  if(api&&api.rissLagreInn&&d.oppdragsStiLast&&d.oppdragsSti){
    const r=await api.rissLagreInn(d.oppdragsSti,filnamn,bytes);
    if(r&&r.ok){ showToast('Lagra: '+r.sti); return; }
    throw new Error('Kunne ikkje lagre i prosjektmappa: '+((r&&r.melding)||'ukjend feil'));
  }
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const a=document.createElement('a'); a.href=url; a.download=filnamn; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  const why=api&&api.rissLagreInn?(d.oppdragsSti?' (prosjektmappa er ikkje låst i notatappen)':' (prosjektet har ingen oppdragsmappe)'):' (skrivebordsappen ikkje oppdaga)';
  showToast('PDF lasta ned: '+filnamn+why);
}
