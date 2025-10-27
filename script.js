/* ---------- Two-tone, flat fruit config ---------- */
const FRUITS = [
  { name: 'Strawberry', base: '#df2b2b', emoji: '🍓' },
  { name: 'Orange',     base: '#fb8c00', emoji: '🍊' },
  { name: 'Lemon',      base: '#f2ce24', emoji: '🍋' },
  { name: 'Lime',       base: '#3fa64b', emoji: '🟢' },
  { name: 'Blueberry',  base: '#2060c9', emoji: '🫐' },
  { name: 'Grape',      base: '#7b3bb6', emoji: '🍇' },
  { name: 'Kiwi',       base: '#72b33f', emoji: '🥝' },
  { name: 'Watermelon', base: '#eb3a78', emoji: '🍉' },
  { name: 'Mango',      base: '#ffb300', emoji: '🥭' },

  // Apple is a single slice with two-tone halves (red/green),
  // but counts as ONE pick for fairness.
  {
    name: 'Apple',
    split: true,
    bases: ['#d62828', '#2aa74a'],
    emojis: ['🍎','🍏'],
    subDisabled: [false, false]
  },

  { name: 'Coconut', base: '#7a4f2a', emoji: '🥥' },
  { name: 'Blackberry', base: '#4a148c', emoji: '🫐' }
];

/* ---------- Math & color helpers ---------- */
const TWO_PI = Math.PI * 2;
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function hexToRgb(hex){
  const m = hex.replace('#','').match(/.{1,2}/g);
  const [r,g,b] = m.map(h => parseInt(h,16));
  return {r,g,b};
}
function rgbToHex(r,g,b){
  const h = (v)=> v.toString(16).padStart(2,'0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
function rgbToHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const l = (max+min)/2;
  let h, s;
  if (max===min){ h=s=0; }
  else{
    const d = max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      case b: h = (r-g)/d + 4; break;
    }
    h/=6;
  }
  return {h, s, l};
}
function hslToRgb(h,s,l){
  function hue2rgb(p,q,t){
    if(t<0) t+=1; if(t>1) t-=1;
    if(t<1/6) return p+(q-p)*6*t;
    if(t<1/2) return q;
    if(t<2/3) return p+(q-p)*(2/3 - t)*6;
    return p;
  }
  let r,g,b;
  if(s===0){ r=g=b=l; }
  else{
    const q = l<0.5 ? l*(1+s) : l+s-l*s;
    const p = 2*l-q;
    r = hue2rgb(p,q,h+1/3);
    g = hue2rgb(p,q,h);
    b = hue2rgb(p,q,h-1/3);
  }
  return { r: Math.round(r*255), g: Math.round(g*255), b: Math.round(b*255) };
}
function lighten(hex, amt=0.18){
  const {r,g,b} = hexToRgb(hex);
  const {h,s,l} = rgbToHsl(r,g,b);
  const {r:rr,g:rg,b:rb} = hslToRgb(h, s, clamp(l+amt,0,1));
  return rgbToHex(rr,rg,rb);
}
function desaturate(hex, amt=0.8, lift=0.05){
  const {r,g,b} = hexToRgb(hex);
  const {h,s,l} = rgbToHsl(r,g,b);
  const {r:rr,g:rg,b:rb} = hslToRgb(h, clamp(s*(1-amt),0,1), clamp(l+lift,0,1));
  return rgbToHex(rr,rg,rb);
}
function pickLabelColor(hex){
  const {r,g,b} = hexToRgb(hex);
  const lum = 0.2126*(r/255) + 0.7152*(g/255) + 0.0722*(b/255);
  return lum > 0.6 ? '#111' : '#fff';
}

/* ---------- Fair RNG (uniform over active slices) ---------- */
function secureRandomInt(n){
  if (n <= 0) return 0;
  const c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
  if (!c) return Math.floor(Math.random() * n);
  const max = 0xFFFFFFFF, lim = Math.floor(max/n)*n;
  const buf = new Uint32Array(1); let x;
  do { c.getRandomValues(buf); x = buf[0]; } while (x >= lim);
  return x % n;
}

/* ---------- Elements ---------- */
const canvas = document.getElementById('wheel');
const ctx = canvas.getContext('2d', { alpha: true });
ctx.imageSmoothingQuality = 'high';

const spinBtn   = document.getElementById('spin');
const resetBtn  = document.getElementById('reset');
const statusEl  = document.getElementById('status');

