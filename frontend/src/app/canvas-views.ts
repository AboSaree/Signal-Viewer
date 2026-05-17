// ═══════════════════════════════════════════════════════════════
// canvas-views.ts — All canvas drawing classes ported from vanilla JS
// ═══════════════════════════════════════════════════════════════

export const CHANNEL_COLORS = [
  '#63b3ed', '#68d391', '#fc8181', '#f6ad55',
  '#b794f4', '#f687b3', '#4fd1c5', '#faf089',
  '#90cdf4', '#9ae6b4', '#feb2b2', '#fbd38d',
];

export const channelColorOverrides: Record<number, string> = {};
export const channelThickOverrides: Record<number, number> = {};
export const onChannelColorChange: Array<(idx: number, color: string) => void> = [];

export function getChannelColor(idx: number): string {
  return channelColorOverrides[idx] || CHANNEL_COLORS[idx % CHANNEL_COLORS.length];
}
export function getChannelThick(idx: number): number {
  return channelThickOverrides[idx] || 1.5;
}
export function setChannelColor(idx: number, color: string): void {
  channelColorOverrides[idx] = color;
  onChannelColorChange.forEach(fn => fn(idx, color));
}

// ── Draw Utilities ────────────────────────────────────────────
export const Draw = {
  grid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.strokeStyle = 'rgba(99,179,237,0.045)'; ctx.lineWidth = 1;
    for (let i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(i * w / 12, 0); ctx.lineTo(i * w / 12, h); ctx.stroke(); }
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(0, i * h / 6); ctx.lineTo(w, i * h / 6); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(99,179,237,0.08)'; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.setLineDash([]);
  },

  signal(ctx: CanvasRenderingContext2D, w: number, h: number, data: number[], color: string, mid: number, baseScaleY: number, windowStart: number, windowWidth: number, scaleY: number, lineWidth?: number) {
    const len = data.length; if (!len) return;
    const eScaleY = baseScaleY * scaleY;
    const lw = lineWidth || 1.5;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = ((Math.floor(windowStart + (x / w) * windowWidth) % len) + len) % len;
      const y = mid - eScaleY * data[idx];
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color + '2a'; ctx.lineWidth = Math.max(4, lw * 4); ctx.stroke();
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const idx = ((Math.floor(windowStart + (x / w) * windowWidth) % len) + len) % len;
      const y = mid - eScaleY * data[idx];
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  },

  periodMarkers(ctx: CanvasRenderingContext2D, w: number, h: number, windowStart: number, windowWidth: number) {
    const p = Math.max(1, windowWidth);
    let k = Math.ceil(windowStart / p);
    ctx.strokeStyle = 'rgba(99,179,237,0.16)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    while (true) {
      const sPos = k * p;
      if (sPos > windowStart + windowWidth) break;
      const x = ((sPos - windowStart) / windowWidth) * w;
      if (x >= 0 && x <= w) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      k++;
    }
    ctx.setLineDash([]);
  },

  axes(ctx: CanvasRenderingContext2D, w: number, h: number, data: number[], windowStart: number, windowWidth: number, lP: number, tP: number, pW: number, pH: number) {
    const minV = Math.min(...data), maxV = Math.max(...data), rangeV = maxV - minV || 1;
    const xAxisY = tP + pH;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(226,232,240,0.9)';
    ctx.beginPath(); ctx.moveTo(lP, tP - 2); ctx.lineTo(lP, xAxisY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lP, xAxisY); ctx.lineTo(lP + pW + 2, xAxisY); ctx.stroke();
    const fmtV = (v: number) => Math.abs(v) >= 1e3 || Math.abs(v) < 1e-2 ? v.toExponential(1) : v.toFixed(2);
    const fmtI = (i: number) => Math.abs(i) >= 1e4 ? (i / 1000).toFixed(1) + 'k' : String(i | 0);
    ctx.font = "10px 'Space Mono'"; ctx.textAlign = 'left';
    for (let i = 0; i < 5; i++) {
      const tp = i / 4, v = minV + tp * rangeV, y = tP + (1 - tp) * pH;
      ctx.strokeStyle = 'rgba(226,232,240,0.9)'; ctx.beginPath(); ctx.moveTo(lP, y); ctx.lineTo(lP + 6, y); ctx.stroke();
      ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.beginPath(); ctx.moveTo(lP + 6, y); ctx.lineTo(lP + pW, y); ctx.stroke();
      ctx.fillStyle = 'rgba(226,232,240,0.9)'; ctx.fillText(fmtV(v), lP + 8, y + 3);
    }
    ctx.textAlign = 'center';
    for (let i = 0; i < 6; i++) {
      const tp = i / 5, x = lP + tp * pW;
      const si = Math.floor(windowStart + tp * windowWidth);
      ctx.strokeStyle = 'rgba(226,232,240,0.9)'; ctx.beginPath(); ctx.moveTo(x, xAxisY - 5); ctx.lineTo(x, xAxisY); ctx.stroke();
      ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.beginPath(); ctx.moveTo(x, tP); ctx.lineTo(x, xAxisY - 5); ctx.stroke();
      ctx.fillStyle = 'rgba(226,232,240,0.9)'; ctx.fillText(fmtI(si), x, Math.min(h - 4, xAxisY + 12));
    }
    ctx.fillText('sample', lP + pW / 2, h - 4);
    ctx.save(); ctx.translate(lP - 28, tP + pH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('mV', 0, 0); ctx.restore();
  },

  miniSubAxis(ctx: CanvasRenderingContext2D, w: number, h: number, data: number[], color: string, bandY: number, bandH: number, leadName: string, windowStart: number, windowWidth: number) {
    const len = data.length; if (!len) return;
    const lP = 10;

    // ── Vertical padding to prevent labels bleeding into adjacent bands ──
    const vPad = Math.max(4, Math.min(10, Math.floor(bandH * 0.06)));
    const safeTop = bandY + vPad;            // topmost Y for any drawing within band
    const safeBot = bandY + bandH - vPad;    // bottommost Y for any drawing within band
    const safeH = safeBot - safeTop;        // usable height after padding

    // ── Compute visible min/max ───────────────────────────────
    let minV = Infinity, maxV = -Infinity;
    const steps = Math.min(windowWidth, len);
    const stride = Math.max(1, Math.floor(steps / 400));
    for (let x = 0; x < steps; x += stride) {
      const idx = ((Math.floor(windowStart + x) % len) + len) % len;
      if (data[idx] < minV) minV = data[idx];
      if (data[idx] > maxV) maxV = data[idx];
    }
    if (!isFinite(minV)) minV = -1;
    if (!isFinite(maxV)) maxV = 1;
    const rangeV = maxV - minV || 1;

    // ── Adaptive font size based on band height ───────────────
    const fontSize = Math.max(7, Math.min(10, Math.floor(bandH / 5.5)));
    const rowH = fontSize + 3;           // height of one text row
    const minGap = rowH + 1;             // minimum px between two label baselines

    // ── Smart number formatter ────────────────────────────────
    const fmt = (v: number): string => {
      const a = Math.abs(v);
      if (a >= 1e5) return (v / 1000).toFixed(0) + 'k';
      if (a >= 1e4) return (v / 1000).toFixed(1) + 'k';
      if (a >= 1000) return v.toFixed(0);
      if (a >= 100) return v.toFixed(1);
      if (a >= 1) return v.toFixed(2);
      return v.toFixed(3);
    };

    ctx.save();

    // ── Clip to band region so nothing bleeds into adjacent bands ──
    ctx.beginPath(); ctx.rect(0, bandY, w, bandH); ctx.clip();

    // ── Band separator line ───────────────────────────────────
    ctx.strokeStyle = `${color}20`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, bandY); ctx.lineTo(w, bandY); ctx.stroke();

    // ── Lead name badge (top-left of band) ───────────────────
    ctx.font = `${fontSize}px 'Space Mono'`;
    const bW = ctx.measureText(leadName).width + 10;
    const bH = Math.max(12, fontSize + 5);
    const bX = lP, bY = safeTop;
    ctx.fillStyle = `${color}25`;
    ctx.beginPath(); (ctx as any).roundRect(bX - 2, bY, bW, bH, 3); ctx.fill();
    ctx.fillStyle = color; ctx.textAlign = 'left';
    ctx.fillText(leadName, bX + 3, bY + bH - 3);

    // ── Tick & label rendering ────────────────────────────────
    const tickX = lP + bW + 6;          // x where tick starts
    const labelX = tickX + 18;          // x where text starts

    // Pixel Y for a given value (within the safe padded band space)
    const toY = (v: number) => safeBot - ((v - minV) / rangeV) * safeH;

    // Collect candidate ticks: max, zero (only if truly in range), min
    const candidates: { val: number; label: string }[] = [];
    candidates.push({ val: maxV, label: fmt(maxV) });
    // Only show zero if it lies strictly between min and max (i.e. both sides of zero)
    if (minV < 0 && maxV > 0) candidates.push({ val: 0, label: '0' });
    candidates.push({ val: minV, label: fmt(minV) });

    // Convert to pixel positions — constrain ticks to the safe area
    const ticks = candidates
      .map(c => ({ ...c, ty: toY(c.val) }))
      .filter(c => c.ty >= safeTop && c.ty <= safeBot); // only in safe-band ticks

    // Only draw labels if safe area is tall enough for at least 2 rows
    const canLabel = safeH >= minGap * 2;

    // Layout: assign each tick a label Y, pushing down if too close to previous
    let nextAllowedY = safeTop + rowH;   // earliest Y a label baseline may appear
    const placed: { ty: number; textY: number; label: string }[] = [];

    for (const tick of ticks) {
      // Try to place label just above the tick line (offset upward by 1px)
      let textY = tick.ty - 1;
      // But not before nextAllowedY
      if (textY < nextAllowedY) textY = nextAllowedY;
      // And not below safe bottom (leave room for text descent)
      if (textY > safeBot - 2) textY = safeBot - 2;
      placed.push({ ty: tick.ty, textY, label: tick.label });
      nextAllowedY = textY + minGap;
    }

    // Drop labels that would be placed beyond the safe area
    const finalPlaced = placed.filter(p => p.textY <= safeBot - 2 && p.textY >= safeTop);

    // Draw ticks and labels
    for (const p of finalPlaced) {
      // Dashed guideline
      ctx.strokeStyle = `${color}40`; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(tickX + 14, p.ty); ctx.lineTo(w, p.ty); ctx.stroke();
      ctx.setLineDash([]);
      // Solid tick mark
      ctx.strokeStyle = `${color}aa`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(tickX, p.ty); ctx.lineTo(tickX + 12, p.ty); ctx.stroke();
      // Label — only if there's room
      if (canLabel) {
        ctx.fillStyle = `${color}ee`; ctx.textAlign = 'left';
        ctx.fillText(p.label, labelX, p.textY);
      }
    }

    ctx.restore();
  },
};

