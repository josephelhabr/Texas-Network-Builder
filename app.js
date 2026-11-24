/* Texas Rail Network Sketch: shared map engine.
   index.html runs it in "explore" mode (concept network), build.html in "build" mode (start from scratch). */
(() => {
'use strict';
const D = window.TXR;
const MODE = document.body.dataset.mode === 'build' ? 'build' : 'explore';
const BUILD = MODE === 'build';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = n => Math.round(n).toLocaleString('en-US');
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

/* ---------- Projection ---------- */
const W = 1700, H = 1600;
const LON0 = -107.3, LON1 = -93.3, LAT0 = 25.7, LAT1 = 36.65;
const KX = Math.cos(31 * Math.PI / 180);
const SC = Math.min((W - 120) / ((LON1 - LON0) * KX), (H - 120) / (LAT1 - LAT0));
const OX = (W - (LON1 - LON0) * KX * SC) / 2, OY = (H - (LAT1 - LAT0) * SC) / 2;
const proj = (lat, lon) => [OX + (lon - LON0) * KX * SC, OY + (LAT1 - lat) * SC];
const unproj = (x, y) => [LAT1 - (y - OY) / SC, LON0 + (x - OX) / (KX * SC)];

function regionOf(lat, lon){
  let best = 'central', bd = Infinity;
  for(const [r, la, lo] of D.REGION_SEEDS){ const d = (la-lat)**2 + ((lo-lon)*KX)**2; if(d < bd){ bd = d; best = r; } }
  return best;
}
function hav(a, b){
  const R = 3958.8, r = Math.PI/180, dLat = (b.lat-a.lat)*r, dLon = (b.lon-a.lon)*r;
  const x = Math.sin(dLat/2)**2 + Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
const CIRCUITY = 1.15, ROAD = 1.2, DRIVE_MPH = 58;
const segMiles = (a, b) => hav(N[a], N[b]) * CIRCUITY;
function fmtTime(h){ let hh = Math.floor(h), m = Math.round((h-hh)*60); if(m === 60){ hh++; m = 0; } return hh ? `${hh} h ${m} min` : `${m} min`; }

/* ---------- Nodes ---------- */
const NODES = [], N = {};
function mkNode(o){ o.g = proj(o.lat, o.lon); o.region = regionOf(o.lat, o.lon); NODES.push(o); N[o.id] = o; return o; }
D.CITIES.forEach(r => mkNode({id:r[0], name:r[1], pop:r[2], lat:r[3], lon:r[4], kind: r[2] >= 25000 ? 'city' : 'town'}));
D.SPECIAL.forEach(s => mkNode(Object.assign({pop:0}, s)));
const BIG = NODES.filter(n => n.kind === 'city').sort((a,b) => b.pop - a.pop);
BIG.forEach((n,i) => n.rank = i + 1);

/* ---------- Diagram layout: metro magnification, then declutter ---------- */
// Each metro gets a radial magnifier; applying them one after another keeps the map free of fold-overs
const FISH = [];
D.FISHEYE.forEach(f => { const c = fishApply(proj(f.lat, f.lon)); FISH.push(Object.assign({c}, f)); });
function fishApply(p){
  let x = p[0], y = p[1];
  for(const f of FISH){
    const vx = x-f.c[0], vy = y-f.c[1], r = Math.hypot(vx, vy);
    if(r >= f.r1 || r < 1e-6) continue;
    const r2 = r <= f.r0 ? r*f.m : f.r0*f.m + (r - f.r0)/(f.r1 - f.r0) * (f.r1 - f.r0*f.m);
    x = f.c[0] + vx/r*r2; y = f.c[1] + vy/r*r2;
  }
  return [x, y];
}
const LAYOUT = {s:1, ox:0, oy:0};
function diagramOf(g){ const q = fishApply(g); return [q[0]*LAYOUT.s + LAYOUT.ox, q[1]*LAYOUT.s + LAYOUT.oy]; }
function geoFromDiagram(s){
  let g = [(s[0]-LAYOUT.ox)/LAYOUT.s, (s[1]-LAYOUT.oy)/LAYOUT.s];
  for(let i=0;i<60;i++){ const t = diagramOf(g); g = [g[0] + (s[0]-t[0])/LAYOUT.s*0.6, g[1] + (s[1]-t[1])/LAYOUT.s*0.6]; }
  return g;
}
(function layoutDiagram(){
  const base = NODES.map(n => fishApply(n.g));
  const pts = base.map(p => p.slice()), MIN = 19;
  for(let it=0; it<240; it++){
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
      let dx = pts[j][0]-pts[i][0], dy = pts[j][1]-pts[i][1], d = Math.hypot(dx, dy);
      if(d < MIN){ if(d < 0.01){ dx = 0.7; dy = 0.7; d = 1; } const k = (MIN-d)/2/d; pts[i][0]-=dx*k; pts[i][1]-=dy*k; pts[j][0]+=dx*k; pts[j][1]+=dy*k; }
    }
    for(let i=0;i<pts.length;i++){ pts[i][0] += (base[i][0]-pts[i][0])*0.04; pts[i][1] += (base[i][1]-pts[i][1])*0.04; }
  }
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const p of pts){ x0=Math.min(x0,p[0]); y0=Math.min(y0,p[1]); x1=Math.max(x1,p[0]); y1=Math.max(y1,p[1]); }
  const s = Math.min((W-140)/(x1-x0), (H-140)/(y1-y0));
  LAYOUT.s = s; LAYOUT.ox = (W - (x1-x0)*s)/2 - x0*s; LAYOUT.oy = (H - (y1-y0)*s)/2 - y0*s;
  NODES.forEach((n,i) => n.s = [pts[i][0]*s + LAYOUT.ox, pts[i][1]*s + LAYOUT.oy]);
})();

/* ---------- State ---------- */
const KEY = 'txrail.v2.' + MODE;
const DEFAULTS = {
  t:0, minPop: BUILD ? 25000 : 50000, labelMode:'auto',
  types:{hsr:true,higher:true,conv:true,regional:true,bus:true},
  baseOn: !BUILD, baseTypes:{amtrak:true,commuter:true,lightrail:true},
  off:[], removed:[], pinned:[], custom:[], regions:[], lines:[],
  sizeByPop:false, showUnserved:true, showSug:false,
  sugTypes:{hsr:true,higher:true,conv:true,regional:true,bus:true}, newType:'regional'
};
const state = JSON.parse(JSON.stringify(DEFAULTS));
try{
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if(saved && typeof saved === 'object') for(const k of Object.keys(DEFAULTS)) if(k in saved && typeof saved[k] === typeof DEFAULTS[k]) state[k] = saved[k];
}catch(e){}
state.t = state.t >= 0.5 ? 1 : 0;
const off = new Set(state.off), removed = new Set(state.removed), pinned = new Set(state.pinned), regions = new Set(state.regions);
let sel = null, edit = null, placing = null, SUG = null;
state.custom = (Array.isArray(state.custom) ? state.custom : []).filter(c => c && c.id && isFinite(c.lat) && isFinite(c.lon));
state.custom.forEach(addCustomNode);
state.lines = (Array.isArray(state.lines) ? state.lines : []).filter(validLine).map(cleanLine);
let saveT = 0;
function save(){
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    state.off = [...off]; state.removed = [...removed]; state.pinned = [...pinned]; state.regions = [...regions];
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
  }, 250);
}
function addCustomNode(c){
  if(N[c.id]) return;
  const n = mkNode({id:c.id, name:String(c.name||'New place').slice(0,60), pop:Math.max(0, +c.pop||0), lat:+c.lat, lon:+c.lon, kind:'custom'});
  n.s = diagramOf(n.g);
}
function validLine(l){ return l && typeof l.name === 'string' && D.TYPES[l.type] && Array.isArray(l.stops) && l.stops.every(s => typeof s === 'string'); }
function cleanLine(l, i){
  return {id: (l.id && String(l.id).startsWith('u')) ? String(l.id) : uid(), name:String(l.name).slice(0,60), type:l.type,
    color: /^#[0-9a-f]{6}$/i.test(l.color) ? l.color : D.LINE_COLORS[(i||0) % D.LINE_COLORS.length],
    stops: l.stops.filter(s => N[s]), note: typeof l.note === 'string' ? l.note.slice(0,400) : '', from: l.from || ''};
}
let uidN = 0;
function uid(){ return 'u' + Date.now().toString(36) + (uidN++).toString(36); }

/* ---------- Lines ---------- */
const typeInfo = l => l.base ? D.BASE_TYPES[l.type] : D.TYPES[l.type];
const rankOf = l => l.base ? 5 : D.TYPES[l.type].rank;
const ownLines = () => BUILD ? state.lines : D.LINES;
const allLines = () => ownLines().concat(D.BASELINE);
const lineById = id => allLines().find(l => l.id === id) || D.LOCAL.find(l => l.id === id);
const effStops = l => l.stops.filter(s => N[s] && !removed.has(s));
function lineVisible(l){
  if(l.base) return state.baseOn && state.baseTypes[l.type] && !off.has(l.id);
  return state.types[l.type] && !off.has(l.id);
}
function lineMiles(l){ const s = effStops(l); let m = 0; for(let i=0;i<s.length-1;i++) m += segMiles(s[i], s[i+1]); return m; }
const keyOf = (a,b) => a < b ? a + '|' + b : b + '|' + a;