const modal      = document.getElementById('modal');
const modalPanel = document.querySelector('.modal__panel');
const modalIcons = document.getElementById('modal-icons');
const modalTitle = document.getElementById('modal-title');
const modalOk    = document.getElementById('modal-ok');
const headerEl   = document.querySelector('header');
const mainEl     = document.querySelector('main');
const wrap       = document.querySelector('.wheel-wrap');

let rafId = null;
const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- State ---------- */
const state = {
  dpr: Math.max(1, window.devicePixelRatio || 1),
  sizeCSS: 720,
  rotation: 0,
  spinning: false,
  innerCoverage: 0.88,
  lastFocus: null
};

function readCSSVars(){
  const v = getComputedStyle(document.documentElement).getPropertyValue('--inner-coverage');
  const n = parseFloat(v || '0.88');
  state.innerCoverage = Number.isFinite(n) ? n : 0.88;
}

/* ---------- Active indices (uniform probability) ---------- */
function activeIndices(){
  const out = [];
  FRUITS.forEach((f,i) => {
    if (f.split){
      if (!(f.subDisabled[0] && f.subDisabled[1])) out.push(i); // Apple counts once
    } else if (!f.disabled) out.push(i);
  });
  return out;
}

/* ---------- Curved label drawing ---------- */
function drawArcLabel(text, radius, centerAngle, arcAngle, color, maxHeight){
  const label = text.toUpperCase();
  let fontPx = Math.min(maxHeight, Math.floor(state.sizeCSS * 0.055));
  const pad = Math.max(6, state.sizeCSS * 0.012);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';

  let totalAngle;
  while (fontPx > 10){
    ctx.font = `800 ${fontPx}px Inter, system-ui, sans-serif`;
    const spacing = fontPx * 0.06;
    let width = 0;
    for (const ch of label) width += ctx.measureText(ch).width + spacing;
    width -= spacing;
    totalAngle = (width + pad*2) / radius;
    if (totalAngle <= arcAngle * 0.9) break;
    fontPx--;
  }

  const startAngle = centerAngle - totalAngle/2;
  const stroke = (color === '#fff') ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.55)';
  const spacing = fontPx * 0.06;

  ctx.save();
  ctx.rotate(startAngle);
  for (const ch of label){
    const w = ctx.measureText(ch).width;
    const charAngle = (w + spacing) / radius;
    ctx.save();
    ctx.rotate(charAngle/2);
    ctx.translate(radius, 0);
    ctx.rotate(Math.PI/2);
    ctx.lineWidth = Math.max(1, fontPx * 0.16);
    ctx.strokeStyle = stroke;
    ctx.fillStyle = color;
    ctx.strokeText(ch, 0, 0);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    ctx.rotate(charAngle);
  }
  ctx.restore();
}

/* ---------- Responsive canvas ---------- */
function resizeCanvas(){
  state.dpr = Math.max(1, window.devicePixelRatio || 1);
  const size = Math.round(Math.max(320, Math.min(720, wrap.clientWidth)));
  state.sizeCSS = size;

  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  canvas.width  = Math.round(size * state.dpr);
  canvas.height = Math.round(size * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);

  readCSSVars();
  draw();
}
window.addEventListener('resize', resizeCanvas, { passive: true });