// ── Animation Service ─────────────────────────────────────────
export class AnimationService {
  t = 0;
  private cbs: Array<(t: number) => void> = [];
  running = false;

  add(fn: (t: number) => void) { this.cbs.push(fn); }
  remove(fn: (t: number) => void) { const i = this.cbs.indexOf(fn); if (i > -1) this.cbs.splice(i, 1); }
  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => { this.t++; this.cbs.forEach(fn => fn(this.t)); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

// ── Signal Service ────────────────────────────────────────────
export interface SignalState {
  signalData: number[][];
  numChannels: number;
  numSamples: number;
  status: string;
  statusActive: boolean;
  windowWidth: number;
  playbackSpeed: number;
  recordName: string;
  fs: number;
  sigNames: string[];
  duration: number;
}

export class SignalService {
  private _state: SignalState = {
    signalData: [], numChannels: 0, numSamples: 0,
    status: 'STANDBY', statusActive: false,
    windowWidth: 1000, playbackSpeed: 1,
    recordName: '', fs: 0, sigNames: [], duration: 0,
  };
  private _listeners = new Map<string, Array<(v: any) => void>>();

  get<K extends keyof SignalState>(k: K): SignalState[K] { return this._state[k]; }
  set<K extends keyof SignalState>(k: K, v: SignalState[K]) {
    this._state[k] = v;
    (this._listeners.get(k) || []).forEach(fn => fn(v));
    (this._listeners.get('*') || []).forEach(fn => fn(this._state));
  }
  on(k: string, fn: (v: any) => void) {
    if (!this._listeners.has(k)) this._listeners.set(k, []);
    this._listeners.get(k)!.push(fn);
  }
}

// ── ChannelView ───────────────────────────────────────────────
export class ChannelView {
  idx: number;
  ss: SignalService;
  as: AnimationService;
  visible = true;
  scaleY = 1;
  windowStart = 0;
  paused = false;
  frozenStart = 0;
  isDragging = false;
  lastMouseX = 0;
  el!: HTMLElement;
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  badge!: HTMLElement;
  custPanel!: HTMLElement;
  colorInput!: HTMLInputElement;
  colorPreview!: HTMLElement;
  thickSlider!: HTMLInputElement;
  thickVal!: HTMLElement;
  bAI!: HTMLButtonElement;
  bAO!: HTMLButtonElement;
  bR!: HTMLButtonElement;
  bSnap!: HTMLButtonElement;
  bPlay!: HTMLButtonElement;
  bPause!: HTMLButtonElement;
  bCust!: HTMLButtonElement;
  private _sw!: HTMLElement;
  private _id!: HTMLElement;
  private _fn!: (t: number) => void;

  get color() { return getChannelColor(this.idx); }
  get lineWidth() { return getChannelThick(this.idx); }

  constructor(container: HTMLElement, idx: number, ss: SignalService, as: AnimationService) {
    this.idx = idx; this.ss = ss; this.as = as;
    this._build(container);
    this._bindControls();
    this._bindCanvas();
    this._fn = t => this._draw(t);
    as.add(this._fn);
  }

  _leftEdge(t: number) {
    if (this.paused) return this.frozenStart;
    const len = this.ss.get('signalData')[this.idx]?.length || 1;
    const speed = this.ss.get('playbackSpeed') || 1;
    return ((this.windowStart + t * speed) % len + len) % len;
  }

  _build(container: HTMLElement) {
    const color = this.color;
    const leadName = this.ss.get('sigNames')[this.idx] || `Lead ${this.idx + 1}`;
    this.el = document.createElement('div');
    this.el.className = 'sv-channel';
    this.el.style.animationDelay = `${this.idx * 0.04}s`;

    const head = document.createElement('div'); head.className = 'sv-channel-head';
    const meta = document.createElement('div'); meta.className = 'sv-channel-meta';
    const sw = document.createElement('div'); sw.className = 'sv-channel-swatch';
    sw.style.cssText = `background:${color};box-shadow:0 0 6px ${color}77`;
    this._sw = sw;
    const id = document.createElement('div'); id.className = 'sv-channel-id';
    id.style.color = color; id.textContent = leadName;
    this._id = id;

    const tog = document.createElement('label'); tog.className = 'sv-toggle';
    const cbx = document.createElement('input'); cbx.type = 'checkbox'; cbx.checked = true;
    const rail = document.createElement('div'); rail.className = 'sv-toggle-rail';
    const thumb = document.createElement('div'); thumb.className = 'sv-toggle-thumb';
    rail.appendChild(thumb);
    const tlbl = document.createElement('span'); tlbl.className = 'sv-toggle-label'; tlbl.textContent = 'VIS';
    tog.append(cbx, rail, tlbl);
    cbx.onchange = () => { this.visible = cbx.checked; };
    meta.append(sw, id, tog);

    const tb = document.createElement('div'); tb.className = 'sv-toolbar';
    const mkBtn = (label: string, cls: string, icon: string) => {
      const b = document.createElement('button'); b.className = `sv-btn${cls ? ' ' + cls : ''}`; b.type = 'button'; b.innerHTML = `${icon} ${label}`; return b;
    };
    this.bAI = mkBtn('AMP+', 'yzoom', '↕');
    this.bAO = mkBtn('AMP−', 'yzoom', '↕');
    this.bR = mkBtn('RESET', '', '↺');
    this.bSnap = mkBtn('SNAP', 'snap', '◉');
    this.bPlay = mkBtn('PLAY', 'play', '▶');
    this.bPause = mkBtn('PAUSE', 'pause', '⏸');
    this.badge = document.createElement('div'); this.badge.className = 'sv-yscale-badge'; this.badge.textContent = 'AMP ×1.00';
    tb.append(this.bAI, this.bAO, this.bR, this.bSnap, this.bPlay, this.bPause, this.badge);

    this.bCust = mkBtn('STYLE', 'cust', '🎨');
    tb.appendChild(this.bCust);

    this.custPanel = document.createElement('div'); this.custPanel.className = 'sv-cust-panel';
    const colorRow = document.createElement('div'); colorRow.className = 'sv-cust-row';
    const cLbl = document.createElement('span'); cLbl.className = 'sv-cust-label'; cLbl.textContent = 'Color';
    const swatchBtn = document.createElement('div'); swatchBtn.className = 'sv-color-swatch'; swatchBtn.title = 'Pick channel color';
    this.colorInput = document.createElement('input'); this.colorInput.type = 'color'; this.colorInput.value = color;
    this.colorPreview = document.createElement('div'); this.colorPreview.className = 'sv-color-preview';
    this.colorPreview.style.background = color;
    swatchBtn.append(this.colorPreview, this.colorInput);
    const resetColorBtn = document.createElement('button'); resetColorBtn.className = 'sv-btn'; resetColorBtn.type = 'button'; resetColorBtn.textContent = '↺ DEFAULT'; resetColorBtn.style.fontSize = '9px';
    colorRow.append(cLbl, swatchBtn, resetColorBtn);

    const thickRow = document.createElement('div'); thickRow.className = 'sv-cust-row';
    const tLbl = document.createElement('span'); tLbl.className = 'sv-cust-label'; tLbl.textContent = 'Width';
    this.thickSlider = document.createElement('input'); this.thickSlider.type = 'range'; this.thickSlider.min = '0.5'; this.thickSlider.max = '6'; this.thickSlider.step = '0.5'; this.thickSlider.value = '1.5';
    this.thickSlider.className = 'sv-thick-slider';
    this.thickVal = document.createElement('span'); this.thickVal.className = 'sv-thick-val'; this.thickVal.textContent = '1.5px';
    thickRow.append(tLbl, this.thickSlider, this.thickVal);

    this.custPanel.append(colorRow, thickRow);

    this.bCust.onclick = () => {
      const open = this.custPanel.classList.toggle('open');
      this.bCust.classList.toggle('active', open);
    };
    this.colorInput.addEventListener('input', () => {
      const c = this.colorInput.value;
      setChannelColor(this.idx, c);
      this.colorPreview.style.background = c;
      this._sw.style.background = c; this._sw.style.boxShadow = `0 0 6px ${c}77`;
      this._id.style.color = c;
      this.canvas.style.borderTop = `1px solid ${c}18`;
    });
    resetColorBtn.onclick = () => {
      delete channelColorOverrides[this.idx];
      const def = CHANNEL_COLORS[this.idx % CHANNEL_COLORS.length];
      setChannelColor(this.idx, def);
      this.colorInput.value = def;
      this.colorPreview.style.background = def;
      this._sw.style.background = def; this._sw.style.boxShadow = `0 0 6px ${def}77`;
      this._id.style.color = def;
      this.canvas.style.borderTop = `1px solid ${def}18`;
    };
    this.thickSlider.addEventListener('input', () => {
      const v = parseFloat(this.thickSlider.value);
      channelThickOverrides[this.idx] = v;
      this.thickVal.textContent = `${v}px`;
    });

    head.append(meta, tb);
    this.canvas = document.createElement('canvas'); this.canvas.width = 1200; this.canvas.height = 220;
    this.canvas.style.borderTop = `1px solid ${color}18`;
    this.ctx = this.canvas.getContext('2d')!;
    const wrap = document.createElement('div'); wrap.className = 'sv-canvas-wrap'; wrap.appendChild(this.canvas);
    this.el.append(head, this.custPanel, wrap);
    container.appendChild(this.el);
  }

  _updateBadge() { this.badge.textContent = `AMP ×${this.scaleY.toFixed(2)}`; }

  _bindControls() {
    this.bAI.onclick = () => { this.scaleY = Math.min(20, this.scaleY * 1.5); this._updateBadge(); };
    this.bAO.onclick = () => { this.scaleY = Math.max(0.05, this.scaleY / 1.5); this._updateBadge(); };
    this.bR.onclick = () => { this.scaleY = 1; this.windowStart = 0; this._updateBadge(); };
    this.bSnap.onclick = () => { const a = document.createElement('a'); a.href = this.canvas.toDataURL('image/png'); a.download = `lead${this.idx + 1}.png`; a.click(); };
    this.bPlay.onclick = () => { this.paused = false; };
    this.bPause.onclick = () => { this.frozenStart = this._leftEdge(this.as.t); this.paused = true; };
  }

  _bindCanvas() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => { this.isDragging = true; this.lastMouseX = e.clientX; c.classList.add('panning'); });
    c.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX; this.lastMouseX = e.clientX;
      const ww = this.ss.get('windowWidth');
      const canvasW = c.offsetWidth || this.canvas.width;
      const delta = Math.round((dx / canvasW) * ww);
      if (this.paused) { this.frozenStart -= delta; } else { this.windowStart -= delta; }
    });
    const end = () => { this.isDragging = false; c.classList.remove('panning'); };
    c.addEventListener('mouseup', end); c.addEventListener('mouseleave', end);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const ww = this.ss.get('windowWidth');
      const canvasW = c.offsetWidth || this.canvas.width;
      const delta = Math.round((Math.sign(e.deltaY || e.deltaX) * 40 / canvasW) * ww);
      if (this.paused) { this.frozenStart += delta; } else { this.windowStart += delta; }
    }, { passive: false });
  }

  anchorAndResize() {
    const currentLeft = this._leftEdge(this.as.t);
    const speed = this.ss.get('playbackSpeed') || 1;
    if (this.paused) { this.frozenStart = currentLeft; }
    else { this.windowStart = currentLeft - this.as.t * speed; }
  }

  applySpeed(newSpeed: number) {
    if (this.paused) return;
    const currentLeft = this._leftEdge(this.as.t);
    this.windowStart = currentLeft - this.as.t * newSpeed;
  }

  _draw(t: number) {
    const data = this.ss.get('signalData')[this.idx];
    const windowWidth = this.ss.get('windowWidth');
    if (!data || !data.length) return;
    const { width: w, height: h } = this.canvas, ctx = this.ctx;
    ctx.fillStyle = '#040810'; ctx.fillRect(0, 0, w, h);
    if (!this.visible) return;
    const lP = 46, rP = 10, tP = 10, bP = 28;
    const pW = Math.max(10, w - lP - rP), pH = Math.max(10, h - tP - bP);
    const wStart = this._leftEdge(t);
    ctx.save(); ctx.beginPath(); ctx.rect(lP, tP, pW, pH); ctx.clip(); ctx.translate(lP, tP);
    Draw.grid(ctx, pW, pH);
    Draw.signal(ctx, pW, pH, data, this.color, pH / 2, pH * 0.4, wStart, windowWidth, this.scaleY, this.lineWidth);
    Draw.periodMarkers(ctx, pW, pH, wStart, windowWidth);
    ctx.restore();
    ctx.save(); Draw.axes(ctx, w, h, data, wStart, windowWidth, lP, tP, pW, pH); ctx.restore();
  }

  destroy() { this.as.remove(this._fn); this.el.remove(); }
}

