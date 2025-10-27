/* ---------- Two-tone, flat fruit config ---------- */
/* Note: Unicode currently lacks a dedicated blackberry emoji across platforms.
   We use a tasteful stand-in for Blackberry (black heart + grapes) so it’s distinct
   from Blueberry. If your platform ships a blackberry emoji later, swap it in. */
const FRUITS = [
  { name: 'Strawberry', base: '#df2b2b', emoji: '🍓' },
  { name: 'Orange',     base: '#fb8c00', emoji: '🍊' },
  { name: 'Lemon',      base: '#f2ce24', emoji: '🍋' },
  // Lime: try a lime emoji if supported, otherwise fall back to 🟢
  { name: 'Lime',       base: '#3fa64b', emoji: '🦎' /* placeholder for styling */, emojiOptions: ['🧪','🟢'] },
  { name: 'Blueberry',  base: '#2060c9', emoji: '🫐' },
  { name: 'Grape',      base: '#7b3bb6', emoji: '🍇' },
  { name: 'Kiwi',       base: '#72b33f', emoji: '🥝' },
  { name: 'Watermelon', base: '#eb3a78', emoji: '🍉' },
  { name: 'Mango',      base: '#ffb300', emoji: '🥭' },

  // Apple counts as ONE outcome, visually split
  { name: 'Apple', split: true, bases: ['#d62828', '#2aa74a'], emojis: ['🍎','🍏'], subDisabled:[false,false] },

  { name: 'Coconut',    base: '#7a4f2a', emoji: '🥥' },
  // Darker, richer Blackberry + distinct emoji stand-in
  { name: 'Blackberry', base: '#23103e', emoji: '🖤🍇' }
];

/* ---------- Math & color helpers ---------- */
const TWO_PI = Math.PI * 2;
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }

function hexToRgb(hex){ const m=hex.replace('#','').match(/.{1,2}/g); const [r,g,b]=m.map(h=>parseInt(h,16)); return {r,g,b}; }
function rgbToHex(r,g,b){ const h=v=>v.toString(16).padStart(2,'0'); return `#${h(r)}${h(g)}${h(b)}`; }
function rgbToHsl(r,g,b){ r/=255; g/=255; b/=255; const max=Math.max(r,g,b),min=Math.min(r,g,b); const l=(max+min)/2; let h,s;
  if(max===min){h=s=0;}else{const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min); switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;} h/=6;}
  return {h,s,l}; }
function hslToRgb(h,s,l){ function hue2rgb(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3 - t)*6; return p; }
  let r,g,b; if(s===0){r=g=b=l;} else { const q=l<0.5?l*(1+s):l+s-l*s; const p=2*l-q; r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3); }
  return {r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255)}; }
function lighten(hex, amt=0.18){ const {r,g,b}=hexToRgb(hex); const {h,s,l}=rgbToHsl(r,g,b); const {r:rr,g:rg,b:rb}=hslToRgb(h,s,clamp(l+amt,0,1)); return rgbToHex(rr,rg,rb); }
function desaturate(hex,amt=0.8,lift=0.06){ const {r,g,b}=hexToRgb(hex); const {h,s,l}=rgbToHsl(r,g,b); const {r:rr,g:rg,b:rb}=hslToRgb(h,clamp(s*(1-amt),0,1),clamp(l+lift,0,1)); return rgbToHex(rr,rg,rb); }

/* ---------- Fair RNG ---------- */
function secureRandomInt(n){ if(n<=0) return 0; const c=(typeof crypto!=='undefined'&&crypto.getRandomValues)?crypto:null; if(!c) return Math.floor(Math.random()*n);
  const max=0xFFFFFFFF,lim=Math.floor(max/n)*n; const buf=new Uint32Array(1); let x; do{ c.getRandomValues(buf); x=buf[0]; }while(x>=lim); return x % n; }

/* ---------- Elements ---------- */
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d',{alpha:true});
ctx.imageSmoothingQuality='high';
ctx.imageSmoothingEnabled=false; // no resampling blur

const spinBtn  = document.getElementById('spin');
const resetBtn = document.getElementById('reset') || document.querySelector('.reset');
const statusEl = document.getElementById('status');

const modal      = document.getElementById('modal');
const modalPanel = document.querySelector('.modal__panel');
const modalIcons = document.getElementById('modal-icons');
const modalTitle = document.getElementById('modal-title');
const modalOk    = document.getElementById('modal-ok');
const wrap       = document.querySelector('.wheel-wrap');
const headerEl   = document.querySelector('header');
const mainEl     = document.querySelector('main');