/* ---------- Render (flat two-tone) ---------- */
function draw(){
  const size = state.sizeCSS;
  const cx = size/2, cy = size/2;
  const R = size/2 * 0.96;
  const innerR = R * state.innerCoverage;
  const ringT = R - innerR;
  const sliceAngle = TWO_PI / FRUITS.length;

  ctx.clearRect(0,0,size,size);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.rotation);

  // matte disc
  ctx.beginPath(); ctx.arc(0,0,R,0,TWO_PI);
  ctx.fillStyle = '#0b0b0b'; ctx.fill();

  for (let i=0;i<FRUITS.length;i++){
    const f = FRUITS[i];
    const start = i*sliceAngle, end = start + sliceAngle, mid = start + sliceAngle/2;

    if (f.split){
      const halves = [
        { a0: start, a1: mid, base: f.bases[0], disabled: f.subDisabled[0] },
        { a0: mid,   a1: end, base: f.bases[1], disabled: f.subDisabled[1] }
      ];
      halves.forEach(h=>{
        const fillBase = h.disabled ? desaturate(h.base, 0.9, 0.12) : h.base;
        const fillAccent = h.disabled ? desaturate(lighten(h.base,0.18), 0.9, 0.12) : lighten(h.base,0.18);

        // inner flat sector (accent)
        ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,innerR,h.a0,h.a1); ctx.closePath();
        ctx.fillStyle = fillAccent; ctx.fill();

        // ring wedge (base)
        ctx.beginPath(); ctx.arc(0,0,R,h.a0,h.a1); ctx.arc(0,0,innerR,h.a1,h.a0,true); ctx.closePath();
        ctx.fillStyle = fillBase; ctx.fill();
      });

      // center split line
      ctx.lineWidth = Math.max(1, size*0.002);
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(innerR*Math.cos(mid), innerR*Math.sin(mid)); ctx.stroke();

      // label
      const labelRadius = innerR + ringT * 0.60;
      drawArcLabel('Apple', labelRadius, mid, sliceAngle, '#fff', ringT * 0.70);

    } else {
      const base = f.disabled ? desaturate(f.base, 0.9, 0.12) : f.base;
      const accent = f.disabled ? desaturate(lighten(f.base,0.18), 0.9, 0.12) : lighten(f.base,0.18);

      // inner accent sector
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,innerR,start,end); ctx.closePath();
      ctx.fillStyle = accent; ctx.fill();

      // ring base
      ctx.beginPath(); ctx.arc(0,0,R,start,end); ctx.arc(0,0,innerR,end,start,true); ctx.closePath();
      ctx.fillStyle = base; ctx.fill();

      // separator
      ctx.lineWidth = Math.max(1, size*0.002);
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(innerR*Math.cos(start), innerR*Math.sin(start)); ctx.stroke();

      // label
      const labelRadius = innerR + ringT * 0.60;
      drawArcLabel(f.name, labelRadius, mid, sliceAngle, pickLabelColor(base), ringT * 0.70);
    }
  }

  // bezel + hub
  ctx.lineWidth = Math.max(2, size*0.008);
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.arc(0,0,R,0,TWO_PI); ctx.stroke();

  const hubR = size * 0.14;
  ctx.fillStyle = '#0f0f0f';
  ctx.beginPath(); ctx.arc(0,0,hubR,0,TWO_PI); ctx.fill();

  ctx.restore();
}

/* ---------- Spin with inertia (fair; target chosen first) ---------- */
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

function normalizeAngle(a, extraTurns){
  a = a % TWO_PI; if (a > Math.PI) a -= TWO_PI; if (a < -Math.PI) a += TWO_PI;
  return a + TWO_PI * extraTurns;
}

function spin(){
  if (state.spinning) return;

  const choices = activeIndices(); // uniform distribution over remaining fruits
  if (!choices.length){ statusEl.textContent = 'All fruits have been chosen.'; return; }

  // Choose outcome FIRST (fair), then animate toward its center
  const pick = choices[secureRandomInt(choices.length)];
  const sliceAngle = TWO_PI / FRUITS.length;
  const targetCenter = pick * sliceAngle + sliceAngle/2;
  const baseTarget = -Math.PI/2 - targetCenter;

  const startRotation = state.rotation;
  const extraTurns = prefersReduced ? 0 : (4 + secureRandomInt(4)); // feel of weight
  const delta = normalizeAngle(baseTarget - startRotation, extraTurns);
  const duration = prefersReduced ? 900 : (5200 + secureRandomInt(1200));

  // button tactile state
  // handled via pointer listeners; but ensure quick visual if keyboard
  spinBtn.classList.add('pressed');

  const t0 = performance.now();
  state.spinning = true;
  spinBtn.disabled = true;
  statusEl.textContent = 'Spinning…';

  if (rafId) cancelAnimationFrame(rafId);
  const frame = (now) => {
    const t = Math.min(1, (now - t0) / duration);
    const eased = easeOutCubic(t);
    state.rotation = startRotation + delta * eased;
    draw();

    if (t < 1){
      rafId = requestAnimationFrame(frame);
    } else {
      state.rotation = startRotation + delta; draw();

      const f = FRUITS[pick];
      if (f.split){
        f.subDisabled = [true, true]; // Apple: both halves unavailable until reset
        afterPick('Apple', ['🍎','🍏'], f.bases);
      } else {
        f.disabled = true;
        afterPick(f.name, [f.emoji], [f.base]);
      }
    }
  };
  rafId = requestAnimationFrame(frame);
}