// ── SingleView ────────────────────────────────────────────────
export class SingleView {
  ss: SignalService;
  as: AnimationService;
  scaleY = 1;
  windowStart = 0;
  paused = false;
  frozenStart = 0;
  isDragging = false;
  lastMouseX = 0;
  chVisible: boolean[] = [];
  el!: HTMLElement;
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;
  badge!: HTMLElement;
  legendItems: Array<{ item: HTMLElement; line: HTMLElement }> = [];
  bAI!: HTMLButtonElement;
  bAO!: HTMLButtonElement;
  bR!: HTMLButtonElement;
  bSnap!: HTMLButtonElement;
  bPlay!: HTMLButtonElement;
  bPause!: HTMLButtonElement;
  updateLegendColor!: (idx: number, color: string) => void;
  private _fn!: (t: number) => void;

  constructor(container: HTMLElement, ss: SignalService, as: AnimationService) {
    this.ss = ss; this.as = as;
    this._build(container);
    this._bindControls();
    this._bindCanvas();
    this._fn = t => this._draw(t);
    as.add(this._fn);
  }

  _leftEdge(t: number) {
    if (this.paused) return this.frozenStart;
    const len = this.ss.get('signalData')[0]?.length || 1;
    const speed = this.ss.get('playbackSpeed') || 1;
    return ((this.windowStart + t * speed) % len + len) % len;
  }