/* ---------- Geometry ---------- */
function pos(n){ const t = state.t; return [n.s[0] + (n.g[0]-n.s[0])*t, n.s[1] + (n.g[1]-n.s[1])*t]; }
function distSeg(p,a,b){
  const dx=b[0]-a[0], dy=b[1]-a[1], L=dx*dx+dy*dy;
  let t = L ? ((p[0]-a[0])*dx + (p[1]-a[1])*dy)/L : 0; t = clamp(t, 0, 1);
  return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
}
const ROUTE = {};
function schemRoute(key){
  if(ROUTE[key]) return ROUTE[key];
  const [ia, ib] = key.split('|'), a = N[ia].s, b = N[ib].s;
  const dx=b[0]-a[0], dy=b[1]-a[1], ax=Math.abs(dx), ay=Math.abs(dy);
  if(ax < 1 || ay < 1 || Math.abs(ax-ay) < 1) return (ROUTE[key] = [a,b]);
  const d = Math.min(ax,ay), sx = Math.sign(dx), sy = Math.sign(dy);
  const opts = [[a,[a[0]+sx*d, a[1]+sy*d],b],[a,[b[0]-sx*d, b[1]-sy*d],b]];
  let best = opts[0], bs = -1;
  for(const o of opts){
    let m = 40;
    for(const n of NODES){ if(n.id === ia || n.id === ib || n.kind === 'gateway') continue;
      for(let i=0;i<o.length-1;i++) m = Math.min(m, distSeg(n.s, o[i], o[i+1])); }
    if(m > bs + 0.01){ bs = m; best = o; }
  }
  return (ROUTE[key] = best);
}
function baseRoute(key){
  if(state.t === 0) return schemRoute(key);
  const [a,b] = key.split('|'); return [pos(N[a]), pos(N[b])];
}
function offsetPoly(pts, d){
  if(!d) return pts.map(p => p.slice());
  const n = [];
  for(let i=0;i<pts.length-1;i++){ const dx=pts[i+1][0]-pts[i][0], dy=pts[i+1][1]-pts[i][1], L=Math.hypot(dx,dy)||1; n.push([-dy/L, dx/L]); }
  return pts.map((p,i) => {
    let m;
    if(i === 0) m = n[0]; else if(i === pts.length-1) m = n[n.length-1];
    else { const a=n[i-1], b=n[i]; let mx=a[0]+b[0], my=a[1]+b[1]; const L=Math.hypot(mx,my)||1; mx/=L; my/=L; const dot=(mx*b[0]+my*b[1])||1; m=[mx/dot,my/dot]; }
    return [p[0]+m[0]*d, p[1]+m[1]*d];
  });
}
const f2 = p => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
function dedupe(pts){ const p = []; for(const q of pts){ const l = p[p.length-1]; if(!l || Math.hypot(q[0]-l[0], q[1]-l[1]) > 0.3) p.push(q); } return p; }
function roundedPath(pts, r){
  const p = dedupe(pts); if(p.length < 2) return '';
  let s = 'M' + f2(p[0]);
  for(let i=1;i<p.length-1;i++){
    const a=p[i-1], b=p[i], c=p[i+1], l1=Math.hypot(b[0]-a[0],b[1]-a[1]), l2=Math.hypot(c[0]-b[0],c[1]-b[1]), rr=Math.min(r,l1/2,l2/2);
    s += 'L' + f2([b[0]+(a[0]-b[0])*rr/l1, b[1]+(a[1]-b[1])*rr/l1]) + 'Q' + f2(b) + ' ' + f2([b[0]+(c[0]-b[0])*rr/l2, b[1]+(c[1]-b[1])*rr/l2]);
  }
  return s + 'L' + f2(p[p.length-1]);
}

/* ---------- Spatial grid for label placement ---------- */
function Grid(c){
  const m = new Map(), k = (x,y) => x + ',' + y;
  return {
    add(b, o){ o.b = b; for(let x=Math.floor(b[0]/c); x<=Math.floor(b[2]/c); x++) for(let y=Math.floor(b[1]/c); y<=Math.floor(b[3]/c); y++){ const kk=k(x,y); if(!m.has(kk)) m.set(kk,[]); m.get(kk).push(o); } },
    hits(b, skip){ const seen = new Set(); let n = 0;
      for(let x=Math.floor(b[0]/c); x<=Math.floor(b[2]/c); x++) for(let y=Math.floor(b[1]/c); y<=Math.floor(b[3]/c); y++){
        const a = m.get(k(x,y)); if(!a) continue;
        for(const o of a){ if(seen.has(o) || o === skip || (skip && o.id === skip.id)) continue; seen.add(o);
          if(o.b[0] < b[2] && o.b[2] > b[0] && o.b[1] < b[3] && o.b[3] > b[1]) n++; } }
      return n; }
  };
}

/* ---------- View transform ---------- */
const svg = $('svg'), view = $('view');
const vp = {k:1, x:0, y:0, kFit:1};
function applyView(){ view.setAttribute('transform', `translate(${vp.x.toFixed(2)} ${vp.y.toFixed(2)}) scale(${vp.k.toFixed(4)})`); }
const unit = () => (1/vp.k) * clamp(Math.pow(vp.k/vp.kFit, 0.4), 0.8, 2.2);

/* ---------- Render ---------- */
const bgG = $('bgG'), sugG = $('sugG'), linesG = $('linesG'), stationsG = $('stationsG'), labelsG = $('labelsG'), editG = $('editG');
bgG.innerHTML = `<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path class="gridline" d="M40 0H0V40" stroke-width="1"/></pattern></defs>
<rect id="gridRect" x="-2000" y="-2000" width="${W+4000}" height="${H+4000}" fill="url(#grid)"/>
<g id="geoBg" opacity="0"><path class="land" d="${(() => { const o = [[-103.04,36.5],[-100,36.5],[-100,34.56],[-99.2,34.37],[-98.6,34.15],[-97.9,33.9],[-97.2,33.75],[-96.6,33.85],[-95.8,33.86],[-95.2,33.95],[-94.48,33.64],[-94.04,33.55],[-94.04,33.02],[-94.04,31.99],[-93.8,31.4],[-93.55,30.9],[-93.7,30.3],[-93.84,29.7],[-94.7,29.35],[-95.1,29.05],[-95.6,28.75],[-96.4,28.4],[-97,27.9],[-97.3,27.4],[-97.4,26.7],[-97.15,25.96],[-97.7,26.0],[-98.3,26.1],[-99.1,26.5],[-99.5,27.5],[-100.3,28.3],[-100.7,29.1],[-101.4,29.77],[-102.3,29.88],[-102.7,29.6],[-103.1,28.97],[-103.8,29.3],[-104.5,29.65],[-104.9,30.4],[-105.6,31.1],[-106.2,31.5],[-106.62,31.96],[-106.62,32.0],[-103.06,32.0],[-103.06,33.0]]; return 'M' + o.map(([lo,la]) => f2(proj(la,lo))).join('L') + 'Z'; })()}"/><text class="landnote" x="${W-60}" y="${H-30}" text-anchor="end">Approximate state outline</text></g>`;

let LAST = null;
function visibleLines(){
  const out = [];
  for(const l of allLines()){ if(!lineVisible(l)) continue; const s = effStops(l); if(s.length >= 2) out.push({l, stops:s}); }
  return out;
}
function nodeShown(n, used){
  if(removed.has(n.id)) return false;
  if(n.kind === 'gateway') return used.has(n.id);
  if(used.has(n.id) || n.kind === 'custom' || pinned.has(n.id)) return true;
  if(n.kind !== 'city') return false;
  if(!state.showUnserved) return false;
  return n.pop >= state.minPop;
}
function localLines(){ return state.baseOn && state.baseTypes.lightrail ? D.LOCAL.filter(l => !off.has(l.id) && !removed.has(l.city)) : []; }

