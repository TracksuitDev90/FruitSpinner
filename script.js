// app.js

/* ---------- Config ---------- */
const ICON = (name) => `https://api.iconify.design/fluent-emoji/${encodeURIComponent(name.toLowerCase())}.svg`;
const unsplash = (id) => `https://images.unsplash.com/photo-${id}?q=80&w=2400&auto=format&fit=crop`;

/* Fruits (now includes Coconut; Apple is split visually but behaves as one pick) */
const FRUITS = [
  { name: 'Strawberry', base: '#df2b2b', photo: unsplash('0jRQ-_fM0gM'), icon: ICON('strawberry') },
  { name: 'Orange',     base: '#fb8c00', photo: unsplash('8ZGgg6rhzxs'), icon: ICON('tangerine') },
  { name: 'Lemon',      base: '#f2ce24', photo: unsplash('ihvcGNo_mUY'), icon: ICON('lemon') },
  { name: 'Lime',       base: '#3fa64b', photo: unsplash('HiNkYqYYUAM'), icon: ICON('lime') },
  { name: 'Blueberry',  base: '#2060c9', photo: unsplash('ZBZV975pMsg'), icon: ICON('blueberries') },
  { name: 'Grape',      base: '#7b3bb6', photo: unsplash('ixuOeZ_7TIY'), icon: ICON('grapes') },
  { name: 'Kiwi',       base: '#72b33f', photo: unsplash('jtMGK1RuaUA'), icon: ICON('kiwi-fruit') },
  { name: 'Watermelon', base: '#eb3a78', photo: unsplash('aFUHu9WNO3Q'), icon: ICON('watermelon') },
  { name: 'Mango',      base: '#ffb300', photo: unsplash('H-KyBAT6fxk'), icon: ICON('mango') },

  // Apple: split wedge (red/green) but one pick disables both halves
  {
    name: 'Apple',
    split: true,
    bases: ['#d62828', '#2aa74a'],
    photos: [unsplash('1543QZ5Y1DM'), unsplash('N2pzr8iZrcM')],
    icons:  [ICON('red-apple'), ICON('green-apple')],
    imgs:   [null, null],
    ready:  [false, false],
    subDisabled: [false, false] // visual; both become true when Apple is picked
  },

  // Coconut
  { name: 'Coconut', base: '#7a4f2a', photo: unsplash('151jV7yb9pU'), icon: ICON('coconut') },

  { name: 'Blackberry', base: '#4a148c', photo: unsplash('h1CC5tDk64o'), icon: ICON('blackberries') }
];

/* ---------- Fair RNG ---------- */
function secureRandomInt(n){
  if (n <= 0) return 0;
  const c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
  if (!c) return Math.floor(Math.random() * n);
  const max = 0xFFFFFFFF, lim = Math.floor(max/n)*n;
  const buf = new Uint32Array(1); let x;
  do { c.getRandomValues(buf); x = buf[0]; } while (x >= lim);
  return x % n;
}

/* ---------- Canvas & Elements ---------- */
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

const TWO_PI = Math.PI * 2;
const state = { dpr: Math.max(1, window.devicePixelRatio || 1), sizeCSS: 720, rotation: 0, spinning:false };

/* ---------- Responsive canvas ---------- */
function resizeCanvas(){
  const size = Math.min(720, Math.max(320, Math.min(window.innerWidth, window.innerHeight) * 0.92));
  state.sizeCSS = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  canvas.width  = Math.round(size * state.dpr);
  canvas.height = Math.round(size * state.dpr);
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  draw();
}
window.addEventListener('resize', resizeCanvas);

/* ---------- Image preload (robust for CodePen) ---------- */
let imagesLoading = 0;
FRUITS.forEach(f => {
  if (f.split){
    f.photos.forEach((url, i) => {
      imagesLoading++;
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.referrerPolicy = 'no-referrer';
      im.decoding = 'async';
      im.onload  = ()=>{ f.imgs[i] = im; f.ready[i] = true; if(--imagesLoading===0) draw(); };
      im.onerror = ()=>{ f.ready[i] = false; if(--imagesLoading===0) draw(); };
      im.src = url;
    });
  } else {
    imagesLoading++;
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.referrerPolicy = 'no-referrer';
    im.decoding = 'async';
    im.onload  = ()=>{ f.img = im; f.ready = true; if(--imagesLoading===0) draw(); };
    im.onerror = ()=>{ f.ready = false; if(--imagesLoading===0) draw(); };
    im.src = f.photo;
  }
});