  anchorAndResize() {
    const currentLeft = this._leftEdge(this.as.t);
    const speed = this.ss.get('playbackSpeed') || 1;
    if (this.paused) { this.frozenStart = currentLeft; }
    else { this.windowStart = currentLeft - this.as.t * speed; }
  }

  applySpeed(newSpeed: number) {
    if (this.paused) return;
    const currentLeft = this._leftEdge(this.as.t);
    this.windowStart = currentLeft - this.as.t * newSpeed;
  }

  _build(container: HTMLElement) {
    const sd = this.ss.get('signalData'), n = sd.length, sigNames = this.ss.get('sigNames');
    this.chVisible = Array(n).fill(true);
    this.el = document.createElement('div'); this.el.className = 'sv-channel';
    const legend = document.createElement('div'); legend.className = 'sv-legend';
    this.legendItems = [];
    for (let i = 0; i < n; i++) {
      const color = getChannelColor(i);
      const item = document.createElement('div'); item.className = 'sv-legend-item'; item.style.color = color;
      const line = document.createElement('div'); line.className = 'sv-legend-line';
      line.style.background = color; line.style.boxShadow = `0 0 6px ${color}66`;
      const lbl = document.createElement('span'); lbl.textContent = sigNames[i] || `Lead ${i + 1}`; lbl.style.opacity = '.85';
      item.append(line, lbl);
      let vis = true; const ci = i;
      item.onclick = () => { vis = !vis; this.chVisible[ci] = vis; line.style.opacity = vis ? '1' : '.25'; lbl.style.opacity = vis ? '.85' : '.35'; };
      legend.appendChild(item);
      this.legendItems.push({ item, line });
    }
    this.updateLegendColor = (idx: number, color: string) => {
      const ref = this.legendItems[idx]; if (!ref) return;
      ref.item.style.color = color;
      ref.line.style.background = color;
      ref.line.style.boxShadow = `0 0 6px ${color}66`;
    };
    const tb = document.createElement('div'); tb.className = 'sv-toolbar';
    tb.style.cssText = 'padding:10px 16px;border-bottom:1px solid var(--border);background:var(--panel-raised);';
    const mkBtn = (label: string, cls: string, icon: string) => {
      const b = document.createElement('button'); b.className = `sv-btn${cls ? ' ' + cls : ''}`; b.type = 'button'; b.innerHTML = `${icon} ${label}`; return b;
    };
    this.bAI = mkBtn('AMP+', 'yzoom', '↕');
    this.bAO = mkBtn('AMP−', 'yzoom', '↕');
    this.bR = mkBtn('RESET', '', '↺');
    this.bSnap = mkBtn('SNAP', 'snap', '◉');
    this.bPlay = mkBtn('PLAY', 'play', '▶');
    this.bPause = mkBtn('PAUSE', 'pause', '⏸');
    this.badge = document.createElement('div'); this.badge.className = 'sv-yscale-badge'; this.badge.textContent = 'AMP ×1.00';
    tb.append(this.bAI, this.bAO, this.bR, this.bSnap, this.bPlay, this.bPause, this.badge);
    // Ensure each channel band has at minimum 60px height so mini-axis labels don't overlap.
    const minBandH = 160;
    const adaptiveH = Math.max(900, n * minBandH + 32);
    this.canvas = document.createElement('canvas'); this.canvas.width = 1200; this.canvas.height = adaptiveH;
    this.ctx = this.canvas.getContext('2d')!;
    const wrap = document.createElement('div'); wrap.className = 'sv-canvas-wrap'; wrap.appendChild(this.canvas);
    this.el.append(legend, tb, wrap);
    container.appendChild(this.el);
  }

  _updateBadge() { this.badge.textContent = `AMP ×${this.scaleY.toFixed(2)}`; }

  _bindControls() {
    this.bAI.onclick = () => { this.scaleY = Math.min(20, this.scaleY * 1.5); this._updateBadge(); };
    this.bAO.onclick = () => { this.scaleY = Math.max(0.05, this.scaleY / 1.5); this._updateBadge(); };
    this.bR.onclick = () => { this.scaleY = 1; this.windowStart = 0; this._updateBadge(); };
    this.bSnap.onclick = () => { const a = document.createElement('a'); a.href = this.canvas.toDataURL('image/png'); a.download = 'all-leads.png'; a.click(); };
    this.bPlay.onclick = () => { this.paused = false; };
    this.bPause.onclick = () => { this.frozenStart = this._leftEdge(this.as.t); this.paused = true; };
  }