function render(){
  const u = unit();
  const vis = visibleLines();
  const used = new Set(); vis.forEach(v => v.stops.forEach(s => used.add(s)));
  if(BUILD && edit){ const l = lineById(edit.id); if(l) effStops(l).forEach(s => used.add(s)); }
  const shown = new Set(NODES.filter(n => nodeShown(n, used)).map(n => n.id));

  // Corridors: lines sharing a pair of stops run side by side
  const order = [...vis].sort((a,b) => rankOf(b.l) - rankOf(a.l) || 0);
  const corr = new Map();
  for(const v of order) for(let i=0;i<v.stops.length-1;i++){
    const k = keyOf(v.stops[i], v.stops[i+1]); if(!corr.has(k)) corr.set(k, []);
    const a = corr.get(k); if(!a.includes(v.l.id)) a.push(v.l.id);
  }
  const GAP = 6.5*u, stOff = {};
  for(const [k, ids] of corr){ const o = (ids.length-1)/2*GAP; for(const s of k.split('|')) stOff[s] = Math.max(stOff[s]||0, o); }
  const served = {};
  for(const v of vis) for(const s of v.stops) (served[s] = served[s] || new Set()).add(v.l.id);
  const locals = localLines();
  for(const l of locals) (served[l.city] = served[l.city] || new Set()).add(l.id);

  // Focus and dimming
  let focusing = false; const fL = new Set(), fC = new Set();
  if(sel && sel.kind === 'line'){ const l = lineById(sel.id); if(l){ focusing = true; fL.add(l.id); (l.stops||[l.city]).forEach(s => fC.add(s)); } }
  else if(sel && sel.kind === 'node'){ focusing = true; fC.add(sel.id); for(const v of vis) if(v.stops.includes(sel.id)){ fL.add(v.l.id); v.stops.forEach(s => fC.add(s)); } }
  else if(sel && sel.kind === 'sug'){ const s = SUG && SUG.edges.find(e => e.id === sel.id); if(s){ focusing = true; fC.add(s.a); fC.add(s.b); } }
  else if(!BUILD && regions.size){ focusing = true;
    for(const n of NODES) if(regions.has(n.region)) fC.add(n.id);
    for(const v of vis) if(v.stops.some(s => regions.has(N[s].region))) fL.add(v.l.id); }

  // Lines
  const obst = Grid(30*u);
  let ls = '', top = '';
  for(const v of order){
    const l = v.l, T = typeInfo(l), pts = [];
    for(let i=0;i<v.stops.length-1;i++){
      const a = v.stops[i], b = v.stops[i+1], k = keyOf(a,b), ids = corr.get(k);
      let p = offsetPoly(baseRoute(k), (ids.indexOf(l.id) - (ids.length-1)/2) * GAP);
      if(a > b) p = p.reverse();
      pts.push(...p);
    }
    const dp = dedupe(pts);
    for(let i=0;i<dp.length-1;i++){ const a=dp[i], b=dp[i+1], L=Math.hypot(b[0]-a[0],b[1]-a[1]), n=Math.max(1, Math.round(L/(9*u)));
      for(let j=0;j<=n;j++){ const x=a[0]+(b[0]-a[0])*j/n, y=a[1]+(b[1]-a[1])*j/n; obst.add([x,y,x,y], {}); } }
    const d = roundedPath(pts, 12*u), w = T.width*u;
    const dim = focusing && !fL.has(l.id);
    const isSel = (sel && sel.kind === 'line' && sel.id === l.id) || (edit && edit.id === l.id);
    let s = `<g class="ln${dim ? ' dim' : ''}" data-line="${l.id}">`;
    if(isSel) s += `<path d="${d}" stroke="${l.color}" stroke-width="${(w + 10*u).toFixed(2)}" stroke-opacity=".22"/>`;
    if(l.base) s += `<path class="casing" d="${d}" stroke-width="${(w + 2.4*u).toFixed(2)}"/><path d="${d}" stroke="${l.color}" stroke-width="${w.toFixed(2)}"/>`;
    else if(l.type === 'higher') s += `<path d="${d}" stroke="${l.color}" stroke-width="${w.toFixed(2)}"/><path class="core" d="${d}" stroke-width="${(1.5*u).toFixed(2)}"/>`;
    else if(l.type === 'conv') s += `<path class="dash" d="${d}" stroke="${l.color}" stroke-width="${w.toFixed(2)}" stroke-dasharray="${(9*u).toFixed(2)} ${(4.5*u).toFixed(2)}"/>`;
    else if(l.type === 'bus') s += `<path d="${d}" stroke="${l.color}" stroke-width="${w.toFixed(2)}" stroke-dasharray="0.01 ${(6.5*u).toFixed(2)}"/>`;
    else s += `<path d="${d}" stroke="${l.color}" stroke-width="${w.toFixed(2)}"/>`;
    s += `<path class="hit" d="${d}" stroke-width="${(14*u).toFixed(2)}"/></g>`;
    if(isSel) top += s; else ls += s;
  }
  linesG.innerHTML = ls + top;

  // Suggestions (builder)
  let sg = '';
  if(BUILD && state.showSug && SUG){
    const have = new Set(); for(const v of vis) for(let i=0;i<v.stops.length-1;i++) have.add(keyOf(v.stops[i], v.stops[i+1]));
    for(const e of SUG.edges){
      if(!e.type || !state.sugTypes[e.type] || have.has(e.key) || !shown.has(e.a) || !shown.has(e.b)) continue;
      const d = roundedPath(baseRoute(e.key), 12*u), c = D.TYPES[e.type].ghost;
      const dim = focusing && !(fC.has(e.a) && fC.has(e.b)) && !(sel && sel.kind === 'node' && (e.a === sel.id || e.b === sel.id));
      const isSel = sel && sel.kind === 'sug' && sel.id === e.id;
      sg += `<g class="sug${dim ? ' dim' : ''}" data-sug="${e.id}"><path d="${d}" stroke="${c}" stroke-opacity="${isSel ? .95 : .55}" stroke-width="${((isSel ? 4 : 2.6)*u).toFixed(2)}" stroke-dasharray="${(2*u).toFixed(2)} ${(5*u).toFixed(2)}"/><path class="hit" d="${d}" stroke-width="${(12*u).toFixed(2)}"/></g>`;
    }
  }
  sugG.innerHTML = sg;

  // Stations
  let ss = '';
  const marks = [];
  for(const n of NODES){
    if(!shown.has(n.id)) continue;
    const p = pos(n), sv = served[n.id], c = sv ? sv.size : 0;
    const dim = focusing && !fC.has(n.id);
    const isSel = sel && sel.kind === 'node' && sel.id === n.id;
    const extra = state.sizeByPop && n.pop ? Math.sqrt(n.pop/1e5)*1.4 : 0;
    const cx = p[0].toFixed(1), cy = p[1].toFixed(1);
    let r, body;
    if(n.kind === 'gateway'){
      r = 5*u;
      const ang = Math.atan2(n.g[1]-H/2, n.g[0]-W/2), s = 6*u;
      const pts = [[s,0],[-s*.7,s*.75],[-s*.7,-s*.75]].map(([x,y]) => [p[0]+x*Math.cos(ang)-y*Math.sin(ang), p[1]+x*Math.sin(ang)+y*Math.cos(ang)]);
      ss += `<g class="stn gw${dim ? ' dim' : ''}" data-node="${n.id}"><circle class="hitc" cx="${cx}" cy="${cy}" r="${(10*u).toFixed(1)}"/><path d="M${pts.map(f2).join('L')}Z"/></g>`;
      marks.push({n, p, r, gw:true, dim, c}); continue;
    }
    let cls = 'stn';
    if(n.kind === 'airport'){ r = 4.2*u + (stOff[n.id]||0); cls += ' airport';
      body = `<rect class="dot" x="${(p[0]-r).toFixed(1)}" y="${(p[1]-r).toFixed(1)}" width="${(2*r).toFixed(1)}" height="${(2*r).toFixed(1)}" rx="${(1.5*u).toFixed(1)}"/>`; }
    else if(n.kind === 'custom' && !c){ r = 4.2*u; cls += ' custom';
      body = `<rect class="dot" x="${(p[0]-r).toFixed(1)}" y="${(p[1]-r).toFixed(1)}" width="${(2*r).toFixed(1)}" height="${(2*r).toFixed(1)}" transform="rotate(45 ${cx} ${cy})" stroke-width="${(2*u).toFixed(2)}"/>`; }
    else if(c >= 2){ r = 4.4*u + (stOff[n.id]||0) + extra*u; cls += ' inter';
      body = `<circle class="dot" cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" stroke-width="${(2*u).toFixed(2)}"/>`; }
    else if(c === 1){ r = 3.6*u + (stOff[n.id]||0) + extra*u; cls += ' single';
      const col = lineById([...sv][0]).color;
      body = `<circle class="dot" cx="${cx}" cy="${cy}" r="${r.toFixed(2)}" stroke-width="${(2.2*u).toFixed(2)}" style="stroke:${col}"/>`; }
    else { r = (n.kind === 'town' ? 2.4 : 3)*u + extra*u*0.6; cls += ' none';
      body = `<circle class="dot" cx="${cx}" cy="${cy}" r="${r.toFixed(2)}"/>`; }
    let ring = '';
    for(const l of locals) if(l.city === n.id) ring += `<circle class="local" cx="${cx}" cy="${cy}" r="${(r + 3.2*u).toFixed(2)}" stroke="${l.color}" stroke-width="${(2*u).toFixed(2)}"/>`;
    if(isSel) ring += `<circle class="ring" cx="${cx}" cy="${cy}" r="${(r + 6*u).toFixed(2)}" stroke-width="${(2.2*u).toFixed(2)}"/>`;
    ss += `<g class="${cls}${dim ? ' dim' : ''}" data-node="${n.id}"><circle class="hitc" cx="${cx}" cy="${cy}" r="${Math.max(r + 5*u, 10*u).toFixed(1)}"/>${ring}${body}</g>`;
    marks.push({n, p, r: r + (ring ? 3.2*u : 0), dim, c});
  }
  stationsG.innerHTML = ss;

  // Editing overlay
  let eg = '';
  if(BUILD && edit){
    const l = lineById(edit.id);
    if(l){ const st = effStops(l); const endId = edit.at === 'start' ? st[0] : st[st.length-1];
      if(endId && shown.has(endId)){ const p = pos(N[endId]);
        eg = `<circle class="edit-ring" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(13*u).toFixed(1)}" stroke-width="${(2.4*u).toFixed(2)}" stroke-dasharray="${(4*u).toFixed(1)} ${(3*u).toFixed(1)}"/>`; } }
  }
  editG.innerHTML = eg;

  LAST = {u, marks, obst, served, fC, focusing, shown};
  placeLabels();
  document.getElementById('gridRect').setAttribute('opacity', (1 - state.t).toFixed(3));
  document.getElementById('geoBg').setAttribute('opacity', state.t.toFixed(3));
  renderStats(vis, served, shown);
}

/* ---------- Labels: greedy placement that avoids markers, lines and other labels ---------- */
function placeLabels(){
  if(!LAST) return;
  const {u, marks, obst, fC, focusing} = LAST;
  const minLbl = {auto:0, '100k':100000, '250k':250000, '500k':500000, none:Infinity}[state.labelMode] ?? 0;
  const mk = Grid(30*u), lb = Grid(30*u);
  for(const m of marks) mk.add([m.p[0]-m.r, m.p[1]-m.r, m.p[0]+m.r, m.p[1]+m.r], {id:m.n.id});
  const editIds = new Set();
  if(BUILD && edit){ const l = lineById(edit.id); if(l) l.stops.forEach(s => editIds.add(s)); }
  const cands = marks.filter(m => {
    const n = m.n, must = (sel && sel.kind === 'node' && sel.id === n.id) || editIds.has(n.id);
    m.must = must || (sel && fC.has(n.id) && m.c > 0) || (n.kind === 'gateway' && !m.dim);
    if(m.must) return true;
    if(n.kind === 'airport' || n.kind === 'custom') return true;
    return (n.pop || 0) >= minLbl && minLbl !== Infinity;
  });
  cands.sort((a,b) => (b.must - a.must) || ((b.c >= 2) - (a.c >= 2)) || ((b.n.pop||0) - (a.n.pop||0)));
  const DIRS = [['e',1,0,0],['w',-1,0,.4],['n',0,-1,.8],['s',0,1,1],['ne',.75,-.75,1.6],['se',.75,.75,1.8],['nw',-.75,-.75,1.8],['sw',-.75,.75,2]];
  let out = '';
  for(const m of cands){
    const n = m.n, pop = n.pop || 0;
    const fs = (pop >= 500000 ? 14 : pop >= 100000 ? 12.5 : 11.2) * u;
    const text = n.kind === 'gateway' ? 'to ' + n.name : n.name;
    const w = text.length * fs * 0.54 + 2*u, h = fs * 1.05, gap = m.r + 3.5*u, p = m.p;
    let best = null;
    let dirs = DIRS;
    if(n.kind === 'gateway'){ const ang = Math.atan2(n.g[1]-H/2, n.g[0]-W/2); dirs = Math.abs(Math.cos(ang)) > 0.6 ? DIRS.filter(x => x[0] === 'n' || x[0] === 's' || x[0] === (Math.cos(ang) > 0 ? 'nw' : 'ne')) : DIRS.filter(x => x[0] === 'e' || x[0] === 'w'); }
    for(const [dir, dx, dy, pen] of dirs){
      let x0;
      if(dx > 0.1) x0 = p[0] + dx*gap; else if(dx < -0.1) x0 = p[0] + dx*gap - w; else x0 = p[0] - w/2;
      let yc = p[1] + dy*(gap + (dy ? h/2 : 0));
      const b = [x0, yc - h/2, x0 + w, yc + h/2];
      const score = lb.hits(b)*100 + mk.hits(b, {id:n.id})*40 + obst.hits(b)*1.2 + pen;
      if(!best || score < best.score) best = {score, b, dx, dy, x0, yc};
    }
    if(best.score >= 40 && !m.must) continue;
    lb.add(best.b, {});
    const anchor = best.dx > 0.1 ? 'start' : best.dx < -0.1 ? 'end' : 'middle';
    const tx = anchor === 'start' ? best.b[0] : anchor === 'end' ? best.b[2] : (best.b[0]+best.b[2])/2;
    const ty = best.yc + fs*0.36;
    const cls = 'lbl' + (n.kind === 'gateway' ? ' gw' : m.c >= 2 ? ' strong' : m.c === 0 ? ' none' : '') + (m.dim ? ' dim' : '');
    out += `<text class="${cls}" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="${anchor}" font-size="${fs.toFixed(2)}" stroke-width="${(3.6*u).toFixed(2)}">${esc(text)}</text>`;
  }
  labelsG.innerHTML = out;
}