/* ---------- Helpers ---------- */
function activeIndices(){
  const out = [];
  FRUITS.forEach((f,i) => {
    if (f.split){
      if (!(f.subDisabled[0] && f.subDisabled[1])) out.push(i);
    } else if (!f.disabled) out.push(i);
  });
  return out;
}
function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }
function pickLabelColor(hex){
  const [r,g,b] = hex.replace('#','').match(/.{1,2}/g).map(h=>parseInt(h,16)/255);
  const lum = 0.2126*r + 0.7152*g + 0.0722*b;
  return lum > 0.6 ? '#111' : '#fff';
}
function drawImageCover(img, r){
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max((r*2)/iw, (r*2)/ih);
  ctx.drawImage(img, -iw*s/2, -ih*s/2, iw*s, ih*s);
}

/* Curved, auto-fit label along outer ring */
function drawArcLabel(text, radius, centerAngle, arcAngle, color, maxHeight){
  const label = text.toUpperCase();
  let fontPx = Math.min(maxHeight, Math.floor(state.sizeCSS * 0.055));
  const pad = Math.max(6, state.sizeCSS * 0.012);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';

  let totalAngle;
  while (fontPx > 10){
    ctx.font = `700 ${fontPx}px Inter, system-ui, sans-serif`;
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

/* ---------- Render ---------- */
function draw(){
  const size = state.sizeCSS;
  const cx = size/2, cy = size/2;
  const R = size/2 * 0.96;
  const innerR = R * parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inner-coverage'));
  const ringThickness = R - innerR;
  const sliceAngle = TWO_PI / FRUITS.length;

  ctx.clearRect(0,0,size,size);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.rotation);

  // base disc
  ctx.beginPath(); ctx.arc(0,0,R,0,TWO_PI);
  const bgGrad = ctx.createRadialGradient(0,0,R*0.15, 0,0,R);
  bgGrad.addColorStop(0,'#0d111b'); bgGrad.addColorStop(1,'#090c13');
  ctx.fillStyle = bgGrad; ctx.fill();

  for (let i=0;i<FRUITS.length;i++){
    const f = FRUITS[i];
    const start = i * sliceAngle, end = start + sliceAngle, mid = start + sliceAngle/2;

    if (f.split){
      // two halves (red / green)
      const halves = [
        { a0: start, a1: mid, base: f.bases[0], img: f.imgs[0], ready: f.ready[0], disabled: f.subDisabled[0] },
        { a0: mid,   a1: end, base: f.bases[1], img: f.imgs[1], ready: f.ready[1], disabled: f.subDisabled[1] }
      ];
      halves.forEach(h => {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,innerR,h.a0,h.a1); ctx.closePath(); ctx.clip();
        if (h.ready && h.img){
          drawImageCover(h.img, innerR);
          const g = ctx.createRadialGradient(0,0,innerR*0.2, 0,0,innerR);
          g.addColorStop(0,'rgba(255,255,255,.045)'); g.addColorStop(1,'rgba(0,0,0,.22)');
          ctx.fillStyle = g; ctx.fillRect(-innerR,-innerR,innerR*2,innerR*2);
        } else {
          // subtle fallback pattern
          const off = document.createElement('canvas'); off.width = off.height = 32;
          const oc = off.getContext('2d');
          oc.fillStyle = h.base; oc.fillRect(0,0,32,32);
          oc.globalAlpha = 0.12; oc.fillStyle = '#fff';
          for(let j=0;j<26;j++){ oc.beginPath(); oc.arc(Math.random()*32, Math.random()*32, Math.random()*1.1+0.3, 0, TWO_PI); oc.fill(); }
          ctx.fillStyle = ctx.createPattern(off,'repeat'); ctx.fillRect(-innerR,-innerR,innerR*2,innerR*2);
        }
        ctx.restore();

        // ring wedge
        ctx.beginPath(); ctx.arc(0,0,R,h.a0,h.a1); ctx.arc(0,0,innerR,h.a1,h.a0,true); ctx.closePath();
        ctx.fillStyle = h.base; ctx.fill();

        // gray overlay for used half
        if (h.disabled){
          ctx.save();
          ctx.beginPath(); ctx.arc(0,0,R,h.a0,h.a1); ctx.lineTo(0,0); ctx.closePath(); ctx.clip();
          ctx.fillStyle = 'rgba(200,200,200,.60)'; ctx.fillRect(-R,-R,R*2,R*2);
          ctx.globalAlpha = 0.35; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
          for (let y=-R; y<R; y+=12){ ctx.beginPath(); ctx.moveTo(-R, y); ctx.lineTo(R, y+R*2); ctx.stroke(); }
          ctx.restore();
        }
      });

      // separator at center of Apple
      ctx.lineWidth = Math.max(1, size*0.002);
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(innerR*Math.cos(mid), innerR*Math.sin(mid)); ctx.stroke();

      // label "APPLE"
      const labelRadius = innerR + ringThickness * 0.60;
      const labelColor  = '#fff';
      drawArcLabel('Apple', labelRadius, mid, sliceAngle, labelColor, ringThickness * 0.70);

    } else {
      // inner photo
      ctx.save();
      ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0,innerR,start,end); ctx.closePath(); ctx.clip();
      if (f.ready && f.img){
        drawImageCover(f.img, innerR);
        const g = ctx.createRadialGradient(0,0,innerR*0.2, 0,0,innerR);
        g.addColorStop(0,'rgba(255,255,255,.045)'); g.addColorStop(1,'rgba(0,0,0,.22)');
        ctx.fillStyle = g; ctx.fillRect(-innerR,-innerR,innerR*2,innerR*2);
      } else {
        const off = document.createElement('canvas'); off.width = off.height = 32;
        const oc = off.getContext('2d');
        oc.fillStyle = f.base; oc.fillRect(0,0,32,32);
        oc.globalAlpha = 0.12; oc.fillStyle = '#fff';
        for(let j=0;j<26;j++){ oc.beginPath(); oc.arc(Math.random()*32, Math.random()*32, Math.random()*1.1+0.3, 0, TWO_PI); oc.fill(); }
        ctx.fillStyle = ctx.createPattern(off,'repeat'); ctx.fillRect(-innerR,-innerR,innerR*2,innerR*2);
      }
      ctx.restore();

      // ring
      ctx.beginPath(); ctx.arc(0,0,R,start,end); ctx.arc(0,0,innerR,end,start,true); ctx.closePath();
      ctx.fillStyle = f.base; ctx.fill();

      // separator
      ctx.lineWidth = Math.max(1, size*0.002);
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(innerR*Math.cos(start), innerR*Math.sin(start)); ctx.stroke();

      // label
      const labelRadius = innerR + ringThickness * 0.60;
      const labelColor  = pickLabelColor(f.base);
      drawArcLabel(f.name, labelRadius, mid, sliceAngle, labelColor, ringThickness * 0.70);

      // gray-out if disabled
      if (f.disabled){
        ctx.save();
        ctx.beginPath(); ctx.arc(0,0,R,start,end); ctx.lineTo(0,0); ctx.closePath(); ctx.clip();
        ctx.fillStyle = 'rgba(200,200,200,.60)'; ctx.fillRect(-R,-R,R*2,R*2);
        ctx.globalAlpha = 0.35; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
        for (let y=-R; y<R; y+=12){ ctx.beginPath(); ctx.moveTo(-R, y); ctx.lineTo(R, y+R*2); ctx.stroke(); }
        ctx.restore();
      }
    }
  }

  // bezel + hub
  ctx.lineWidth = Math.max(2, size*0.008);
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.arc(0,0,R,0,TWO_PI); ctx.stroke();

  const hubR = size * 0.14;
  const hubGrad = ctx.createRadialGradient(0,0,hubR*0.4, 0,0,hubR);
  hubGrad.addColorStop(0,'rgba(255,255,255,.22)'); hubGrad.addColorStop(1,'rgba(0,0,0,.28)');
  ctx.fillStyle = hubGrad; ctx.beginPath(); ctx.arc(0,0,hubR,0,TWO_PI); ctx.fill();

  ctx.restore();
}