  _bindCanvas() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => { this.isDragging = true; this.lastMouseX = e.clientX; c.classList.add('panning'); });
    c.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX; this.lastMouseX = e.clientX;
      const ww = this.ss.get('windowWidth'), canvasW = c.offsetWidth || this.canvas.width;
      const delta = Math.round((dx / canvasW) * ww);
      if (this.paused) { this.frozenStart -= delta; } else { this.windowStart -= delta; }
    });
    const end = () => { this.isDragging = false; c.classList.remove('panning'); };
    c.addEventListener('mouseup', end); c.addEventListener('mouseleave', end);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      const ww = this.ss.get('windowWidth'), canvasW = c.offsetWidth || this.canvas.width;
      const delta = Math.round((Math.sign(e.deltaY || e.deltaX) * 40 / canvasW) * ww);
      if (this.paused) { this.frozenStart += delta; } else { this.windowStart += delta; }
    }, { passive: false });
  }

  _draw(t: number) {
    const sd = this.ss.get('signalData'), windowWidth = this.ss.get('windowWidth');
    const sigNames = this.ss.get('sigNames');
    if (!sd.length) return;
    const n = sd.length;
    // Dynamically ensure canvas height fits all channels without crowding mini-axis labels
    const minBandH = 160;
    const requiredH = Math.max(900, n * minBandH + 32);
    if (this.canvas.height !== requiredH) this.canvas.height = requiredH;
    const { width: w, height: h } = this.canvas, ctx = this.ctx;
    ctx.fillStyle = '#040810'; ctx.fillRect(0, 0, w, h);
    const lP = 6, rP = 6, tP = 10, bP = 22;
    const pW = Math.max(10, w - lP - rP), pH = Math.max(10, h - tP - bP);
    const wStart = this._leftEdge(t);
    const bandH = pH / n;
    ctx.save();
    ctx.beginPath(); ctx.rect(lP, tP, pW, pH); ctx.clip();
    ctx.translate(lP, tP);
    Draw.grid(ctx, pW, pH);
    sd.forEach((data, i) => {
      if (!data.length) return;
      const bandY = i * bandH;
      const color = getChannelColor(i);
      const name = sigNames[i] || `Lead ${i + 1}`;
      if (this.chVisible[i]) {
        Draw.signal(ctx, pW, pH, data, color, (i + .5) * bandH, bandH * .38, wStart, windowWidth, this.scaleY, getChannelThick(i));
      }
      Draw.miniSubAxis(ctx, pW, pH, data, color, bandY, bandH, name, wStart, windowWidth);
    });
    Draw.periodMarkers(ctx, pW, pH, wStart, windowWidth);
    ctx.restore();
    ctx.save();
    ctx.font = "9px 'Space Mono'"; ctx.fillStyle = 'rgba(226,232,240,0.4)'; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(226,232,240,0.3)'; ctx.lineWidth = 1;
    const xAxisY = tP + pH;
    const fmtI = (i: number) => Math.abs(i) >= 1e4 ? (i / 1000).toFixed(1) + 'k' : String(i | 0);
    for (let i = 0; i <= 8; i++) {
      const tp = i / 8, x = lP + tp * pW;
      const si = Math.floor(wStart + tp * windowWidth);
      ctx.beginPath(); ctx.moveTo(x, xAxisY); ctx.lineTo(x, xAxisY + 4); ctx.stroke();
      ctx.fillText(fmtI(si), x, xAxisY + 14);
    }
    ctx.fillStyle = 'rgba(226,232,240,0.25)';
    ctx.fillText('sample', lP + pW / 2, xAxisY + 22);
    ctx.restore();
  }

  destroy() { this.as.remove(this._fn); this.el.remove(); }
}

// ── PolarView ─────────────────────────────────────────────────
export class PolarView {
  canvas: HTMLCanvasElement;
  data: number[];
  ci: number;
  period: number;
  as: AnimationService;
  btnSnap: HTMLElement | null;
  btnReset: HTMLElement | null;
  badge: HTMLElement | null;
  zoom = 1; panX = 0; panY = 0;
  isDragging = false; lastMX = 0; lastMY = 0;
  private _ro!: ResizeObserver;
  private _fn!: () => void;

  constructor(canvas: HTMLCanvasElement, data: number[], ci: number, period: number, as: AnimationService, btnSnap: HTMLElement | null, btnReset: HTMLElement | null, badge: HTMLElement | null) {
    this.canvas = canvas; this.data = data; this.ci = ci; this.period = period;
    this.as = as; this.btnSnap = btnSnap; this.btnReset = btnReset; this.badge = badge;
    this._resizeCanvas();
    this._ro = new ResizeObserver(() => { this._resizeCanvas(); this._draw(); });
    this._ro.observe(canvas.parentElement || canvas);
    this._bindCanvas(); this._bindButtons();
    this._fn = () => this._draw(); as.add(this._fn);
  }

  _resizeCanvas() {
    const wrap = this.canvas.parentElement; if (!wrap) return;
    this.canvas.width = wrap.clientWidth || 800;
    this.canvas.height = wrap.clientHeight || 520;
  }

  _draw() {
    const canvas = this.canvas, ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height; if (!w || !h) return;
    ctx.fillStyle = '#040810'; ctx.fillRect(0, 0, w, h);
    const data = this.data;
    const color = CHANNEL_COLORS[this.ci % CHANNEL_COLORS.length];
    const minV = Math.min(...data), maxV = Math.max(...data), range = maxV - minV || 1;
    const n = data.length, p = Math.min(this.period, n);
    const step = Math.max(1, Math.floor(n / 15000)), numPts = Math.floor(n / step);
    const cx = w / 2 + this.panX, cy = h / 2 + this.panY;
    const maxR = (Math.min(w, h) / 2 - 50) * this.zoom;
    ctx.lineWidth = 1;
    for (let r = 1; r <= 4; r++) {
      const rv = r * maxR / 4;
      ctx.strokeStyle = 'rgba(99,179,237,0.08)';
      ctx.beginPath(); ctx.arc(cx, cy, rv, 0, Math.PI * 2); ctx.stroke();
      const mv = (minV + ((r / 4) * range)).toFixed(3);
      ctx.font = "9px 'Space Mono'"; ctx.fillStyle = 'rgba(99,179,237,0.4)'; ctx.textAlign = 'left';
      ctx.fillText(`${mv} mV`, cx + rv + 4, cy - 3);
    }
    for (let a = 0; a < 12; a++) {
      const ang = a * Math.PI / 6;
      ctx.strokeStyle = 'rgba(99,179,237,0.07)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + maxR * Math.cos(ang), cy - maxR * Math.sin(ang)); ctx.stroke();
      const deg = a * 30;
      ctx.font = "9px 'Space Mono'"; ctx.fillStyle = 'rgba(226,232,240,0.3)'; ctx.textAlign = 'center';
      ctx.fillText(`${deg}°`, cx + (maxR + 14) * Math.cos(ang), cy - (maxR + 14) * Math.sin(ang) + 3);
    }
    const drawPath = (lw: number, style: string) => {
      ctx.beginPath();
      for (let i = 0; i < numPts; i++) {
        const idx = i * step, r = ((data[idx] - minV) / range) * maxR;
        const theta = 2 * Math.PI * ((idx % p) / p);
        const x = cx + r * Math.cos(theta), y = cy - r * Math.sin(theta);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.stroke();
    };
    drawPath(8, color + '22'); drawPath(1.5, color);
    ctx.font = "bold 12px 'Space Mono'"; ctx.fillStyle = 'rgba(226,232,240,0.9)'; ctx.textAlign = 'center';
    ctx.fillText(`POLAR VISUALIZATION · Lead ${this.ci + 1}`, w / 2, 22);
    ctx.font = "9px 'Space Mono'"; ctx.fillStyle = 'rgba(99,179,237,0.45)'; ctx.textAlign = 'right';
    ctx.fillText(`r = amplitude (mV)  ·  θ = time  ·  ${numPts.toLocaleString()} pts`, w - 16, h - 12);
    ctx.textAlign = 'left'; ctx.fillStyle = color;
    ctx.fillText(`period = ${p} samples`, 16, h - 12);
  }

  _bindCanvas() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => { this.isDragging = true; this.lastMX = e.clientX; this.lastMY = e.clientY; c.style.cursor = 'grabbing'; });
    c.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      this.panX += e.clientX - this.lastMX; this.panY += e.clientY - this.lastMY;
      this.lastMX = e.clientX; this.lastMY = e.clientY; this._updateBadge();
    });
    const end = () => { this.isDragging = false; c.style.cursor = 'crosshair'; };
    c.addEventListener('mouseup', end); c.addEventListener('mouseleave', end);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = Math.max(0.1, Math.min(200, this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      this._updateBadge();
    }, { passive: false });
  }

  _updateBadge() { if (this.badge) this.badge.textContent = `ZOOM ×${this.zoom.toFixed(2)}`; }

  _bindButtons() {
    if (this.btnSnap) this.btnSnap.onclick = () => { const a = document.createElement('a'); a.href = this.canvas.toDataURL('image/png'); a.download = `polar-lead${this.ci + 1}.png`; a.click(); };
    if (this.btnReset) this.btnReset.onclick = () => { this.zoom = 1; this.panX = 0; this.panY = 0; this._updateBadge(); };
  }

  destroy() { this.as.remove(this._fn); if (this._ro) this._ro.disconnect(); if (this.btnSnap) this.btnSnap.onclick = null; if (this.btnReset) this.btnReset.onclick = null; }
}

