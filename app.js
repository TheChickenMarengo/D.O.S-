(function () {
  const $ = id => document.getElementById(id);
  const body = document.body, editor = $('editor'), root = document.documentElement, scroller = $('scroller');
  const K = { idx:'dos-writer-index', snaps:'dos-writer-snaps-', body:'dos-writer-doc-', comf:'dos-writer-comfort', num:'dos-writer-numbered', lastbk:'dos-writer-lastbackup', fsize:'dos-writer-fsize', lspace:'dos-writer-lspace', ksound:'dos-writer-ksound', doc:'dos-writer-doc', name:'dos-writer-name', theme:'dos-writer-theme', mode:'dos-writer-mode', tc:'dos-writer-textcolor', imgs:'dos-writer-images', capstyle:'dos-writer-capstyle', detail:'dos-writer-detail', notes:'dos-writer-notes', crt:'dos-writer-crt', boot:'dos-writer-boot', events:'dos-writer-events', people:'dos-writer-people' };
  let syncHook = null;
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { return false; } if (syncHook) syncHook(k); return true; }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  let msgTimer;
  function flash(t) { const m = $('msg'); m.textContent = t; m.classList.add('show'); clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('show'), 2200); }

  // ---------- option lists ----------
  const THEMES = [['blue','Default'],['amber','Amber'],['green','Green'],['grey','Grey'],['parchment','Parchment'],['ocean','Ocean'],['midnight','Midnight'],['rose','Rose'],['paper','Paper'],['matrix','Matrix'],['lcd','LCD'],['c64','C64'],['vt320','VT320'],['brutalist','Brutalist'],['crypt','Crypt'],['bubblegum','Bubblegum']];
  const PALETTE = [['#ff5555','Red'],['#ff9a3c','Orange'],['#e8b84a','Gold'],['#ffff55','Yellow'],['#55ff55','Green'],['#2fb8c4','Teal'],['#55ffff','Cyan'],['#5599ff','Blue'],['#8a4fd6','Violet'],['#ff77ff','Pink'],['#ffffff','White'],['#aaaaaa','Grey']];
  const CAP_STYLES = [['braille','Braille'],['dither','Dithered'],['solid','Solid'],['outline','Outline'],['illum','Illuminated'],['deco','Art deco'],['victorian','Victorian'],['midcentury','Mid-century'],['pixel','8-bit pixel'],['glitch','Glitch']];
  const DETAILS = [['120','120px'],['200','200px'],['320','320px'],['480','480px']];
  const DISPLAY_W = { 120:420, 200:600, 320:720, 480:820 };
  function fill(sel, head, list) { sel.innerHTML = (head ? '<option value="">' + head + '</option>' : '') + list.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join(''); }
  fill($('theme'), '', THEMES.map(([k, l]) => [k, '/' + l.toLowerCase()]));
  fill($('capstyle'), '', CAP_STYLES.map(([k, l]) => [k, 'cap:' + l.toLowerCase()]));
  fill($('capcolour'), 'cap colour', PALETTE);
  fill($('wordcolour'), 'colour sel', PALETTE.concat([['clear', 'clear colour']]));
  fill($('textcolor'), 'text:theme', PALETTE);
  fill($('detail'), '', DETAILS.map(([k, l]) => [k, 'img:' + l]));
  fill($('fsize'), '', ['16','18','20','22','24','28'].map(n => [n, 'size:' + n]));
  fill($('lspace'), '', [['1.4','lh:1.4'],['1.6','lh:1.6'],['1.8','lh:1.8'],['2','lh:2.0']]);

  // ---------- colour + theme helpers ----------
  function cssVar(n) { return getComputedStyle(root).getPropertyValue(n).trim(); }
  function hex2rgb(h) { h = String(h || '').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); if (isNaN(n)) return [255, 255, 255]; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = c => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  function isLight() { const [r, g, b] = hex2rgb(cssVar('--bg')); return (0.299 * r + 0.587 * g + 0.114 * b) > 140; }

  // ---------- state ----------
  let capStyle = load(K.capstyle) || 'braille';
  let images = [];
  try { images = JSON.parse(load(K.imgs) || '[]'); } catch (e) { images = []; }
  let selImg = null, saved = null, selKeep = null, lib = null;

  // ---------- block helpers ----------
  const isImg = b => !!b && b.classList.contains('img');
  const txtOf = b => b.querySelector('.txt');
  const blocks = () => Array.from(editor.children);
  const br = () => document.createElement('br');
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function toHTML(str) { return esc(str).replace(/\[#([0-9a-fA-F]{6})\]([\s\S]*?)\[\/\]/g, '<span class="c" data-c="$1" style="color:#$1">$2</span>'); }
  function setTxt(txt, str) { txt.innerHTML = toHTML(str) || '<br>'; }
  function txtStr(txt) {
    let s = '';
    txt.childNodes.forEach(n => {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeName === 'BR') { /* none */ }
      else if (n.classList && n.classList.contains('c') && n.dataset.c) s += '[#' + n.dataset.c + ']' + n.textContent + '[/]';
      else s += n.textContent;
    });
    return s.replace(/ /g, ' ');
  }
  function normalize(txt) {
    txt.querySelectorAll('.c').forEach(s => { if (!s.textContent) s.remove(); });
    txt.normalize();
    if (txt.textContent.length) txt.querySelectorAll('br').forEach(x => x.remove());
    else if (!txt.firstChild) txt.appendChild(br());
  }
  const blen = b => isImg(b) ? 1 : txtOf(b).textContent.length;
  function blockPlain(b) { const cap = b.querySelector('.cap'); return (cap ? cap.dataset.l : '') + txtOf(b).textContent; }

  // ---------- drop caps: fine-grid pixel letters ----------
  const GC = 56, GR = 64, S = 2, EXT = 3;
  const inkCache = {};
  const CAP_FONT = '"Space Grotesk","Helvetica Neue",Arial,sans-serif';
  function capInk(ch) {
    if (inkCache[ch]) return inkCache[ch];
    const SS = 6, cw = GC * SS, chh = GR * SS;
    const c = document.createElement('canvas'); c.width = cw; c.height = chh;
    const g = c.getContext('2d');
    g.font = '700 100px ' + CAP_FONT;
    const capH = g.measureText('H').actualBoundingBoxAscent || 70;
    let fs = 100 * (chh * 0.80) / capH;
    g.font = '700 ' + fs + 'px ' + CAP_FONT;
    let m = g.measureText(ch), w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    if (w > cw * 0.92) { fs *= cw * 0.92 / w; g.font = '700 ' + fs + 'px ' + CAP_FONT; m = g.measureText(ch); w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight; }
    const asc = g.measureText('H').actualBoundingBoxAscent;
    g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(ch, (cw - w) / 2 + m.actualBoundingBoxLeft, (chh + asc) / 2);
    const px = g.getImageData(0, 0, cw, chh).data;
    const ink = new Uint8Array(GC * GR);
    for (let y = 0; y < GR; y++) for (let x = 0; x < GC; x++) {
      let sum = 0;
      for (let yy = 0; yy < SS; yy++) for (let xx = 0; xx < SS; xx++) sum += px[((y * SS + yy) * cw + (x * SS + xx)) * 4 + 3];
      ink[y * GC + x] = sum / (SS * SS * 255) > 0.5 ? 1 : 0;
    }
    return (inkCache[ch] = ink);
  }
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function paintCap(sp) {
    sp.classList.toggle('flat', !!FRAMED[capStyle]);
    if (FRAMED[capStyle]) { paintFramed(sp); return; }
    if (capStyle === 'braille') { paintBraille(sp); return; }
    const cv = sp.firstChild, ch = sp.dataset.l.toUpperCase();
    const A = hex2rgb(sp.dataset.c), B = hex2rgb(cssVar('--accent'));
    const ink = capInk(ch), W = (GC + EXT) * S, H = (GR + EXT) * S;
    cv.width = W; cv.height = H; cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.style.imageRendering = '';
    sp.dataset.h = H + 18; capVar(sp.parentNode);
    const g = cv.getContext('2d'); g.clearRect(0, 0, W, H);
    const at = (x, y) => x >= 0 && y >= 0 && x < GC && y < GR && ink[y * GC + x] === 1;
    if (capStyle !== 'outline') {
      g.fillStyle = rgb(mix(A, [0, 0, 0], 0.62));
      for (let y = 0; y < GR; y++) for (let x = 0; x < GC; x++) if (at(x, y)) for (let k = 1; k <= EXT; k++) g.fillRect((x + k) * S, (y + k) * S, S, S);
    }
    for (let y = 0; y < GR; y++) for (let x = 0; x < GC; x++) {
      if (!at(x, y)) continue;
      const edge = !at(x, y - 1) || !at(x - 1, y) || !at(x + 1, y) || !at(x, y + 1);
      let col;
      if (capStyle === 'outline') {
        if (edge) col = A; else if (((x + y) & 3) === 0) col = mix(A, [0, 0, 0], 0.45); else continue;
      } else if (capStyle === 'solid') {
        col = A;
      } else {
        const t = (y / GR) * 0.75 + (x / GC) * 0.25;
        col = t > (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? B : A;
      }
      if (capStyle !== 'outline') {
        if (!at(x, y - 1) || !at(x - 1, y)) col = mix(col, [255, 255, 255], 0.45);
        else if (!at(x + 1, y) || !at(x, y + 1)) col = mix(col, [0, 0, 0], 0.3);
        else if (y % 4 === 3) col = mix(col, [0, 0, 0], 0.16);
      }
      g.fillStyle = rgb(col); g.fillRect(x * S, y * S, S, S);
    }
  }
  // Framed drop cap styles: drawn on a canvas with web fonts, coloured from the paragraph colour and the theme accent.
  const FRAMED = {
    illum: { font: '"Eagle Lake",Georgia,serif', w: 118, h: 126 },
    deco: { font: '"Limelight",Georgia,serif', w: 112, h: 124 },
    victorian: { font: '"Abril Fatface",Georgia,serif', w: 104, h: 116 },
    midcentury: { font: '"Archivo Black","Arial Black",sans-serif', w: 0, h: 112 },
    pixel: { font: '"Press Start 2P","Courier New",monospace', w: 100, h: 100 },
    glitch: { font: '"Rubik Glitch","Arial Black",sans-serif', w: 110, h: 120 }
  };
  const FRAMED_SPECS = ['48px "Eagle Lake"', '48px "Limelight"', '48px "Abril Fatface"', '48px "Archivo Black"', '48px "Press Start 2P"', '48px "Rubik Glitch"'];
  // size the glyph so a capital H is capTarget tall (shrunk to maxW if wider), centred on the origin
  function fitCap(g, ch, fam, capTarget, maxW, snap) {
    g.font = '100px ' + fam;
    const capH = g.measureText('H').actualBoundingBoxAscent || 70;
    let fs = 100 * capTarget / capH;
    g.font = fs + 'px ' + fam; let m = g.measureText(ch), gw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    if (maxW && gw > maxW) { fs *= maxW / gw; }
    if (snap) fs = Math.max(snap, Math.round(fs / snap) * snap);
    g.font = fs + 'px ' + fam; m = g.measureText(ch); gw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const ca = g.measureText('H').actualBoundingBoxAscent;
    return { fs, gw, dx: -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, dy: ca / 2 };
  }
  function paintFramed(sp) {
    const st = FRAMED[capStyle], cv = sp.firstChild, ch = sp.dataset.l.toUpperCase(), fam = st.font;
    const A = hex2rgb(sp.dataset.c), B = hex2rgb(cssVar('--accent')), BG = hex2rgb(cssVar('--bg') || '#000');
    const dpr = window.devicePixelRatio || 1, K0 = [0, 0, 0];
    let W = st.w, H = st.h;
    if (capStyle === 'midcentury') { const mg = document.createElement('canvas').getContext('2d'); W = Math.max(64, Math.round(fitCap(mg, ch, fam, 84, 0).gw) + 16); }
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cv.style.imageRendering = capStyle === 'pixel' ? 'pixelated' : 'auto';
    sp.dataset.h = H + 4; capVar(sp.parentNode);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = capStyle !== 'pixel'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const put = (f, cx, cy, fill) => { g.fillStyle = fill; g.fillText(ch, cx + f.dx, cy + f.dy); };
    const grad = (c1, c2) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0.15, rgb(c1)); gr.addColorStop(1, rgb(c2)); return gr; };
    if (capStyle === 'illum') {
      const G = mix(B, K0, 0.62);
      g.fillStyle = rgb(G); g.fillRect(0, 0, W, H);
      g.fillStyle = rgb(mix(G, A, 0.22));
      for (let y = 16; y < H - 10; y += 8) for (let x = 16 + ((y / 8 | 0) % 2) * 4; x < W - 10; x += 8) { g.beginPath(); g.arc(x, y, 1, 0, 6.3); g.fill(); }
      g.strokeStyle = rgb(A); g.lineWidth = 2; g.strokeRect(3, 3, W - 6, H - 6);
      g.strokeStyle = rgb(B); g.lineWidth = 1; g.strokeRect(8.5, 8.5, W - 17, H - 17);
      g.strokeStyle = rgb(mix(A, G, 0.3)); g.lineWidth = 1.2;
      [[16, 16, 0], [W - 16, 16, 1.57], [W - 16, H - 16, 3.14], [16, H - 16, 4.71]].forEach(([x, y, r]) => {
        g.beginPath(); for (let t = 0; t < 12.5; t += 0.25) { const rr = 0.8 * t; g.lineTo(x + rr * Math.cos(t + r), y + rr * Math.sin(t + r)); } g.stroke();
      });
      g.fillStyle = rgb(A);
      [[3, 3], [W - 3, 3], [3, H - 3], [W - 3, H - 3]].forEach(([x, y]) => { g.save(); g.translate(x, y); g.rotate(0.7854); g.fillRect(-4, -4, 8, 8); g.restore(); });
      const f = fitCap(g, ch, fam, H - 58, W - 52);
      put(f, W / 2 + 1.5, H / 2 + 1.5, rgb(mix(A, K0, 0.6))); put(f, W / 2, H / 2, grad(A, mix(A, B, 0.55)));
    } else if (capStyle === 'deco') {
      const G = mix(B, K0, 0.84), c = 14;
      const oct = i => { g.beginPath(); [[i + c, i], [W - i - c, i], [W - i, i + c], [W - i, H - i - c], [W - i - c, H - i], [i + c, H - i], [i, H - i - c], [i, i + c]].forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
      g.save(); oct(1); g.fillStyle = rgb(G); g.fill(); g.clip();
      g.strokeStyle = rgb(A); g.globalAlpha = 0.2; g.lineWidth = 1;
      for (let a = -80; a <= 80; a += 10) { const r = a * Math.PI / 180; g.beginPath(); g.moveTo(W / 2, H + 8); g.lineTo(W / 2 + Math.sin(r) * 190, H + 8 - Math.cos(r) * 190); g.stroke(); }
      g.restore();
      oct(2); g.strokeStyle = rgb(A); g.lineWidth = 2; g.stroke();
      oct(8); g.strokeStyle = rgb(B); g.lineWidth = 1; g.stroke();
      const f = fitCap(g, ch, fam, H - 60, W - 50);
      put(f, W / 2 + 2, H / 2 + 2, rgb(mix(A, K0, 0.65))); put(f, W / 2, H / 2, rgb(A));
    } else if (capStyle === 'victorian') {
      g.fillStyle = rgb(mix(BG, A, 0.07)); g.fillRect(0, 0, W, H);
      g.strokeStyle = rgb(A); g.lineWidth = 3; g.strokeRect(2, 2, W - 4, H - 4);
      g.lineWidth = 1; g.strokeRect(9.5, 9.5, W - 19, H - 19);
      g.fillStyle = rgb(B); [[9.5, 9.5], [W - 9.5, 9.5], [9.5, H - 9.5], [W - 9.5, H - 9.5]].forEach(([x, y]) => g.fillRect(x - 3, y - 3, 6, 6));
      const f = fitCap(g, ch, fam, H - 52, W - 44);
      put(f, W / 2, H / 2, rgb(A));
    } else if (capStyle === 'midcentury') {
      const f = fitCap(g, ch, fam, 84, 0), cx = W / 2, cy = (H - 16) / 2;
      put(f, cx + 3, cy + 3, rgb(mix(B, K0, 0.55))); put(f, cx, cy, rgb(B));
      g.fillStyle = rgb(A); g.fillRect(0, H - 8, W, 5);
    } else if (capStyle === 'pixel') {
      const SH = 6, BW = W - SH, BH = H - SH, G = mix(B, K0, 0.8);
      g.fillStyle = rgb(mix(A, K0, 0.6)); g.fillRect(SH, SH, BW, BH);
      g.fillStyle = rgb(G); g.fillRect(0, 0, BW, BH);
      g.fillStyle = rgb(A); g.fillRect(0, 0, BW, 4); g.fillRect(0, BH - 4, BW, 4); g.fillRect(0, 0, 4, BH); g.fillRect(BW - 4, 0, 4, BH);
      g.fillStyle = rgb(B); [[4, 4], [BW - 8, 4], [4, BH - 8], [BW - 8, BH - 8]].forEach(([x, y]) => g.fillRect(x, y, 4, 4));
      const f = fitCap(g, ch, fam, 48, 0, 8);
      put(f, BW / 2 + 4, BH / 2 + 4, rgb(mix(B, K0, 0.4))); put(f, BW / 2, BH / 2, rgb(A));
    } else if (capStyle === 'glitch') {
      g.fillStyle = rgb(mix(B, K0, 0.88)); g.fillRect(0, 0, W, H);
      g.strokeStyle = rgb(B); g.lineWidth = 1; g.strokeRect(0.5, 0.5, W - 1, H - 1);
      g.fillStyle = rgb(B); g.fillRect(8, 0, 26, 4); g.fillStyle = rgb(A); g.fillRect(W - 34, H - 4, 26, 4);
      const f = fitCap(g, ch, fam, H - 50, W - 34), cx = W / 2, cy = H / 2, sd = ch.charCodeAt(0);
      put(f, cx + 4, cy, rgb(B)); put(f, cx - 1, cy, rgb(A));
      [[20 + (sd % 5) * 9, 7, 7], [Math.round(H * 0.58) + (sd % 3) * 7, 5, -6]].forEach(([by, bh, dx]) => {
        g.save(); g.beginPath(); g.rect(0, by, W, bh); g.clip(); put(f, cx + dx, cy, rgb(A)); g.restore();
      });
      g.fillStyle = 'rgba(0,0,0,.28)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    }
  }
  function capVar(b) {
    const c = b && b.querySelector && b.querySelector('.cap');
    if (c && c.dataset.h) b.style.setProperty('--caph', c.dataset.h + 'px');
  }
  // Braille drop caps: the letter is sampled onto a dot grid (2 x 4 dots per braille cell), cropped to its own
  // bounding box with an equal margin on every side, then drawn as round dots so it lines up on every device.
  const dotCache = {};
  const DOT = 3, DOT_CAP = 40, DOT_M = 3, GX = 1.5, GY = 1.5;
  function dotInk(ch) {
    if (ch in dotCache) return dotCache[ch];
    const SS = 6, cw = 90 * SS, chh = (DOT_CAP + 20) * SS;
    const c = document.createElement('canvas'); c.width = cw; c.height = chh;
    const g = c.getContext('2d');
    g.font = '700 100px ' + CAP_FONT;
    const capH = g.measureText('H').actualBoundingBoxAscent || 70;
    const fs = 100 * (DOT_CAP * SS) / capH;
    g.font = '700 ' + fs + 'px ' + CAP_FONT;
    const m = g.measureText(ch);
    g.fillStyle = '#000'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(ch, 6 * SS + m.actualBoundingBoxLeft, (chh + DOT_CAP * SS) / 2);
    const px = g.getImageData(0, 0, cw, chh).data;
    let x0 = cw, x1 = -1, y0 = chh, y1 = -1;
    for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
      if (px[(y * cw + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return (dotCache[ch] = null);
    const w0 = Math.ceil((x1 - x0 + 1) / SS), h0 = Math.ceil((y1 - y0 + 1) / SS);
    let wt = w0 + 2 * DOT_M; if (wt % 2) wt++;
    const ht = Math.ceil((h0 + 2 * DOT_M) / 4) * 4;
    const padX = (wt - w0) >> 1, padY = (ht - h0) >> 1;
    const ink = new Uint8Array(wt * ht);
    for (let y = 0; y < h0; y++) for (let x = 0; x < w0; x++) {
      let sum = 0;
      for (let yy = 0; yy < SS; yy++) for (let xx = 0; xx < SS; xx++) {
        const px_ = x0 + x * SS + xx, py_ = y0 + y * SS + yy;
        if (px_ < cw && py_ < chh) sum += px[(py_ * cw + px_) * 4 + 3];
      }
      if (sum / (SS * SS * 255) > 0.5) ink[(y + padY) * wt + x + padX] = 1;
    }
    return (dotCache[ch] = { w: wt, h: ht, ink });
  }
  function paintBraille(sp) {
    const cv = sp.firstChild, d = dotInk(sp.dataset.l.toUpperCase());
    const A = hex2rgb(sp.dataset.c), B = hex2rgb(cssVar('--accent'));
    if (!d) { cv.width = 1; cv.height = 1; sp.dataset.h = 40; capVar(sp.parentNode); return; }
    const W = d.w * DOT + (d.w / 2) * GX, H = d.h * DOT + (d.h / 4) * GY, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.style.imageRendering = 'auto';
    sp.dataset.h = Math.round(H + 18); capVar(sp.parentNode);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
      if (!d.ink[y * d.w + x]) continue;
      g.fillStyle = rgb(mix(A, B, (y / d.h) * 0.85));
      g.beginPath();
      g.arc(x * DOT + Math.floor(x / 2) * GX + DOT / 2, y * DOT + Math.floor(y / 4) * GY + DOT / 2, 1.25, 0, 6.2832);
      g.fill();
    }
  }
  function makeCap(letter, colour) {
    const s = document.createElement('span');
    s.className = 'cap'; s.contentEditable = 'false'; s.dataset.l = letter; s.dataset.c = colour;
    s.appendChild(document.createElement('canvas'));
    paintCap(s); return s;
  }

  // ---------- pixel images ----------
  const imgEls = {};
  function paintPic(b) {
    const cv = b.querySelector('canvas'), tag = b.querySelector('.imgtag'), im = images[+b.dataset.id];
    if (!im) { b.classList.add('missing'); tag.textContent = '[missing image ' + b.dataset.id + ']'; cv.width = 1; cv.height = 1; return; }
    b.classList.remove('missing'); tag.textContent = '[image ' + b.dataset.id + ' - Backspace/Delete to remove]';
    let el = imgEls[b.dataset.id];
    if (!el) { el = imgEls[b.dataset.id] = new Image(); el.onload = () => paintPic(b); el.src = im.src; }
    if (!el.complete || !el.naturalWidth) return;
    cv.width = im.w; cv.height = im.h; cv.style.width = Math.min(im.dw || im.w * 3, editor.clientWidth || 9999) + 'px';
    const g = cv.getContext('2d'), fg = cssVar('--fg') || '#fff';
    const normal = (im.v === 2) === !isLight();
    g.clearRect(0, 0, im.w, im.h);
    if (normal) { g.drawImage(el, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = fg; g.fillRect(0, 0, im.w, im.h); }
    else { g.fillStyle = fg; g.fillRect(0, 0, im.w, im.h); g.globalCompositeOperation = 'destination-out'; g.drawImage(el, 0, 0); }
    g.globalCompositeOperation = 'source-over';
  }
  function repaintAll() {
    editor.querySelectorAll('.cap').forEach(paintCap);
    editor.querySelectorAll('.blk.img').forEach(paintPic);
    if (typeof repaintNoteImgs === 'function') repaintNoteImgs();
  }
  // Greyscale -> auto levels -> light sharpen -> Atkinson dither -> 1-bit alpha mask (ink = bright areas)
  function makeImage(file, done) {
    const rd = new FileReader();
    rd.onerror = () => flash('COULD NOT READ IMAGE');
    rd.onload = () => {
      const img = new Image();
      img.onerror = () => flash('COULD NOT READ IMAGE');
      img.onload = () => {
        const W0 = +$('detail').value;
        let w = W0, h = Math.round(img.height / img.width * W0);
        if (h > W0 * 1.6) { h = Math.round(W0 * 1.6); w = Math.max(8, Math.round(img.width / img.height * h)); }
        h = Math.max(8, h);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
        const d = g.getImageData(0, 0, w, h), N = w * h;
        let gray = new Float32Array(N);
        const hist = new Uint32Array(256);
        for (let i = 0; i < N; i++) { const v = 0.299 * d.data[i * 4] + 0.587 * d.data[i * 4 + 1] + 0.114 * d.data[i * 4 + 2]; gray[i] = v; hist[Math.min(255, v | 0)]++; }
        let lo = 0, hi = 255, acc = 0;
        for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > N * 0.01) { lo = i; break; } }
        acc = 0;
        for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > N * 0.01) { hi = i; break; } }
        if (hi - lo < 10) { lo = 0; hi = 255; }
        for (let i = 0; i < N; i++) gray[i] = Math.max(0, Math.min(255, (gray[i] - lo) / (hi - lo) * 255));
        const blur = new Float32Array(N);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let s = 0, n = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += gray[yy * w + xx]; n++; } }
          blur[y * w + x] = s / n;
        }
        for (let i = 0; i < N; i++) gray[i] = Math.max(0, Math.min(255, gray[i] + 0.7 * (gray[i] - blur[i])));
        const out = g.createImageData(w, h);
        const spread = (x, y, e) => { if (x >= 0 && x < w && y < h) gray[y * w + x] += e; };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const i = y * w + x, old = gray[i], nw = old < 128 ? 0 : 255, e = (old - nw) / 8;
          spread(x + 1, y, e); spread(x + 2, y, e); spread(x - 1, y + 1, e); spread(x, y + 1, e); spread(x + 1, y + 1, e); spread(x, y + 2, e);
          out.data[i * 4 + 3] = nw ? 255 : 0;
        }
        g.clearRect(0, 0, w, h); g.putImageData(out, 0, 0);
        done({ src: c.toDataURL('image/png'), w: w, h: h, dw: DISPLAY_W[W0] || w * 3, v: 2 });
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(file);
  }

  // ---------- doc <-> blocks ----------
  function createBlock(line) {
    const b = document.createElement('div');
    let m = /^\[img:(\d+)\]$/.exec(line);
    if (m) {
      b.className = 'blk img'; b.contentEditable = 'false'; b.dataset.id = m[1];
      makeImgParts(b);
      const t = document.createElement('div'); t.className = 'imgtag'; b.appendChild(t);
      paintPic(b); return b;
    }
    b.className = 'blk';
    const txt = document.createElement('div'); txt.className = 'txt';
    const d = /^\[dc:([0-9a-fA-F]{6})\]([\s\S])([\s\S]*)$/.exec(line);
    if (d) { b.classList.add('dc'); b.appendChild(makeCap(d[2], '#' + d[1])); capVar(b); setTxt(txt, d[3]); }
    else setTxt(txt, line);
    b.appendChild(txt);
    return b;
  }
  function blockLine(b) {
    if (isImg(b)) return '[img:' + b.dataset.id + ']';
    const cap = b.querySelector('.cap');
    return (cap ? '[dc:' + cap.dataset.c.slice(1) + ']' + cap.dataset.l : '') + txtStr(txtOf(b));
  }
  function serialize() { return blocks().map(blockLine).join('\n'); }
  function plainText() { return blocks().map(b => isImg(b) ? '[image]' : blockPlain(b)).join('\n'); }
  function loadDoc(str) {
    selImg = null; editor.innerHTML = '';
    String(str || '').replace(/\r\n?/g, '\n').split('\n').forEach(l => editor.appendChild(createBlock(l)));
    ensureTail();
  }
  function ensureTail() {
    if (!editor.lastElementChild) editor.appendChild(createBlock(''));
    if (isImg(editor.lastElementChild)) editor.appendChild(createBlock(''));
  }
  function fix() {
    if (!editor.childNodes.length) { editor.appendChild(createBlock('')); setCaret(editor.firstElementChild, 0); return; }
    Array.from(editor.childNodes).forEach(n => {
      const ok = n.nodeType === 1 && n.classList.contains('blk') && (isImg(n) || n.querySelector(':scope > .txt'));
      if (!ok) editor.replaceChild(createBlock(n.textContent || ''), n);
    });
  }

  // ---------- caret + selection ----------
  function blockOfNode(n) { while (n && n !== editor) { if (n.parentNode === editor) return n; n = n.parentNode; } return null; }
  function curRange() { const s = getSelection(); if (s.rangeCount && editor.contains(s.anchorNode)) return s.getRangeAt(0); return saved; }
  function curBlock() {
    const r = curRange(); if (!r) return null;
    if (r.startContainer === editor) { const ch = editor.children; return ch[Math.min(r.startOffset, ch.length - 1)] || null; }
    return blockOfNode(r.startContainer);
  }
  function posToDOM(txt, off) {
    const w = document.createTreeWalker(txt, NodeFilter.SHOW_TEXT); let n, any = false;
    while ((n = w.nextNode())) { any = true; if (off <= n.nodeValue.length) return [n, off]; off -= n.nodeValue.length; }
    return any ? [txt, txt.childNodes.length] : [txt, 0];
  }
  function setCaret(b, off) {
    if (!b || isImg(b)) return;
    const [n, o] = posToDOM(txtOf(b), off);
    const r = document.createRange(); r.setStart(n, o); r.collapse(true);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    saved = r.cloneRange();
    b.scrollIntoView({ block: 'nearest' });
  }
  function pointOf(node, off) {
    if (node === editor) { const ch = editor.children; if (off >= ch.length) { const b = ch[ch.length - 1]; return { b, o: blen(b) }; } return { b: ch[off], o: 0 }; }
    const b = blockOfNode(node); if (!b) return null;
    if (isImg(b)) return { b, o: 0 };
    const txt = txtOf(b);
    if (node === b) { const idx = Array.prototype.indexOf.call(b.childNodes, txt); return { b, o: off > idx ? blen(b) : 0 }; }
    if (!txt.contains(node)) return { b, o: 0 };
    const r = document.createRange(); r.selectNodeContents(txt); r.setEnd(node, off);
    return { b, o: r.toString().length };
  }
  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s.rangeCount && editor.contains(s.anchorNode) && editor.contains(s.focusNode)) { saved = s.getRangeAt(0).cloneRange(); if (!s.isCollapsed) selKeep = saved.cloneRange(); sched(); }
  });
  // On phones, opening a menu or colour picker collapses the selection. selKeep remembers the last real selection until the writer touches the text again.
  ['pointerdown', 'keydown', 'input'].forEach(ev => editor.addEventListener(ev, () => { selKeep = null; }, true));
  function liveSel() {
    const s = getSelection();
    if (s.rangeCount && !s.isCollapsed && editor.contains(s.anchorNode) && editor.contains(s.focusNode)) return true;
    if (selKeep && !selKeep.collapsed && selKeep.startContainer.isConnected && selKeep.endContainer.isConnected) { s.removeAllRanges(); s.addRange(selKeep.cloneRange()); return true; }
    return false;
  }
  function restore() {
    const s = getSelection();
    if (s.rangeCount && editor.contains(s.anchorNode)) return true;
    if (!saved) return false;
    s.removeAllRanges(); s.addRange(saved); return true;
  }

  // ---------- documents (library) ----------
  function curDoc() { return lib.list.find(d => d.id === lib.cur); }
  function saveLib() { store(K.idx, JSON.stringify(lib)); }
  function loadLib() {
    try { lib = JSON.parse(load(K.idx) || 'null'); } catch (e) { lib = null; }
    if (!lib || !Array.isArray(lib.list) || !lib.list.length) {
      lib = { cur: 1, next: 2, list: [{ id: 1, name: (load(K.name) || 'untitled.txt').toLowerCase() }] };
      store(K.body + 1, load(K.doc) || '');
    }
    if (!lib.next) lib.next = Math.max.apply(null, lib.list.map(d => d.id)) + 1;
    if (!curDoc()) lib.cur = lib.list[0].id;
    saveLib();
  }
  let lastMain = +load('dos-writer-lastmain') || 0;
  function showName() {
    const d = curDoc(); $('docname').textContent = '/' + d.name;
    if (!d.journal) { lastMain = d.id; store('dos-writer-lastmain', String(d.id)); }
    const t = lib.list.find(x => x.id === lastMain), b = $('backBtn');
    if (d.journal && t) { b.style.display = ''; b.textContent = '[< ' + t.name + ']'; b.title = 'Back to ' + t.name; } else b.style.display = 'none';
  }

  // ---------- history + persistence ----------
  let hist = [], hp = -1, ctimer = null;
  function snap() {
    const b = curBlock(), r = curRange(); let c = null;
    if (b && !isImg(b) && r) { const p = pointOf(r.startContainer, r.startOffset); c = { i: blocks().indexOf(b), o: p ? p.o : 0 }; }
    return { s: serialize(), c };
  }
  function persist() { const ok = store(K.body + lib.cur, serialize()); $('saved').textContent = ok ? '[autosave: on]' : '[autosave: off - storage full?]'; }
  function commit() {
    clearTimeout(ctimer);
    const st = snap();
    if (hp >= 0 && hist[hp].s === st.s) { hist[hp].c = st.c; return; }
    hist = hist.slice(0, hp + 1); hist.push(st); if (hist.length > 300) hist.shift(); hp = hist.length - 1;
    persist();
  }
  function later() { clearTimeout(ctimer); ctimer = setTimeout(commit, 500); }
  function applyState(st) {
    loadDoc(st.s);
    if (st.c) { const b = blocks()[st.c.i]; if (b && !isImg(b)) setCaret(b, st.c.o); }
    persist(); refresh();
  }
  function undo() { commit(); if (hp > 0) { hp--; applyState(hist[hp]); } }
  function redo() { if (hp < hist.length - 1) { hp++; applyState(hist[hp]); } }

  // ---------- screenplay + headings ----------
  const HEAD = /^(#{1,3}\s+\S.*|(chapter|part|book|act)\s+([0-9]+|[ivxlc]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b.{0,70}|(prologue|epilogue|interlude)\b.{0,70})$/i;
  const isHeadLine = l => l.length > 0 && l.length < 90 && HEAD.test(l);
  function classify(line) {
    const t = line.trim();
    if (!t) return '';
    if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(t)) return 'scene';
    if (/^\(.*\)$/.test(t)) return 'paren';
    if (/:$/.test(t) && t === t.toUpperCase()) return 'trans';
    if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.length < 40) return 'char';
    return 'action';
  }
  function scriptTypes() {
    let prev = '';
    return blocks().map(b => {
      if (isImg(b)) { prev = ''; return null; }
      let t = classify(txtOf(b).textContent);
      if (t === 'action' && (prev === 'char' || prev === 'paren' || prev === 'dialogue')) t = 'dialogue';
      prev = t || ''; return t || '';
    });
  }
  function updateScript() {
    const on = body.classList.contains('screenplay'); let prev = '';
    blocks().forEach(b => {
      if (isImg(b)) { delete b.dataset.t; delete b.dataset.h; prev = ''; return; }
      const line = txtOf(b).textContent;
      if (!on) { delete b.dataset.t; if (isHeadLine(line.trim())) b.dataset.h = '1'; else delete b.dataset.h; return; }
      delete b.dataset.h;
      let t = classify(line);
      if (t === 'action' && (prev === 'char' || prev === 'paren' || prev === 'dialogue')) t = 'dialogue';
      if (!t) { delete b.dataset.t; prev = ''; return; }
      b.dataset.t = t; prev = t;
    });
  }
  const ORDER = ['action', 'scene', 'char', 'paren', 'trans'];
  function cycleType(shift) {
    const b = curBlock(); if (!b || isImg(b)) return;
    const line = txtOf(b).textContent;
    let cur = classify(line) || 'action'; if (cur === 'dialogue') cur = 'action';
    const i = Math.max(0, ORDER.indexOf(cur));
    const next = ORDER[(i + (shift ? -1 : 1) + ORDER.length) % ORDER.length];
    const base = line.replace(/[()]/g, '').trim();
    const text = { action: base, scene: 'INT. LOCATION - DAY', char: (base || 'CHARACTER').toUpperCase(), paren: '(' + (base || 'beat') + ')', trans: 'CUT TO:' }[next];
    setTxt(txtOf(b), text); setCaret(b, text.length); commit(); refresh(); flash(next.toUpperCase());
  }
  function knownChars() {
    const set = new Set(), ty = scriptTypes();
    blocks().forEach((b, i) => { if (ty[i] === 'char') set.add(blockPlain(b).trim().toUpperCase()); });
    return Array.from(set);
  }
  function suggestName() {
    if (!body.classList.contains('screenplay')) return '';
    const b = curBlock(); if (!b || isImg(b)) return '';
    const t = txtOf(b).textContent.trim().toUpperCase();
    if (!t || t.length > 30) return '';
    const prev = b.previousElementSibling;
    if (prev && !isImg(prev) && txtOf(prev).textContent.trim()) return '';
    return knownChars().find(n => n !== t && n.startsWith(t)) || '';
  }
  function completeName() {
    const sg = suggestName(); if (!sg) return false;
    const b = curBlock(); setTxt(txtOf(b), sg); setCaret(b, sg.length); commit(); refresh(); return true;
  }

  // ---------- editing operations ----------
  function undrop(b) {
    const cap = b.querySelector('.cap'); if (!cap) return;
    const txt = txtOf(b); txt.querySelectorAll('br').forEach(x => x.remove());
    txt.insertBefore(document.createTextNode(cap.dataset.l), txt.firstChild);
    cap.remove(); b.classList.remove('dc'); normalize(txt);
  }
  function mergeInto(a, b) {
    if (b.classList.contains('dc')) undrop(b);
    const ta = txtOf(a), tb = txtOf(b), at = ta.textContent.length;
    if (tb.textContent) { ta.querySelectorAll('br').forEach(x => x.remove()); while (tb.firstChild) ta.appendChild(tb.firstChild); }
    b.remove(); normalize(ta); return at;
  }
  function cut(b, from, to) {
    if (from >= to) return;
    const txt = txtOf(b), [n1, o1] = posToDOM(txt, from), [n2, o2] = posToDOM(txt, to);
    const r = document.createRange(); r.setStart(n1, o1); r.setEnd(n2, o2); r.deleteContents(); normalize(txt);
  }
  function deleteSelection() {
    const s = getSelection(); if (!s.rangeCount || s.isCollapsed) return false;
    const r = s.getRangeAt(0); if (!editor.contains(r.commonAncestorContainer)) return false;
    const a = pointOf(r.startContainer, r.startOffset), z = pointOf(r.endContainer, r.endOffset);
    if (!a || !z || (a.b === z.b && !isImg(a.b))) return false;
    const bl = blocks(), i = bl.indexOf(a.b), j = bl.indexOf(z.b);
    for (let k = i + 1; k < j; k++) bl[k].remove();
    let cb = null, co = 0;
    if (isImg(a.b)) a.b.remove(); else { cut(a.b, a.o, blen(a.b)); cb = a.b; co = a.o; }
    if (i !== j) {
      if (isImg(z.b)) { if (z.o > 0) z.b.remove(); }
      else { cut(z.b, 0, z.o); if (cb) mergeInto(cb, z.b); else { cb = z.b; co = 0; } }
    }
    if (!cb) {
      const rest = blocks(); let t = rest[Math.min(i, rest.length - 1)];
      if (!t || isImg(t)) { const nb = createBlock(''); if (t) t.before(nb); else editor.appendChild(nb); t = nb; }
      cb = t; co = 0;
    }
    ensureTail(); setCaret(cb, co);
    return true;
  }
  function clearSel() { const s = getSelection(); if (s.isCollapsed) return; if (!deleteSelection()) document.execCommand('delete'); }
  function splitBlock() {
    const s = getSelection(); if (!s.rangeCount) return;
    const b = curBlock(); if (!b) return;
    if (isImg(b)) { const nb = createBlock(''); b.after(nb); setCaret(nb, 0); return; }
    const txt = txtOf(b), r = s.getRangeAt(0);
    if (!txt.contains(r.startContainer)) { setCaret(b, 0); return; }
    const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(txt, txt.childNodes.length);
    const frag = tail.extractContents();
    const nb = createBlock(''), nt = txtOf(nb); nt.innerHTML = ''; nt.appendChild(frag);
    normalize(nt); normalize(txt); b.after(nb); setCaret(nb, 0);
  }
  function insertPlain(t) {
    clearSel();
    t.replace(/\r\n?/g, '\n').split('\n').forEach((ln, i) => { if (i > 0) splitBlock(); if (ln) document.execCommand('insertText', false, ln); });
    commit(); refresh();
  }
  function takeFirstChar(txt) {
    const w = document.createTreeWalker(txt, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      n.nodeValue = n.nodeValue.replace(/^\s+/, '');
      if (n.nodeValue.length) { const ch = n.nodeValue[0]; n.nodeValue = n.nodeValue.slice(1); return ch; }
    }
    return null;
  }
  function dropBlock(b) {
    const txt = txtOf(b);
    if (!txt.textContent.trim()) return false;
    const ch = takeFirstChar(txt); if (!ch) return false;
    const n = blocks().filter(x => x.classList.contains('dc')).length;
    b.insertBefore(makeCap(ch, PALETTE[n % PALETTE.length][0]), txt); capVar(b);
    b.classList.add('dc'); normalize(txt); return true;
  }
  function toggleCap() {
    restore();
    const b = curBlock();
    if (!b || isImg(b)) { flash('PUT THE CURSOR IN A PARAGRAPH'); return; }
    if (b.classList.contains('dc')) { undrop(b); setCaret(b, 0); flash('DROP CAP OFF'); }
    else {
      if (!dropBlock(b)) { flash('WRITE A FEW WORDS FIRST'); return; }
      setCaret(b, 0); flash('DROP CAP ON');
    }
    commit(); refresh();
  }
  function applyColour(v) {
    if (!liveSel()) { flash('SELECT SOME TEXT FIRST'); return; }
    const s = getSelection(); if (!s.rangeCount || s.isCollapsed) { flash('SELECT SOME TEXT FIRST'); return; }
    const r = s.getRangeAt(0); let first = null, last = null;
    blocks().forEach(b => {
      if (isImg(b) || !r.intersectsNode(b)) return;
      const txt = txtOf(b), sub = document.createRange(); sub.selectNodeContents(txt);
      if (r.comparePoint(txt, 0) < 0) sub.setStart(r.startContainer, r.startOffset);
      if (r.comparePoint(txt, txt.childNodes.length) > 0) sub.setEnd(r.endContainer, r.endOffset);
      if (sub.collapsed) return;
      const plain = sub.extractContents().textContent; let node;
      if (v === 'clear') node = document.createTextNode(plain);
      else { node = document.createElement('span'); node.className = 'c'; node.dataset.c = v.slice(1); node.style.color = v; node.textContent = plain; }
      sub.insertNode(node);
      if (!first) first = node; last = node;
    });
    if (!first) return;
    blocks().forEach(b => { if (!isImg(b)) normalize(txtOf(b)); });
    if (first.isConnected && last.isConnected) {
      const nr = document.createRange(); nr.setStartBefore(first); nr.setEndAfter(last);
      s.removeAllRanges(); s.addRange(nr); saved = nr.cloneRange(); selKeep = nr.cloneRange();
    }
    commit(); refresh(); flash(v === 'clear' ? 'COLOUR REMOVED' : 'COLOUR APPLIED');
  }
  function insertImage(im) {
    images.push(im);
    if (!store(K.imgs, JSON.stringify(images))) flash('IMAGE TOO BIG TO SAVE - KEPT THIS SESSION ONLY');
    else flash('IMAGE ADDED');
    restore();
    const cb = curBlock() || editor.lastElementChild;
    const nb = createBlock('[img:' + (images.length - 1) + ']');
    cb.after(nb); ensureTail();
    setCaret(nb.nextElementSibling, 0);
    commit(); refresh();
  }
  function pickImage() {
    restore();
    chooseImage(f => makeImage(f, insertImage));
  }
  // Asks whether to take a photo with the camera or pick one from the library, then hands the file to cb.
  function chooseImage(cb) {
    const ov = $('imgsrc'); ov.classList.add('show');
    const go = cam => {
      ov.classList.remove('show');
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      if (cam) inp.setAttribute('capture', 'environment');
      inp.onchange = () => { const f = inp.files[0]; if (f) cb(f); };
      inp.click();
    };
    $('imgcam').onclick = () => go(true); $('imglib').onclick = () => go(false); $('imgcancel').onclick = () => ov.classList.remove('show');
  }
  let imgSaveT;
  function saveImgsLater() { clearTimeout(imgSaveT); imgSaveT = setTimeout(() => { if (!store(K.imgs, JSON.stringify(images))) flash('COULD NOT SAVE IMAGE SIZE'); }, 500); }
  function imgWidth(b) { return b.querySelector('canvas').getBoundingClientRect().width; }
  function setImgWidth(b, w) {
    const im = images[+b.dataset.id], cv = b.querySelector('canvas'); if (!im) return;
    const max = editor.clientWidth || 800;
    w = Math.round(Math.max(48, Math.min(max, w)));
    im.dw = w; cv.style.width = w + 'px'; saveImgsLater();
  }
  function makeImgParts(b) {
    const wrap = document.createElement('span'); wrap.className = 'imgwrap';
    wrap.appendChild(document.createElement('canvas'));
    const rz = document.createElement('span'); rz.className = 'rz'; rz.title = 'Drag to resize'; wrap.appendChild(rz);
    b.appendChild(wrap);
    rz.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); rz.setPointerCapture(e.pointerId);
      const x0 = e.clientX, w0 = imgWidth(b);
      const mv = ev => setImgWidth(b, w0 + (ev.clientX - x0) * 2);
      const up = () => {
        rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); rz.removeEventListener('pointercancel', up);
        flash('IMAGE WIDTH ' + Math.round(imgWidth(b) / (editor.clientWidth || 1) * 100) + '%');
      };
      rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up); rz.addEventListener('pointercancel', up);
    });
    const ctl = document.createElement('div'); ctl.className = 'imgctl';
    [['[-]', null, -0.15], ['[+]', null, 0.15], ['[S]', 0.25], ['[M]', 0.5], ['[L]', 0.75], ['[Full]', 1]].forEach(([lab, frac, step]) => {
      const bt = document.createElement('button'); bt.textContent = lab;
      bt.addEventListener('mousedown', e => e.preventDefault());
      bt.addEventListener('click', e => { e.stopPropagation(); const max = editor.clientWidth || 800; setImgWidth(b, frac != null ? max * frac : imgWidth(b) + max * step); });
      ctl.appendChild(bt);
    });
    const sv = document.createElement('button'); sv.textContent = '[Save]'; sv.title = 'Save this image to your device';
    sv.addEventListener('mousedown', e => e.preventDefault());
    sv.addEventListener('click', e => { e.stopPropagation(); openImgExport(+b.dataset.id); }); ctl.appendChild(sv);
    b.appendChild(ctl);
  }
  function clearSelImg() { if (selImg) selImg.classList.remove('sel'); selImg = null; }
  function removeImg() {
    const n = selImg.nextElementSibling || selImg.previousElementSibling;
    selImg.remove(); selImg = null; fix(); ensureTail();
    if (n && n.isConnected && !isImg(n)) setCaret(n, 0);
    commit(); refresh();
  }

  // ---------- goals ----------
  function today() { return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function countWords() {
    let w = 0;
    blocks().forEach(b => { if (isImg(b)) return; const m = blockPlain(b).match(/\S+/g); if (m) w += m.length; });
    return w;
  }
  function initGoalDay() {
    const g = curDoc().goal; if (!g || g.mode !== 'day') return;
    if (g.day !== today()) { g.day = today(); g.start = countWords(); delete g.hit; saveLib(); }
  }
  function goalText(words) {
    const g = curDoc().goal; if (!g || !g.n) return '';
    const done = g.mode === 'day' ? words - (g.start || 0) : words;
    const f = Math.round(Math.max(0, Math.min(1, done / g.n)) * 10);
    const key = g.mode + (g.day || '');
    if (done >= g.n && g.hit !== key) { g.hit = key; saveLib(); flash('GOAL REACHED - ' + g.n + ' WORDS'); }
    return '[' + '#'.repeat(f) + '.'.repeat(10 - f) + '] ' + Math.max(0, done) + '/' + g.n + (g.mode === 'day' ? ' today' : '');
  }

  // ---------- editor events ----------
  let idle;
  function wake() {
    body.classList.remove('focus'); clearTimeout(idle);
    if (matchMedia('(pointer:coarse)').matches) return;
    idle = setTimeout(() => { if (document.activeElement === editor) body.classList.add('focus'); }, 2500);
  }
  $('menuBtn').onclick = () => body.classList.toggle('menu-open');
  $('handle').onclick = () => { clearTimeout(idle); body.classList.remove('focus'); };
  $('tools').addEventListener('click', e => { if (e.target.tagName === 'BUTTON') body.classList.remove('menu-open'); });
  let rt; function sched() { clearTimeout(rt); rt = setTimeout(updateStats, 120); }
  function refresh() {
    ensureTail(); updateScript(); updateStats();
    const bl = blocks();
    editor.classList.toggle('empty', bl.length === 1 && !isImg(bl[0]) && !bl[0].querySelector('.cap') && !txtOf(bl[0]).textContent);
  }
  function updateStats() {
    let words = 0, chars = 0; const bl = blocks();
    bl.forEach(b => {
      if (isImg(b)) return;
      const t = blockPlain(b);
      chars += t.length; const m = t.match(/\S+/g); if (m) words += m.length;
    });
    const cb = curBlock(), idx = cb ? bl.indexOf(cb) + 1 : 0;
    $('stats').textContent = 'W:' + words.toLocaleString() + '  C:' + chars.toLocaleString();
    $('pos').textContent = 'P:' + idx + '/' + bl.length;
    $('goalbar').textContent = goalText(words);
    const sg = suggestName(); $('hint').textContent = sg ? '[Tab] ' + sg : '';
  }
  editor.addEventListener('input', () => {
    fix();
    const b = curBlock(); if (b && !isImg(b)) normalize(txtOf(b));
    later(); wake();
    clearTimeout(rt); rt = setTimeout(refresh, 120);
  });
  editor.addEventListener('mousedown', e => {
    clearSelImg();
    const im = e.target.closest && e.target.closest('.blk.img');
    if (im) { selImg = im; im.classList.add('sel'); }
  });
  editor.addEventListener('keydown', e => {
    wake();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if (k === 'y') { e.preventDefault(); redo(); }
      else if (k === 'd') { e.preventDefault(); toggleCap(); }
      return;
    }
    if (selImg) {
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeImg(); return; }
      if (e.key.length === 1 || e.key === 'Enter') clearSelImg();
    }
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault(); clearSel(); splitBlock(); commit(); refresh(); return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      if (body.classList.contains('screenplay')) { if (!completeName()) cycleType(e.shiftKey); }
      else { document.execCommand('insertText', false, '    '); }
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      const s = getSelection(); if (!s.rangeCount) return;
      if (!s.isCollapsed) { if (deleteSelection()) { e.preventDefault(); commit(); refresh(); } return; }
      const b = curBlock(); if (!b || isImg(b)) return;
      const r = s.getRangeAt(0), p = pointOf(r.startContainer, r.startOffset); if (!p) return;
      if (e.key === 'Backspace' && p.o === 0) {
        e.preventDefault();
        if (b.classList.contains('dc')) { undrop(b); setCaret(b, 0); }
        else {
          const prev = b.previousElementSibling;
          if (prev && !isImg(prev)) { const at = mergeInto(prev, b); setCaret(prev, at); }
          else if (prev && isImg(prev)) { clearSelImg(); selImg = prev; prev.classList.add('sel'); }
        }
        commit(); refresh(); return;
      }
      if (e.key === 'Delete' && p.o === blen(b)) {
        e.preventDefault();
        const next = b.nextElementSibling;
        if (next && !isImg(next)) { const at = mergeInto(b, next); setCaret(b, at); commit(); refresh(); }
        return;
      }
      return;
    }
    if (e.key.length === 1 && !e.altKey) { const s = getSelection(); if (s.rangeCount && !s.isCollapsed) deleteSelection(); }
  });
  editor.addEventListener('paste', e => { e.preventDefault(); insertPlain((e.clipboardData || window.clipboardData).getData('text/plain')); });
  editor.addEventListener('cut', e => {
    const s = getSelection(); if (s.isCollapsed) return;
    e.preventDefault(); e.clipboardData.setData('text/plain', s.toString()); clearSel(); commit(); refresh();
  });
  editor.addEventListener('drop', e => e.preventDefault());
  editor.addEventListener('dragstart', e => e.preventDefault());

  // ---------- comfort mode: typewriter scrolling, size, key clicks ----------
  function typewriter() {
    if (!body.classList.contains('comfort')) return;
    const s = getSelection(); if (!s.rangeCount || !editor.contains(s.anchorNode)) return;
    const r = s.getRangeAt(0).cloneRange(); r.collapse(false);
    let rc = r.getClientRects()[0];
    if (!rc || !rc.height) { const b = curBlock(); if (!b) return; rc = b.getBoundingClientRect(); }
    const target = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.42;
    scroller.scrollTop += rc.top - target;
  }
  editor.addEventListener('input', typewriter);
  editor.addEventListener('keyup', typewriter);
  function setComfort(on) { body.classList.toggle('comfort', on); store(K.comf, on ? '1' : '0'); flash(on ? 'COMFORT MODE ON' : 'COMFORT MODE OFF'); if (on) typewriter(); }
  $('comfBtn').onclick = () => setComfort(!body.classList.contains('comfort'));
  $('fsize').onchange = e => { store(K.fsize, e.target.value); root.style.setProperty('--fs', e.target.value + 'px'); };
  $('lspace').onchange = e => { store(K.lspace, e.target.value); root.style.setProperty('--lh', e.target.value); };
  function setNum(on) { body.classList.toggle('numbered', on); store(K.num, on ? '1' : '0'); flash(on ? 'SCENE NUMBERS ON (SCREENPLAY MODE)' : 'SCENE NUMBERS OFF'); }

  // ---------- overlays ----------
  function openOv(id) { document.querySelectorAll('.overlay.show').forEach(o => o.classList.remove('show')); $(id).classList.add('show'); }
  function closeOv(id) { $(id).classList.remove('show'); if (id === 'nedit') noteClosed(); if (id === 'cedit') contactClosed(); editor.focus(); restore(); }
  document.querySelectorAll('.overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) closeOv(o.id); }));
  let pendingConfirm = null;
  function confirmTwice(q) { if (pendingConfirm === q) { pendingConfirm = null; return true; } pendingConfirm = q; flash(q + ' Press again.'); setTimeout(() => { pendingConfirm = null; }, 3000); return false; }

  // documents
  function enterDoc() {
    loadDoc(load(K.body + lib.cur) || ''); initGoalDay();
    hist = []; hp = -1; commit(); refresh(); showName();
    const f = blocks().find(b => !isImg(b)); if (f) setCaret(f, 0);
    scroller.scrollTop = 0; lockCheck();
  }
  function createDoc(name, content) {
    persist(); const id = lib.next++;
    lib.list.push({ id, name }); lib.cur = id; saveLib(); store(K.body + id, content || ''); enterDoc();
  }
  function switchDoc(id) { if (id === lib.cur) return; persist(); lib.cur = id; saveLib(); enterDoc(); }
  function wordsOf(s) { const m = s.replace(/\[#[0-9a-fA-F]{6}\]|\[\/\]|\[dc:[0-9a-fA-F]{6}\]|\[img:\d+\]/g, '').match(/\S+/g); return m ? m.length : 0; }
  function drawDocs() {
    const L = $('doclist'); L.innerHTML = '';
    lib.list.forEach(d => {
      const row = document.createElement('div'); if (d.id === lib.cur) row.className = 'on';
      row.innerHTML = '<span></span><span></span>';
      row.children[0].textContent = d.name;
      row.children[1].textContent = (d.id === lib.cur ? countWords() : wordsOf(load(K.body + d.id) || '')).toLocaleString() + ' words';
      row.onclick = () => { closeOv('docs'); switchDoc(d.id); };
      L.appendChild(row);
    });
    $('docin').value = '';
  }
  function openDocs() { persist(); drawDocs(); openOv('docs'); }
  function newDoc() { const n = $('docin').value.trim(); createDoc(n || ('untitled-' + lib.next + '.txt'), ''); }
  $('doccreate').onclick = () => { newDoc(); closeOv('docs'); flash('NEW DOCUMENT'); };
  $('docren').onclick = () => { const n = $('docin').value.trim(); if (!n) { flash('TYPE A NAME FIRST'); return; } curDoc().name = n; saveLib(); showName(); drawDocs(); };
  $('docdel').onclick = () => {
    if (!confirmTwice('Delete ' + curDoc().name + '?')) return;
    const id = lib.cur;
    try { localStorage.removeItem(K.body + id); localStorage.removeItem(K.snaps + id); } catch (e) { /* ignore */ }
    lib.list = lib.list.filter(d => d.id !== id);
    notes.list.forEach(n => { if (n.doc === id) n.doc = null; if (n.ref && n.ref.d === id) delete n.ref; }); saveNotes();
    if (!lib.list.length) { const nid = lib.next++; lib.list.push({ id: nid, name: 'untitled.txt' }); }
    lib.cur = lib.list[0].id; saveLib(); closeOv('docs'); enterDoc(); flash('DOCUMENT DELETED');
  };
  $('docin').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('doccreate').click(); } });
  function openFile() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.txt,.md,.fountain,text/plain';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { createDoc(f.name.toLowerCase(), String(r.result)); flash('IMPORTED ' + f.name); };
      r.readAsText(f);
    };
    inp.click();
  }

  // snapshots
  function snapsGet() { try { return JSON.parse(load(K.snaps + lib.cur) || '[]'); } catch (e) { return []; } }
  function snapsSet(a) { if (!store(K.snaps + lib.cur, JSON.stringify(a))) flash('SNAPSHOT TOO BIG - NOT SAVED'); }
  function takeSnap(name) { commit(); const a = snapsGet(); a.unshift({ t: Date.now(), n: name || 'snapshot', s: serialize(), w: countWords() }); snapsSet(a.slice(0, 40)); }
  function drawSnaps() {
    const L = $('snaplist'); L.innerHTML = '';
    const a = snapsGet();
    if (!a.length) { L.textContent = 'No snapshots yet.'; return; }
    a.forEach((sn, i) => {
      const row = document.createElement('div'); row.className = 'hd';
      const lab = document.createElement('span'); lab.textContent = sn.n + '  -  ' + new Date(sn.t).toLocaleString() + '  -  ' + sn.w + 'w';
      const btns = document.createElement('span');
      const rb = document.createElement('button'); rb.textContent = '[Restore]';
      const db = document.createElement('button'); db.textContent = '[x]';
      rb.onclick = () => { takeSnap('before restore'); loadDoc(sn.s); commit(); refresh(); closeOv('snaps'); flash('SNAPSHOT RESTORED'); };
      db.onclick = () => { const b = snapsGet(); b.splice(i, 1); snapsSet(b); drawSnaps(); };
      btns.appendChild(rb); btns.appendChild(db); row.appendChild(lab); row.appendChild(btns); L.appendChild(row);
    });
  }
  function openSnaps() { drawSnaps(); $('snapin').value = ''; openOv('snaps'); }
  $('snapsave').onclick = () => { takeSnap($('snapin').value.trim()); $('snapin').value = ''; drawSnaps(); flash('SNAPSHOT SAVED'); };

  // backup / export text
  function showText(title, text, allowRestore, info) {
    $('bktitle').textContent = title; $('bkta').value = text; $('bkrestore').style.display = allowRestore ? '' : 'none';
    $('bkinfo').textContent = info || ''; openOv('bk');
  }
  function buildBackup() {
    persist();
    const docs = lib.list.map(d => {
      let sn = []; try { sn = JSON.parse(load(K.snaps + d.id) || '[]'); } catch (e) { sn = []; }
      return { id: d.id, name: d.name, journal: d.journal || null, goal: d.goal || null, s: d.id === lib.cur ? serialize() : (load(K.body + d.id) || ''), snaps: sn };
    });
    return JSON.stringify({ app: 'dos-writer', v: 1, cur: lib.list.findIndex(d => d.id === lib.cur), docs, images, notes, events, contacts: people });
  }
  function openBackup() {
    const t = buildBackup();
    showText('/backup', t, true, 'Copy this text and keep it somewhere safe (notes, email to yourself). To restore, paste a backup here and press Restore. ' + Math.round(t.length / 1024) + ' KB');
  }
  async function copyBox() {
    const ta = $('bkta');
    try { await navigator.clipboard.writeText(ta.value); flash('COPIED'); store(K.lastbk, String(Date.now())); }
    catch (e) { ta.focus(); ta.select(); flash('PRESS CTRL+C TO COPY'); }
  }
  $('bkcopy').onclick = copyBox;
  $('bkrestore').onclick = () => {
    let data; try { data = JSON.parse($('bkta').value); } catch (e) { flash('NOT A VALID BACKUP'); return; }
    if (!data || data.app !== 'dos-writer' || !Array.isArray(data.docs) || !data.docs.length) { flash('NOT A DOS WRITER BACKUP'); return; }
    if (!confirmTwice('Replace everything with this backup?')) return;
    try { lib.list.forEach(d => { localStorage.removeItem(K.body + d.id); localStorage.removeItem(K.snaps + d.id); }); } catch (e) { /* ignore */ }
    images = Array.isArray(data.images) ? data.images : []; for (const k in imgEls) delete imgEls[k];
    store(K.imgs, JSON.stringify(images));
    lib = { cur: 1, next: 1, list: [] };
    const idMap = {};
    data.docs.forEach(d => {
      const id = lib.next++; if (d.id != null) idMap[d.id] = id; const o = { id, name: d.name || 'untitled.txt' }; if (d.goal) o.goal = d.goal; if (d.journal) o.journal = d.journal; lib.list.push(o);
      store(K.body + id, d.s || ''); store(K.snaps + id, JSON.stringify(d.snaps || []));
    });
    lib.cur = lib.list[Math.max(0, Math.min(data.cur || 0, lib.list.length - 1))].id;
    if (data.notes && Array.isArray(data.notes.list)) {
      notes = { list: data.notes.list, next: data.notes.next || (data.notes.list.length + 1), view: data.notes.view === 'board' ? 'board' : 'grid' };
      notes.list.forEach(n => { n.doc = n.doc != null && idMap[n.doc] != null ? idMap[n.doc] : null; if (n.ref) { if (idMap[n.ref.d] != null) n.ref.d = idMap[n.ref.d]; else delete n.ref; } });
    } else notes.list.forEach(n => { n.doc = null; delete n.ref; });
    saveNotes();
    if (data.events && Array.isArray(data.events.list)) { events = { list: data.events.list, next: data.events.next || (data.events.list.length + 1) }; saveEvents(); }
    if (data.contacts && Array.isArray(data.contacts.list)) { people = { list: data.contacts.list, next: data.contacts.next || (data.contacts.list.length + 1) }; savePeople(); }
    saveLib(); closeOv('bk'); enterDoc(); flash('BACKUP RESTORED');
  };

  // contents (chapters / scenes)
  function headings() {
    const sp = body.classList.contains('screenplay'), ty = sp ? scriptTypes() : null, out = [];
    blocks().forEach((b, i) => {
      if (isImg(b)) return;
      const line = blockPlain(b).trim(); if (!line) return;
      if (sp ? ty[i] === 'scene' : isHeadLine(line)) out.push({ b, line });
    });
    return out;
  }
  function openNav() {
    const L = $('navlist'); L.innerHTML = ''; const hs = headings();
    if (!hs.length) L.textContent = 'No headings found. In prose, start a line with "Chapter 1", "Part II", "Prologue" or "# Title". In screenplay mode, scene headings (INT./EXT.) are listed here.';
    hs.forEach((h, i) => {
      const row = document.createElement('div'); row.textContent = (i + 1) + '.  ' + h.line;
      row.onclick = () => { closeOv('nav'); if (h.b.isConnected) { h.b.scrollIntoView({ block: 'start' }); setCaret(h.b, 0); } };
      L.appendChild(row);
    });
    openOv('nav');
  }
  function capChapters() {
    if (body.classList.contains('screenplay')) { flash('SWITCH TO PROSE MODE FIRST'); return; }
    const bl = blocks(); let n = 0;
    bl.forEach((b, i) => {
      if (isImg(b) || !isHeadLine(blockPlain(b).trim())) return;
      for (let j = i + 1; j < bl.length; j++) {
        const nb = bl[j]; if (isImg(nb)) continue;
        if (!txtOf(nb).textContent.trim() && !nb.classList.contains('dc')) continue;
        if (!nb.classList.contains('dc') && !isHeadLine(blockPlain(nb).trim()) && dropBlock(nb)) n++;
        break;
      }
    });
    commit(); refresh(); flash(n ? n + ' DROP CAPS ADDED' : 'NO CHAPTER OPENERS FOUND');
  }
  function removeAllCaps() { let n = 0; blocks().forEach(b => { if (b.classList.contains('dc')) { undrop(b); n++; } }); commit(); refresh(); flash(n + ' DROP CAPS REMOVED'); }
  $('navcaps').onclick = () => { closeOv('nav'); capChapters(); };
  $('navnocaps').onclick = () => { closeOv('nav'); removeAllCaps(); };

  // goal
  function openGoal() { const g = curDoc().goal; $('goaln').value = g ? g.n : ''; $('goalm').value = g ? g.mode : 'day'; openOv('goal'); }
  $('goalset').onclick = () => {
    const n = Math.round(+$('goaln').value);
    if (!(n > 0)) { delete curDoc().goal; } else { curDoc().goal = { n, mode: $('goalm').value, day: today(), start: countWords() }; }
    saveLib(); closeOv('goal'); updateStats(); flash(n > 0 ? 'GOAL SET: ' + n + ' WORDS' : 'GOAL CLEARED');
  };
  $('goalclr').onclick = () => { delete curDoc().goal; saveLib(); closeOv('goal'); updateStats(); flash('GOAL CLEARED'); };

  // find + replace
  const fq = $('fq');
  function findRe() {
    const q = fq.value; if (!q) return null;
    let p = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if ($('fword').checked) p = '(?<![\\p{L}\\p{N}_])' + p + '(?![\\p{L}\\p{N}_])';
    try { return new RegExp(p, 'gu' + ($('fcase').checked ? '' : 'i')); } catch (e) { return null; }
  }
  function allMatches() {
    const re = findRe(); if (!re) return []; const out = [];
    blocks().forEach((b, bi) => {
      if (isImg(b) || out.length > 5000) return;
      const t = txtOf(b).textContent; re.lastIndex = 0; let m;
      while ((m = re.exec(t))) { if (!m[0].length) { re.lastIndex++; continue; } out.push({ b, bi, s: m.index, e: m.index + m[0].length }); }
    });
    return out;
  }
  function rangeFor(m) {
    const t = txtOf(m.b), [n1, o1] = posToDOM(t, m.s), [n2, o2] = posToDOM(t, m.e);
    const r = document.createRange(); r.setStart(n1, o1); r.setEnd(n2, o2); return r;
  }
  function paintFind(ms) {
    $('fcount').textContent = fq.value ? ms.length + ' found' : '';
    if (window.CSS && CSS.highlights && window.Highlight) {
      if (!ms.length) CSS.highlights.delete('find');
      else CSS.highlights.set('find', new Highlight(...ms.slice(0, 2000).map(rangeFor)));
    }
  }
  function posNow(end) {
    const r = saved; if (!r) return { i: -1, o: 0 };
    const p = pointOf(end ? r.endContainer : r.startContainer, end ? r.endOffset : r.startOffset);
    return p ? { i: blocks().indexOf(p.b), o: p.o } : { i: -1, o: 0 };
  }
  function selectMatch(m) {
    const r = rangeFor(m), s = getSelection(); s.removeAllRanges(); s.addRange(r); saved = r.cloneRange();
    m.b.scrollIntoView({ block: 'center' });
  }
  function goFind(dir) {
    const ms = allMatches(); paintFind(ms);
    if (!ms.length) { flash('NOT FOUND'); return; }
    let pick;
    if (dir > 0) { const p = posNow(true); pick = ms.find(m => m.bi > p.i || (m.bi === p.i && m.s >= p.o)) || ms[0]; }
    else { const p = posNow(false); for (let k = ms.length - 1; k >= 0; k--) { const m = ms[k]; if (m.bi < p.i || (m.bi === p.i && m.e <= p.o)) { pick = m; break; } } pick = pick || ms[ms.length - 1]; }
    selectMatch(pick);
  }
  function replaceCur() {
    const r = saved, q = fq.value; if (!r || !q) { goFind(1); return; }
    const sel = r.toString(), same = $('fcase').checked ? sel === q : sel.toLowerCase() === q.toLowerCase();
    const b = blockOfNode(r.startContainer);
    if (same && !r.collapsed && b && !isImg(b) && b === blockOfNode(r.endContainer)) {
      const p = pointOf(r.startContainer, r.startOffset), rep = $('fr').value, rr = r.cloneRange();
      rr.deleteContents(); rr.insertNode(document.createTextNode(rep)); normalize(txtOf(b));
      setCaret(p.b, p.o + rep.length); commit(); refresh();
    }
    goFind(1);
  }
  function replaceAll() {
    const ms = allMatches(); if (!ms.length) { flash('NOT FOUND'); return; }
    const rep = $('fr').value, by = new Map();
    ms.forEach(m => { if (!by.has(m.b)) by.set(m.b, []); by.get(m.b).push(m); });
    by.forEach((arr, b) => {
      for (let k = arr.length - 1; k >= 0; k--) { const r = rangeFor(arr[k]); r.deleteContents(); r.insertNode(document.createTextNode(rep)); }
      normalize(txtOf(b));
    });
    commit(); refresh(); paintFind(allMatches()); flash(ms.length + ' REPLACED');
  }
  function openFind() {
    $('find').classList.add('show');
    const r = curRange(); if (r && !r.collapsed) { const t = r.toString(); if (t && t.length < 60 && !/\n/.test(t)) fq.value = t; }
    fq.focus(); fq.select(); paintFind(allMatches());
  }
  function closeFind() { $('find').classList.remove('show'); if (window.CSS && CSS.highlights) CSS.highlights.delete('find'); editor.focus(); restore(); }
  fq.addEventListener('input', () => paintFind(allMatches()));
  fq.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goFind(e.shiftKey ? -1 : 1); } });
  $('fcase').onchange = $('fword').onchange = () => paintFind(allMatches());
  $('fnext').onclick = () => goFind(1); $('fprev').onclick = () => goFind(-1);
  $('frep').onclick = replaceCur; $('fall').onclick = replaceAll; $('fclose').onclick = closeFind;

  // screenplay export (copy as text)
  function wrapW(t, w) {
    const out = []; let cur = '';
    t.split(/\s+/).forEach(x => { if (cur && (cur + ' ' + x).length > w) { out.push(cur); cur = x; } else cur = (cur ? cur + ' ' : '') + x; });
    if (cur) out.push(cur); return out;
  }
  function toFountain() {
    const ty = scriptTypes(), out = []; let sn = 0;
    blocks().forEach((b, i) => {
      if (isImg(b)) return;
      const t = ty[i], line = blockPlain(b).trim();
      if (!line) { if (out.length && out[out.length - 1] !== '') out.push(''); return; }
      if ((t === 'scene' || t === 'char' || t === 'trans' || t === 'action') && out.length && out[out.length - 1] !== '') out.push('');
      if (t === 'scene') { sn++; out.push(line.toUpperCase() + (body.classList.contains('numbered') ? ' #' + sn + '#' : '')); }
      else out.push(t === 'char' || t === 'trans' ? line.toUpperCase() : line);
    });
    return out.join('\n').trim() + '\n';
  }
  function toFormatted() {
    const ty = scriptTypes(), out = []; let sn = 0;
    const pad = n => ' '.repeat(Math.max(0, n));
    blocks().forEach((b, i) => {
      if (isImg(b)) return;
      const t = ty[i], line = blockPlain(b).trim();
      if (!line) { if (out.length && out[out.length - 1] !== '') out.push(''); return; }
      if ((t === 'scene' || t === 'char' || t === 'trans' || t === 'action') && out.length && out[out.length - 1] !== '') out.push('');
      if (t === 'scene') { sn++; out.push((body.classList.contains('numbered') ? sn + '.  ' : '') + line.toUpperCase()); }
      else if (t === 'char') out.push(pad(22) + line.toUpperCase());
      else if (t === 'paren') out.push(pad(16) + line);
      else if (t === 'dialogue') wrapW(line, 35).forEach(l => out.push(pad(10) + l));
      else if (t === 'trans') out.push(pad(60 - line.length) + line.toUpperCase());
      else wrapW(line, 60).forEach(l => out.push(l));
    });
    return out.join('\n').trim() + '\n';
  }
  async function copyOut(text, label) {
    try { await navigator.clipboard.writeText(text); flash('COPIED ' + label); }
    catch (e) { showText('/' + label.toLowerCase(), text, false, 'Select all and copy this text.'); }
  }


  // ---------- notes board ----------
  const NCOLS = ['', '#ff5f56', '#ffb454', '#ffe66d', '#7ee787', '#56d4dd', '#79a8ff', '#d2a8ff'];
  const NCNAME = ['plain', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
  let notes = { list: [], next: 1, view: 'grid' };
  try { const o = JSON.parse(load(K.notes) || 'null'); if (o && Array.isArray(o.list)) notes = { list: o.list, next: o.next || (o.list.length + 1), view: o.view === 'board' ? 'board' : 'grid' }; } catch (e) { /* ignore */ }
  let editing = null, zTop = 1, nsT;
  function saveNotes() { clearTimeout(nsT); if (!store(K.notes, JSON.stringify(notes))) flash('NOTES NOT SAVED - STORAGE FULL?'); }
  function saveNotesLater() { clearTimeout(nsT); nsT = setTimeout(saveNotes, 400); }
  function noteById(id) { return notes.list.find(n => n.id === id); }
  function docNameById(id) { const d = lib.list.find(x => x.id === id); return d ? d.name : ''; }
  function ago(t) {
    const m = Math.floor((Date.now() - t) / 60000); if (m < 1) return 'now'; if (m < 60) return m + 'm';
    const h = Math.floor(m / 60); if (h < 24) return h + 'h'; const d = Math.floor(h / 24); if (d < 30) return d + 'd';
    return new Date(t).toLocaleDateString();
  }
  // note stickers: 8x8 pixel icons
  const STK = {
    star: ['Star', ['...##...', '...##...', '########', '.######.', '..####..', '.######.', '.##..##.', '##....##']],
    bolt: ['Big idea', ['.....##.', '....##..', '...##...', '..#####.', '....##..', '...##...', '..##....', '.##.....']],
    question: ['Research', ['..####..', '.##..##.', '.....##.', '....##..', '...##...', '...##...', '........', '...##...']],
    heart: ['Heart', ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...', '........']],
    skull: ['Cut', ['.######.', '########', '##.##.##', '##.##.##', '########', '..####..', '..#..#..', '..####..']],
    tick: ['Done', ['.......#', '......##', '.....##.', '#...##..', '##.##...', '.###....', '..#.....', '........']],
    clock: ['Later', ['..####..', '.#....#.', '#..#...#', '#..#...#', '#..###.#', '.#....#.', '..####..', '........']],
    flag: ['Next draft', ['.###....', '.#####..', '.#######', '.#####..', '.#......', '.#......', '.#......', '.#......']],
    moon: ['Night', ['..####..', '.###....', '###.....', '###.....', '###.....', '.###....', '..####..', '........']],
    ghost: ['Scare', ['..####..', '.######.', '##.##.##', '########', '########', '########', '##.##.##', '#..#..#.']],
    sun: ['Day', ['...##...', '#..##..#', '.######.', '.######.', '.######.', '.######.', '#..##..#', '...##...']],
    music: ['Music', ['...#####', '...#####', '...#...#', '...#...#', '.###.###', '####.###', '.##...#.', '........']]
  };
  function stickerCanvas(key) {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8; const g = c.getContext('2d'), d = STK[key];
    g.fillStyle = cssVar('--accent') || '#5ff'; if (d) d[1].forEach((row, y) => { for (let x = 0; x < 8; x++) if (row[x] === '#') g.fillRect(x, y, 1, 1); });
    return c;
  }
  const nImgEls = {};
  function paintNoteImg(cv, id) {
    const im = images[id]; if (!im) { cv.width = 1; cv.height = 1; return; }
    cv.width = im.w; cv.height = im.h;
    let el = nImgEls[id];
    if (!el || el.dataset.s !== im.src) { el = nImgEls[id] = new Image(); el.dataset.s = im.src; el.src = im.src; }
    if (!el.complete || !el.naturalWidth) { el.addEventListener('load', () => paintNoteImg(cv, id), { once: true }); return; }
    const g = cv.getContext('2d'), fg = cssVar('--fg') || '#fff', normal = (im.v === 2) === !isLight();
    g.clearRect(0, 0, im.w, im.h);
    if (normal) { g.drawImage(el, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = fg; g.fillRect(0, 0, im.w, im.h); }
    else { g.fillStyle = fg; g.fillRect(0, 0, im.w, im.h); g.globalCompositeOperation = 'destination-out'; g.drawImage(el, 0, 0); }
    g.globalCompositeOperation = 'source-over';
  }
  function fillNoteFilters() {
    const f = $('nfilter'), v = f.value || 'all'; f.innerHTML = '';
    const add = (val, lab) => { const o = document.createElement('option'); o.value = val; o.textContent = lab; f.appendChild(o); };
    add('all', 'All projects'); add('cur', 'This project'); add('none', 'No project');
    lib.list.forEach(d => add(String(d.id), d.name));
    f.value = [].some.call(f.options, o => o.value === v) ? v : 'all';
    const c = $('ncolfilter');
    const sf = $('nstfilter');
    if (!sf.options.length) { [['all', 'any sticker'], ['none', 'no sticker']].concat(Object.keys(STK).map(k => [k, STK[k][0].toLowerCase()])).forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; sf.appendChild(o); }); }
    if (!c.options.length) NCOLS.forEach((col, i) => { const o = document.createElement('option'); o.value = i ? col : 'all'; o.textContent = i ? NCNAME[i] : 'any colour'; c.appendChild(o); });
  }
  function matchNote(n) {
    const q = $('nsearch').value.trim().toLowerCase();
    if (q && !(n.text.toLowerCase().includes(q) || docNameById(n.doc).toLowerCase().includes(q))) return false;
    const f = $('nfilter').value;
    if (f === 'cur' && n.doc !== lib.cur) return false;
    if (f === 'none' && n.doc) return false;
    if (/^\d+$/.test(f) && n.doc !== +f) return false;
    const sk = $('nstfilter').value;
    if (sk === 'none' && n.s) return false;
    if (sk && sk !== 'all' && sk !== 'none' && n.s !== sk) return false;
    const c = $('ncolfilter').value;
    if (c !== 'all' && c !== 'plain' && n.c !== c) return false;
    return true;
  }
  function sizeBoard() {
    const g = $('ngrid'); let mx = 0, my = 0;
    g.querySelectorAll('.ncard').forEach(c => { mx = Math.max(mx, c.offsetLeft + c.offsetWidth); my = Math.max(my, c.offsetTop + c.offsetHeight); });
    g.style.height = (my + 80) + 'px'; g.style.minWidth = (mx + 20) + 'px';
  }
  function renderNotes() {
    fillNoteFilters();
    const g = $('ngrid'), board = notes.view === 'board';
    g.innerHTML = ''; g.className = board ? 'board' : 'grid'; g.style.height = ''; g.style.minWidth = '';
    $('nviewBtn').textContent = board ? '[Grid view]' : '[Board view]';
    const list = notes.list.filter(matchNote);
    $('ncount').textContent = list.length + (list.length === notes.list.length ? '' : '/' + notes.list.length) + ' notes';
    if (!list.length) { const e = document.createElement('div'); e.className = 'nempty'; e.textContent = notes.list.length ? 'No notes match.' : 'No notes yet. Tap [+ Note] or [+ Image].'; g.appendChild(e); return; }
    if (!board) list.sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || b.t - a.t);
    zTop = notes.list.length + 1;
    list.forEach(n => g.appendChild(makeCard(n)));
    if (board) {
      const cols = Math.max(1, Math.floor(($('nscroll').clientWidth - 10) / 250)), colH = new Array(cols).fill(10); let dirty = false;
      list.forEach(n => { if (n.x != null) { const c = Math.max(0, Math.min(cols - 1, Math.round((n.x - 10) / 250))), el = g.querySelector('[data-id="' + n.id + '"]'); colH[c] = Math.max(colH[c], n.y + el.offsetHeight + 14); } });
      list.forEach(n => {
        if (n.x != null) return;
        const el = g.querySelector('[data-id="' + n.id + '"]'); let c = 0; for (let i = 1; i < cols; i++) if (colH[i] < colH[c]) c = i;
        n.x = 10 + c * 250; n.y = colH[c]; colH[c] += el.offsetHeight + 14; el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; dirty = true;
      });
      if (dirty) saveNotes();
      sizeBoard();
    }
  }
  function makeCard(n) {
    const board = notes.view === 'board';
    const c = document.createElement('div'); c.className = 'ncard' + (n.pin ? ' pin' : ''); c.dataset.id = n.id;
    if (n.c) c.style.setProperty('--nc', n.c);
    if (board) { c.style.left = (n.x != null ? n.x : 0) + 'px'; c.style.top = (n.y != null ? n.y : 0) + 'px'; c.style.zIndex = notes.list.indexOf(n) + 1; if (n.w) c.style.width = n.w + 'px'; }
    const h = document.createElement('div'); h.className = 'nh';
    const l = document.createElement('span');
    if (n.doc && docNameById(n.doc)) {
      const ch = document.createElement('span'); ch.className = 'nchip'; ch.textContent = '/' + docNameById(n.doc); ch.title = 'Open this project';
      ch.addEventListener('click', e => { e.stopPropagation(); openProject(n.doc); }); l.appendChild(ch);
    } else l.textContent = n.img != null && !n.text.trim() ? 'image' : 'note';
    const r = document.createElement('span'); r.textContent = (n.pin ? '★ ' : '') + ago(n.t);
    h.appendChild(l); h.appendChild(r); c.appendChild(h);
    if (n.s && STK[n.s]) { c.classList.add('hs'); const st = document.createElement('span'); st.className = 'nstk'; st.title = STK[n.s][0]; st.appendChild(stickerCanvas(n.s)); c.appendChild(st); }
    if (n.ref) {
      const lk = document.createElement('div'); lk.className = 'nlink'; lk.textContent = '\u21e2 ' + refLabel(n.ref); lk.title = 'Jump to this spot in the manuscript';
      lk.addEventListener('click', e => { e.stopPropagation(); gotoRef(n); }); c.appendChild(lk);
    }
    if (n.img != null && images[n.img]) { const cv = document.createElement('canvas'); paintNoteImg(cv, n.img); if (n.iz && n.iz < 100) cv.style.width = 'calc(' + n.iz + '% - 16px)'; c.appendChild(cv); }
    if (n.text.trim()) {
      const b = document.createElement('div'); b.className = 'nb'; const lines = n.text.split('\n');
      const t = document.createElement('span'); t.className = 'nt'; t.textContent = lines[0]; b.appendChild(t);
      if (lines.length > 1) b.appendChild(document.createTextNode(lines.slice(1).join('\n')));
      c.appendChild(b);
    }
    if (board) {
      const rz = document.createElement('span'); rz.className = 'nrz'; rz.title = 'Drag to resize'; c.appendChild(rz);
      rz.addEventListener('click', e => e.stopPropagation());
      rz.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        try { rz.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        const x0 = e.clientX, w0 = c.offsetWidth;
        const mv = ev => { n.w = Math.round(Math.max(140, Math.min(700, w0 + ev.clientX - x0))); c.style.width = n.w + 'px'; sizeBoard(); };
        const up = () => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); rz.removeEventListener('pointercancel', up); c.style.zIndex = ++zTop; saveNotes(); };
        rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up); rz.addEventListener('pointercancel', up);
      });
    }
    c.addEventListener('click', () => { if (c._drag) { c._drag = false; return; } openNote(n.id); });
    if (board) {
      h.addEventListener('pointerdown', e => {
        if (e.target.closest('.nchip')) return;
        const x0 = e.clientX, y0 = e.clientY, ox = n.x || 0, oy = n.y || 0; let moved = false;
        try { h.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        const mv = ev => {
          const dx = ev.clientX - x0, dy = ev.clientY - y0;
          if (!moved && Math.hypot(dx, dy) < 6) return;
          if (!moved) { moved = true; c.style.zIndex = 99999; }
          n.x = Math.max(0, Math.round(ox + dx)); n.y = Math.max(0, Math.round(oy + dy));
          c.style.left = n.x + 'px'; c.style.top = n.y + 'px'; sizeBoard();
        };
        const up = () => {
          h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); h.removeEventListener('pointercancel', up);
          if (moved) { c._drag = true; setTimeout(() => { c._drag = false; }, 80); c.style.zIndex = ++zTop; saveNotes(); }
        };
        h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
      });
    }
    return c;
  }
  // links from notes to a spot in the manuscript
  function refHere() {
    const r = curRange(); if (!r) return null;
    const nd = r.startContainer, el = nd.nodeType === 1 ? nd : nd.parentElement, b = el && el.closest ? el.closest('.blk') : null;
    if (!b || !editor.contains(b) || isImg(b)) return null;
    return { d: lib.cur, t: blockPlain(b).trim().slice(0, 60), i: blocks().indexOf(b) };
  }
  function refLabel(ref) { const nm = docNameById(ref.d); return (ref.t ? '"' + ref.t.slice(0, 32) + (ref.t.length > 32 ? '...' : '') + '"' : 'line ' + (ref.i + 1)) + (nm && ref.d !== lib.cur ? ' in ' + nm : ''); }
  function findRef(ref) {
    const bl = blocks(); let best = -1;
    if (ref.t) bl.forEach((b, i) => { if (!isImg(b) && blockPlain(b).trim().slice(0, 60) === ref.t && (best < 0 || Math.abs(i - ref.i) < Math.abs(best - ref.i))) best = i; });
    if (best < 0 && ref.i < bl.length) best = ref.i;
    return best < 0 ? null : bl[best];
  }
  function gotoRef(n) {
    const ref = n.ref; if (!ref) return;
    if (!lib.list.some(d => d.id === ref.d)) { flash('LINKED DOCUMENT IS GONE'); return; }
    closeOv('nedit'); setNotesMode(false);
    if (ref.d !== lib.cur) switchDoc(ref.d);
    const b = findRef(ref); if (!b) { flash('LINKED SPOT NOT FOUND'); return; }
    try { setCaret(b, 0); } catch (e) { /* ignore */ }
    b.scrollIntoView({ block: 'center' });
    b.classList.add('jump'); setTimeout(() => b.classList.remove('jump'), 2500);
  }
  function drawLink(n) {
    $('nlink').textContent = n.ref ? '[Unlink]' : '[Link to cursor]';
    $('ngo').style.display = n.ref ? '' : 'none';
    $('nlinkinfo').textContent = n.ref ? refLabel(n.ref) : '';
  }
  $('nlink').onclick = () => {
    if (!editing) return; const n = editing;
    if (n.ref) { delete n.ref; } else {
      const r = refHere(); if (!r) { flash('CLICK A PARAGRAPH IN YOUR MANUSCRIPT FIRST'); return; }
      n.ref = r; if (n.doc == null) n.doc = r.d; $('nproj').value = n.doc != null ? String(n.doc) : '';
    }
    saveNotes(); drawLink(n);
  };
  $('ngo').onclick = () => { if (editing) gotoRef(editing); };
  // DOS startup sequence
  const bootOn = () => load(K.boot) !== '0';
  const reduceMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  function setBoot(on) { store(K.boot, on ? '1' : '0'); $('bootBtn').textContent = on ? '[Boot: on]' : '[Boot: off]'; }
  let booting = false;
  async function runBoot() {
    if (booting) return; booting = true;
    const el = $('boot'), pre = $('bootpre'); let skip = false;
    const stop = () => { skip = true; };
    document.addEventListener('keydown', stop); el.addEventListener('pointerdown', stop);
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); pre.textContent = '';
    const sleep = ms => new Promise(r => { const t0 = Date.now(), iv = setInterval(() => { if (skip || Date.now() - t0 >= ms) { clearInterval(iv); r(); } }, 20); });
    const words = (plainText().match(/\S+/g) || []).length, nm = curDoc().name.toUpperCase();
    let text = '';
    const line = async (t, ms) => { if (skip) return; text += t + '\n'; pre.textContent = text; await sleep(ms == null ? 160 : ms); };
    try {
      await line('D.O.S  -  DISTRACTION OBFUSCATION SYSTEM', 200);
      await line('BIOS V1.0', 120);
      await line('COPYRIGHT (C) THE AUTHOR. ALL WORDS RESERVED.', 200);
      await line('', 120);
      for (let m = 0; m <= 640 && !skip; m += 64) { pre.textContent = text + 'MEMORY TEST: ' + m + 'K'; await sleep(45); }
      await line('MEMORY TEST: 640K OK', 140);
      await line('DETECTING STORAGE ........ OK');
      await line('LOADING DOCUMENTS ........ ' + lib.list.length + ' FOUND');
      await line('LOADING NOTES ............ ' + notes.list.length + ' FOUND');
      await line('', 100);
      await line('OPENING ' + nm + '  (' + words + ' WORDS)', 260);
      await line('', 80);
      await line('C:\\WRITE> READY', 520);
    } finally {
      document.removeEventListener('keydown', stop); el.removeEventListener('pointerdown', stop);
      el.classList.remove('show'); booting = false;
    }
  }
  $('bootBtn').textContent = bootOn() ? '[Boot: on]' : '[Boot: off]';
  $('bootBtn').onclick = () => { const on = !bootOn(); setBoot(on); flash(on ? 'STARTUP SEQUENCE ON' : 'STARTUP SEQUENCE OFF'); };

  // CRT effect
  function setCrt(l) {
    l = +l || 0; body.classList.remove('crt1', 'crt2'); if (l) body.classList.add('crt' + l);
    store(K.crt, String(l)); $('crtBtn').textContent = l ? '[CRT ' + l + ']' : '[CRT]';
  }
  function cycleCrt() { const c = body.classList.contains('crt2') ? 2 : body.classList.contains('crt1') ? 1 : 0, n = (c + 1) % 3; setCrt(n); flash(['CRT OFF', 'CRT: SCANLINES', 'CRT: FULL'][n]); }
  $('crtBtn').onclick = cycleCrt;
  setCrt(load(K.crt) || 0);

  function defaultNoteDoc() { const f = $('nfilter').value; return f === 'cur' ? lib.cur : (/^\d+$/.test(f) ? +f : null); }
  function newNote(text, docId, imgId) {
    const n = { id: notes.next++, text: text || '', c: '', pin: false, doc: docId == null ? null : docId, t: Date.now() };
    if (imgId != null) n.img = imgId;
    notes.list.push(n); return n;
  }
  function pickNoteImage(cb) {
    chooseImage(f => addNoteImage(f, cb));
  }
  function addNoteImage(f, cb) {
    makeImage(f, im => {
      images.push(im);
      if (!store(K.imgs, JSON.stringify(images))) flash('IMAGE TOO BIG TO SAVE - KEPT THIS SESSION ONLY');
      cb(images.length - 1);
    });
  }
  function drawNoteTools(n) {
    const cw = $('ncols'); cw.innerHTML = '';
    NCOLS.forEach((col, i) => {
      const b = document.createElement('button'); b.className = 'sw' + ((n.c || '') === col ? ' on' : ''); b.title = NCNAME[i];
      b.style.background = col || 'transparent'; b.textContent = col ? '' : '×';
      b.onclick = () => { n.c = col; saveNotes(); drawNoteTools(n); };
      cw.appendChild(b);
    });
    const sw = $('nstick'); sw.innerHTML = '';
    const b0 = document.createElement('button'); b0.className = 'sw st' + (n.s ? '' : ' on'); b0.title = 'No sticker'; b0.textContent = '\u00d7'; b0.onclick = () => { n.s = ''; saveNotes(); drawNoteTools(n); }; sw.appendChild(b0);
    Object.keys(STK).forEach(k => {
      const b = document.createElement('button'); b.className = 'sw st' + (n.s === k ? ' on' : ''); b.title = STK[k][0]; b.appendChild(stickerCanvas(k));
      b.onclick = () => { n.s = n.s === k ? '' : k; saveNotes(); drawNoteTools(n); }; sw.appendChild(b);
    });
    const p = $('nproj'); p.innerHTML = '';
    const o0 = document.createElement('option'); o0.value = ''; o0.textContent = '(no project)'; p.appendChild(o0);
    lib.list.forEach(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.name; p.appendChild(o); });
    p.value = n.doc != null ? String(n.doc) : '';
    $('npin').textContent = n.pin ? '[Unpin]' : '[Pin]'; drawLink(n);
    $('nimgbtn').textContent = n.img != null ? '[Remove image]' : '[Add image]';
    const pv = $('nprev');
    const has = n.img != null && images[n.img]; $('nsave').style.display = has ? '' : 'none';
    $('nsizerow').style.display = has ? 'flex' : 'none'; $('nsize').value = n.iz || 100;
    if (has) { pv.style.display = 'block'; pv.style.width = (n.iz || 100) + '%'; paintNoteImg(pv, n.img); } else pv.style.display = 'none';
  }
  function openNote(id) {
    const n = noteById(id); if (!n) return;
    editing = n; $('ntext').value = n.text; drawNoteTools(n); openOv('nedit');
    if (!n.text && n.img == null) $('ntext').focus();
  }
  function noteClosed() {
    const n = editing; editing = null; if (!n) return;
    if (!n.text.trim() && n.img == null) notes.list = notes.list.filter(x => x !== n);
    saveNotes();
    if (body.classList.contains('notes')) renderNotes(); else flash('NOTE SAVED');
  }
  $('ntext').addEventListener('input', () => { if (editing) { editing.text = $('ntext').value; editing.t = Date.now(); saveNotesLater(); } });
  $('nproj').onchange = () => { if (editing) { editing.doc = $('nproj').value ? +$('nproj').value : null; saveNotes(); } };
  $('npin').onclick = () => { if (editing) { editing.pin = !editing.pin; saveNotes(); drawNoteTools(editing); } };
  $('nimgbtn').onclick = () => {
    if (!editing) return; const n = editing;
    if (n.img != null) { delete n.img; saveNotes(); drawNoteTools(n); }
    else pickNoteImage(i => { n.img = i; n.t = Date.now(); saveNotes(); if (editing === n) drawNoteTools(n); });
  };
  $('nsize').addEventListener('input', () => { if (!editing) return; editing.iz = +$('nsize').value; $('nprev').style.width = editing.iz + '%'; saveNotesLater(); });
  $('ndone').onclick = () => closeOv('nedit');
  $('ndel').onclick = () => {
    if (!editing || !confirmTwice('Delete this note?')) return;
    const n = editing; editing = null; notes.list = notes.list.filter(x => x !== n); saveNotes();
    closeOv('nedit'); if (body.classList.contains('notes')) renderNotes(); flash('NOTE DELETED');
  };
  $('nsend').onclick = () => {
    if (!editing) return; const n = editing, lines = (n.img != null ? ['[img:' + n.img + ']'] : []).concat(n.text.trim() ? n.text.split('\n') : []);
    closeOv('nedit'); setNotesMode(false); restore();
    let cb = curBlock() || editor.lastElementChild;
    lines.forEach(ln => { const nb = createBlock(ln); cb.after(nb); cb = nb; });
    ensureTail(); commit(); refresh(); flash('NOTE SENT TO MANUSCRIPT');
  };
  function quickNote() {
    let t = ''; const s = getSelection();
    if (s.rangeCount && !s.isCollapsed && editor.contains(s.anchorNode)) t = s.toString().trim();
    else if (selKeep && !selKeep.collapsed) t = selKeep.toString().trim();
    else if (saved && !saved.collapsed) t = saved.toString().trim();
    const n = newNote(t, lib.cur), rf = refHere(); if (rf) n.ref = rf; saveNotes();
    if (t) flash('NOTE ADDED'); else { if (body.classList.contains('notes')) renderNotes(); openNote(n.id); }
  }
  const VIEWS = ['notes', 'cal', 'contacts'];
  const curView = () => VIEWS.find(v => body.classList.contains(v)) || 'write';
  function setView(v) {
    const cur = curView(); if (v === cur) return;
    if (cur === 'write') { commit(); persist(); body.classList.remove('focus'); }
    VIEWS.forEach(x => body.classList.toggle(x, x === v));
    if (v === 'notes') renderNotes(); else if (v === 'cal') renderCal(); else if (v === 'contacts') renderPeople(); else editor.focus();
    $('notesBtn').textContent = v === 'notes' ? '[Writing]' : '[Notes]';
    lockCheck();
  }
  function setNotesMode(on) { setView(on ? 'notes' : 'write'); }
  function openProject(id) { setNotesMode(false); switchDoc(id); flash('OPENED ' + docNameById(id)); }
  function toggleNotesView() { notes.view = notes.view === 'board' ? 'grid' : 'board'; saveNotes(); if (body.classList.contains('notes')) renderNotes(); else setNotesMode(true); }
  $('notesBtn').onclick = () => setNotesMode(!body.classList.contains('notes'));
  $('noteAddBtn').onclick = quickNote;
  $('nclose').onclick = () => setNotesMode(false);
  $('nviewBtn').onclick = toggleNotesView;
  $('nnew').onclick = () => { const n = newNote('', defaultNoteDoc()); openNote(n.id); };
  $('nimg').onclick = () => pickNoteImage(i => { const n = newNote('', defaultNoteDoc(), i); saveNotes(); renderNotes(); openNote(n.id); });
  ['input', 'change'].forEach(ev => { $('nsearch').addEventListener(ev, renderNotes); $('nfilter').addEventListener(ev, renderNotes); $('ncolfilter').addEventListener(ev, renderNotes); $('nstfilter').addEventListener(ev, renderNotes); });
  const nv = $('notesview');
  nv.addEventListener('dragover', e => { e.preventDefault(); nv.classList.add('drop'); });
  nv.addEventListener('dragleave', () => nv.classList.remove('drop'));
  nv.addEventListener('drop', e => {
    e.preventDefault(); nv.classList.remove('drop');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /^image\//.test(f.type)) addNoteImage(f, i => { const n = newNote('', defaultNoteDoc(), i); saveNotes(); renderNotes(); });
  });
  const repaintNoteImgs = () => { if (body.classList.contains('notes')) renderNotes(); else if (body.classList.contains('contacts')) renderPeople(); };

  // ---------- menus (dropdowns) ----------
  const dds = Array.from(document.querySelectorAll('.dd'));
  function closeDD(except) { dds.forEach(d => { if (d !== except) d.classList.remove('open'); }); }
  dds.forEach(d => {
    d.querySelector('.ddb').addEventListener('click', e => { e.stopPropagation(); const o = !d.classList.contains('open'); closeDD(); d.classList.toggle('open', o); });
    const pn = d.querySelector('.ddp');
    pn.addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.classList.contains('keep')) closeDD(); });
    pn.addEventListener('change', () => setTimeout(closeDD, 0));
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.dd')) closeDD(); }, true);
  // ---------- save images to the device ----------
  let expId = null, dlP = null;
  const getDL = () => dlP || (dlP = (window.claude && window.claude.use) ? Promise.resolve(window.claude.use('downloads')).catch(() => null) : Promise.resolve(null));
  function loadImgEl(id) { return new Promise(res => { const im = images[id]; if (!im) { res(null); return; } const el = new Image(); el.onload = () => res(el); el.onerror = () => res(null); el.src = im.src; }); }
  async function exportCanvas(id, mode, scale) {
    const im = images[id], el = await loadImgEl(id); if (!im || !el) return null;
    const t = document.createElement('canvas'); t.width = im.w; t.height = im.h; const g = t.getContext('2d');
    const light = mode === 'bw' ? true : isLight(), fg = mode === 'bw' ? '#000000' : (cssVar('--fg') || '#ffffff');
    if ((im.v === 2) === !light) { g.drawImage(el, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = fg; g.fillRect(0, 0, im.w, im.h); }
    else { g.fillStyle = fg; g.fillRect(0, 0, im.w, im.h); g.globalCompositeOperation = 'destination-out'; g.drawImage(el, 0, 0); }
    const out = document.createElement('canvas'); out.width = im.w * scale; out.height = im.h * scale; const o = out.getContext('2d');
    if (mode === 'bw') { o.fillStyle = '#ffffff'; o.fillRect(0, 0, out.width, out.height); }
    else if (mode === 'shown') { o.fillStyle = cssVar('--bg') || '#000000'; o.fillRect(0, 0, out.width, out.height); }
    o.imageSmoothingEnabled = false; o.drawImage(t, 0, 0, out.width, out.height);
    return out;
  }
  function openImgExport(id) {
    if (!images[id]) { flash('IMAGE NOT FOUND'); return; }
    expId = id; $('imgexp').classList.add('show');
    exportCanvas(id, 'shown', 1).then(c => { const p = $('expprev'); if (!c) return; p.width = c.width; p.height = c.height; p.getContext('2d').drawImage(c, 0, 0); });
  }
  async function saveExport(mode) {
    if (expId == null) return;
    const id = expId, sc = +$('expscale').value || 4, cv = await exportCanvas(id, mode, sc);
    if (!cv) { flash('IMAGE NOT FOUND'); return; }
    const blob = await new Promise(r => cv.toBlob(r, 'image/png')); if (!blob) { flash('COULD NOT MAKE THE PNG'); return; }
    const name = 'dos-writer-image-' + id + (mode === 'bw' ? '-black-on-white' : mode === 'tr' ? '-transparent' : '') + '.png';
    const dl = await getDL();
    if (dl) {
      try { await dl.save({ filename: name, data: blob }); flash('IMAGE SAVED'); $('imgexp').classList.remove('show'); }
      catch (e) { flash(e && e.code === 'declined' ? 'SAVE CANCELLED' : 'COULD NOT SAVE IMAGE (' + ((e && e.code) || 'error') + ')'); }
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); flash('IMAGE DOWNLOADED'); $('imgexp').classList.remove('show');
  }
  $('expshown').onclick = () => saveExport('shown'); $('expbw').onclick = () => saveExport('bw'); $('exptr').onclick = () => saveExport('tr');
  $('expcancel').onclick = () => $('imgexp').classList.remove('show');
  $('nsave').onclick = () => { if (editing && editing.img != null) openImgExport(editing.img); };

  // ---------- journal, calendar and contacts ----------
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const p2 = n => (n < 10 ? '0' : '') + n;
  const ymd = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const parseYmd = t => { const a = t.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
  const dateLabel = t => { const d = parseYmd(t); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };
  function parseHeadDate(line) {
    const m = line.match(/^#{1,3}\s+(?:[A-Za-z]+,?\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/); if (!m) return null;
    const mi = MONTHS.findIndex(x => x.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3))); if (mi < 0) return null;
    return m[3] + '-' + p2(mi + 1) + '-' + p2(+m[1]);
  }
  let events = { list: [], next: 1 }, people = { list: [], next: 1 };
  try { const o = JSON.parse(load(K.events) || 'null'); if (o && Array.isArray(o.list)) events = { list: o.list, next: o.next || (o.list.length + 1) }; } catch (e) { /* ignore */ }
  try { const o = JSON.parse(load(K.people) || 'null'); if (o && Array.isArray(o.list)) people = { list: o.list, next: o.next || (o.list.length + 1) }; } catch (e) { /* ignore */ }
  let evT, plT;
  function saveEvents() { clearTimeout(evT); if (!store(K.events, JSON.stringify(events))) flash('EVENTS NOT SAVED - STORAGE FULL?'); }
  function savePeople() { clearTimeout(plT); if (!store(K.people, JSON.stringify(people))) flash('CONTACTS NOT SAVED - STORAGE FULL?'); }
  function savePeopleLater() { clearTimeout(plT); plT = setTimeout(savePeople, 400); }

  // journal: one dated heading per day inside a normal document
  function journalDoc(kind, create) {
    let d = lib.list.find(x => x.journal === kind || (kind === 'journal' && x.journal === true));
    if (!d && create) { persist(); const id = lib.next++; d = { id, name: kind === 'dream' ? 'dreams.txt' : 'journal.txt', journal: kind }; lib.list.push(d); store(K.body + id, ''); saveLib(); }
    return d;
  }
  function journalIndex(kind) {
    const d = journalDoc(kind, false), out = {}; if (!d) return out;
    const text = d.id === lib.cur ? serialize() : (load(K.body + d.id) || ''); let key = null;
    text.split('\n').forEach(raw => {
      const line = raw.replace(/\[#[0-9a-fA-F]{6}\]|\[\/\]/g, '').replace(/^\[dc:[0-9a-fA-F]{6}\]/, '').trim();
      const k = parseHeadDate(line);
      if (k) { key = k; if (!out[k]) out[k] = { words: 0 }; return; }
      if (key) out[key].words += wordsOf(line);
    });
    return out;
  }
  function openJournal(ds, kind) {
    ds = ds || ymd(new Date()); kind = kind || 'journal';
    const jd = journalDoc(kind, true), LB = kind === 'dream' ? 'DREAM' : 'JOURNAL'; setView('write'); if (lib.cur !== jd.id) switchDoc(jd.id);
    let hb = null, later = null;
    blocks().forEach(b => { if (isImg(b)) return; const k = parseHeadDate(blockPlain(b).trim()); if (!k) return; if (k === ds) hb = hb || b; else if (k > ds && !later) later = b; });
    let wb;
    if (!hb) {
      const bl = blocks(); if (bl.length === 1 && !isImg(bl[0]) && !blockPlain(bl[0]).trim()) bl[0].remove();
      hb = createBlock('## ' + dateLabel(ds)); wb = createBlock(''); const gap = createBlock('');
      if (later) { later.before(hb); later.before(wb); later.before(gap); }
      else {
        const last = editor.lastElementChild;
        if (last && !isImg(last) && blockPlain(last).trim()) editor.appendChild(createBlock(''));
        editor.appendChild(hb); editor.appendChild(wb); editor.appendChild(gap);
      }
      ensureTail(); commit(); refresh(); flash('NEW ' + LB + ' ENTRY: ' + dateLabel(ds).toUpperCase());
    } else { wb = hb.nextElementSibling || hb; flash(LB + ': ' + dateLabel(ds).toUpperCase()); }
    setCaret(wb, 0); wb.scrollIntoView({ block: 'center' }); lockCheck();
  }

  // calendar
  let calM = new Date(), calSel = ymd(new Date()); calM.setDate(1);
  function birthdaysOn(md) { return people.list.filter(c => c.bday && c.bday.slice(-5) === md && (c.name || c.nick)); }
  function renderCal() {
    const idx = journalIndex('journal'), idd = journalIndex('dream'), y = calM.getFullYear(), m = calM.getMonth(), g = $('calgrid'), todayS = ymd(new Date());
    $('caltitle').textContent = MONTHS[m] + ' ' + y; g.innerHTML = '';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(d => { const e = document.createElement('div'); e.className = 'dow'; e.textContent = d; g.appendChild(e); });
    const first = new Date(y, m, 1), off = (first.getDay() + 6) % 7, dim = new Date(y, m + 1, 0).getDate(), cells = Math.ceil((off + dim) / 7) * 7;
    for (let i = 0; i < cells; i++) {
      const d = new Date(y, m, 1 - off + i), k = ymd(d), b = document.createElement('button');
      b.className = 'cd' + (d.getMonth() !== m ? ' out' : '') + (k === todayS ? ' today' : '') + (k === calSel ? ' sel' : '');
      b.appendChild(document.createTextNode(String(d.getDate())));
      const j = idx[k];
      if (j) { const s = document.createElement('i'); s.className = 'jb j' + (j.words >= 400 ? 3 : j.words >= 100 ? 2 : 1); b.appendChild(s); }
      const dj = idd[k];
      if (dj) { const s = document.createElement('i'); s.className = 'jb dr j' + (dj.words >= 400 ? 3 : dj.words >= 100 ? 2 : 1); b.appendChild(s); }
      const ne = events.list.filter(e => e.d === k).length, nb = birthdaysOn(k.slice(5)).length;
      if (ne || nb) { const s = document.createElement('span'); s.className = 'mk'; s.textContent = (nb ? '*' : '') + (ne ? '•'.repeat(Math.min(ne, 3)) : ''); b.appendChild(s); }
      b.onclick = () => { calSel = k; if (d.getMonth() !== m) { calM = new Date(d.getFullYear(), d.getMonth(), 1); } renderCal(); };
      g.appendChild(b);
    }
    renderDay();
  }
  function renderDay() {
    const P = $('calday'); P.innerHTML = '';
    const h = document.createElement('h4'); h.textContent = dateLabel(calSel); P.appendChild(h);
    const row = (txt, btn) => { const r = document.createElement('div'); r.className = 'rw'; const s = document.createElement('span'); s.textContent = txt; r.appendChild(s); if (btn) r.appendChild(btn); P.appendChild(r); return r; };
    const mkb = (lab, fn) => { const b = document.createElement('button'); b.textContent = lab; b.onclick = fn; return b; };
    [['journal', 'Journal'], ['dream', 'Dream']].forEach(([k, l]) => {
      const j = journalIndex(k)[calSel];
      row(j ? l + ' entry: ' + j.words + ' words' : 'No ' + l.toLowerCase() + ' entry yet', mkb(j ? '[Open entry]' : '[Start entry]', () => openJournal(calSel, k)));
    });
    const yr = +calSel.slice(0, 4);
    birthdaysOn(calSel.slice(5)).forEach(c => { const by = (bdayParts(c.bday) || {}).y, age = by && by < yr ? ' (turns ' + (yr - by) + ')' : ''; row('* ' + (c.name || c.nick) + "'s birthday" + age, mkb('[Open]', () => { setView('contacts'); openContact(c); })); });
    events.list.filter(e => e.d === calSel).forEach(e => row('• ' + e.t, mkb('[x]', () => { events.list = events.list.filter(x => x !== e); saveEvents(); renderCal(); })));
    const a = document.createElement('div'); a.className = 'add';
    const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'add an event or reminder'; inp.autocomplete = 'off';
    const add = () => { const t = inp.value.trim(); if (!t) return; events.list.push({ id: events.next++, d: calSel, t }); saveEvents(); renderCal(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    a.appendChild(inp); a.appendChild(mkb('[Add]', add)); P.appendChild(a);
  }
  $('calprev').onclick = () => { calM = new Date(calM.getFullYear(), calM.getMonth() - 1, 1); renderCal(); };
  $('calnext').onclick = () => { calM = new Date(calM.getFullYear(), calM.getMonth() + 1, 1); renderCal(); };
  $('caltoday').onclick = () => { calM = new Date(); calM.setDate(1); calSel = ymd(new Date()); renderCal(); };
  $('calclose').onclick = () => setView('write');
  $('calBtn').onclick = () => { calM = parseYmd(calSel); calM.setDate(1); setView('cal'); if (curView() === 'cal') renderCal(); };
  $('journalBtn').onclick = () => openJournal(null, 'journal');
  $('dreamBtn').onclick = () => openJournal(null, 'dream');
  $('backBtn').onclick = () => { if (lib.list.some(x => x.id === lastMain)) { setView('write'); switchDoc(lastMain); } };

  // birthdays are typed; stored as YYYY-MM-DD, or --MM-DD when the year is unknown
  function bdayParts(b) { const m = String(b || '').match(/^(?:(\d{4})|-)-(\d\d)-(\d\d)$/); return m ? { y: m[1] ? +m[1] : 0, m: +m[2], d: +m[3] } : null; }
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
  function bdayText(b) { const q = bdayParts(b); return q ? ordinal(q.d) + ' ' + MONTHS[q.m - 1] + (q.y ? ' ' + q.y : '') : ''; }
  function bdayNumeric(b) { const q = bdayParts(b); return q ? q.d + '/' + q.m + (q.y ? '/' + q.y : '') : ''; }
  function parseBirthday(t) {
    t = String(t || '').trim().toLowerCase(); if (!t) return '';
    const mon = w => MONTHS.findIndex(x => x.toLowerCase().startsWith(w.slice(0, 3))) + 1;
    const mk = (y, mo, d) => {
      if (mo < 1 || mo > 12 || d < 1 || d > new Date(y || 2000, mo, 0).getDate()) return null;
      if (y && (y < 1850 || y > new Date().getFullYear())) return null;
      return (y ? String(y) : '-') + '-' + p2(mo) + '-' + p2(d);
    };
    const yr = v => { v = +v; if (v >= 100) return v; return v <= (new Date().getFullYear() % 100) ? 2000 + v : 1900 + v; };
    let m;
    if ((m = t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))) return mk(+m[1], +m[2], +m[3]);
    if ((m = t.match(/^(\d{1,2})[-\/. ](\d{1,2})[-\/. ](\d{2,4})$/))) return mk(yr(m[3]), +m[2], +m[1]);
    if ((m = t.match(/^(\d{1,2})[-\/.](\d{1,2})$/))) return mk(0, +m[2], +m[1]);
    if ((m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,})\.?,?\s*(\d{4})?$/)) && mon(m[2])) return mk(m[3] ? +m[3] : 0, mon(m[2]), +m[1]);
    if ((m = t.match(/^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/)) && mon(m[1])) return mk(m[3] ? +m[3] : 0, mon(m[1]), +m[2]);
    return null;
  }
  // contacts
  let editingC = null;
  function personAge(c) {
    const q = bdayParts(c.bday);
    if (q && q.y) { const t = new Date(); let a = t.getFullYear() - q.y; if (t.getMonth() + 1 < q.m || (t.getMonth() + 1 === q.m && t.getDate() < q.d)) a--; return a >= 0 && a < 150 ? String(a) : ''; }
    return c.age ? String(c.age) : '';
  }
  function renderPeople() {
    const q = $('psearch').value.trim().toLowerCase(), g = $('pgrid'); g.innerHTML = '';
    const hay = c => [c.name, c.nick, c.phone, c.email, c.addr, c.notes].concat((c.fields || []).map(f => f[0] + ' ' + f[1])).join(' ').toLowerCase();
    const list = people.list.filter(c => !q || hay(c).includes(q)).sort((a, b) => (a.name || '~').toLowerCase().localeCompare((b.name || '~').toLowerCase()));
    $('pcount').textContent = list.length + (list.length === people.list.length ? '' : '/' + people.list.length) + ' contacts';
    if (!list.length) { const e = document.createElement('div'); e.className = 'nempty'; e.textContent = people.list.length ? 'No contacts match.' : 'No contacts yet. Tap [+ Contact].'; g.appendChild(e); return; }
    list.forEach(c => {
      const card = document.createElement('div'); card.className = 'pcard';
      if (c.img != null && images[c.img]) { const cv = document.createElement('canvas'); cv.className = 'cph'; paintNoteImg(cv, c.img); cv.title = 'Tap for full size'; cv.onclick = e => { e.stopPropagation(); showPhoto(c.img); }; card.appendChild(cv); }
      else { const ph = document.createElement('div'); ph.className = 'cph'; ph.textContent = ((c.name || c.nick || '?').trim()[0] || '?').toUpperCase(); card.appendChild(ph); }
      const info = document.createElement('div'); info.className = 'pinfo';
      const line = (cls, t) => { if (!t) return; const d = document.createElement('div'); d.className = cls; d.textContent = t; info.appendChild(d); };
      line('pn', c.name || '(no name)'); if (c.nick) line('', 'Nickname: ' + c.nick); line('', c.phone); line('', c.email);
      const age = personAge(c), bq = bdayParts(c.bday), bd = bq ? ordinal(bq.d) + ' ' + MONTHS[bq.m - 1].slice(0, 3) : '';
      line('ps', [age ? 'Age ' + age : '', bd ? 'Born ' + bd : ''].filter(Boolean).join('  ·  '));
      card.appendChild(info); card.onclick = () => openContact(c); g.appendChild(card);
    });
  }
  function drawContactPhoto(c) {
    const cv = $('cphoto');
    if (c.img != null && images[c.img]) paintNoteImg(cv, c.img); else { cv.width = 8; cv.height = 8; cv.getContext('2d').clearRect(0, 0, 8, 8); }
    $('cphotoBtn').textContent = c.img != null ? '[Change photo]' : '[Add photo]'; $('cphotoDel').style.display = c.img != null ? '' : 'none';
  }
  function drawContactFields(c) {
    const W = $('cfields'); W.innerHTML = '';
    (c.fields || []).forEach((f, i) => {
      const r = document.createElement('div'); r.className = 'cfr';
      const k = document.createElement('input'); k.type = 'text'; k.placeholder = 'label'; k.value = f[0]; k.setAttribute('list', 'cfsug');
      const v = document.createElement('input'); v.type = 'text'; v.placeholder = 'value'; v.value = f[1];
      const x = document.createElement('button'); x.textContent = '[x]'; x.title = 'Remove this field';
      k.oninput = () => { f[0] = k.value; savePeopleLater(); }; v.oninput = () => { f[1] = v.value; savePeopleLater(); };
      x.onclick = () => { c.fields.splice(i, 1); savePeople(); drawContactFields(c); };
      r.appendChild(k); r.appendChild(v); r.appendChild(x); W.appendChild(r);
    });
  }
  const CF = { cname: 'name', cnick: 'nick', cphone: 'phone', cemail: 'email', cage: 'age', caddr: 'addr', cnotes: 'notes' };
  Object.keys(CF).forEach(id => $(id).addEventListener('input', () => { if (editingC) { editingC[CF[id]] = $(id).value; editingC.t = Date.now(); savePeopleLater(); } }));
  $('cbday').addEventListener('input', () => {
    if (!editingC) return; const el = $('cbday');
    const grew = el.value.length > (+el.dataset.pl || 0); el.dataset.pl = el.value.length;
    if (grew && (/^\d{2}$/.test(el.value) && +el.value >= 1 || /^\d{1,2}\/\d{2}$/.test(el.value))) { el.value += '/'; el.dataset.pl = el.value.length; try { el.setSelectionRange(el.value.length, el.value.length); } catch (x) { /* ignore */ } }
    const v = el.value, r = parseBirthday(v), h = $('cbhint');
    editingC.bdayRaw = v;
    if (r === null) { h.textContent = 'Not recognised yet. Type it as day/month/year, e.g. 16/1/1986.'; return; }
    editingC.bday = r; h.textContent = r ? '= ' + bdayText(r) : ''; editingC.t = Date.now(); savePeopleLater();
  });
  $('cbday').addEventListener('focus', () => { if (editingC && editingC.bday) $('cbday').value = bdayNumeric(editingC.bday); $('cbday').dataset.pl = $('cbday').value.length; });
  $('cbday').addEventListener('blur', () => { if (editingC && editingC.bday && parseBirthday($('cbday').value) !== null) { $('cbday').value = bdayText(editingC.bday); $('cbhint').textContent = ''; } });
  function openContact(c) {
    editingC = c; Object.keys(CF).forEach(id => { $(id).value = c[CF[id]] || ''; });
    $('cbday').value = c.bday ? bdayText(c.bday) : ''; $('cbday').dataset.pl = $('cbday').value.length; $('cbhint').textContent = '';
    if (!c.fields) c.fields = []; drawContactFields(c); drawContactPhoto(c); openOv('cedit');
    if (!c.name && !c.phone && !c.email) $('cname').focus();
  }
  function contactClosed() {
    const c = editingC; editingC = null; if (!c) return;
    const empty = !(c.name || c.nick || c.phone || c.email || c.addr || c.notes || c.bday || c.age || c.img != null || (c.fields || []).some(f => f[0] || f[1]));
    if (empty) people.list = people.list.filter(x => x !== c);
    c.fields = (c.fields || []).filter(f => f[0] || f[1]);
    savePeople(); if (curView() === 'contacts') renderPeople(); else if (curView() === 'cal') renderCal();
  }
  $('pnew').onclick = () => { const c = { id: people.next++, name: '', phone: '', email: '', bday: '', age: '', addr: '', notes: '', fields: [], img: null, t: Date.now() }; people.list.push(c); openContact(c); };
  $('cfadd').onclick = () => { if (!editingC) return; editingC.fields.push(['', '']); drawContactFields(editingC); const ins = $('cfields').querySelectorAll('input'); if (ins.length > 1) ins[ins.length - 2].focus(); };
  $('cphotoBtn').onclick = () => { if (!editingC) return; const c = editingC; chooseImage(f => addNoteImage(f, i => { c.img = i; savePeople(); if (editingC === c) drawContactPhoto(c); })); };
  $('cphotoDel').onclick = () => { if (!editingC) return; editingC.img = null; savePeople(); drawContactPhoto(editingC); };
  $('cdone').onclick = () => closeOv('cedit');
  let photoId = null;
  function showPhoto(id) { if (!images[id]) return; photoId = id; paintNoteImg($('pvcanvas'), id); $('photoview').classList.add('show'); }
  const hidePhoto = () => $('photoview').classList.remove('show');
  $('pvcanvas').onclick = hidePhoto; $('pvclose').onclick = hidePhoto; $('pvsave').onclick = () => { if (photoId != null) openImgExport(photoId); };
  $('photoview').addEventListener('click', e => { if (e.target === $('photoview')) hidePhoto(); });
  $('cphoto').onclick = () => { if (editingC && editingC.img != null) showPhoto(editingC.img); };
  $('cdel').onclick = () => {
    if (!editingC || !confirmTwice('Delete this contact?')) return;
    const c = editingC; editingC = null; people.list = people.list.filter(x => x !== c); savePeople(); closeOv('cedit'); flash('CONTACT DELETED');
  };
  $('pclose').onclick = () => setView('write');
  $('psearch').addEventListener('input', renderPeople);
  $('peopleBtn').onclick = () => setView('contacts');

  // ---------- toolbar ----------
  document.querySelectorAll('#titlebar button, #find button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  async function copyAll() {
    try { await navigator.clipboard.writeText(plainText()); flash('COPIED TO CLIPBOARD'); }
    catch (e) { const r = document.createRange(); r.selectNodeContents(editor); const s = getSelection(); s.removeAllRanges(); s.addRange(r); flash('PRESS CTRL+C TO COPY'); }
  }
  $('newBtn').onclick = () => { persist(); drawDocs(); openOv('docs'); $('docin').focus(); flash('NAME THE NEW DOCUMENT, THEN [New]'); };
  $('openBtn').onclick = openFile; $('copyBtn').onclick = copyAll;
  $('docsBtn').onclick = openDocs; $('docname').onclick = openDocs;
  $('snapBtn').onclick = openSnaps; $('bkBtn').onclick = openBackup;
  $('navBtn').onclick = openNav; $('findBtn').onclick = openFind; $('goalBtn').onclick = openGoal;
  $('imgBtn').onclick = pickImage; $('capBtn').onclick = toggleCap;
  $('detail').onchange = e => store(K.detail, e.target.value);
  $('wordcolour').onchange = e => { const v = e.target.value; e.target.value = ''; if (v) applyColour(v); };
  $('capcolour').onchange = e => {
    const v = e.target.value; e.target.value = ''; if (!v) return;
    restore(); const b = curBlock(), cap = b && b.querySelector('.cap');
    if (!cap) { flash('PUT THE CURSOR IN A DROP CAP PARAGRAPH'); return; }
    cap.dataset.c = v; paintCap(cap); commit();
  };
  function setCapStyle(v) { capStyle = v; store(K.capstyle, v); $('capstyle').value = v; repaintAll(); }
  $('capstyle').onchange = e => setCapStyle(e.target.value);
  function setTheme(t) { store(K.theme, t); root.dataset.theme = t; $('theme').value = t; repaintAll(); }
  $('theme').onchange = e => setTheme(e.target.value);
  function setMode(m) { store(K.mode, m); body.classList.toggle('screenplay', m === 'screenplay'); $('mode').value = m; updateScript(); updateStats(); flash(m.toUpperCase() + ' MODE' + (m === 'screenplay' ? '  (TAB cycles line type)' : '')); }
  $('mode').onchange = e => setMode(e.target.value);
  function applyTextColor(c) { if (c) root.style.setProperty('--fg', c); else root.style.removeProperty('--fg'); repaintAll(); }
  $('textcolor').onchange = e => { store(K.tc, e.target.value); applyTextColor(e.target.value); };

  // ---------- full screen ----------
  const inFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  let lastEsc = 0, reenter = false;
  async function goFull() {
    const req = root.requestFullscreen || root.webkitRequestFullscreen; if (!req) throw 0;
    await req.call(root);
  }
  async function toggleFull() {
    try {
      if (!inFull()) { await goFull(); store('dos-writer-full', '1'); flash('FULL SCREEN  (F11 or ESC to exit)'); }
      else { store('dos-writer-full', '0'); const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) await ex.call(document); }
    } catch (e) { flash('FULL SCREEN BLOCKED HERE - USE F11 OR OPEN IN OWN TAB'); }
  }
  // If full screen drops without the writer asking for it (page reloaded, window focus lost), re-enter on the next tap or key.
  document.addEventListener('keydown', e => { if (e.key === 'Escape') lastEsc = Date.now(); }, true);
  const onFsChange = () => { if (!inFull() && Date.now() - lastEsc <= 600) store('dos-writer-full', '0'); reenter = !inFull() && load('dos-writer-full') === '1' && Date.now() - lastEsc > 600; };
  document.addEventListener('fullscreenchange', onFsChange); document.addEventListener('webkitfullscreenchange', onFsChange);
  if (load('dos-writer-full') === '1') reenter = true;
  const tryReenter = () => { if (!reenter || inFull()) return; reenter = false; goFull().catch(() => {}); };
  document.addEventListener('pointerdown', tryReenter, true); document.addEventListener('keydown', tryReenter, true);
  $('fsBtn').onclick = toggleFull;

  // ---------- help ----------
  $('helpText').textContent = [
    'D.O.S (DISTRACTION OBFUSCATION SYSTEM) - KEYS', '',
    'Ctrl+K       command palette (everything is in here)',
    'Ctrl+F       find and replace',
    'Ctrl+D       drop cap on/off for this paragraph',
    'Ctrl+Z / Y   undo / redo',
    'Esc          show/hide title and status bars',
    'Tab          screenplay: complete a character name, or cycle line type',
    '/            type / at the start of an empty line for quick commands (/date, /break, /chapter, /note ...)',
    '',
    '[Docs]    switch documents      [Snap]   named snapshots',
    '[Backup]  copy everything out   [Nav]    chapters / scenes',
    '[Goal]    daily or total word goal',
    '[Comfort] typewriter scrolling, text size, key clicks',
    '',
    'Chapter lines ("Chapter 1", "Part II", "# Title") show in [Nav].',
    'Everything autosaves in this browser - use [Backup] now and then.',
    '', 'Click outside this box or press F1 to close.'
  ].join('\n');
  function toggleHelp(v) { $('help').classList.toggle('show', v === undefined ? !$('help').classList.contains('show') : v); }
  $('helpBtn').onclick = () => toggleHelp();

  // ---------- command palette ----------
  const pal = $('pal'), pin = $('palin'), plist = $('pallist'); let pidx = 0, pitems = [];
  function commands() {
    return [['Documents', openDocs], ['New document', () => $('newBtn').click()], ['Import text file', openFile], ['Copy all text', copyAll],
      ['Snapshots', openSnaps], ['Backup / restore', openBackup], ['Contents (chapters / scenes)', openNav], ['Find and replace', openFind], ['Word goal', openGoal],
      ['Insert image', pickImage], ['Notes board on/off', () => setNotesMode(!body.classList.contains('notes'))], ['Quick note (from selection)', quickNote], ['Notes: switch grid / board', toggleNotesView], ['Journal: today\'s entry', () => openJournal(null, 'journal')], ['Dream journal: today\'s entry', () => openJournal(null, 'dream')], ['Back to main document', () => $('backBtn').click()], ['Calendar', () => $('calBtn').click()], ['Contacts', () => setView('contacts')], ['New contact', () => { setView('contacts'); $('pnew').click(); }], ['Notes for this project', () => { setNotesMode(true); $('nfilter').value = 'cur'; renderNotes(); }], ['CRT effect: cycle off / scanlines / full', cycleCrt], ['Startup sequence on/off', () => $('bootBtn').click()], ['Replay startup sequence', runBoot], ['Notes: add image note', () => { setNotesMode(true); $('nimg').click(); }], ['Toggle drop cap', toggleCap], ['Cap chapter openers', capChapters], ['Remove all drop caps', removeAllCaps],
      ['Comfort mode on/off', () => setComfort(!body.classList.contains('comfort'))], ['Scene numbers on/off', () => setNum(!body.classList.contains('numbered'))],
      ['Copy as Fountain', () => copyOut(toFountain(), 'FOUNTAIN')], ['Copy as formatted screenplay', () => copyOut(toFormatted(), 'SCREENPLAY')],
      ['Search everything', openGS], ['Sync now', () => (SY.on ? syncRun(true) : setSync(true))], ['Sync on/off', () => setSync(!SY.on)], ['Lock now', lockNow], ['Privacy lock: set or change PIN', startPin], ['Privacy lock: remove PIN', removePin], ['Hide screen', hideScreen],
      ['Undo', undo], ['Redo', redo], ['Full screen', toggleFull], ['Help', () => toggleHelp(true)],
      ['Mode: prose', () => setMode('prose')], ['Mode: screenplay', () => setMode('screenplay')]]
      .concat(THEMES.map(([k, l]) => ['Theme: ' + l, () => setTheme(k)]))
      .concat(CAP_STYLES.map(([k, l]) => ['Drop cap style: ' + l, () => setCapStyle(k)]));
  }
  function drawPal() {
    const q = pin.value.trim().toLowerCase();
    pitems = commands().filter(c => c[0].toLowerCase().includes(q)); if (pidx >= pitems.length) pidx = 0;
    plist.innerHTML = '';
    pitems.forEach((c, i) => { const d = document.createElement('div'); d.textContent = c[0]; if (i === pidx) d.className = 'on'; d.onclick = () => runPal(i); plist.appendChild(d); });
  }
  function openPal() { openOv('pal'); pin.value = ''; pidx = 0; drawPal(); pin.focus(); }
  function closePal() { pal.classList.remove('show'); editor.focus(); restore(); }
  function runPal(i) { const c = pitems[i]; closePal(); if (c) setTimeout(c[1], 0); }
  pin.addEventListener('input', () => { pidx = 0; drawPal(); });
  pin.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); pidx = Math.min(pitems.length - 1, pidx + 1); drawPal(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); pidx = Math.max(0, pidx - 1); drawPal(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPal(pidx); }
    else if (e.key === 'Escape') { e.stopPropagation(); closePal(); }
  });
  $('palBtn').onclick = openPal;

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.querySelector('.dd.open')) { closeDD(); return; }
      const ov = document.querySelector('#imgexp.show, #imgsrc.show, #photoview.show') || document.querySelector('.overlay.show');
      if (ov) { closeOv(ov.id); return; }
      if ($('find').classList.contains('show')) { closeFind(); return; }
      body.classList.toggle('focus');
    }
    if (e.key === 'F1') { e.preventDefault(); toggleHelp(); }
    if (e.key === 'F11') { e.preventDefault(); toggleFull(); }
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'k') { e.preventDefault(); openPal(); }
    if (mod && k === 'f') { e.preventDefault(); if (body.classList.contains('notes')) $('nsearch').focus(); else openFind(); }
    if (mod && k === 's') { e.preventDefault(); commit(); persist(); flash('SAVED'); }
  });

  // ---------- slash commands: type / at the start of a line ----------
  function insertAtCaret(str) {
    editor.focus();
    if (!document.execCommand('insertText', false, str)) {
      const s = getSelection(); if (s.rangeCount) { const r = s.getRangeAt(0); r.deleteContents(); const t = document.createTextNode(str); r.insertNode(t); r.setStartAfter(t); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
    }
    later();
  }
  const timeText = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const SL = [
    ['date', "Today's date", ['today'], () => insertAtCaret(dateLabel(ymd(new Date())))],
    ['time', 'The time', ['clock'], () => insertAtCaret(timeText())],
    ['now', 'Date and time', ['datetime', 'stamp'], () => insertAtCaret(dateLabel(ymd(new Date())) + ', ' + timeText())],
    ['chapter', 'Next chapter heading', ['heading'], () => insertAtCaret('Chapter ' + (headings().filter(h => /^chapter\s/i.test(h.line)).length + 1))],
    ['break', 'Scene break  * * *', ['scene', 'divider', 'rule'], b => { insertAtCaret('* * *'); const nb = createBlock(''); b.after(nb); setCaret(nb, 0); commit(); refresh(); }],
    ['heading', 'Make this line a heading', ['h', 'title'], () => insertAtCaret('## ')],
    ['cap', 'Drop cap on / off', ['dropcap'], () => toggleCap()],
    ['image', 'Insert an image', ['photo', 'picture', 'camera'], () => pickImage()],
    ['note', 'Quick note about this spot', ['idea'], () => quickNote()],
    ['words', 'Show the word count', ['count'], () => flash(countWords().toLocaleString() + ' WORDS')],
    ['journal', "Today's journal entry", ['diary'], () => openJournal(null, 'journal')],
    ['dream', "Today's dream entry", ['dreams'], () => openJournal(null, 'dream')],
    ['back', 'Back to your main document', ['main'], () => $('backBtn').click()],
    ['notes', 'Notes board', ['board', 'pinboard'], () => setView('notes')],
    ['calendar', 'Calendar', ['events', 'cal'], () => $('calBtn').click()],
    ['contacts', 'Contacts', ['people'], () => setView('contacts')],
    ['docs', 'Switch document', ['documents', 'files'], () => openDocs()],
    ['nav', 'Chapters and scenes', ['contents'], () => openNav()],
    ['find', 'Find and replace', ['replace'], () => openFind()],
    ['search', 'Search everything', ['global', 'all'], () => openGS()],
    ['sync', 'Sync with your other device now', ['cloud'], () => (SY.on ? syncRun(true) : setSync(true))],
    ['lock', 'Lock journal, dreams and contacts', ['pin', 'private'], () => lockNow()],
    ['hide', 'Hide the screen', ['panic', 'cover'], () => hideScreen()],
    ['goal', 'Word goal', ['target'], () => openGoal()],
    ['snapshot', 'Snapshots', ['snap', 'version'], () => openSnaps()],
    ['backup', 'Backup and restore', ['export'], () => openBackup()],
    ['full', 'Full screen', ['fullscreen'], () => toggleFull()],
    ['crt', 'CRT effect', ['scanlines'], () => cycleCrt()],
    ['prose', 'Prose mode', [], () => setMode('prose')],
    ['screenplay', 'Screenplay mode', ['script'], () => setMode('screenplay')],
    ['help', 'Help', ['?'], () => toggleHelp(true)]
  ];
  const slash = $('slash'); let slOpen = false, slItems = [], slIdx = 0;
  function slashClose() { if (!slOpen) return; slOpen = false; slash.classList.remove('show'); }
  function slashDraw() {
    slash.innerHTML = '';
    slItems.forEach((it, i) => {
      const d = document.createElement('div'); if (i === slIdx) d.className = 'on';
      const a = document.createElement('span'), z = document.createElement('span'); a.textContent = '/' + it[0]; z.textContent = it[1]; d.appendChild(a); d.appendChild(z);
      d.addEventListener('mousedown', e => e.preventDefault()); d.addEventListener('click', () => slashRun(it));
      slash.appendChild(d);
    });
    const on = slash.children[slIdx]; if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function slashPlace() {
    const b = curBlock(); if (!b) return; const r = b.getBoundingClientRect(), vh = window.visualViewport ? window.visualViewport.height : innerHeight;
    slash.style.left = Math.max(8, Math.min(r.left, innerWidth - slash.offsetWidth - 8)) + 'px';
    let top = r.bottom + 4; if (top + slash.offsetHeight > vh - 8) top = Math.max(8, r.top - slash.offsetHeight - 4);
    slash.style.top = top + 'px';
  }
  function slashUpdate() {
    const b = curBlock(); const t = b && !isImg(b) ? txtOf(b).textContent : '';
    const m = t.match(/^\/([a-z?]*)$/i);
    if (!m) { slashClose(); return; }
    const q = m[1].toLowerCase();
    const a = SL.filter(it => !q || it[0].startsWith(q) || it[2].some(k => k.startsWith(q)));
    const c = q ? SL.filter(it => !a.includes(it) && (it[0].includes(q) || it[1].toLowerCase().includes(q))) : [];
    slItems = a.concat(c);
    if (!slItems.length) { slashClose(); return; }
    if (!slOpen || slIdx >= slItems.length) slIdx = 0;
    slOpen = true; slash.classList.add('show'); slashDraw(); slashPlace();
  }
  function slashRun(it) {
    slashClose(); const b = curBlock(); if (!b) return;
    const tx = txtOf(b); tx.textContent = ''; normalize(tx); setCaret(b, 0);
    it[3](b);
  }
  editor.addEventListener('input', slashUpdate);
  editor.addEventListener('pointerdown', slashClose);
  editor.addEventListener('blur', () => setTimeout(slashClose, 150));
  editor.addEventListener('keydown', e => {
    if (!slOpen) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); slIdx = (slIdx + (k === 'ArrowDown' ? 1 : slItems.length - 1)) % slItems.length; slashDraw(); }
    else if (k === 'Enter' || k === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); slashRun(slItems[slIdx]); }
    else if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); slashClose(); }
  }, true);

  // ---------- sync between devices (artifact database) ----------
  const SY = { on: load('dos-writer-sync-on') !== '0', ready: false, busy: false, again: false, t: null, last: 0, lastChange: 0, apply: false, col: null, key: 'dos-writer-sync', st: null };
  try { SY.st = JSON.parse(load(SY.key) || 'null'); } catch (e) { SY.st = null; }
  if (!SY.st || typeof SY.st !== 'object') SY.st = {};
  ['base', 'lt', 'lh'].forEach(k => { if (!SY.st[k]) SY.st[k] = {}; });
  if (!SY.st.dev) SY.st.dev = Math.random().toString(36).slice(2, 8);
  const SYCH = 40000;
  function hashStr(s) { let h = 5381 | 0; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + '.' + s.length; }
  function sySave() { store(SY.key, JSON.stringify(SY.st)); }
  function syStatus(t) { const el = $('syncst'); if (!el) return; el.style.display = SY.ready || t ? '' : 'none'; el.textContent = '[sync: ' + t + ']'; }
  const ihc = new WeakMap();
  function ih(i) { const im = images[i]; if (!im || !im.src) return null; let h = ihc.get(im); if (!h) { h = hashStr(im.src); ihc.set(im, h); } return h; }
  const toH = s => s.replace(/\[img:(\d+)\]/g, (m, n) => { const h = ih(+n); return h ? '[img:~' + h + ']' : m; });
  const imgIdx = h => { for (let i = 0; i < images.length; i++) if (ih(i) === h) return i; return -1; };
  const fromH = s => s.replace(/\[img:~([^\]]+)\]/g, (m, h) => { const i = imgIdx(h); return i < 0 ? m : '[img:' + i + ']'; });
  function ensureUids() {
    let ch = false;
    lib.list.forEach(d => { if (!d.uid) { d.uid = d.journal ? 'j' + (d.journal === true ? 'journal' : d.journal) : Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); ch = true; } });
    if (ch) saveLib();
  }
  function docItem(d) {
    const s = d.id === lib.cur ? serialize() : (load(K.body + d.id) || '');
    return JSON.stringify({ u: d.uid, name: d.name, goal: d.goal || null, journal: d.journal || null, s: toH(s) });
  }
  function localItems() {
    persist(); ensureUids();
    const it = {}, idU = {}; lib.list.forEach(d => { idU[d.id] = d.uid; it['d_' + d.uid] = docItem(d); });
    it.notes = JSON.stringify({ next: notes.next, view: notes.view, list: notes.list.map(n => {
      const c = Object.assign({}, n);
      if (c.doc != null) { c.docu = idU[c.doc] || null; delete c.doc; }
      if (c.ref) { const r = Object.assign({}, c.ref); r.u = idU[r.d] || null; delete r.d; c.ref = r; }
      if (c.img != null) { c.imgh = ih(c.img); delete c.img; }
      return c; }) });
    it.events = JSON.stringify(events);
    it.people = JSON.stringify({ next: people.next, list: people.list.map(p => { const c = Object.assign({}, p); if (c.img != null) { c.imgh = ih(c.img); delete c.img; } return c; }) });
    images.forEach((im, i) => { const h = ih(i); if (h) it['img_' + h] = JSON.stringify(im); });
    return it;
  }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function sw(p) { try { return await p(); } catch (e) { if (e && (e.code === 'resource_exhausted' || e.code === 'unavailable')) { await wait(1800); return await p(); } throw e; } }
  async function syWrite(k, str, oldN) {
    const n = Math.max(1, Math.ceil(str.length / SYCH));
    for (let i = 0; i < n; i++) await sw(() => SY.col.doc('c~' + k + '~' + i).set({ k: 'c', c: str.slice(i * SYCH, (i + 1) * SYCH) }));
    await sw(() => SY.col.doc('h~' + k).set({ k: 'h', key: k, h: hashStr(str), n, t: Date.now(), dev: SY.st.dev }));
    for (let i = n; i < (oldN || 0); i++) await sw(() => SY.col.doc('c~' + k + '~' + i).delete());
  }
  async function syTomb(k, oldN) {
    await sw(() => SY.col.doc('h~' + k).set({ k: 'h', key: k, del: true, h: '', n: 0, t: Date.now(), dev: SY.st.dev }));
    for (let i = 0; i < (oldN || 0); i++) await sw(() => SY.col.doc('c~' + k + '~' + i).delete());
  }
  async function syRead(k, head) {
    let s = '';
    for (let i = 0; i < head.n; i++) { const d = await sw(() => SY.col.doc('c~' + k + '~' + i).get()); if (!d.exists) return null; s += d.data().c; }
    return hashStr(s) === head.h ? s : null;
  }
  function recKey(r) { const c = Object.assign({}, r); delete c.id; delete c.t; return JSON.stringify(c); }
  function mergeColl(a, b) {
    const out = Object.assign({}, a), seen = new Set(a.list.map(recKey)); out.list = a.list.slice(); out.next = out.next || out.list.length + 1;
    b.list.forEach(r => { if (!seen.has(recKey(r))) { const c = Object.assign({}, r); c.id = out.next++; out.list.push(c); } });
    return out;
  }
  function decide(L, R, B, head) {
    if (L === R) return null;
    if (L === B) { if (R == null) return head && head.del ? (L != null ? 'pullDel' : null) : (L != null ? 'push' : null); return 'pull'; }
    if (R === B) return L == null ? 'pushDel' : 'push';
    if (L == null) return R != null ? 'pull' : null;
    if (R == null) return 'push';
    return 'conflict';
  }
  function applyItem(k, str, fl) {
    const o = JSON.parse(str);
    if (k.indexOf('img_') === 0) {
      const i = imgIdx(k.slice(4)); if (i < 0) images.push(o); else images[i] = o; fl.img = true;
    } else if (k.indexOf('d_') === 0) {
      let d = lib.list.find(x => x.uid === o.u);
      if (!d) { d = { id: lib.next++, name: o.name, uid: o.u }; lib.list.push(d); }
      d.name = o.name; if (o.goal) d.goal = o.goal; else delete d.goal; if (o.journal) d.journal = o.journal; else delete d.journal;
      store(K.body + d.id, fromH(o.s || '')); fl.lib = true; if (d.id === lib.cur) fl.cur = true;
    } else if (k === 'notes') {
      const idOf = u => { const d = lib.list.find(x => x.uid === u); return d ? d.id : null; };
      notes = { list: o.list.map(n => {
        const c = Object.assign({}, n);
        if ('docu' in c) { c.doc = idOf(c.docu); delete c.docu; }
        if (c.ref) { const r = Object.assign({}, c.ref), id = idOf(r.u); delete r.u; if (id == null) delete c.ref; else { r.d = id; c.ref = r; } }
        if ('imgh' in c) { const i = c.imgh ? imgIdx(c.imgh) : -1; delete c.imgh; if (i >= 0) c.img = i; }
        return c; }), next: o.next || (o.list.length + 1), view: o.view === 'board' ? 'board' : 'grid' };
      fl.notes = true;
    } else if (k === 'events') { events = { list: o.list || [], next: o.next || ((o.list || []).length + 1) }; fl.events = true; }
    else if (k === 'people') {
      people = { list: (o.list || []).map(p => { const c = Object.assign({}, p); if ('imgh' in c) { const i = c.imgh ? imgIdx(c.imgh) : -1; delete c.imgh; c.img = i >= 0 ? i : null; } return c; }), next: o.next || ((o.list || []).length + 1) }; fl.people = true;
    }
  }
  function removeLocalDoc(uid, fl) {
    const d = lib.list.find(x => x.uid === uid); if (!d) return;
    try { localStorage.removeItem(K.body + d.id); localStorage.removeItem(K.snaps + d.id); } catch (e) { /* ignore */ }
    lib.list = lib.list.filter(x => x !== d);
    if (!lib.list.length) lib.list.push({ id: lib.next++, name: 'untitled.txt' });
    if (!curDoc()) { lib.cur = lib.list[0].id; fl.cur = true; }
    fl.lib = true;
  }
  function snapIn(id, name, s) {
    let a = []; try { a = JSON.parse(load(K.snaps + id) || '[]'); } catch (e) { a = []; }
    a.unshift({ t: Date.now(), n: name, s, w: wordsOf(s) }); store(K.snaps + id, JSON.stringify(a.slice(0, 40)));
  }
  async function syncRun(manual) {
    if (!SY.on || !SY.ready) return;
    if (SY.busy) { SY.again = true; return; }
    SY.busy = true; syStatus('working');
    const fl = {}; let pushed = 0, pulled = 0, conflicts = 0;
    try {
      const snap = await SY.col.where('k', '==', 'h').get();
      const heads = {}; snap.docs.forEach(d => { const v = d.data(); if (v && v.key) heads[v.key] = v; });
      SY.apply = true; const loc = localItems(); SY.apply = false; const base = SY.st.base;
      const fresh = !Object.keys(base).length && lib.list.every(d => !(load(K.body + d.id) || '').trim() || d.id === lib.cur && !serialize().trim()) && !notes.list.length && !events.list.length && !people.list.length;
      if (fresh) Object.keys(loc).forEach(k => { if (k.indexOf('d_') === 0 || k === 'notes' || k === 'events' || k === 'people') { const o = JSON.parse(loc[k]); if ((o.s != null && !o.s) || (o.list && !o.list.length)) delete loc[k]; } });
      const keys = new Set(Object.keys(loc).concat(Object.keys(heads), Object.keys(base)));
      const L0 = {}; keys.forEach(k => { L0[k] = loc[k] != null ? hashStr(loc[k]) : null; });
      const order = Array.from(keys).sort((a, b) => (a.indexOf('img_') === 0 ? 0 : a.indexOf('d_') === 0 ? 1 : 2) - (b.indexOf('img_') === 0 ? 0 : b.indexOf('d_') === 0 ? 1 : 2));
      SY.apply = true;
      for (const k of order) {
        const head = heads[k], L = L0[k], R = head && !head.del ? head.h : null, B = base[k] || null;
        if (L != null && SY.st.lh[k] !== L) { SY.st.lh[k] = L; SY.st.lt[k] = SY.lastChange || Date.now(); }
        let act = decide(L, R, B, head);
        if (!act) { if (L === R) { if (L == null) delete base[k]; else base[k] = L; } continue; }
        if (act === 'conflict') {
          conflicts++;
          if (k === 'notes' || k === 'events' || k === 'people') {
            const rs = await syRead(k, head); if (rs == null) continue;
            const merged = JSON.stringify(mergeColl(JSON.parse(loc[k]), JSON.parse(rs)));
            applyItem(k, merged, fl); await syWrite(k, merged, head.n); base[k] = hashStr(merged); pushed++; pulled++; continue;
          }
          const rs = await syRead(k, head); if (rs == null) continue;
          const remoteNewer = (head.t || 0) > (SY.st.lt[k] || 0);
          if (k.indexOf('d_') === 0) { const d = lib.list.find(x => x.uid === k.slice(2)); if (d) snapIn(d.id, remoteNewer ? 'sync: this device before merge' : 'sync: other device', remoteNewer ? fromH(JSON.parse(loc[k]).s) : fromH(JSON.parse(rs).s)); }
          act = remoteNewer ? 'pull' : 'push';
        }
        if (act === 'pull') {
          const rs = await syRead(k, head); if (rs == null) continue;
          if (k.indexOf('d_') === 0) { const d = lib.list.find(x => x.uid === k.slice(2)); if (d && d.id === lib.cur && docItem(d) !== loc[k]) continue; }
          applyItem(k, rs, fl); base[k] = head.h; pulled++;
        } else if (act === 'pullDel') { removeLocalDoc(k.slice(2), fl); delete base[k]; pulled++; }
        else if (act === 'push') { await syWrite(k, loc[k], head && head.n); base[k] = L; pushed++; }
        else if (act === 'pushDel') { await syTomb(k, head && head.n); delete base[k]; pushed++; }
      }
      if (fresh && pulled) { lib.list.filter(d => !heads['d_' + d.uid] && !(d.id === lib.cur ? serialize() : (load(K.body + d.id) || '')).trim()).forEach(d => removeLocalDoc(d.uid, fl)); }
      if (fl.img) { store(K.imgs, JSON.stringify(images)); for (const k in imgEls) delete imgEls[k]; }
      if (fl.lib) { if (!curDoc()) lib.cur = lib.list[0].id; saveLib(); }
      if (fl.notes) store(K.notes, JSON.stringify(notes));
      if (fl.events) store(K.events, JSON.stringify(events));
      if (fl.people) store(K.people, JSON.stringify(people));
      SY.apply = false; sySave(); SY.last = Date.now();
      if (fl.cur || fl.img) { enterDoc(); }
      const v = curView(); if (!$('nedit').classList.contains('show') && !$('cedit').classList.contains('show')) { if (v === 'notes' && (fl.notes || fl.img)) renderNotes(); else if (v === 'cal' && (fl.events || fl.lib)) renderCal(); else if (v === 'contacts' && (fl.people || fl.img)) renderPeople(); }
      const t = new Date(); syStatus('ok ' + p2(t.getHours()) + ':' + p2(t.getMinutes()));
      if (manual) flash(pushed || pulled ? 'SYNCED: ' + pulled + ' IN, ' + pushed + ' OUT' + (conflicts ? ', ' + conflicts + ' MERGED' : '') : 'ALREADY UP TO DATE');
      else if (pulled) flash('SYNCED ' + pulled + ' CHANGE' + (pulled > 1 ? 'S' : '') + ' FROM YOUR OTHER DEVICE');
    } catch (e) {
      SY.apply = false; sySave(); SY.last = Date.now();
      const c = e && e.code; syStatus(c === 'quota_exceeded' ? 'full' : 'error');
      if (manual || c === 'quota_exceeded') flash(c === 'quota_exceeded' ? 'SYNC STORAGE FULL' : 'SYNC FAILED - WILL RETRY');
    }
    SY.busy = false;
    if (SY.again) { SY.again = false; syncSoon(); }
  }
  function syncSoon() { if (!SY.on || !SY.ready) return; clearTimeout(SY.t); SY.t = setTimeout(() => syncRun(), 12000); }
  syncHook = k => { if (SY.apply) return; if (k === K.idx || k === K.notes || k === K.events || k === K.people || k === K.imgs || k.indexOf(K.body) === 0) { SY.lastChange = Date.now(); syncSoon(); } };
  function setSync(on) { SY.on = on; store('dos-writer-sync-on', on ? '1' : '0'); if (!SY.ready) { flash('SYNC NEEDS THE ARTIFACT DATABASE - NOT AVAILABLE HERE'); return; } if (on) { syStatus('on'); syncRun(true); } else { clearTimeout(SY.t); syStatus('off'); flash('SYNC OFF'); } }
  async function syncInit() {
    try {
      if (!window.claude || !claude.use) return;
      const db = await claude.use('db'), us = await claude.use('user'); if (!db || !us) return;
      const id = await us.id(); if (!id) return;
      SY.col = db.collection('data/users/' + id); SY.ready = true; syStatus(SY.on ? 'on' : 'off');
      if (SY.on) setTimeout(() => syncRun(), 1500);
    } catch (e) { /* sync unavailable */ }
  }
  document.addEventListener('visibilitychange', () => { if (!SY.on || !SY.ready) return; if (document.hidden) { if (SY.lastChange > SY.last) syncRun(); } else syncRun(); });
  window.addEventListener('online', () => syncRun());
  setInterval(() => { if (SY.on && SY.ready && !document.hidden && Date.now() - SY.last > 45000) syncRun(); }, 15000);
  $('syncBtn').onclick = () => { if (!SY.ready) flash('SYNC NOT AVAILABLE HERE'); else if (!SY.on) setSync(true); else syncRun(true); };
  $('syncst').onclick = () => { if (!SY.ready) flash('SYNC NOT AVAILABLE HERE'); else if (!SY.on) setSync(true); else syncRun(true); };

  // ---------- global search ----------
  const GSKIND = { doc: 'DOC', journal: 'JOURNAL', dream: 'DREAM', note: 'NOTE', contact: 'CONTACT', event: 'EVENT' };
  let gsT = null;
  function gsSnip(text, i, qlen) { const a = Math.max(0, i - 28), b = Math.min(text.length, i + qlen + 44); return (a ? '...' : '') + text.slice(a, b).replace(/\s+/g, ' ') + (b < text.length ? '...' : ''); }
  function gsFind(q) {
    q = q.toLowerCase(); const out = [];
    lib.list.forEach(d => {
      if (d.journal && locked) return;
      const raw = d.id === lib.cur ? serialize() : (load(K.body + d.id) || ''), lines = raw.split('\n'); let hits = 0;
      const kind = d.journal === 'dream' ? 'dream' : d.journal ? 'journal' : 'doc';
      if (d.name.toLowerCase().indexOf(q) >= 0) out.push({ kind, title: d.name, text: 'document name', go: () => { setView('write'); switchDoc(d.id); } });
      for (let li = 0; li < lines.length && hits < 4; li++) {
        if (/^\[img:\d+\]$/.test(lines[li])) continue;
        const t = lines[li].replace(/\[#[0-9a-fA-F]{6}\]|\[\/\]|\[dc:[0-9a-fA-F]{6}\]/g, ''), i = t.toLowerCase().indexOf(q);
        if (i >= 0) { hits++; out.push({ kind, title: d.name, text: gsSnip(t, i, q.length), go: () => { setView('write'); switchDoc(d.id); const b = blocks()[li]; if (b && !isImg(b)) { setCaret(b, Math.min(i, 1e9)); b.scrollIntoView({ block: 'center' }); } } }); }
      }
    });
    notes.list.forEach(n => { const t = n.text || '', i = t.toLowerCase().indexOf(q); if (i >= 0) out.push({ kind: 'note', title: 'Note', text: gsSnip(t, i, q.length), go: () => { setView('notes'); openNote(n.id); } }); });
    events.list.forEach(e => { const t = e.t || ''; if (t.toLowerCase().indexOf(q) >= 0 || (e.d || '').indexOf(q) >= 0) out.push({ kind: 'event', title: e.d ? dateLabel(e.d) : 'Event', text: t, go: () => { calSel = e.d; calM = parseYmd(e.d); calM.setDate(1); setView('cal'); renderCal(); } }); });
    if (!locked) people.list.forEach(c => {
      const parts = [c.name, c.nick, c.phone, c.email, c.addr, c.notes, c.bday].concat((c.fields || []).map(f => (f[0] || '') + ': ' + (f[1] || ''))).filter(Boolean), hit = parts.find(p => p.toLowerCase().indexOf(q) >= 0);
      if (hit) out.push({ kind: 'contact', title: c.name || c.nick || 'Contact', text: gsSnip(hit, hit.toLowerCase().indexOf(q), q.length), go: () => { setView('contacts'); openContact(c); } });
    });
    return out;
  }
  function gsDraw() {
    const q = $('gsq').value.trim(), L = $('gslist'); L.innerHTML = '';
    if (q.length < 2) { L.textContent = 'Type at least two letters. Searches documents, journals, notes, contacts and events' + (locked && lockCfg ? ' (locked areas are skipped until you unlock).' : '.'); return; }
    const res = gsFind(q);
    if (!res.length) { L.textContent = 'Nothing found for "' + q + '".'; return; }
    res.slice(0, 80).forEach(r => {
      const row = document.createElement('div'); row.className = 'gsr';
      const a = document.createElement('span'); a.className = 'gsk'; a.textContent = '[' + GSKIND[r.kind] + ']';
      const b = document.createElement('b'); b.textContent = ' ' + r.title;
      const c = document.createElement('div'); c.className = 'gst'; c.textContent = r.text;
      row.appendChild(a); row.appendChild(b); row.appendChild(c);
      row.onclick = () => { closeOv('gs'); r.go(); };
      L.appendChild(row);
    });
    if (res.length > 80) { const m = document.createElement('div'); m.textContent = '... ' + (res.length - 80) + ' more. Narrow the search.'; L.appendChild(m); }
  }
  function openGS() { persist(); openOv('gs'); $('gsq').focus(); $('gsq').select(); gsDraw(); }
  $('gsq').addEventListener('input', () => { clearTimeout(gsT); gsT = setTimeout(gsDraw, 140); });
  $('gsq').addEventListener('keydown', e => { if (e.key === 'Enter') { const r = $('gslist').querySelector('.gsr'); if (r) r.click(); } });
  $('searchBtn').onclick = openGS;

  // ---------- privacy lock (journal, dream journal, contacts) ----------
  const LKEY = 'dos-writer-lock';
  let lockCfg = null; try { lockCfg = JSON.parse(load(LKEY) || 'null'); } catch (e) { lockCfg = null; }
  if (!lockCfg || !lockCfg.h) lockCfg = null;
  let locked = !!lockCfg, cover = false, lkMode = 'enter', lkTmp = '', lkFails = 0, lkAct = Date.now(), lkHiddenAt = 0;
  async function sha(s) {
    try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    catch (e) { return 'w' + hashStr(s) + hashStr(s.split('').reverse().join('')); }
  }
  function protectedNow() { const d = curDoc(); return curView() === 'contacts' || (curView() === 'write' && d && d.journal); }
  function lockCheck() {
    const need = (locked && lockCfg && protectedNow()) || cover, el = $('lock');
    if (el.classList.contains('show') && lkMode !== 'enter' && lkMode !== 'cover') return;
    if (need) { if (!el.classList.contains('show')) { lkMode = cover && !lockCfg ? 'cover' : 'enter'; lkDraw(); } el.classList.add('show'); try { editor.blur(); } catch (e) { /* ignore */ } setTimeout(() => $('lkin').focus(), 30); }
    else el.classList.remove('show');
  }
  function lkDraw() {
    const T = { enter: cover ? 'SCREEN HIDDEN' : 'LOCKED - journal, dreams and contacts', cover: 'SCREEN HIDDEN - tap to show', verify: 'Enter your current PIN', set1: 'Choose a new PIN (4 or more digits)', set2: 'Type the new PIN again', rem: 'Enter your PIN to remove the lock' };
    $('lktitle').textContent = T[lkMode] || ''; $('lkin').style.display = lkMode === 'cover' ? 'none' : ''; $('lkin').value = '';
    $('lkcancel').textContent = lkMode === 'enter' ? '[Leave]' : '[Cancel]';
    $('lkcancel').style.display = (lkMode === 'enter' && cover) || lkMode === 'cover' ? 'none' : ''; $('lkok').textContent = lkMode === 'cover' ? '[Show screen]' : '[OK]';
    $('lock').classList.toggle('dlg', lkMode !== 'enter' && lkMode !== 'cover');
    $('lkmsg').textContent = '';
  }
  async function lkSubmit() {
    const v = $('lkin').value.trim();
    if (lkMode === 'cover') { cover = false; $('lock').classList.remove('show'); editor.focus(); return; }
    if (lkMode === 'enter' || lkMode === 'verify' || lkMode === 'rem') {
      if (!v) return;
      if (lkFails >= 3) await wait(1500 * (lkFails - 2));
      const h = await sha(lockCfg.s + v);
      if (h !== lockCfg.h) { lkFails++; $('lkmsg').textContent = 'Wrong PIN.'; $('lkin').value = ''; return; }
      lkFails = 0;
      if (lkMode === 'enter') { locked = false; cover = false; lkAct = Date.now(); $('lock').classList.remove('show'); editor.focus(); restore(); flash('UNLOCKED'); return; }
      if (lkMode === 'rem') { lockCfg = null; locked = false; try { localStorage.removeItem(LKEY); } catch (e) { /* ignore */ } lkClose(); flash('PRIVACY LOCK REMOVED'); return; }
      lkMode = 'set1'; lkDraw(); $('lkin').focus(); return;
    }
    if (lkMode === 'set1') { if (!/^\d{4,12}$/.test(v)) { $('lkmsg').textContent = 'Use 4 to 12 digits.'; return; } lkTmp = v; lkMode = 'set2'; lkDraw(); $('lkin').focus(); return; }
    if (lkMode === 'set2') {
      if (v !== lkTmp) { $('lkmsg').textContent = 'PINs did not match. Start again.'; lkMode = 'set1'; setTimeout(lkDraw, 900); return; }
      const s = Math.random().toString(36).slice(2, 10); lockCfg = { s, h: await sha(s + v) }; store(LKEY, JSON.stringify(lockCfg)); lkTmp = ''; locked = false; lkClose(); flash('PRIVACY LOCK ON'); return;
    }
  }
  function lkClose() { lkMode = 'enter'; $('lock').classList.remove('show', 'dlg'); lkCheckSoon(); editor.focus(); restore(); }
  function lkCheckSoon() { setTimeout(lockCheck, 0); }
  $('lkok').onclick = lkSubmit;
  $('lkin').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); lkSubmit(); } });
  $('lock').addEventListener('click', () => { if (lkMode === 'cover') lkSubmit(); });
  $('lkcancel').onclick = () => {
    if (lkMode === 'enter') { const t = lib.list.find(x => x.id === lastMain && !x.journal) || lib.list.find(x => !x.journal); $('lock').classList.remove('show'); setView('write'); if (t && t.id !== lib.cur) switchDoc(t.id); else if (curDoc().journal) createDoc('untitled.txt', ''); return; }
    lkMode = 'enter'; $('lock').classList.remove('show', 'dlg'); lkCheckSoon();
  };
  function lockNow() { if (!lockCfg) { startPin(); return; } locked = true; flash('LOCKED'); lockCheck(); }
  function startPin() { if (lockCfg) { lkMode = 'verify'; } else lkMode = 'set1'; cover = false; lkDraw(); $('lock').classList.add('show'); setTimeout(() => $('lkin').focus(), 30); }
  function removePin() { if (!lockCfg) { flash('NO PIN SET'); return; } lkMode = 'rem'; lkDraw(); $('lock').classList.add('show'); setTimeout(() => $('lkin').focus(), 30); }
  function hideScreen() { cover = true; if (lockCfg) locked = true; lkMode = lockCfg ? 'enter' : 'cover'; lkDraw(); $('lock').classList.remove('dlg'); $('lock').classList.add('show'); try { editor.blur(); } catch (e) { /* ignore */ } setTimeout(() => $('lkin').focus(), 30); }
  $('lockBtn').onclick = lockNow;
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { lkAct = Date.now(); }, true));
  document.addEventListener('visibilitychange', () => {
    if (!lockCfg) return;
    if (document.hidden) lkHiddenAt = Date.now();
    else if (lkHiddenAt && Date.now() - lkHiddenAt > 60000) { locked = true; lockCheck(); }
  });
  setInterval(() => { if (lockCfg && !locked && Date.now() - lkAct > 600000) { locked = true; lockCheck(); } }, 30000);

  // ---------- init ----------
  const t0 = load(K.theme) || 'blue'; root.dataset.theme = t0; $('theme').value = t0;
  const m0 = load(K.mode) || 'prose'; $('mode').value = m0; body.classList.toggle('screenplay', m0 === 'screenplay');
  $('capstyle').value = capStyle; $('detail').value = load(K.detail) || '320';
  const tc0 = load(K.tc) || ''; if (tc0) { $('textcolor').value = tc0; applyTextColor(tc0); }
  $('fsize').value = load(K.fsize) || '20'; root.style.setProperty('--fs', $('fsize').value + 'px');
  $('lspace').value = load(K.lspace) || '1.6'; root.style.setProperty('--lh', $('lspace').value);
  if (load(K.comf) === '1') body.classList.add('comfort');
  if (load(K.num) === '1') body.classList.add('numbered');
  loadLib(); showName();
  loadDoc(load(K.body + lib.cur) || ''); initGoalDay();
  commit(); refresh();
  if (bootOn() && !reduceMotion()) runBoot(); else $('boot').classList.remove('show');
  if (document.fonts) Promise.all(FRAMED_SPECS.map(f => document.fonts.load(f, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'))).then(() => repaintAll()).catch(() => {});
  if (document.fonts) document.fonts.load('700 100px "Space Grotesk"').then(() => { for (const k in inkCache) delete inkCache[k]; for (const k in dotCache) delete dotCache[k]; repaintAll(); }).catch(() => {});
  editor.focus(); setCaret(blocks().filter(b => !isImg(b)).pop(), 1e9);
  lockCheck(); syncInit();
  if (countWords() > 150 && Date.now() - (+load(K.lastbk) || 0) > 7 * 864e5) setTimeout(() => flash('TIP: [Backup] copies your work out of this browser'), 2500);
})();