/* ---------- Spin ---------- */
function normalizeAngle(a){
  a = a % TWO_PI; if (a > Math.PI) a -= TWO_PI; if (a < -Math.PI) a += TWO_PI;
  return a + TWO_PI * (4 + secureRandomInt(4));
}

function spin(){
  if (state.spinning) return;
  const choices = activeIndices();
  if (!choices.length){ statusEl.textContent = 'All fruits have been chosen.'; return; }

  const pick = choices[secureRandomInt(choices.length)];
  const sliceAngle = TWO_PI / FRUITS.length;
  const targetCenter = pick * sliceAngle + sliceAngle/2;
  const baseTarget = -Math.PI/2 - targetCenter;

  const startRotation = state.rotation;
  const delta = normalizeAngle(baseTarget - startRotation);
  const duration = 5200 + secureRandomInt(1200);

  const t0 = performance.now();
  state.spinning = true; spinBtn.disabled = true; statusEl.textContent = 'Spinning…';

  function frame(now){
    const t = Math.min(1, (now - t0) / duration);
    const eased = easeOutCubic(t);
    state.rotation = startRotation + delta * eased;
    draw();

    if (t < 1){ requestAnimationFrame(frame); }
    else{
      state.rotation = startRotation + delta; draw();

      const f = FRUITS[pick];
      if (f.split){
        // Apple chosen → disable both halves; user decides red/green IRL
        f.subDisabled = [true, true];
        afterPick('Apple', f, ['#d62828','#2aa74a'], f.icons);
      } else {
        f.disabled = true;
        afterPick(f.name, f, [f.base], [f.icon]);
      }
    }
  }
  requestAnimationFrame(frame);
}