// ── PolarRatioView ────────────────────────────────────────────
export class PolarRatioView {
  canvas: HTMLCanvasElement;
  ci: number; cj: number;
  period: number;
  as: AnimationService;
  btnSnap: HTMLElement | null; btnReset: HTMLElement | null; badge: HTMLElement | null;
  zoom = 1; panX = 0; panY = 0;
  isDragging = false; lastMX = 0; lastMY = 0;
  ratios: number[];
  numPts: number; step: number; len: number;
  private _ro!: ResizeObserver;
  private _fn!: () => void;

  constructor(canvas: HTMLCanvasElement, d1: number[], d2: number[], ci: number, cj: number, period: number, as: AnimationService, btnSnap: HTMLElement | null, btnReset: HTMLElement | null, badge: HTMLElement | null) {
    this.canvas = canvas; this.ci = ci; this.cj = cj; this.period = period;
    this.as = as; this.btnSnap = btnSnap; this.btnReset = btnReset; this.badge = badge;
    const len = Math.min(d1.length, d2.length);
    const step = Math.max(1, Math.floor(len / 15000));
    const numPts = Math.floor(len / step); const eps = 1e-10;
    this.ratios = [];
    for (let i = 0; i < numPts; i++) { const idx = i * step; this.ratios.push(Math.abs(d1[idx]) / (Math.abs(d2[idx]) + eps)); }
    this.numPts = numPts; this.step = step; this.len = len;
    this._resizeCanvas();
    this._ro = new ResizeObserver(() => { this._resizeCanvas(); this._draw(); });
    this._ro.observe(canvas.parentElement || canvas);
    this._bindCanvas(); this._bindButtons();
    this._fn = () => this._draw(); as.add(this._fn);
  }

  _resizeCanvas() {
    const wrap = this.canvas.parentElement; if (!wrap) return;
    this.canvas.width = wrap.clientWidth || 800; this.canvas.height = wrap.clientHeight || 520;
  }

  _draw() {
    const canvas = this.canvas, ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height; if (!w || !h) return;
    ctx.fillStyle = '#040810'; ctx.fillRect(0, 0, w, h);
    const ratios = this.ratios, numPts = this.numPts;
    const p = Math.min(this.period, this.len);
    const minR = Math.min(...ratios), maxR2 = Math.max(...ratios), rangeR = maxR2 - minR || 1;
    const color = '#b794f4';
    const cx = w / 2 + this.panX, cy = h / 2 + this.panY;
    const maxR = (Math.min(w, h) / 2 - 50) * this.zoom;
    for (let r = 1; r <= 4; r++) {
      ctx.strokeStyle = 'rgba(183,148,244,0.08)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r * maxR / 4, 0, Math.PI * 2); ctx.stroke();
    }
    for (let a = 0; a < 12; a++) {
      const ang = a * Math.PI / 6;
      ctx.strokeStyle = 'rgba(183,148,244,0.07)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + maxR * Math.cos(ang), cy - maxR * Math.sin(ang)); ctx.stroke();
      const deg = a * 30;
      ctx.font = "9px 'Space Mono'"; ctx.fillStyle = 'rgba(226,232,240,0.3)'; ctx.textAlign = 'center';
      ctx.fillText(`${deg}°`, cx + (maxR + 14) * Math.cos(ang), cy - (maxR + 14) * Math.sin(ang) + 3);
    }
    const drawPath = (lw: number, style: string) => {
      ctx.beginPath();
      for (let i = 0; i < numPts; i++) {
        const r = ((ratios[i] - minR) / rangeR) * maxR;
        const theta = 2 * Math.PI * ((i * this.step % p) / p);
        const x = cx + r * Math.cos(theta), y = cy - r * Math.sin(theta);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.stroke();
    };
    drawPath(8, color + '22'); drawPath(1.5, color);
    ctx.font = "bold 12px 'Space Mono'"; ctx.fillStyle = 'rgba(226,232,240,0.9)'; ctx.textAlign = 'center';
    ctx.fillText(`POLAR RATIO · Lead ${this.ci + 1} / Lead ${this.cj + 1}`, w / 2, 22);
    ctx.font = "9px 'Space Mono'"; ctx.fillStyle = 'rgba(183,148,244,0.5)'; ctx.textAlign = 'right';
    ctx.fillText(`r = |L${this.ci + 1}|/|L${this.cj + 1}|  ·  θ = time  ·  ${numPts.toLocaleString()} pts`, w - 16, h - 12);
    ctx.textAlign = 'left'; ctx.fillStyle = color;
    ctx.fillText(`period = ${p} samples`, 16, h - 12);
  }

  _bindCanvas() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => { this.isDragging = true; this.lastMX = e.clientX; this.lastMY = e.clientY; c.style.cursor = 'grabbing'; });
    c.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      this.panX += e.clientX - this.lastMX; this.panY += e.clientY - this.lastMY;
      this.lastMX = e.clientX; this.lastMY = e.clientY; this._updateBadge();
    });
    const end = () => { this.isDragging = false; c.style.cursor = 'crosshair'; };
    c.addEventListener('mouseup', end); c.addEventListener('mouseleave', end);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = Math.max(0.1, Math.min(200, this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      this._updateBadge();
    }, { passive: false });
  }

  _updateBadge() { if (this.badge) this.badge.textContent = `ZOOM ×${this.zoom.toFixed(2)}`; }

  _bindButtons() {
    if (this.btnSnap) this.btnSnap.onclick = () => { const a = document.createElement('a'); a.href = this.canvas.toDataURL('image/png'); a.download = `polar-ratio-lead${this.ci + 1}-div-lead${this.cj + 1}.png`; a.click(); };
    if (this.btnReset) this.btnReset.onclick = () => { this.zoom = 1; this.panX = 0; this.panY = 0; this._updateBadge(); };
  }

  destroy() { this.as.remove(this._fn); if (this._ro) this._ro.disconnect(); if (this.btnSnap) this.btnSnap.onclick = null; if (this.btnReset) this.btnReset.onclick = null; }
}