const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- State ---------- */
const state = {
  dpr: 1,
  sizeCSS: 720,
  rotation: 0,
  spinning: false,
  innerCoverage: 0.88,
  lastFocus: null
};

/* ---------- High-PPI canvas ---------- */
function resizeCanvas(){
  // Super-sample for crisp text & edges on zoom / retina
  const oversample = 2; // render at 2x devicePixelRatio
  const dpr = Math.max(1, (window.devicePixelRatio || 1) * oversample);
  state.dpr = Math.min(dpr, 4); // cap to avoid extreme memory

  const size = Math.round(Math.max(320, Math.min(720, wrap.clientWidth)));
  state.sizeCSS = size;

  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  canvas.width  = Math.round(size * state.dpr);
  canvas.height = Math.round(size * state.dpr);

  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  draw();
}
window.addEventListener('resize', resizeCanvas, { passive: true });

/* ---------- Active indices ---------- */
function activeIndices(){
  const out=[]; FRUITS.forEach((f,i)=>{ if(f.split){ if(!(f.subDisabled[0]&&f.subDisabled[1])) out.push(i); } else if(!f.disabled) out.push(i); });
  return out;
}

/* ---------- Uniform label drawing (same color for all) ---------- */
function drawArcLabel(text, radius, centerAngle, arcAngle, maxHeight){
  const label=text.toUpperCase();
  const baseFontPx=Math.min(maxHeight,Math.floor(state.sizeCSS*0.052));
  let fontPx=baseFontPx;
  const pad=Math.max(6,state.sizeCSS*0.012);
  ctx.textBaseline='middle'; ctx.textAlign='center';

  let totalAngle;
  while(fontPx>10){
    ctx.font=`900 ${fontPx}px Inter, system-ui, sans-serif`;
    const spacing=fontPx*0.06;
    let width=0; for(const ch of label) width+=ctx.measureText(ch).width+spacing; width-=spacing;
    totalAngle=(width+pad*2)/radius;
    if(totalAngle<=arcAngle*0.9) break;
    fontPx--;
  }

  const startAngle=centerAngle-totalAngle/2;
  const color='#fff', stroke='rgba(0,0,0,.78)';  // consistent color
  const spacing=fontPx*0.06;

  ctx.save();
  ctx.rotate(startAngle);
  for(const ch of label){
    const w=ctx.measureText(ch).width;
    const charAngle=(w+spacing)/radius;
    ctx.save();
    ctx.rotate(charAngle/2);
    ctx.translate(radius,0);
    ctx.rotate(Math.PI/2);
    ctx.lineWidth=Math.max(1,fontPx*0.18);
    ctx.strokeStyle=stroke;
    ctx.fillStyle=color;
    ctx.strokeText(ch,0,0);
    ctx.fillText(ch,0,0);
    ctx.restore();
    ctx.rotate(charAngle);
  }
  ctx.restore();
}