/* ---------- Modal ---------- */
function openModal(title, border, icons){
  modalTitle.textContent = title;

  // border: single color or two-color gradient (Apple)
  if (border.length === 2){
    modalPanel.style.borderImage = `linear-gradient(90deg, ${border[0]} 0 50%, ${border[1]} 50% 100%) 1`;
  } else {
    modalPanel.style.borderImage = 'unset';
    modalPanel.style.borderColor = border[0];
  }

  // icons container (1 or 2)
  modalIcons.innerHTML = '';
  icons.forEach(src => {
    const img = new Image();
    img.src = src; img.alt = '';
    modalIcons.appendChild(img);
  });

  modal.hidden = false;
  modalOk.focus();
}

function afterPick(label, fruit, borderColors, iconList){
  persistDisabled();
  draw();

  const remaining = activeIndices().length;
  statusEl.textContent = `${label} selected. ${remaining} remaining.`;
  state.spinning = false;
  spinBtn.disabled = remaining === 0;

  openModal(label, borderColors, iconList);
}

modalOk.addEventListener('click', () => { modal.hidden = true; });
modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

/* ---------- Persistence ---------- */
function persistDisabled(){
  const data = FRUITS.map(f => f.split ? { split:true, sub:f.subDisabled } : !!f.disabled);
  localStorage.setItem('simsFruitDisabled_v3', JSON.stringify(data));
}
function restoreDisabled(){
  // v3 preferred; v2 fallback if you used a prior build
  const raw = localStorage.getItem('simsFruitDisabled_v3') || localStorage.getItem('simsFruitDisabled_v2');
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

/* ---------- Controls ---------- */
spinBtn.addEventListener('click', spin);
resetBtn.addEventListener('click', () => {
  FRUITS.forEach(f => { if (f.split) f.subDisabled = [false,false]; else f.disabled = false; });
  localStorage.removeItem('simsFruitDisabled_v3');
  state.rotation = 0; state.spinning = false;
  spinBtn.disabled = false; statusEl.textContent = '';
  draw();
});

/* ---------- Init ---------- */
restoreDisabled();
resizeCanvas();
draw();
