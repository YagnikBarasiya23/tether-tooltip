/*!
 * Tether — a tooltip on an elastic string. MIT © 2026 Yagnik Barasiya
 * https://github.com/YagnikBarasiya23/tether-tooltip
 */

const OPPOSITE = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/**
 * Where the bubble should sit. Tries the preferred side, flips to the
 * opposite one if the bubble would leave the viewport, then slides along the
 * edge to stay `padding` px inside it. Returns the bubble's top-left corner,
 * the side used, and the two points the string connects.
 */
export function place(anchor, bubble, viewport, { placement = 'top', gap = 36, padding = 8 } = {}) {
  const fits = side => {
    if (side === 'top') return anchor.top - gap - bubble.height >= padding;
    if (side === 'bottom') return anchor.bottom + gap + bubble.height <= viewport.height - padding;
    if (side === 'left') return anchor.left - gap - bubble.width >= padding;
    return anchor.right + gap + bubble.width <= viewport.width - padding;
  };
  const side = fits(placement) || !fits(OPPOSITE[placement]) ? placement : OPPOSITE[placement];
  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2;
  let x;
  let y;
  if (side === 'top' || side === 'bottom') {
    x = cx - bubble.width / 2;
    y = side === 'top' ? anchor.top - gap - bubble.height : anchor.bottom + gap;
  } else {
    y = cy - bubble.height / 2;
    x = side === 'left' ? anchor.left - gap - bubble.width : anchor.right + gap;
  }
  x = Math.max(padding, Math.min(viewport.width - padding - bubble.width, x));
  y = Math.max(padding, Math.min(viewport.height - padding - bubble.height, y));
  return { x, y, side, from: anchorPoint(anchor, side) };
}

/** The middle of the anchor edge that faces the bubble. */
export function anchorPoint(rect, side) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return {
    top: { x: cx, y: rect.top },
    bottom: { x: cx, y: rect.bottom },
    left: { x: rect.left, y: cy },
    right: { x: rect.right, y: cy },
  }[side];
}

/** The point on the bubble's edge, facing the anchor, where the string ties on. */
export function bubblePoint(x, y, width, height, side, toward) {
  const clampX = Math.max(x + 14, Math.min(x + width - 14, toward.x));
  const clampY = Math.max(y + 10, Math.min(y + height - 10, toward.y));
  return {
    top: { x: clampX, y: y + height },
    bottom: { x: clampX, y },
    left: { x: x + width, y: clampY },
    right: { x, y: clampY },
  }[side];
}

/**
 * A quadratic curve from `a` to `b`. The control point starts at the
 * midpoint and is pushed sideways by `sway` (px) plus a little slack that
 * grows as the string gets shorter than its rest length.
 */
export function stringPath(a, b, sway = 0, rest = 36) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const slack = Math.max(0, rest - length) * 0.6;
  const bend = sway + slack;
  const cx = (a.x + b.x) / 2 + nx * bend;
  const cy = (a.y + b.y) / 2 + ny * bend;
  const r = n => Math.round(n * 10) / 10;
  return `M${r(a.x)} ${r(a.y)} Q${r(cx)} ${r(cy)} ${r(b.x)} ${r(b.y)}`;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVG = 'http://www.w3.org/2000/svg';
let uid = 0;

export default class Tether {
  /** Attaches to every `[data-tether]` element; the attribute value is the text. */
  static mountAll(root = document, options = {}) {
    return [...root.querySelectorAll('[data-tether]')].map(anchor => new Tether(anchor, {
      ...options,
      content: anchor.dataset.tether || document.getElementById(anchor.dataset.tetherTemplate)?.content.cloneNode(true),
      placement: anchor.dataset.placement ?? options.placement,
    }));
  }