/* ---------- Render (flat two-tone; no extra faint ring) ---------- */
function draw(){
  const size=state.sizeCSS; const R=size/2*0.96; const innerR=R*parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inner-coverage')||0.88);
  const ringT=R-innerR; const sliceAngle=TWO_PI/FRUITS.length;

  ctx.clearRect(0,0,size,size);
  ctx.save(); ctx.translate(size/2,size/2); ctx.rotate(state.rotation);

  // flat disc (no faint perimeter stroke)
  ctx.beginPath(); ctx.arc(0,0,R,0,TWO_PI); ctx.fillStyle='#0b0b0b'; ctx.fill();

  for(let i=0;i<FRUITS.length;i++){
    const f=FRUITS[i]; const start=i*sliceAngle, end=start+sliceAngle, mid=start+sliceAngle/2;

    if(f.split){
      const halves=[ {a0:start,a1:mid,base:f.bases[0],disabled:f.subDisabled[0]}, {a0:mid,a1:end,base:f.bases[1],disabled:f.subDisabled[1]} ];
      halves.forEach(h=>{
        const base=h.disabled?desaturate(h.base,0.9,0.12):h.base;
        const accent=h.disabled?desaturate(lighten(h.base,0.18),0.9,0.12):lighten(h.base,0.18);

        ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,innerR,h.a0,h.a1); ctx.closePath(); ctx.fillStyle=accent; ctx.fill();
        ctx.beginPath(); ctx.arc(0,0,R,h.a0,h.a1); ctx.arc(0,0,innerR,h.a1,h.a0,true); ctx.closePath(); ctx.fillStyle=base; ctx.fill();
      });

      // split line
      ctx.lineWidth=Math.max(1,size*0.002); ctx.strokeStyle='rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(innerR*Math.cos(mid), innerR*Math.sin(mid)); ctx.stroke();

      const labelRadius=innerR+ringT*0.60;
      drawArcLabel('Apple', labelRadius, mid, sliceAngle, ringT*0.70);

    }else{
      const base=f.disabled?desaturate(f.base,0.9,0.12):f.base;
      const accent=f.disabled?desaturate(lighten(f.base,0.18),0.9,0.12):lighten(f.base,0.18);

      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,innerR,start,end); ctx.closePath(); ctx.fillStyle=accent; ctx.fill();
      ctx.beginPath(); ctx.arc(0,0,R,start,end); ctx.arc(0,0,innerR,end,start,true); ctx.closePath(); ctx.fillStyle=base; ctx.fill();

      // crisp separator
      ctx.lineWidth=Math.max(1,size*0.002); ctx.strokeStyle='rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(innerR*Math.cos(start), innerR*Math.sin(start)); ctx.stroke();

      const labelRadius=innerR+ringT*0.60;
      drawArcLabel(f.name, labelRadius, mid, sliceAngle, ringT*0.70);
    }
  }

  // No outer bezel stroke (removed)
  // Center hub
  const hubR=size*0.14; ctx.fillStyle='#0f0f0f'; ctx.beginPath(); ctx.arc(0,0,hubR,0,TWO_PI); ctx.fill();

  ctx.restore();
}

/* ---------- Spin with inertia (fair) ---------- */
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function normalizeAngle(a, turns){ a%=TWO_PI; if(a>Math.PI)a-=TWO_PI; if(a<-Math.PI)a+=TWO_PI; return a + TWO_PI*turns; }