/* ---------- Suggested corridors (gravity model) ---------- */
function computeSuggestions(){
  // Candidate places: what's on the map and has people
  const C = NODES.filter(n => n.pop > 0 && !removed.has(n.id) && (n.kind === 'city' || n.kind === 'custom' || pinned.has(n.id))
    && (n.pop >= state.minPop || pinned.has(n.id) || n.kind === 'custom')).sort((a,b) => b.pop - a.pop);
  const dm = (a,b) => hav(a,b) * CIRCUITY;
  const grav = (pa, pb, d) => (pa/1e5)*(pb/1e5)/Math.pow(Math.max(d, 12)/100, 2);
  // 1. Group suburbs with their metro's principal city
  const principals = [], owner = new Map();
  for(const n of C){
    let best = null;
    for(const p of principals){ const d = hav(p, n); if(d <= 40 && (p.pop >= 2*n.pop || (d <= 25 && p.pop >= 1.15*n.pop)) && (!best || p.pop > best.pop)) best = p; }
    if(best) owner.set(n.id, best); else { principals.push(n); owner.set(n.id, n); }
  }
  const metroPop = new Map();
  for(const n of C){ const p = owner.get(n.id); metroPop.set(p.id, (metroPop.get(p.id)||0) + n.pop); }
  const out = new Map();
  // Build a corridor graph: drop A–B when a sizable place sits nearly on the way
  function graph(nodes, popOf, maxD, maxDetour){
    const M = nodes.length, dist = nodes.map(() => new Float64Array(M));
    for(let i=0;i<M;i++) for(let j=i+1;j<M;j++) dist[i][j] = dist[j][i] = dm(nodes[i], nodes[j]);
    const edges = [], adj = Array.from({length:M}, () => []);
    for(let i=0;i<M;i++) for(let j=i+1;j<M;j++){
      const d = dist[i][j]; if(d > maxD) continue;
      const thr = 0.1*Math.min(popOf(nodes[i]), popOf(nodes[j]));
      let pruned = false;
      for(let k=0;k<M && !pruned;k++){ if(k===i || k===j || popOf(nodes[k]) < thr) continue;
        if(Math.min(dist[i][k], dist[k][j]) < 0.12*d) continue;
        if(dist[i][k] + dist[k][j] <= maxDetour*d) pruned = true;
        else if(Math.min(popOf(nodes[i]), popOf(nodes[j])) < 300000 && popOf(nodes[k]) >= 0.5*Math.min(popOf(nodes[i]), popOf(nodes[j])) && Math.max(dist[i][k], dist[k][j]) < 0.92*d) pruned = true; }
      if(pruned) continue;
      const e = {i, j, d, short:0, mid:0, long:0}; edges.push(e); adj[i].push([j,e]); adj[j].push([i,e]);
    }
    return {M, dist, edges, adj};
  }
  function routeAll(g, pairs){
    const {M, adj} = g;
    const bySrc = new Map(); for(const pr of pairs){ if(!bySrc.has(pr[0])) bySrc.set(pr[0], []); bySrc.get(pr[0]).push(pr); }
    for(const [a, list] of bySrc){
      const dd = new Float64Array(M).fill(Infinity), prev = new Array(M).fill(null), done = new Uint8Array(M); dd[a] = 0;
      for(let it=0; it<M; it++){ let u=-1, b=Infinity; for(let v=0; v<M; v++) if(!done[v] && dd[v] < b){ b = dd[v]; u = v; } if(u < 0) break; done[u] = 1;
        for(const [v,e] of adj[u]) if(dd[u] + e.d < dd[v]){ dd[v] = dd[u] + e.d; prev[v] = e; } }
      for(const [, b, g, direct] of list){
        if(!isFinite(dd[b]) || dd[b] > 1.35*direct) continue;
        let v = b, hops = 0;
        while(v !== a && prev[v] && hops++ < 80){ const e = prev[v]; if(direct < 60) e.short += g; else if(direct < 150) e.mid += g; else e.long += g; v = e.i === v ? e.j : e.i; }
      }
    }
  }
  // 2. Intercity tier between metros and regional centers
  const ig = graph(principals, n => metroPop.get(n.id), 420, 1.10);
  const ipairs = [];
  for(let i=0;i<principals.length;i++) for(let j=i+1;j<principals.length;j++){
    const d = ig.dist[i][j]; if(d > 700) continue;
    const g = grav(metroPop.get(principals[i].id), metroPop.get(principals[j].id), d); if(g >= 0.01) ipairs.push([i, j, g, d]);
  }
  routeAll(ig, ipairs);
  for(const e of ig.edges){
    const L = e.long, LM = e.long + e.mid, S = e.short, tot = L + e.mid + S;
    let type = null;
    if((L >= 100 || (L >= 50 && LM >= 140)) && e.d >= 40) type = 'hsr';
    else if(LM >= 18 && e.d >= 30) type = 'higher';
    else if(S >= 6 && e.d < 60) type = 'regional';
    else if(LM >= 2) type = 'conv';
    else if(tot >= 0.3 && e.d <= 260) type = 'bus';
    if(!type) continue;
    const a = principals[e.i].id, b = principals[e.j].id, key = keyOf(a,b);
    out.set(key, {id:key, key, a, b, d:e.d, type, also: type !== 'regional' && S >= 6 && e.d < 60 ? 'regional' : null, short:S, mid:e.mid, long:L, total:tot, tier:'intercity'});
  }
  // 3. Regional tier inside each metro: suburbs over 40,000 toward the principal city
  for(const p of principals){
    const members = C.filter(n => owner.get(n.id) === p && (n === p || n.pop >= 40000 || n.kind === 'custom' || pinned.has(n.id)));
    if(members.length < 2) continue;
    const rg = graph(members, n => n.pop, 55, 1.12);
    const pi = members.indexOf(p), rpairs = [];
    members.forEach((m, i) => { if(i !== pi){ const d = rg.dist[i][pi]; rpairs.push([i, pi, grav(m.pop, p.pop, d), Math.min(d, 59)]); } });
    routeAll(rg, rpairs);
    for(const e of rg.edges){
      const S = e.short + e.mid + e.long; if(S < 15 || e.d < 4) continue;
      const a = members[e.i].id, b = members[e.j].id, key = keyOf(a,b);
      if(out.has(key)) continue;
      out.set(key, {id:key, key, a, b, d:e.d, type:'regional', also:null, short:S, mid:0, long:0, total:S, tier:'regional'});
    }
  }
  const edges = [...out.values()];
  SUG = {edges, byKey: out};
}
function pairSuggestion(a, b){
  if(SUG){ const e = SUG.byKey.get(keyOf(a,b)); if(e && e.type) return e.type; }
  const A = N[a], B = N[b]; if(!A.pop || !B.pop) return null;
  const d = hav(A,B)*CIRCUITY, g = (A.pop/1e5)*(B.pop/1e5)/Math.pow(Math.max(d,12)/100,2);
  if(d >= 120 && g >= 6) return 'hsr';
  if(d >= 60 && g >= 1.6) return 'higher';
  if(d < 70 && g >= 1.2) return 'regional';
  if(g >= 0.35) return 'conv';
  return 'bus';
}

/* ---------- Stats ---------- */
function renderStats(vis, served, shown){
  const el = $('stats'); if(!el) return;
  const cities = NODES.filter(n => shown.has(n.id) && n.kind !== 'gateway' && n.kind !== 'airport');
  const conn = cities.filter(n => served[n.id]);
  const popAll = cities.reduce((s,n) => s + (n.pop||0), 0), popC = conn.reduce((s,n) => s + (n.pop||0), 0);
  const miles = vis.reduce((s,v) => s + lineMiles(v.l), 0);
  el.innerHTML = `<div><dt>Places connected</dt><dd>${conn.length}<span> of ${cities.length}</span></dd></div>`
    + `<div><dt>Residents on the map served</dt><dd>${popAll ? Math.round(popC/popAll*100) : 0}%</dd></div>`
    + `<div><dt>Line-miles shown</dt><dd>${fmt(Math.round(miles/10)*10)}</dd></div>`;
}

/* ---------- Sidebar ---------- */
function swatch(type, color, base){
  const T = base ? D.BASE_TYPES[type] : D.TYPES[type], w = Math.min(T.width, 5.5);
  const st = color ? `stroke="${color}"` : 'class="inkst"';
  let inner;
  if(base) inner = `<path d="M3 7H35" class="casing" stroke-width="${w+2.4}"/><path d="M3 7H35" ${st} stroke-width="${w}"/>`;
  else if(type === 'higher') inner = `<path d="M3 7H35" ${st} stroke-width="${w}"/><path d="M3 7H35" class="core" stroke-width="1.5"/>`;
  else if(type === 'conv') inner = `<path d="M3 7H35" ${st} stroke-width="${w}" stroke-dasharray="7 3.5"/>`;
  else if(type === 'bus') inner = `<path d="M5 7H35" ${st} stroke-width="${w}" stroke-linecap="round" stroke-dasharray="0.01 6.5"/>`;
  else inner = `<path d="M3 7H35" ${st} stroke-width="${w}" stroke-linecap="round"/>`;
  return `<svg class="swsvg" width="38" height="14" viewBox="0 0 38 14" aria-hidden="true">${inner}</svg>`;
}
function keepFocus(fn){ const id = document.activeElement && document.activeElement.id; fn(); if(id){ const el = $(id); if(el) el.focus({preventScroll:true}); } }
const TYPE_ORDER = ['hsr','higher','conv','regional','bus'];