  constructor(anchor, { content = '', placement = 'top', gap = 36, delay = 120, open = false, interactive = false, stiffness = 150, damping = 14 } = {}) {
    this.anchor = anchor;
    this.options = { placement, gap, delay, interactive, stiffness, damping };
    this.visible = false;
    this.persistent = open;
    // Bubble position and scale, each with a velocity for the springs.
    this.state = { x: 0, y: 0, vx: 0, vy: 0, s: 0.6, vs: 0, tx: 0, ty: 0, ts: 1 };
    this.frame = 0;

    const id = `tether-${++uid}`;
    this.bubble = document.createElement('div');
    this.bubble.className = 'tether-bubble';
    this.bubble.id = id;
    this.bubble.setAttribute('role', 'tooltip');
    this.bubble.hidden = true;
    this.setContent(content);

    this.svg = document.createElementNS(SVG, 'svg');
    this.svg.setAttribute('class', 'tether-string');
    this.svg.setAttribute('aria-hidden', 'true');
    this.path = document.createElementNS(SVG, 'path');
    this.knot = document.createElementNS(SVG, 'circle');
    this.knot.setAttribute('r', '3.5');
    this.svg.append(this.path, this.knot);
    this.svg.style.display = 'none';
    document.body.append(this.svg, this.bubble);

    const described = anchor.getAttribute('aria-describedby');
    anchor.setAttribute('aria-describedby', described ? `${described} ${id}` : id);

    this.listeners = [
      [anchor, 'pointerenter', () => this.schedule(true)],
      [anchor, 'pointerleave', () => this.schedule(false)],
      [anchor, 'focus', () => this.schedule(true, 0)],
      [anchor, 'blur', () => this.schedule(false, 0)],
      [this.bubble, 'pointerenter', () => this.options.interactive && this.schedule(true, 0)],
      [this.bubble, 'pointerleave', () => this.options.interactive && this.schedule(false)],
      [document, 'keydown', event => { if (event.key === 'Escape' && this.visible && !this.persistent) this.hide(); }],
      [window, 'scroll', () => this.reposition(), { passive: true, capture: true }],
      [window, 'resize', () => this.reposition(), { passive: true }],
    ];
    this.listeners.forEach(([target, type, fn, opts]) => target.addEventListener(type, fn, opts));
    this.observer = new ResizeObserver(() => this.reposition());
    this.observer.observe(anchor);
    this.observer.observe(this.bubble);

    if (open) this.show();
  }

  setContent(content) {
    if (content instanceof Node) this.bubble.replaceChildren(content);
    else this.bubble.textContent = content;
    if (this.visible) this.reposition();
  }

  configure(options) {
    Object.assign(this.options, options);
    if (this.visible) this.reposition();
    return this;
  }

  schedule(show, delay = this.options.delay) {
    clearTimeout(this.timer);
    if (this.persistent) return;
    this.timer = setTimeout(() => (show ? this.show() : this.hide()), show ? delay : delay + 60);
  }

  show() {
    clearTimeout(this.timer);
    if (this.visible) return;
    this.visible = true;
    this.bubble.hidden = false;
    this.svg.style.display = '';
    this.bubble.classList.remove('is-leaving');
    this.bubble.classList.toggle('is-interactive', !!this.options.interactive);
    this.svg.style.setProperty('--tether-string', getComputedStyle(this.bubble).getPropertyValue('--tether-string'));
    this.anchor.dispatchEvent(new CustomEvent('tether:show'));
    const target = this.measure();
    const s = this.state;
    // Grow out of the anchor unless it was still on its way out.
    if (!this.leaving) {
      Object.assign(s, { x: target.from.x - this.size.width / 2, y: target.from.y - this.size.height / 2, vx: 0, vy: 0, s: 0.4, vs: 0 });
    }
    this.leaving = false;
    s.ts = 1;
    this.run();
  }

  hide() {
    clearTimeout(this.timer);
    if (!this.visible) return;
    this.visible = false;
    this.leaving = true;
    this.bubble.classList.add('is-leaving');
    this.anchor.dispatchEvent(new CustomEvent('tether:hide'));
    const from = this.target?.from;
    if (from) Object.assign(this.state, { tx: from.x - this.size.width / 2, ty: from.y - this.size.height / 2 });
    this.state.ts = 0.4;
    this.run();
  }