// ── ScatterView ───────────────────────────────────────────────
export class ScatterView {
  canvas: HTMLCanvasElement;
  xData: number[]; yData: number[];
  ci: number; cj: number;
  as: AnimationService;
  btnSnap: HTMLElement | null; btnReset: HTMLElement | null; badge: HTMLElement | null;
  zoom = 1; panX = 0; panY = 0;
  isDragging = false; lastMX = 0; lastMY = 0;
  minX = 0; maxX = 0; minY = 0; maxY = 0;
  baseX0 = 0; baseX1 = 0; baseY0 = 0; baseY1 = 0;
  private _ro!: ResizeObserver;
  private _fn!: () => void;

  constructor(canvas: HTMLCanvasElement, xData: number[], yData: number[], ci: number, cj: number, as: AnimationService, btnSnap: HTMLElement | null, btnReset: HTMLElement | null, badge: HTMLElement | null) {
    this.canvas = canvas; this.xData = xData; this.yData = yData;
    this.ci = ci; this.cj = cj; this.as = as;
    this.btnSnap = btnSnap; this.btnReset = btnReset; this.badge = badge;
    this._computeStats();
    this._resizeCanvas();
    this._ro = new ResizeObserver(() => { this._resizeCanvas(); this._draw(); });
    this._ro.observe(canvas.parentElement || canvas);
    this._bindCanvas(); this._bindButtons();
    this._fn = () => this._draw(); as.add(this._fn);
  }

  _computeStats() {
    const xV = this.xData, yV = this.yData;
    this.minX = Math.min(...xV); this.maxX = Math.max(...xV);
    this.minY = Math.min(...yV); this.maxY = Math.max(...yV);
    const px = (this.maxX - this.minX) * 0.06 || 0.06, py = (this.maxY - this.minY) * 0.06 || 0.06;
    this.baseX0 = this.minX - px; this.baseX1 = this.maxX + px;
    this.baseY0 = this.minY - py; this.baseY1 = this.maxY + py;
  }

  _resizeCanvas() {
    const wrap = this.canvas.parentElement; if (!wrap) return;
    this.canvas.width = wrap.clientWidth || 800; this.canvas.height = wrap.clientHeight || 520;
  }

  _viewWindow() {
    const bW = this.baseX1 - this.baseX0, bH = this.baseY1 - this.baseY0;
    const vW = bW / this.zoom, vH = bH / this.zoom;
    const cx = (this.baseX0 + this.baseX1) / 2 + this.panX, cy = (this.baseY0 + this.baseY1) / 2 + this.panY;
    return { x0: cx - vW / 2, x1: cx + vW / 2, y0: cy - vH / 2, y1: cy + vH / 2 };
  }