function sideSkeleton(){
  const s = [];
  s.push(`<div class="search"><label for="q">Find or add a city</label><input id="q" list="cityList" placeholder="Any Texas city, like Temple" autocomplete="off"><datalist id="cityList"></datalist></div><dl class="stats" id="stats"></dl>`);
  if(BUILD){
    s.push(`<section><h2>Start from</h2><p class="hint">Begin on a blank map, or drop in ready-made pieces and edit them. Added lines become yours to change.</p><div id="presets"></div><div class="btns"><button type="button" class="btn alt small" id="clearLines">Clear all my lines</button></div></section>`);
    s.push(`<section><h2>Your lines</h2><div class="newline"><select class="sel" id="newType" aria-label="Type for the new line">${TYPE_ORDER.map(t => `<option value="${t}">${D.TYPES[t].name}</option>`).join('')}</select><button type="button" class="btn" id="newLine">New line</button></div><div id="lineList"></div></section>`);
    s.push(`<section><h2>Suggested corridors</h2><label class="opt"><input type="checkbox" id="showSug"> Show suggestions on the map</label><p class="hint">A gravity model ranks each corridor by population and distance, then suggests a service type. Click a dashed corridor to add it.</p><div id="sugTypes" class="chips"></div></section>`);
    s.push(`<section><h2>Show types</h2><div id="types"></div></section>`);
  } else {
    s.push(`<section><h2>Concept network</h2><div id="types"></div></section>`);
  }
  s.push(`<section><h2>Today’s rail</h2><label class="opt"><input type="checkbox" id="baseOn"> Show existing service</label><div id="baseTypes"></div><details><summary>Existing lines</summary><ul class="lines" id="baseList"></ul></details></section>`);
  if(!BUILD){
    s.push(`<section><h2>Regions</h2><p class="hint">Pick one or more to spotlight the lines that touch them.</p><div class="chips" id="regions"></div></section>`);
    s.push(`<section><div class="sec-head"><h2>Concept lines</h2><span><button type="button" class="link" id="allOn">Show all</button><button type="button" class="link" id="allOff">Hide all</button></span></div><div id="lineList"></div><div class="btns"><button type="button" class="btn alt" id="toBuilder">Edit this network in the builder</button></div></section>`);
  }
  s.push(`<section><h2>Cities</h2><label class="field"><span>Show cities with at least</span><select id="minPop">${[[25000,'25,000 people'],[50000,'50,000 people'],[100000,'100,000 people'],[250000,'250,000 people'],[500000,'500,000 people']].map(([v,t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
    <label class="field"><span>Labels</span><select id="labelMode"><option value="auto">Fit as many as possible</option><option value="100k">Cities over 100,000</option><option value="250k">Cities over 250,000</option><option value="500k">Cities over 500,000</option><option value="none">Hide labels</option></select></label>
    <label class="opt"><input type="checkbox" id="showUnserved"> Show cities with no service</label>
    <label class="opt"><input type="checkbox" id="sizeByPop"> Size stations by population</label>
    <div class="btns"><button type="button" class="btn alt small" id="addPlace">Add a place on the map</button></div>
    <div id="cityLists"></div></section>`);
  if(BUILD) s.push(`<section><h2>Save and share</h2><p class="hint">Your work saves in this browser automatically. Export a file to back it up or share it.</p><div class="btns"><button type="button" class="btn alt small" id="exportBtn">Export network</button><button type="button" class="btn alt small" id="importBtn">Import network</button><button type="button" class="btn alt small" id="resetBtn">Start over</button></div><input type="file" id="importFile" accept="application/json,.json" hidden></section>`);
  s.push(`<p class="fine">Populations: ${D.SOURCE}. Every Census place of 25,000 or more is included, plus smaller towns with rail stations today. Route lengths use a 1.15 circuity factor on straight-line distance; drive times assume ${DRIVE_MPH} mph over a 1.2 road factor. Concept lines, speeds and suggestions are brainstorming aids, not engineered alignments.</p>`);
  $('side').innerHTML = s.join('');
  $('cityList').innerHTML = NODES.filter(n => n.kind !== 'gateway').sort((a,b) => a.name.localeCompare(b.name)).map(n => `<option value="${esc(n.name)}">`).join('');
}

function renderTypes(){
  const el = $('types'); if(!el) return;
  el.innerHTML = TYPE_ORDER.map(t => {
    const T = D.TYPES[t], ls = ownLines().filter(l => l.type === t), mi = ls.reduce((s,l) => s + lineMiles(l), 0);
    return `<label class="trow${state.types[t] ? '' : ' off'}"><input type="checkbox" id="ty-${t}" data-type="${t}" ${state.types[t] ? 'checked' : ''}>${swatch(t)}<span><strong>${T.name}</strong><small>${T.desc}</small></span><span class="cnt">${ls.length} ${ls.length === 1 ? 'line' : 'lines'}<br>${fmt(Math.round(mi/10)*10)} mi</span></label>`;
  }).join('');
}
function renderBase(){
  $('baseOn').checked = state.baseOn;
  $('baseTypes').innerHTML = Object.entries(D.BASE_TYPES).map(([t,T]) => {
    const n = D.BASELINE.filter(l => l.type === t).length + D.LOCAL.filter(l => l.type === t).length;
    return `<label class="trow${state.baseOn && state.baseTypes[t] ? '' : ' off'}"><input type="checkbox" id="bt-${t}" data-btype="${t}" ${state.baseTypes[t] ? 'checked' : ''}>${swatch(t, null, true)}<span><strong>${T.name}</strong><small>${T.desc}</small></span><span class="cnt">${n} ${n === 1 ? 'line' : 'lines'}</span></label>`;
  }).join('');
  $('baseList').innerHTML = D.BASELINE.concat(D.LOCAL).map(l => {
    const st = l.stops ? effStops(l) : [l.city];
    const sub = l.stops ? `${esc(N[st[0]].kind === 'gateway' ? 'from ' + N[st[0]].name : N[st[0]].name)} to ${esc(N[st[st.length-1]].kind === 'gateway' ? N[st[st.length-1]].name : N[st[st.length-1]].name)}` : 'within ' + esc(N[l.city].name);
    return `<li class="${state.baseOn && state.baseTypes[l.type] ? '' : 'muted'}"><input type="checkbox" id="cb-${l.id}" data-toggle-line="${l.id}" ${off.has(l.id) ? '' : 'checked'} aria-label="Show ${esc(l.name)}">${swatch(l.type, l.color, true)}<button type="button" class="lname" data-goto-line="${l.id}"><strong>${esc(l.name)}</strong><small>${esc(l.agency)}, ${sub}</small></button><span></span></li>`;
  }).join('');
}
function lineRow(l){
  const typeOff = !state.types[l.type], st = effStops(l);
  const sub = st.length >= 2 ? `${esc(N[st[0]].name)} to ${esc(N[st[st.length-1]].name)}, ${fmt(lineMiles(l))} mi` : st.length === 1 ? `Starts at ${esc(N[st[0]].name)}; add a stop` : 'No stops yet';
  const editing = edit && edit.id === l.id;
  return `<li class="${typeOff ? 'muted' : ''}"><input type="checkbox" id="cb-${l.id}" data-toggle-line="${l.id}" ${off.has(l.id) ? '' : 'checked'} aria-label="Show ${esc(l.name)}">${swatch(l.type, l.color)}<button type="button" class="lname" data-goto-line="${l.id}"><strong>${esc(l.name)}${editing ? ' (editing)' : ''}</strong><small>${sub}${typeOff ? ', type hidden' : ''}</small></button><span></span></li>`;
}
function renderLines(){
  const el = $('lineList'); if(!el) return;
  if(BUILD){
    el.innerHTML = state.lines.length ? `<ul class="lines">${state.lines.map(lineRow).join('')}</ul>`
      : `<p class="empty">No lines yet. Press New line and click cities on the map, add a starter set above, or turn on suggestions.</p>`;
  } else {
    el.innerHTML = TYPE_ORDER.map(t => `<h3>${D.TYPES[t].name}</h3><ul class="lines">${D.LINES.filter(l => l.type === t).map(lineRow).join('')}</ul>`).join('');
  }
}
function renderRegions(){
  const el = $('regions'); if(!el) return;
  el.innerHTML = Object.entries(D.REGIONS).map(([k,v]) => `<button type="button" class="chip" id="rg-${k}" data-region="${k}" aria-pressed="${regions.has(k)}">${v}</button>`).join('');
}
function renderPresets(){
  const el = $('presets'); if(!el) return;
  const have = new Set(state.lines.map(l => l.from).filter(Boolean));
  el.innerHTML = D.PRESETS.map(p => { const all = p.lines.every(id => have.has(id));
    return `<div class="preset"><div><strong>${esc(p.name)}</strong><small>${esc(p.desc)}</small></div><button type="button" class="btn small${all ? ' alt' : ''}" id="pr-${p.id}" data-preset="${p.id}" ${all ? 'disabled' : ''}>${all ? 'Added' : 'Add'}</button></div>`; }).join('')
    + `<div class="preset"><div><strong>The whole concept network</strong><small>Every line from the concept map.</small></div><button type="button" class="btn small" id="pr-all" data-preset="all">Add</button></div>`;
}
function renderSugTypes(){
  const el = $('sugTypes'); if(!el) return;
  $('showSug').checked = state.showSug;
  el.innerHTML = TYPE_ORDER.map(t => `<button type="button" class="chip" id="st-${t}" data-sugtype="${t}" aria-pressed="${state.sugTypes[t]}">${D.TYPES[t].name}</button>`).join('');
}
function renderCities(){
  $('minPop').value = String(state.minPop);
  $('labelMode').value = state.labelMode;
  $('showUnserved').checked = state.showUnserved;
  $('sizeByPop').checked = state.sizeByPop;
  const pins = [...pinned].filter(id => N[id] && !removed.has(id));
  const customs = NODES.filter(n => n.kind === 'custom');
  const rem = [...removed].filter(id => N[id]);
  let h = '';
  if(customs.length) h += `<h3>Places you added</h3><ul class="citylist">${customs.map(n => `<li><button type="button" class="link" data-goto-node="${n.id}">${esc(n.name)}</button><button type="button" class="link danger" data-del-place="${n.id}">Delete</button></li>`).join('')}</ul>`;
  if(pins.length) h += `<h3>Kept on the map</h3><ul class="citylist">${pins.map(id => `<li><button type="button" class="link" data-goto-node="${id}">${esc(N[id].name)}</button><button type="button" class="link" data-unpin="${id}">Let the size filter decide</button></li>`).join('')}</ul>`;
  if(rem.length) h += `<h3>Removed from the map</h3><ul class="citylist">${rem.map(id => `<li><span>${esc(N[id].name)}</span><button type="button" class="link" data-restore="${id}">Restore</button></li>`).join('')}</ul>`;
  $('cityLists').innerHTML = h;
}
function renderSide(){ keepFocus(() => { renderTypes(); renderBase(); renderLines(); renderRegions(); renderPresets(); renderSugTypes(); renderCities(); }); }