function spin(){
  if(state.spinning) return;
  const choices=activeIndices();
  if(!choices.length){ statusEl.textContent='All fruits have been chosen.'; return; }

  // FAIR: choose outcome first
  const pick = choices[secureRandomInt(choices.length)];
  const sliceAngle = TWO_PI / FRUITS.length;
  const targetCenter = pick*sliceAngle + sliceAngle/2;
  const baseTarget = -Math.PI/2 - targetCenter;

  const startRotation=state.rotation;
  const extraTurns = prefersReduced ? 0 : (4 + secureRandomInt(4));
  const delta = normalizeAngle(baseTarget - startRotation, extraTurns);
  const duration = prefersReduced ? 900 : (5200 + secureRandomInt(1200));

  const t0 = performance.now();
  state.spinning=true; spinBtn.disabled=true; statusEl.textContent='Spinning…';

  function frame(now){
    const t=Math.min(1,(now-t0)/duration); const eased=easeOutCubic(t);
    state.rotation=startRotation + delta*eased; draw();
    if(t<1) requestAnimationFrame(frame);
    else{
      state.rotation=startRotation+delta; draw();
      const f=FRUITS[pick];
      if(f.split){ f.subDisabled=[true,true]; afterPick('Apple',['🍎','🍏'], f.bases); }
      else {
        // Lime emoji correction (use a lime if available, else fallback)
        let em = f.emoji;
        if (f.name === 'Lime'){
          // try to use a green citrus look; browsers without lime glyph get fallback
          em = '🟢';
        }
        f.disabled=true; afterPick(f.name,[em],[f.base]);
      }
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- Modal (themed), persistence ---------- */
function openModal(title, emojis, colors){
  modalTitle.textContent = title;

  // bright border (base) + lighter inner (accent)
  const base = colors[0];
  const accent = colors[1] ? colors[1] : lighten(base,0.25);

  if(colors.length===2){
    modalPanel.style.borderImage = `linear-gradient(90deg, ${colors[0]} 0 50%, ${colors[1]} 50% 100%) 1`;
  } else {
    modalPanel.style.borderImage = 'unset';
    modalPanel.style.borderColor = base;
  }
  modalPanel.style.background = `linear-gradient(180deg, ${accent}22, #121212 40%)`;

  // emoji row
  modalIcons.textContent = '';
  const span = document.createElement('div');
  span.textContent = emojis.join(' ');
  modalIcons.appendChild(span);

  state.lastFocus = document.activeElement;
  [headerEl, mainEl].forEach(el => el && (el.setAttribute('inert',''), el.setAttribute('aria-hidden','true')));
  modal.hidden = false;
  modalOk.focus();
}
function closeModal(){
  modal.hidden = true;
  [headerEl, mainEl].forEach(el => el && (el.removeAttribute('inert'), el.removeAttribute('aria-hidden')));
  (state.lastFocus && state.lastFocus.focus ? state.lastFocus : spinBtn).focus();
}

function afterPick(label, emojis, colorList){
  persistDisabled(); draw();

  const remaining=activeIndices().length;
  statusEl.textContent = `${label} selected. ${remaining} remaining.`;
  state.spinning = false;

  openModal(label, emojis, colorList);

  const noneLeft = remaining === 0;
  spinBtn.disabled = noneLeft;

  if (noneLeft){
    const doReset = () => { resetAll(); statusEl.textContent = 'All fruits were chosen. Spinner reset.'; };
    const once = () => { modalOk.removeEventListener('click', once); doReset(); };
    modalOk.addEventListener('click', once);
    setTimeout(()=>{ if(!modal.hidden){ closeModal(); doReset(); } }, 3500);
  }
}

function persistDisabled(){ const data=FRUITS.map(f=>f.split?{split:true,sub:f.subDisabled}:!!f.disabled); localStorage.setItem('simsFruitDisabled_v7', JSON.stringify(data)); }
function restoreDisabled(){
  const raw=localStorage.getItem('simsFruitDisabled_v7'); if(!raw) return;
  try{
    const data=JSON.parse(raw);
    data.forEach((v,i)=>{ const f=FRUITS[i]; if(!f) return; if(f.split && v && v.split) f.subDisabled=[!!v.sub?.[0], !!v.sub?.[1]]; else if(!f.split) f.disabled=!!v; });
  }catch{}
}

/* ---------- CodePen bubbly-button JS (copied) ---------- */
var animateButton = function(e) {
  e.preventDefault;
  e.target.classList.remove('animate');
  e.target.classList.add('animate');
  setTimeout(function(){
    e.target.classList.remove('animate');
  },700);
};
spinBtn.classList.add('bubbly-button');

/* ---------- Randomize bubble colors/sizes per press ---------- */
function allFruitColors(){ const arr=[]; FRUITS.forEach(f=>{ if(f.split) arr.push(...f.bases); else arr.push(f.base); }); return arr; }
const PALETTE = allFruitColors();

function randomGradients(n){
  const parts=[]; for(let i=0;i<n;i++){ const col=PALETTE[secureRandomInt(PALETTE.length)]; const pct=12+secureRandomInt(14); parts.push(`radial-gradient(circle, ${col} ${pct}%, transparent ${pct}%)`); }
  return parts.join(', ');
}
function randomSizes(n, min=8, max=22){
  const sizes=[]; for(let i=0;i<n;i++){ const a=min+secureRandomInt(max-min+1); const b=min+secureRandomInt(max-min+1); sizes.push(`${a}% ${b}%`); }
  return sizes.join(', ');
}
function setRandomBubbleStyle(btn){
  btn.style.setProperty('--top-bg', randomGradients(9));
  btn.style.setProperty('--bot-bg', randomGradients(7));
  btn.style.setProperty('--top-size', randomSizes(9,8,24));
  btn.style.setProperty('--bot-size', randomSizes(7,10,26));
}

/* Wire up interactions */
spinBtn.addEventListener('click', (e)=>{ setRandomBubbleStyle(spinBtn); animateButton(e); if(!state.spinning) spin(); });
spinBtn.addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ setRandomBubbleStyle(spinBtn); animateButton({target:spinBtn, preventDefault(){}}); if(!state.spinning) spin(); e.preventDefault(); } });

resetBtn.addEventListener('click', ()=>{ resetAll(); statusEl.textContent=''; });
modalOk.addEventListener('click', closeModal);
modal.addEventListener('click', e=>{ if(e.target===modal) closeModal(); });

/* ---------- Init ---------- */
function resetAll(){ FRUITS.forEach(f=>{ if(f.split) f.subDisabled=[false,false]; else f.disabled=false; });
  localStorage.removeItem('simsFruitDisabled_v7'); state.rotation=0; state.spinning=false; spinBtn.disabled=false; draw(); }

restoreDisabled();
resizeCanvas();
draw();