  /** Keeps a tooltip open (for onboarding steps) or hands control back to hover. */
  pin(open = true) {
    this.persistent = open;
    open ? this.show() : this.hide();
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.timer);
    this.listeners.forEach(([target, type, fn, opts]) => target.removeEventListener(type, fn, opts));
    this.observer.disconnect();
    const ids = (this.anchor.getAttribute('aria-describedby') ?? '').split(' ').filter(i => i && i !== this.bubble.id);
    ids.length ? this.anchor.setAttribute('aria-describedby', ids.join(' ')) : this.anchor.removeAttribute('aria-describedby');
    this.bubble.remove();
    this.svg.remove();
  }

  measure() {
    this.size = { width: this.bubble.offsetWidth, height: this.bubble.offsetHeight };
    const target = place(this.anchor.getBoundingClientRect(), this.size, { width: innerWidth, height: innerHeight }, this.options);
    this.target = target;
    this.bubble.dataset.side = target.side;
    if (this.visible) Object.assign(this.state, { tx: target.x, ty: target.y });
    return target;
  }

  reposition() {
    if (!this.visible && !this.leaving) return;
    this.measure();
    this.run();
  }

  run() {
    if (reduced()) {
      const s = this.state;
      Object.assign(s, { x: s.tx, y: s.ty, s: this.visible ? 1 : 0.4, vx: 0, vy: 0, vs: 0 });
      this.paint();
      if (!this.visible) this.finishHide();
      return;
    }
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  tick = now => {
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    const s = this.state;
    const { stiffness, damping } = this.options;
    let busy = false;
    for (const [p, v, t, k] of [['x', 'vx', 'tx', 1], ['y', 'vy', 'ty', 1], ['s', 'vs', 'ts', 1.6]]) {
      for (let i = 0; i < 4; i++) {
        const a = -stiffness * k * (s[p] - s[t]) - damping * s[v];
        s[v] += a * (dt / 4);
        s[p] += s[v] * (dt / 4);
      }
      busy ||= Math.abs(s[p] - s[t]) > (p === 's' ? 0.002 : 0.1) || Math.abs(s[v]) > 0.05;
    }
    this.paint();
    // Once a leaving bubble has faded out there is nothing left to watch.
    if (!this.visible && s.s <= 0.42) {
      this.finishHide();
      this.frame = 0;
      return;
    }
    if (!busy) {
      s.x = s.tx; s.y = s.ty; s.s = s.ts;
      this.paint();
      if (!this.visible) this.finishHide();
    }
    this.frame = busy ? requestAnimationFrame(this.tick) : 0;
  };

  paint() {
    const s = this.state;
    const { target, size } = this;
    if (!target) return;
    this.bubble.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) scale(${s.s})`;
    // Opacity follows the scale spring, so the bubble fades in as it grows and out as it shrinks.
    this.bubble.style.opacity = String(Math.max(0, Math.min(1, (s.s - 0.4) / 0.5)));
    // The bubble scales about its tie-on point, so measure that point after scaling.
    const bx = s.x + (size.width * (1 - s.s)) / 2;
    const by = s.y + (size.height * (1 - s.s)) / 2;
    const tie = bubblePoint(bx, by, size.width * s.s, size.height * s.s, target.side, target.from);
    // Sideways velocity bends the string the way a real one lags behind.
    const along = target.side === 'top' || target.side === 'bottom' ? s.vx : -s.vy;
    const sway = Math.max(-60, Math.min(60, along * 0.06 * (target.side === 'top' || target.side === 'left' ? -1 : 1)));
    this.path.setAttribute('d', stringPath(target.from, tie, sway, this.options.gap));
    this.knot.setAttribute('cx', target.from.x);
    this.knot.setAttribute('cy', target.from.y);
  }

  finishHide() {
    this.leaving = false;
    this.bubble.hidden = true;
    this.svg.style.display = 'none';
  }
}