/* ---------- Info card ---------- */
const info = $('info');
function pill(label, color, attr, extra){ return `<button type="button" class="pill" ${attr}><i style="background:${color}"></i>${esc(label)}${extra ? ` <em>${extra}</em>` : ''}</button>`; }
function showInfo(){
  if(placing && placing.pt){ placeForm(); return; }
  if(!sel){ info.hidden = true; return; }
  if(sel.kind === 'node') nodeCard(N[sel.id]);
  else if(sel.kind === 'line') lineCard(lineById(sel.id));
  else if(sel.kind === 'sug') sugCard();
  info.hidden = false;
}
function nodeCard(n){
  if(!n){ sel = null; info.hidden = true; return; }
  const vis = visibleLines(), here = vis.filter(v => v.stops.includes(n.id)).map(v => v.l);
  const locals = localLines().filter(l => l.city === n.id);
  const nb = new Map();
  for(const v of vis) v.stops.forEach((s,i) => { if(s !== n.id) return; [v.stops[i-1], v.stops[i+1]].forEach(m => { if(m && !nb.has(m) && N[m].kind !== 'gateway') nb.set(m, v.l); }); });
  let h = `<button type="button" class="x" data-close aria-label="Close">×</button><h3>${esc(n.name)}</h3>`;
  if(n.kind === 'gateway'){ h += `<p class="meta">Out-of-state connection</p>`; }
  else if(n.kind === 'airport'){ h += `<p class="meta">Airport station in ${D.REGIONS[n.region]}</p>`; }
  else {
    const meta = n.kind === 'city' ? `${D.REGIONS[n.region]}. Ranked ${n.rank} of ${BIG.length} Texas places over 25,000.` : n.kind === 'custom' ? `A place you added, in ${D.REGIONS[n.region]}.` : `${D.REGIONS[n.region]}. A smaller town with a rail station today.`;
    h += `<p class="meta">${meta}</p>`;
    if(n.pop) h += `<dl class="kv"><dt>Population</dt><dd>${fmt(n.pop)} <small>(${n.kind === 'custom' ? 'your estimate' : 'ACS 2020–2024'})</small></dd></dl>`;
  }
  h += `<h4>Service here</h4>`;
  h += here.length || locals.length ? `<div class="pills">${here.concat(locals).map(l => pill(l.name, l.color, `data-goto-line="${l.id}"`, l.base ? l.agency : typeInfo(l).name.split(' ')[0])).join('')}</div>` : `<p class="meta">No visible line stops here.</p>`;
  if(nb.size) h += `<h4>One stop away</h4><div class="pills">${[...nb].map(([id,l]) => { const mi = segMiles(n.id, id); return pill(N[id].name, l.color, `data-goto-node="${id}"`, `${fmt(mi)} mi, ${fmtTime(mi/typeInfo(l).avg)}`); }).join('')}</div>`;
  if(BUILD && n.kind !== 'gateway'){
    const L = edit && lineById(edit.id);
    h += `<div class="btns">`;
    if(L && !L.stops.includes(n.id)) h += `<button type="button" class="btn small" data-add-stop="${n.id}">Add to ${esc(L.name)}</button>`;
    h += `<button type="button" class="btn small${L ? ' alt' : ''}" data-start-line="${n.id}">Start a new line here</button></div>`;
    if(state.showSug && SUG){
      const mine = SUG.edges.filter(e => e.type && (e.a === n.id || e.b === n.id)).sort((a,b) => b.total - a.total).slice(0,6);
      if(mine.length) h += `<h4>Suggested corridors from here</h4><div class="pills">${mine.map(e => { const o = e.a === n.id ? e.b : e.a; return pill(N[o].name, D.TYPES[e.type].ghost, `data-goto-sug="${e.id}"`, D.TYPES[e.type].name.split(' ')[0]); }).join('')}</div>`;
    }
  }
  if(n.kind !== 'gateway'){
    h += `<div class="btns">`;
    if(n.kind === 'custom') h += `<button type="button" class="btn alt small" data-del-place="${n.id}">Delete this place</button>`;
    else h += `<button type="button" class="btn alt small" data-remove="${n.id}">Remove from map</button>`;
    if(n.kind !== 'custom' && (n.pop < state.minPop || n.kind !== 'city')) h += pinned.has(n.id) ? `<button type="button" class="btn alt small" data-unpin="${n.id}">Let the size filter decide</button>` : `<button type="button" class="btn alt small" data-pin="${n.id}">Keep on map</button>`;
    h += `</div>`;
  }
  info.innerHTML = h;
}
function travelRows(mi, T){
  const road = mi / CIRCUITY * ROAD;
  return `<dt>Route length</dt><dd>≈${fmt(mi)} mi</dd><dt>End to end</dt><dd>${fmtTime(mi/T.avg)} <small>at a ${T.avg} mph average</small></dd><dt>Driving</dt><dd>${fmtTime(road/DRIVE_MPH)} <small>about ${fmt(road)} road miles</small></dd>`;
}
function lineCard(l){
  if(!l){ sel = null; info.hidden = true; return; }
  if(l.city){
    info.innerHTML = `<button type="button" class="x" data-close aria-label="Close">×</button><h3>${swatch(l.type, l.color, true)}${esc(l.name)}</h3><p class="meta">${esc(l.agency)}, ${D.BASE_TYPES[l.type].name.toLowerCase()} today</p><p>${esc(l.note)}</p><p class="meta">Shown as a ring around ${esc(N[l.city].name)} because it runs entirely inside the city.</p>`;
    return;
  }
  const T = typeInfo(l), st = effStops(l), mi = lineMiles(l), shown = lineVisible(l);
  const mine = BUILD && !l.base;
  let h = `<button type="button" class="x" data-close aria-label="Close">×</button><h3>${swatch(l.type, l.color, l.base)}${esc(l.name)}</h3>`;
  h += `<p class="meta">${l.base ? esc(l.agency) + ', ' + T.name.toLowerCase() + ' today' : T.name + (mine ? ', your line' : ', concept line')}</p>`;
  if(mine){
    h += `<label class="field"><span>Name</span><input id="edName" value="${esc(l.name)}" maxlength="60"></label>
      <div class="row2"><label class="field"><span>Type</span><select id="edType">${TYPE_ORDER.map(t => `<option value="${t}" ${t === l.type ? 'selected' : ''}>${D.TYPES[t].name}</option>`).join('')}</select></label>
      <label class="field"><span>Color</span><input type="color" class="colorin" id="edColor" value="${l.color}"></label></div>`;
    if(st.length >= 2){
      const counts = {}; for(let i=0;i<st.length-1;i++){ const t = pairSuggestion(st[i], st[i+1]); if(t) counts[t] = (counts[t]||0) + segMiles(st[i], st[i+1]); }
      const best = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
      if(best) h += `<p class="meta">The gravity model leans toward <strong>${D.TYPES[best[0]].name.toLowerCase()}</strong> for most of this route.${best[0] !== l.type ? ` <button type="button" class="link" data-set-type="${best[0]}">Use it</button>` : ''}</p>`;
    }
  }
  if(st.length >= 2) h += `<dl class="kv">${travelRows(mi, T)}<dt>Residents at stops</dt><dd>${fmt(st.reduce((s,id) => s + (N[id].pop||0), 0))}</dd></dl>`;
  h += `<h4>Stops in order</h4>`;
  h += st.length ? `<ol class="stops">${st.map(s => `<li><span><button type="button" class="go" data-goto-node="${s}">${esc(N[s].kind === 'gateway' ? 'to ' + N[s].name : N[s].name)}</button>${mine ? `<button type="button" class="link danger" data-drop-stop="${s}" aria-label="Remove ${esc(N[s].name)} from this line">Remove</button>` : ''}</span></li>`).join('')}</ol>` : `<p class="meta">No stops yet. Click cities on the map.</p>`;
  if(l.note) h += `<p>${esc(l.note)}</p>`;
  if(!shown) h += `<p class="meta">Hidden by your filters. <button type="button" class="link" data-show-line="${l.id}">Show it</button></p>`;
  if(mine){
    const ed = edit && edit.id === l.id;
    h += `<div class="btns">${ed ? `<button type="button" class="btn small" data-done>Done adding stops</button>` : `<button type="button" class="btn small" data-extend="end">Add stops at the end</button><button type="button" class="btn alt small" data-extend="start">Add at the start</button>`}</div>
      <div class="btns"><button type="button" class="btn alt small" data-reverse>Reverse</button><button type="button" class="btn alt small" data-dup>Duplicate</button><button type="button" class="btn alt small" data-del-line="${l.id}">Delete line</button></div>`;
  } else if(!BUILD && !l.base){
    h += `<div class="btns"><button type="button" class="btn alt small" data-copy-line="${l.id}">Copy this line to the builder</button></div>`;
  }
  info.innerHTML = h;
}
function sugCard(){
  const e = SUG && SUG.edges.find(x => x.id === sel.id);
  if(!e){ sel = null; info.hidden = true; return; }
  const T = D.TYPES[e.type];
  const L = edit && lineById(edit.id), st = L ? effStops(L) : [];
  const endA = st.length && (st[st.length-1] === e.a || st[st.length-1] === e.b) && !(L.stops.includes(e.a) && L.stops.includes(e.b));
  let h = `<button type="button" class="x" data-close aria-label="Close">×</button><h3>${esc(N[e.a].name)} – ${esc(N[e.b].name)}</h3>
    <p class="meta">Suggested corridor</p>
    <dl class="kv"><dt>Suggested type</dt><dd>${T.name}</dd>${e.also ? `<dt>Also strong</dt><dd>${D.TYPES[e.also].name}</dd>` : ''}${travelRows(e.d, T)}
    <dt>Demand index</dt><dd>${e.total >= 10 ? fmt(e.total) : e.total.toFixed(1)} <small>${e.long >= e.mid && e.long >= e.short ? 'mostly long trips' : e.mid >= e.short ? 'mostly medium trips' : 'mostly short trips'}</small></dd></dl>
    <p class="meta">The index multiplies city populations, divides by distance squared, and adds up every city pair whose best route uses this corridor. Long-trip demand points to faster service; short-trip demand points to regional rail.</p>
    <div class="btns"><button type="button" class="btn small" data-add-sug="${e.id}">Add as a new line</button>${endA ? `<button type="button" class="btn alt small" data-extend-sug="${e.id}">Add to ${esc(L.name)}</button>` : ''}</div>`;
  info.innerHTML = h; info.hidden = false;
}
function placeForm(){
  const p = placing.pt;
  info.innerHTML = `<button type="button" class="x" data-cancel-place aria-label="Cancel">×</button><h3>New place</h3><p class="meta">Near ${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</p>
    <label class="field"><span>Name</span><input id="plName" maxlength="60" placeholder="For example, Marfa or a new station"></label>
    <label class="field"><span>Population (optional, used for suggestions)</span><input id="plPop" inputmode="numeric" placeholder="0"></label>
    <div class="btns"><button type="button" class="btn small" data-save-place>Add place</button><button type="button" class="btn alt small" data-cancel-place>Cancel</button></div>`;
  info.hidden = false; const el = $('plName'); if(el) el.focus();
}

