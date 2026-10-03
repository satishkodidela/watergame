// Pointer / touch / keyboard input.
// Drag anywhere = virtual joystick (relative to where the finger went down).
// Short tap (no drag) = pulse. A second finger while dragging = pulse. Space = pulse.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.dir = { x: 0, y: 0 };      // desired movement, length 0..1, world axes (y up)
    this.pulseQueued = 0;
    this.keys = new Set();
    this.joy = null;                // {id, sx, sy, cx, cy, t, moved}
    this.anyInput = false;
    this.lastTouchJoy = null;       // for drawing the on-screen stick
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._up(e, true));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.anyInput = true;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'enter' || k === 'shift') { this.pulseQueued++; e.preventDefault(); }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.joy = null; });
  }

  _down(e) {
    this.anyInput = true;
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (this.joy && this.joy.id !== e.pointerId) {
      // second finger while steering → pulse
      this.pulseQueued++;
      return;
    }
    this.joy = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cx: e.clientX, cy: e.clientY, t: performance.now(), moved: false };
  }

  _move(e) {
    const j = this.joy;
    if (!j || j.id !== e.pointerId) return;
    j.cx = e.clientX; j.cy = e.clientY;
    const dx = j.cx - j.sx, dy = j.cy - j.sy;
    if (dx * dx + dy * dy > 10 * 10) j.moved = true;
  }

  _up(e, cancelled = false) {
    const j = this.joy;
    if (!j || j.id !== e.pointerId) return;
    const dt = performance.now() - j.t;
    if (!cancelled && !j.moved && dt < 350) this.pulseQueued++;
    this.joy = null;
  }

  // Called once per frame. Returns {x, y} desired direction (len ≤ 1), y up.
  poll() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('arrowleft') || k.has('a')) x -= 1;
    if (k.has('arrowright') || k.has('d')) x += 1;
    if (k.has('arrowup') || k.has('w')) y += 1;
    if (k.has('arrowdown') || k.has('s')) y -= 1;
    const j = this.joy;
    if (j && j.moved) {
      const dx = j.cx - j.sx, dy = -(j.cy - j.sy);
      const len = Math.hypot(dx, dy);
      const R = 70; // px for full deflection
      const m = Math.min(1, len / R);
      x = (dx / (len || 1)) * m;
      y = (dy / (len || 1)) * m;
      this.lastTouchJoy = { sx: j.sx, sy: j.sy, cx: j.cx, cy: j.cy, m };
    } else {
      this.lastTouchJoy = null;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
    }
    this.dir.x = x; this.dir.y = y;
    return this.dir;
  }

  takePulse() {
    const n = this.pulseQueued;
    this.pulseQueued = 0;
    return n;
  }
}