  _draw() {
    const canvas = this.canvas, ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height; if (!w || !h) return;
    const lP = 72, rP = 20, tP = 40, bP = 64;
    const pW = w - lP - rP, pH = h - tP - bP;
    const { x0, x1, y0, y1 } = this._viewWindow();
    const rX = x1 - x0 || 1, rY = y1 - y0 || 1;
    const toCanvasX = (v: number) => lP + ((v - x0) / rX) * pW;
    const toCanvasY = (v: number) => tP + pH - ((v - y0) / rY) * pH;
    const colorX = CHANNEL_COLORS[this.ci % CHANNEL_COLORS.length];
    const colorY = CHANNEL_COLORS[this.cj % CHANNEL_COLORS.length];
    const fmtMV = (v: number) => v.toFixed(3);
    ctx.fillStyle = '#020509'; ctx.fillRect(0, 0, w, h);
    ctx.font = "bold 12px 'Space Mono'"; ctx.fillStyle = 'rgba(226,232,240,0.9)'; ctx.textAlign = 'center';
    ctx.fillText('LEAD CROSS-ANALYSIS · SCATTER PLOT', w / 2, 18);
    ctx.font = "10px 'Space Mono'";
    const numTicks = 6;
    for (let i = 0; i <= numTicks; i++) {
      const t2 = i / numTicks, v = x0 + t2 * rX, cx2 = lP + t2 * pW;
      ctx.strokeStyle = 'rgba(99,179,237,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(cx2, tP); ctx.lineTo(cx2, tP + pH); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(226,232,240,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx2, tP + pH); ctx.lineTo(cx2, tP + pH + 5); ctx.stroke();
      ctx.fillStyle = colorX; ctx.textAlign = 'center'; ctx.fillText(fmtMV(v) + 'mV', cx2, tP + pH + 18);
    }
    for (let i = 0; i <= numTicks; i++) {
      const t2 = i / numTicks, v = y0 + t2 * rY, cy2 = tP + pH - t2 * pH;
      ctx.strokeStyle = 'rgba(99,179,237,0.1)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(lP, cy2); ctx.lineTo(lP + pW, cy2); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(226,232,240,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lP - 5, cy2); ctx.lineTo(lP, cy2); ctx.stroke();
      ctx.fillStyle = colorY; ctx.textAlign = 'right'; ctx.fillText(fmtMV(v), lP - 8, cy2 + 3.5);
    }
    if (x0 < 0 && x1 > 0) { const zx = toCanvasX(0); ctx.strokeStyle = 'rgba(99,179,237,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(zx, tP); ctx.lineTo(zx, tP + pH); ctx.stroke(); ctx.setLineDash([]); }
    if (y0 < 0 && y1 > 0) { const zy = toCanvasY(0); ctx.strokeStyle = 'rgba(99,179,237,0.3)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(lP, zy); ctx.lineTo(lP + pW, zy); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = 'rgba(99,179,237,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.strokeRect(lP, tP, pW, pH);
    ctx.save(); ctx.beginPath(); ctx.rect(lP, tP, pW, pH); ctx.clip();
    for (let i = 0; i < this.xData.length; i++) {
      const px = toCanvasX(this.xData[i]), py = toCanvasY(this.yData[i]);
      const hue = 200 + (i / this.xData.length) * 100;
      ctx.fillStyle = `hsla(${hue},75%,65%,0.55)`; ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.font = "bold 10px 'Space Mono'"; ctx.fillStyle = colorX; ctx.textAlign = 'center'; ctx.fillText(`Lead ${this.ci + 1}  (mV)`, lP + pW / 2, tP + pH + 46);
    ctx.save(); ctx.translate(14, tP + pH / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = colorY; ctx.textAlign = 'center'; ctx.fillText(`Lead ${this.cj + 1}  (mV)`, 0, 0); ctx.restore();
    ctx.font = "9px 'Space Mono'"; ctx.fillStyle = 'rgba(99,179,237,0.45)'; ctx.textAlign = 'right'; ctx.fillText('axes in mV', w - rP, tP - 6);
  }

  _bindCanvas() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => { this.isDragging = true; this.lastMX = e.clientX; this.lastMY = e.clientY; c.style.cursor = 'grabbing'; });
    c.addEventListener('mousemove', e => {
      if (!this.isDragging) return;
      const bW = this.baseX1 - this.baseX0, bH = this.baseY1 - this.baseY0;
      const { width: cw, height: ch } = this.canvas;
      this.panX -= (e.clientX - this.lastMX) * (bW / this.zoom) / cw;
      this.panY += (e.clientY - this.lastMY) * (bH / this.zoom) / ch;
      this.lastMX = e.clientX; this.lastMY = e.clientY; this._updateBadge();
    });
    const end = () => { this.isDragging = false; c.style.cursor = 'crosshair'; };
    c.addEventListener('mouseup', end); c.addEventListener('mouseleave', end);
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = Math.max(0.05, Math.min(500, this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      this._updateBadge();
    }, { passive: false });
  }

  _updateBadge() { if (this.badge) this.badge.textContent = `ZOOM ×${this.zoom.toFixed(2)}`; }

  _bindButtons() {
    if (this.btnSnap) this.btnSnap.onclick = () => { const a = document.createElement('a'); a.href = this.canvas.toDataURL('image/png'); a.download = `scatter-lead${this.ci + 1}-vs-lead${this.cj + 1}.png`; a.click(); };
    if (this.btnReset) this.btnReset.onclick = () => { this.zoom = 1; this.panX = 0; this.panY = 0; this._updateBadge(); };
  }

  destroy() { this.as.remove(this._fn); if (this._ro) this._ro.disconnect(); if (this.btnSnap) this.btnSnap.onclick = null; if (this.btnReset) this.btnReset.onclick = null; }
}

// ── DigitalXorView ────────────────────────────────────────────
export class DigitalXorView {
  canvas: HTMLCanvasElement;
  ci: number;
  btnSnap: HTMLElement | null;
  chunkBadge: HTMLElement | null;
  statsEl: HTMLElement | null;

  constructor(canvas: HTMLCanvasElement, data: number[], ci: number, windowWidth: number, threshold: number, btnSnap: HTMLElement | null, chunkBadge: HTMLElement | null = null, statsEl: HTMLElement | null = null) {
    this.canvas = canvas; this.ci = ci; this.btnSnap = btnSnap;
    this.chunkBadge = chunkBadge; this.statsEl = statsEl;
    this._render(data, windowWidth, threshold);
    this._bindButtons();
  }

  _render(data: number[], W: number, threshold: number) {
    const n = data.length;
    if (!n || W < 2) return;
    const wrap = this.canvas.parentElement;
    const cW = wrap ? (wrap.clientWidth || 900) : 900, cH = 260;
    this.canvas.width = cW; this.canvas.height = cH;
    const ctx = this.canvas.getContext('2d')!;
    ctx.fillStyle = '#040810'; ctx.fillRect(0, 0, cW, cH);
    const lP = 52, rP = 12, tP = 28, bP = 32;
    const pW = Math.max(10, cW - lP - rP), pH = Math.max(10, cH - tP - bP);
    const numChunks = Math.floor(n / W);
    if (numChunks < 2) {
      ctx.font = "11px 'Space Mono'"; ctx.fillStyle = 'rgba(113,128,150,0.8)'; ctx.textAlign = 'center';
      ctx.fillText('Need at least 2 chunks — reduce window width', cW / 2, cH / 2); return;
    }
    // Global range for tolerance gate
    let gMin = Infinity, gMax = -Infinity;
    for (let i = 0; i < n; i++) { if (data[i] < gMin) gMin = data[i]; if (data[i] > gMax) gMax = data[i]; }
    const gRange = gMax - gMin || 1, tolerance = (threshold / 100) * gRange;
    // Per-pixel: mean across chunks + range-based disagree flag (vMax - vMin > tolerance)
    const meanLine = new Float32Array(pW), disagrees = new Uint8Array(pW);
    let mMin = Infinity, mMax = -Infinity;
    let anomalyCount = 0;
    for (let x = 0; x < pW; x++) {
      const pos = Math.floor((x / pW) * W);
      let sum = 0, cnt = 0, vMin = Infinity, vMax = -Infinity;
      for (let c = 0; c < numChunks; c++) {
        const idx = c * W + pos;
        if (idx < n) { const v = data[idx]; sum += v; cnt++; if (v < vMin) vMin = v; if (v > vMax) vMax = v; }
      }
      const mean = cnt ? sum / cnt : 0;
      meanLine[x] = mean; disagrees[x] = (vMax - vMin) > tolerance ? 1 : 0;
      if (disagrees[x]) anomalyCount++;
      if (mean < mMin) mMin = mean; if (mean > mMax) mMax = mean;
    }
    const mRange = mMax - mMin || 1;
    const color = CHANNEL_COLORS[this.ci % CHANNEL_COLORS.length];
    ctx.save(); ctx.beginPath(); ctx.rect(lP, tP, pW, pH); ctx.clip(); ctx.translate(lP, tP);
    Draw.grid(ctx, pW, pH);
    // Dot plot: only disagreeing positions, placed at their mean value on Y
    for (let x = 0; x < pW; x++) {
      if (!disagrees[x]) continue;
      const y = Math.round((1 - (meanLine[x] - mMin) / mRange) * pH);
      ctx.fillStyle = color + '55'; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
    ctx.save(); Draw.axes(ctx, cW, cH, Array.from(meanLine), 0, W, lP, tP, pW, pH); ctx.restore();
    ctx.save(); ctx.font = "bold 10px 'Space Mono'"; ctx.fillStyle = 'rgba(226,232,240,0.8)'; ctx.textAlign = 'left';
    ctx.fillText(`XOR SIGNAL · Lead ${this.ci + 1} · ${numChunks} chunks · pixels = mean of disagreeing positions`, lP, 16);
    ctx.font = "9px 'Space Mono'"; ctx.fillStyle = color + 'aa'; ctx.textAlign = 'right';
    ctx.fillText(`gate = ±${tolerance.toFixed(4)}  (${threshold}% of range)`, cW - rP, 16); ctx.restore();
    // Chunk badge
    if (this.chunkBadge) { this.chunkBadge.textContent = `${numChunks} CHUNKS`; (this.chunkBadge as HTMLElement).style.display = 'inline-block'; }
    // Stats panel
    const anomalyPct = (anomalyCount / pW * 100).toFixed(1);
    const periodicPct = (100 - parseFloat(anomalyPct)).toFixed(1);
    const isHealthy = parseFloat(anomalyPct) < 15;
    if (this.statsEl) {
      this.statsEl.style.display = 'flex';
      this.statsEl.innerHTML = `<div class="sv-meta-item"><div class="sv-meta-label">Chunks</div><div class="sv-meta-value" style="color:var(--green)">${numChunks}</div></div><div class="sv-meta-sep"></div><div class="sv-meta-item"><div class="sv-meta-label">Window Width</div><div class="sv-meta-value" style="color:var(--green)">${W} samples</div></div><div class="sv-meta-sep"></div><div class="sv-meta-item"><div class="sv-meta-label">Periodic Positions</div><div class="sv-meta-value" style="color:var(--green)">${periodicPct}%</div></div><div class="sv-meta-sep"></div><div class="sv-meta-item"><div class="sv-meta-label">Anomalous Positions</div><div class="sv-meta-value" style="color:${isHealthy ? 'var(--green)' : 'var(--amber)'}">${anomalyPct}%</div></div><div class="sv-meta-sep"></div><div class="sv-meta-item"><div class="sv-meta-label">Interpretation</div><div class="sv-meta-value" style="color:${isHealthy ? 'var(--green)' : 'var(--amber)'};font-size:11px">${isHealthy ? '✓ HIGHLY PERIODIC' : '⚠ IRREGULARITY DETECTED'}</div></div>`;
    }
  }

  _bindButtons() {
    if (this.btnSnap) {
      (this.btnSnap as HTMLElement).style.display = 'inline-flex';
      this.btnSnap.onclick = () => { const a = document.createElement('a'); a.href = this.canvas.toDataURL('image/png'); a.download = `xor-signal-lead${this.ci + 1}.png`; a.click(); };
    }
  }

  destroy() {
    if (this.btnSnap) { this.btnSnap.onclick = null; (this.btnSnap as HTMLElement).style.display = 'none'; }
    if (this.chunkBadge) (this.chunkBadge as HTMLElement).style.display = 'none';
    if (this.statsEl) this.statsEl.style.display = 'none';
  }
}