/* ---------- Actions ---------- */
function refresh(side){ if(side) renderSide(); render(); showInfo(); save(); }
function select(s){ sel = s; render(); showInfo(); }
function centerOn(p){
  const r = svg.getBoundingClientRect();
  vp.k = Math.max(vp.k, vp.kFit*2.4); vp.x = r.width/2 - p[0]*vp.k; vp.y = r.height/2 - p[1]*vp.k; applyView(); render();
}
let toastT = 0;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 3200); }
function banner(){
  const b = $('banner');
  if(placing){ b.hidden = false; b.innerHTML = `<span>Click the map where the new place should go.</span><button type="button" data-cancel-place>Cancel</button>`; return; }
  if(BUILD && edit){
    const l = lineById(edit.id); if(!l){ edit = null; b.hidden = true; return; }
    b.hidden = false;
    b.innerHTML = `<span>Click cities to add them ${edit.at === 'start' ? 'to the start of' : 'to'} ${esc(l.name)}.</span><button type="button" data-done>Done</button>`;
    return;
  }
  b.hidden = true;
}
function addStop(id){
  const l = lineById(edit.id); if(!l || l.base) return;
  if(l.stops.includes(id)){ toast(`${N[id].name} is already on ${l.name}.`); return; }
  if(edit.at === 'start') l.stops.unshift(id); else l.stops.push(id);
  refresh(true); banner();
}
function newLine(stops, type, name, from, color){
  const l = {id:uid(), name: name || `Line ${state.lines.length + 1}`, type: type || state.newType,
    color: color || D.LINE_COLORS[state.lines.length % D.LINE_COLORS.length], stops: stops || [], note:'', from: from || ''};
  state.lines.push(l); state.types[l.type] = true; return l;
}
function addPreset(id){
  const ids = id === 'all' ? D.LINES.map(l => l.id) : D.PRESETS.find(p => p.id === id).lines;
  const have = new Set(state.lines.map(l => l.from));
  let n = 0;
  for(const lid of ids){ if(have.has(lid)) continue; const src = D.LINES.find(l => l.id === lid); if(!src) continue;
    newLine(src.stops.slice(), src.type, src.name, src.id, src.color).note = src.note; n++; }
  toast(n ? `Added ${n} ${n === 1 ? 'line' : 'lines'}. Click any of them to edit.` : 'Those lines are already in your network.');
  refresh(true);
}
function removeNode(id){
  const n = N[id];
  if(BUILD){
    const uses = state.lines.filter(l => l.stops.includes(id));
    if(uses.length && !confirm(`${n.name} is a stop on ${uses.length} of your ${uses.length === 1 ? 'line' : 'lines'}. Remove it from the map and from those lines?`)) return;
    uses.forEach(l => l.stops = l.stops.filter(s => s !== id));
  }
  removed.add(id); pinned.delete(id);
  if(sel && sel.id === id) sel = null;
  toast(`${n.name} removed. Restore it from the Cities section.`);
  refresh(true);
}
function findNode(v){
  const q = v.trim().toLowerCase(); if(!q) return null;
  const list = NODES.filter(n => n.kind !== 'gateway');
  return list.find(n => n.name.toLowerCase() === q) || list.find(n => n.name.toLowerCase().startsWith(q)) || list.find(n => n.name.toLowerCase().includes(q));
}
function goToNode(id, center){
  const n = N[id]; if(!n) return;
  let note = '';
  if(removed.has(id)){ removed.delete(id); note = `${n.name} restored to the map.`; }
  const used = new Set(); visibleLines().forEach(v => v.stops.forEach(s => used.add(s)));
  if(!nodeShown(n, used)){ pinned.add(id); note = `${n.name} is now kept on the map.`; }
  if(note){ toast(note); renderCities(); save(); }
  sel = {kind:'node', id};
  if(center) centerOn(pos(n)); else render();
  showInfo();
}
function exportNetwork(){
  const data = {format:'texas-rail-network', version:2, lines: state.lines.map(({id,name,type,color,stops,note}) => ({id,name,type,color,stops,note})),
    places: NODES.filter(n => n.kind === 'custom').map(n => ({id:n.id, name:n.name, pop:n.pop, lat:+n.lat.toFixed(5), lon:+n.lon.toFixed(5)})),
    removed:[...removed], pinned:[...pinned], minPop: state.minPop};
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'texas-rail-network.json';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function importNetwork(file){
  if(!file) return;
  const r = new FileReader();
  r.onload = () => {
    try{
      const d = JSON.parse(r.result);
      (Array.isArray(d.places) ? d.places : []).forEach(p => { if(p && p.id && isFinite(p.lat) && isFinite(p.lon) && !N[p.id]){ const c = {id:String(p.id), name:p.name, pop:+p.pop||0, lat:+p.lat, lon:+p.lon}; state.custom.push(c); addCustomNode(c); } });
      const lines = (Array.isArray(d) ? d : d.lines || []).filter(validLine);
      const ids = new Set(state.lines.map(l => l.id));
      lines.forEach((l,i) => { const c = cleanLine(l, state.lines.length + i); if(ids.has(c.id)) c.id = uid(); ids.add(c.id); state.lines.push(c); });
      (d.removed || []).forEach(id => N[id] && removed.add(id)); (d.pinned || []).forEach(id => N[id] && pinned.add(id));
      if(!lines.length && !(d.places||[]).length){ toast('That file has no lines or places this map can read.'); return; }
      toast(`Imported ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}.`); if(SUG) computeSuggestions(); refresh(true);
    }catch(err){ toast('That file isn’t valid JSON. Export a file from this page and try again.'); }
  };
  r.readAsText(file);
}

/* ---------- Events ---------- */
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if(d.type){ state.types[d.type] = t.checked; refresh(true); }
  else if(d.btype){ state.baseTypes[d.btype] = t.checked; if(t.checked) state.baseOn = true; refresh(true); }
  else if(d.toggleLine){ t.checked ? off.delete(d.toggleLine) : off.add(d.toggleLine); refresh(false); }
  else if(t.id === 'baseOn'){ state.baseOn = t.checked; refresh(true); }
  else if(t.id === 'minPop'){ state.minPop = +t.value; if(BUILD && SUG) computeSuggestions(); refresh(true); }
  else if(t.id === 'labelMode'){ state.labelMode = t.value; placeLabels(); save(); }
  else if(t.id === 'showUnserved'){ state.showUnserved = t.checked; refresh(false); }
  else if(t.id === 'sizeByPop'){ state.sizeByPop = t.checked; refresh(false); }
  else if(t.id === 'showSug'){ state.showSug = t.checked; if(t.checked && !SUG) computeSuggestions(); if(!t.checked && sel && sel.kind === 'sug') sel = null; refresh(false); }
  else if(t.id === 'newType'){ state.newType = t.value; save(); }
  else if(t.id === 'edType'){ const l = lineById(sel.id); l.type = t.value; state.types[l.type] = true; refresh(true); }
  else if(t.id === 'edColor'){ const l = lineById(sel.id); l.color = t.value; refresh(true); }
  else if(t.id === 'q'){ const n = findNode(t.value); if(n){ goToNode(n.id, true); t.value = ''; } }
  else if(t.id === 'importFile'){ importNetwork(t.files && t.files[0]); t.value = ''; }
});
document.addEventListener('input', e => {
  if(e.target.id === 'edName'){ const l = lineById(sel.id); l.name = e.target.value.trim() || 'Untitled line'; keepFocus(renderLines); banner(); save(); }
});
document.addEventListener('keydown', e => {
  if(e.target.id === 'q' && e.key === 'Enter'){ e.preventDefault(); const n = findNode(e.target.value); if(n){ goToNode(n.id, true); e.target.value = ''; } else toast('No city by that name. Try Add a place on the map.'); return; }
  if((e.target.id === 'plName' || e.target.id === 'plPop') && e.key === 'Enter'){ e.preventDefault(); savePlace(); return; }
  if(e.key !== 'Escape') return;
  if(placing){ placing = null; svg.classList.remove('placing'); banner(); showInfo(); }
  else if(edit){ edit = null; banner(); refresh(true); }
  else if(sel){ select(null); }
});
function savePlace(){
  const name = ($('plName').value || '').trim(); if(!name){ $('plName').focus(); return; }
  const pop = Math.max(0, parseInt(($('plPop').value || '0').replace(/[^0-9]/g,''), 10) || 0);
  const c = {id:'p' + Date.now().toString(36), name, pop, lat:placing.pt.lat, lon:placing.pt.lon};
  state.custom.push(c); addCustomNode(c);
  placing = null; svg.classList.remove('placing'); banner();
  if(SUG) computeSuggestions();
  sel = {kind:'node', id:c.id}; refresh(true);
}
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  const d = b.dataset;
  if(d.gotoLine){ if(off.has(d.gotoLine)){ off.delete(d.gotoLine); renderSide(); } select({kind:'line', id:d.gotoLine}); }
  else if(d.gotoNode){ goToNode(d.gotoNode, true); }
  else if(d.gotoSug){ select({kind:'sug', id:d.gotoSug}); }
  else if('close' in d){ select(null); }
  else if(d.region){ regions.has(d.region) ? regions.delete(d.region) : regions.add(d.region); b.setAttribute('aria-pressed', regions.has(d.region)); sel = null; refresh(false); }
  else if(d.sugtype){ state.sugTypes[d.sugtype] = !state.sugTypes[d.sugtype]; b.setAttribute('aria-pressed', state.sugTypes[d.sugtype]); refresh(false); }
  else if(d.showLine){ const l = lineById(d.showLine); off.delete(l.id); if(l.base){ state.baseOn = true; state.baseTypes[l.type] = true; } else state.types[l.type] = true; refresh(true); }
  else if(d.preset){ addPreset(d.preset); }
  else if(d.remove){ removeNode(d.remove); }
  else if(d.restore){ removed.delete(d.restore); refresh(true); }
  else if(d.pin){ pinned.add(d.pin); refresh(true); }
  else if(d.unpin){ pinned.delete(d.unpin); refresh(true); }
  else if(d.delPlace){ const n = N[d.delPlace]; if(!n || !confirm(`Delete ${n.name}? It will also come off any of your lines.`)) return;
    state.custom = state.custom.filter(c => c.id !== n.id); state.lines.forEach(l => l.stops = l.stops.filter(s => s !== n.id));
    NODES.splice(NODES.indexOf(n), 1); delete N[n.id]; pinned.delete(n.id);
    if(sel && sel.id === n.id) sel = null; if(SUG) computeSuggestions(); refresh(true); }
  else if(d.addStop){ addStop(d.addStop); showInfo(); }
  else if(d.startLine){ const l = newLine([d.startLine]); edit = {id:l.id, at:'end'}; sel = {kind:'line', id:l.id}; banner(); refresh(true); }
  else if(d.extend){ edit = {id:sel.id, at:d.extend}; banner(); refresh(true); }
  else if('done' in d){ edit = null; banner(); refresh(true); }
  else if(d.dropStop){ const l = lineById(sel.id); l.stops = l.stops.filter(s => s !== d.dropStop); refresh(true); }
  else if('reverse' in d){ const l = lineById(sel.id); l.stops.reverse(); refresh(true); }
  else if('dup' in d){ const l = lineById(sel.id); const c = newLine(l.stops.slice(), l.type, l.name + ' copy'); sel = {kind:'line', id:c.id}; refresh(true); }
  else if(d.delLine){ const l = lineById(d.delLine); if(!confirm(`Delete ${l.name}? This can’t be undone.`)) return;
    state.lines = state.lines.filter(x => x.id !== l.id); if(edit && edit.id === l.id) edit = null; sel = null; banner(); refresh(true); }
  else if(d.setType){ const l = lineById(sel.id); l.type = d.setType; state.types[l.type] = true; refresh(true); }
  else if(d.addSug){ const e2 = SUG.edges.find(x => x.id === d.addSug); const l = newLine([e2.a, e2.b], e2.type, `${N[e2.a].name}–${N[e2.b].name}`); sel = {kind:'line', id:l.id}; toast(`Added ${l.name}. Keep extending it, or click another suggestion.`); refresh(true); }
  else if(d.extendSug){ const e2 = SUG.edges.find(x => x.id === d.extendSug); const l = lineById(edit.id); const st = l.stops;
    const tail = edit.at === 'start' ? st[0] : st[st.length-1]; const other = tail === e2.a ? e2.b : e2.a;
    if(!st.includes(other)){ edit.at === 'start' ? st.unshift(other) : st.push(other); } sel = {kind:'line', id:l.id}; refresh(true); }
  else if(d.copyLine){ handoff([d.copyLine]); }
  else if('savePlace' in d){ savePlace(); }
  else if('cancelPlace' in d){ placing = null; svg.classList.remove('placing'); banner(); showInfo(); }
  else if(b.id === 'allOn'){ off.clear(); TYPE_ORDER.forEach(t => state.types[t] = true); refresh(true); }
  else if(b.id === 'allOff'){ ownLines().forEach(l => off.add(l.id)); refresh(true); }
  else if(b.id === 'newLine'){ const l = newLine([]); edit = {id:l.id, at:'end'}; sel = {kind:'line', id:l.id}; banner(); refresh(true); }
  else if(b.id === 'clearLines'){ if(!state.lines.length) return; if(!confirm(`Delete all ${state.lines.length} of your lines?`)) return; state.lines = []; edit = null; sel = null; banner(); refresh(true); }
  else if(b.id === 'addPlace'){ placing = {pt:null}; sel = null; svg.classList.add('placing'); banner(); showInfo(); render(); }
  else if(b.id === 'toBuilder'){ handoff(D.LINES.filter(l => !off.has(l.id) && state.types[l.type]).map(l => l.id)); }
  else if(b.id === 'exportBtn'){ exportNetwork(); }
  else if(b.id === 'importBtn'){ $('importFile').click(); }
  else if(b.id === 'resetBtn'){ if(!confirm('Clear your lines, added places and city changes, and start over?')) return;
    try{ localStorage.removeItem(KEY); }catch(err){} location.reload(); }
});
function handoff(ids){
  const lines = D.LINES.filter(l => ids.includes(l.id)).map(l => ({name:l.name, type:l.type, color:l.color, stops:l.stops, note:l.note, from:l.id}));
  try{ localStorage.setItem('txrail.handoff', JSON.stringify(lines)); location.href = 'build.html'; }
  catch(e){ toast('Your browser blocked saving. Use the builder’s starter sets instead.'); }
}