/* ---------- Modal (themed), focus trap, inert page ---------- */
function setAppInert(isInert){
  [headerEl, mainEl].forEach(el => {
    if (!el) return;
    if (isInert){ el.setAttribute('inert',''); el.setAttribute('aria-hidden','true'); }
    else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
  });
}
function focusTrapHandler(e){
  if (e.key !== 'Tab') return;
  const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const list = Array.from(focusables).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);
  if (!list.length) return;
  const first = list[0], last = list[list.length-1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
function keyCloseHandler(e){ if (e.key === 'Escape') closeModal(); }

function openModal(title, emojis, colors){
  modalTitle.textContent = title;

  const base = colors[0];
  const accent = colors[1] ? colors[1] : lighten(base,0.25);

  // Theme the panel (border + subtle bg tint)
  if (colors.length === 2){
    modalPanel.style.borderImage = `linear-gradient(90deg, ${colors[0]} 0 50%, ${colors[1]} 50% 100%) 1`;
  } else {
    modalPanel.style.borderImage = 'unset';
    modalPanel.style.borderColor = base;
  }
  modalPanel.style.background = `linear-gradient(180deg, ${accent}22, #121212 40%)`;

  // Emoji row
  modalIcons.textContent = '';
  const span = document.createElement('div');
  span.textContent = emojis.join(' ');
  modalIcons.appendChild(span);

  state.lastFocus = document.activeElement;
  setAppInert(true);
  modal.hidden = false;
  document.addEventListener('keydown', focusTrapHandler);
  document.addEventListener('keydown', keyCloseHandler);
  modalOk.focus();
}
function closeModal(){
  modal.hidden = true;
  setAppInert(false);
  document.removeEventListener('keydown', focusTrapHandler);
  document.removeEventListener('keydown', keyCloseHandler);
  (state.lastFocus && typeof state.lastFocus.focus === 'function' ? state.lastFocus : spinBtn).focus();
}

/* After pick: update status, auto-reset when done */
function afterPick(label, emojis, colorList){
  persistDisabled();
  draw();

  const remaining = activeIndices().length;
  statusEl.textContent = `${label} selected. ${remaining} remaining.`;
  state.spinning = false;

  openModal(label, emojis, colorList);

  const noneLeft = remaining === 0;
  spinBtn.disabled = noneLeft;

  if (noneLeft){
    // Auto reset after the user acknowledges the modal, or after a short delay fallback
    const doReset = () => {
      resetAll();
      statusEl.textContent = 'All fruits were chosen. Spinner reset.';
    };
    const once = () => { modalOk.removeEventListener('click', once); doReset(); };
    modalOk.addEventListener('click', once);
    setTimeout(()=>{ if (!modal.hidden){ closeModal(); doReset(); } }, 3500);
  }
}

/* ---------- Persistence ---------- */
function persistDisabled(){
  const data = FRUITS.map(f => f.split ? { split:true, sub:f.subDisabled } : !!f.disabled);
  localStorage.setItem('simsFruitDisabled_v4', JSON.stringify(data));
}
function restoreDisabled(){
  const raw = localStorage.getItem('simsFruitDisabled_v4');
  if (!raw) return;
  try{
    const data = JSON.parse(raw);
    data.forEach((v,i) => {
      const f = FRUITS[i]; if (!f) return;
      if (f.split && v && v.split) f.subDisabled = [!!v.sub?.[0], !!v.sub?.[1]];
      else if (!f.split) f.disabled = !!v;
    });
  }catch{}
}

/* ---------- Controls & init ---------- */
function resetAll(){
  FRUITS.forEach(f => { if (f.split) f.subDisabled = [false,false]; else f.disabled = false; });
  localStorage.removeItem('simsFruitDisabled_v4');
  state.rotation = 0; state.spinning = false;
  spinBtn.disabled = false; draw();
}

spinBtn.addEventListener('click', spin);
resetBtn.addEventListener('click', () => { resetAll(); statusEl.textContent = ''; });

/* Tactile press + ripple (mouse & touch) */
function pressStart(ev){
  const rect = spinBtn.getBoundingClientRect();
  const x = (ev.clientX ?? (ev.touches && ev.touches[0].clientX)) - rect.left;
  const y = (ev.clientY ?? (ev.touches && ev.touches[0].clientY)) - rect.top;
  spinBtn.style.setProperty('--rx', `${x}px`);
  spinBtn.style.setProperty('--ry', `${y}px`);
  spinBtn.classList.add('pressed');
  spinBtn.classList.remove('rippling');
  // trigger reflow to restart animation cleanly
  // eslint-disable-next-line no-unused-expressions
  spinBtn.offsetTop;
  spinBtn.classList.add('rippling');
}
function pressEnd(){
  spinBtn.classList.remove('pressed');
}
spinBtn.addEventListener('pointerdown', pressStart);
spinBtn.addEventListener('pointerup', pressEnd);
spinBtn.addEventListener('pointerleave', pressEnd);
spinBtn.addEventListener('pointercancel', pressEnd);

modalOk.addEventListener('click', closeModal);
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

/* Boot */
restoreDisabled();
readCSSVars();
resizeCanvas();
draw();