/* ---------- Map pointer handling ---------- */
const mapEl = $('map'), tip = $('tip');
let zoomT = 0;
function zoomed(){ clearTimeout(zoomT); zoomT = setTimeout(render, 140); }
function zoomAt(f, cx, cy){ const k = clamp(vp.k*f, vp.kFit*0.6, vp.kFit*14); f = k/vp.k; vp.x = cx-(cx-vp.x)*f; vp.y = cy-(cy-vp.y)*f; vp.k = k; applyView(); zoomed(); }
function fitView(){ const r = svg.getBoundingClientRect(); if(!r.width || !r.height) return; vp.kFit = Math.min(r.width/W, r.height/H)*0.97; vp.k = vp.kFit; vp.x = (r.width - W*vp.k)/2; vp.y = (r.height - H*vp.k)/2; applyView(); render(); }
svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY*0.0015), e.clientX-r.left, e.clientY-r.top); }, {passive:false});
const ptrs = new Map(); let dragged = false, down = null, pinchD = 0;
svg.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); if(ptrs.size === 1){ dragged = false; down = [e.clientX, e.clientY]; } });
window.addEventListener('pointermove', e => {
  if(!ptrs.has(e.pointerId)) return;
  const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if(ptrs.size === 1){
    if(!dragged && Math.hypot(e.clientX-down[0], e.clientY-down[1]) > 5){ dragged = true; svg.classList.add('dragging'); tip.hidden = true; }
    if(dragged){ vp.x += e.clientX-prev[0]; vp.y += e.clientY-prev[1]; applyView(); }
  } else if(ptrs.size === 2){
    dragged = true; const [a,b] = [...ptrs.values()], dd = Math.hypot(a[0]-b[0], a[1]-b[1]), r = svg.getBoundingClientRect();
    if(pinchD) zoomAt(dd/pinchD, (a[0]+b[0])/2-r.left, (a[1]+b[1])/2-r.top); pinchD = dd;
  }
});
const endPtr = e => { ptrs.delete(e.pointerId); if(ptrs.size < 2) pinchD = 0; if(!ptrs.size) svg.classList.remove('dragging'); };
window.addEventListener('pointerup', endPtr); window.addEventListener('pointercancel', endPtr);
$('zin').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1.4, r.width/2, r.height/2); };
$('zout').onclick = () => { const r = svg.getBoundingClientRect(); zoomAt(1/1.4, r.width/2, r.height/2); };
$('zfit').onclick = fitView;

svg.addEventListener('click', e => {
  if(dragged){ dragged = false; return; }
  const nodeEl = e.target.closest('[data-node]'), lineEl = e.target.closest('[data-line]'), sugEl = e.target.closest('[data-sug]');
  if(placing){
    if(nodeEl){ toast('Pick an empty spot, or click Cancel.'); return; }
    const r = svg.getBoundingClientRect(), m = [(e.clientX - r.left - vp.x)/vp.k, (e.clientY - r.top - vp.y)/vp.k];
    const g = state.t >= 0.5 ? m : geoFromDiagram(m), [lat, lon] = unproj(g[0], g[1]);
    placing.pt = {lat, lon}; placeForm(); return;
  }
  if(BUILD && edit && nodeEl){ const id = nodeEl.dataset.node; if(N[id].kind !== 'gateway') addStop(id); return; }
  if(nodeEl) select({kind:'node', id:nodeEl.dataset.node});
  else if(lineEl) select({kind:'line', id:lineEl.dataset.line});
  else if(sugEl) select({kind:'sug', id:sugEl.dataset.sug});
  else if(sel) select(null);
});
svg.addEventListener('pointermove', e => {
  if(dragged || ptrs.size > 1 || e.pointerType === 'touch'){ return; }
  const nodeEl = e.target.closest('[data-node]'), lineEl = e.target.closest('[data-line]'), sugEl = e.target.closest('[data-sug]');
  let text = '';
  if(nodeEl){ const n = N[nodeEl.dataset.node];
    text = n.kind === 'gateway' ? 'Continues to ' + n.name : n.pop ? `${n.name}, ${fmt(n.pop)}` : n.name;
    if(BUILD && edit){ const l = lineById(edit.id), st = l ? effStops(l) : []; const tail = edit.at === 'start' ? st[0] : st[st.length-1];
      if(tail && tail !== n.id && n.kind !== 'gateway'){ const mi = segMiles(tail, n.id), t = pairSuggestion(tail, n.id); text += `. ${fmt(mi)} mi from ${N[tail].name}${t ? `, suggests ${D.TYPES[t].name.toLowerCase()}` : ''}`; } } }
  else if(lineEl){ const l = lineById(lineEl.dataset.line); if(l) text = `${l.name}, ${l.base ? l.agency : typeInfo(l).name.toLowerCase()}`; }
  else if(sugEl){ const s = SUG && SUG.edges.find(x => x.id === sugEl.dataset.sug); if(s) text = `Suggested ${D.TYPES[s.type].name.toLowerCase()}: ${N[s.a].name} – ${N[s.b].name}`; }
  if(!text){ tip.hidden = true; return; }
  const r = mapEl.getBoundingClientRect();
  tip.textContent = text; tip.hidden = false;
  let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
  if(x + tip.offsetWidth > r.width - 8) x = e.clientX - r.left - tip.offsetWidth - 10;
  tip.style.transform = `translate(${x}px, ${y}px)`;
});
svg.addEventListener('pointerleave', () => tip.hidden = true);

/* ---------- Layout toggle and theme ---------- */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let anim = 0;
function setLayout(geo){
  const target = geo ? 1 : 0;
  $('btnDiagram').setAttribute('aria-pressed', String(!geo)); $('btnGeo').setAttribute('aria-pressed', String(geo));
  if(state.t === target) return;
  cancelAnimationFrame(anim); state.t = target; save();
  if(reduced){ render(); return; }
  const from = 1 - target, t0 = performance.now(), dur = 650;
  const step = now => { const u = Math.min(1, (now-t0)/dur), e = u < .5 ? 2*u*u : 1 - Math.pow(-2*u+2, 2)/2;
    state.t = u === 1 ? target : from + (target-from)*e; render(); if(u < 1) anim = requestAnimationFrame(step); };
  anim = requestAnimationFrame(step);
}
$('btnDiagram').onclick = () => setLayout(false);
$('btnGeo').onclick = () => setLayout(true);
$('btnDiagram').setAttribute('aria-pressed', String(state.t === 0)); $('btnGeo').setAttribute('aria-pressed', String(state.t === 1));
const root = document.documentElement;
const isDark = () => { const a = root.getAttribute('data-theme'); return a ? a === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
function themeBtn(){ $('btnTheme').textContent = isDark() ? 'Light map' : 'Dark map'; }
try{ const t = localStorage.getItem('txrail.theme'); if(t === 'light' || t === 'dark') root.setAttribute('data-theme', t); }catch(e){}
$('btnTheme').onclick = () => { const n = isDark() ? 'light' : 'dark'; root.setAttribute('data-theme', n); try{ localStorage.setItem('txrail.theme', n); }catch(e){} themeBtn(); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeBtn);
themeBtn();

/* ---------- Start ---------- */
sideSkeleton();
if(BUILD){
  $('newType').value = state.newType;
  try{
    const h = JSON.parse(localStorage.getItem('txrail.handoff') || 'null');
    if(Array.isArray(h) && h.length){
      localStorage.removeItem('txrail.handoff');
      const have = new Set(state.lines.map(l => l.from)); let n = 0;
      h.filter(validLine).forEach(l => { if(l.from && have.has(l.from)) return; newLine(l.stops.filter(s => N[s]), l.type, l.name, l.from, l.color).note = l.note || ''; n++; });
      setTimeout(() => toast(n ? `Added ${n} ${n === 1 ? 'line' : 'lines'} from the concept map.` : 'Those lines were already in your network.'), 300);
    }
  }catch(e){}
  if(state.showSug) computeSuggestions();
}
renderSide();
fitView();
render();
let lastW = 0;
window.addEventListener('resize', () => { const w = svg.getBoundingClientRect().width; if(Math.abs(w - lastW) > 40){ lastW = w; fitView(); } });
window.__txr = {render, computeSuggestions, state, N, NODES, get SUG(){ return SUG; }, look(id, m){ const r = svg.getBoundingClientRect(); vp.k = vp.kFit*m; const p = pos(N[id]); vp.x = r.width/2 - p[0]*vp.k; vp.y = r.height/2 - p[1]*vp.k; applyView(); render(); }};
})();
