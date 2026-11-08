/**
 * Celebration confetti in the spirit of Telegram's: two bursts from the bottom
 * corners, pieces fly up and inwards, flip in the air and drift down.
 * Self-contained canvas overlay — no dependency, removes itself when done,
 * skipped for users who prefer reduced motion.
 */

const COLORS = ['#ff2181', '#56ce6b', '#f5b947', '#3d9bee', '#ae6ce9', '#ff7a45'];
const PER_SIDE = 90;
const GRAVITY = 0.32;
const DRAG = 0.985;
const MAX_MS = 4200;
const FADE_MS = 700;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  angle: number;
  spin: number;
  flip: number;
  flipSpeed: number;
  sway: number;
  round: boolean;
};

function makePiece(fromLeft: boolean, width: number, height: number): Piece {
  // Launch angle: up and towards the centre (60°–85° from the horizontal).
  const angle = ((60 + Math.random() * 25) * Math.PI) / 180;
  const speed = (height / 900) * (17 + Math.random() * 9);
  const dir = fromLeft ? 1 : -1;
  const round = Math.random() < 0.25;
  const size = 8 + Math.random() * 7;
  return {
    x: fromLeft ? -10 : width + 10,
    y: height + 10,
    vx: dir * Math.cos(angle) * speed * (0.8 + Math.random() * 0.6),
    vy: -Math.sin(angle) * speed,
    w: round ? size * 0.8 : size,
    h: round ? size * 0.8 : size * (0.4 + Math.random() * 0.3),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.3,
    flip: Math.random() * Math.PI * 2,
    flipSpeed: 0.08 + Math.random() * 0.12,
    sway: Math.random() * Math.PI * 2,
    round,
  };
}

export function fireConfetti(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
    zIndex: '9999',
  });
  document.body.appendChild(canvas);
  ctx.scale(dpr, dpr);

  const pieces: Piece[] = [];
  for (let i = 0; i < PER_SIDE; i++) {
    pieces.push(makePiece(true, width, height), makePiece(false, width, height));
  }

  const start = performance.now();
  let last = start;

  const frame = (now: number) => {
    const elapsed = now - start;
    // Normalise to 60 fps so the motion is the same on 120 Hz screens.
    const k = Math.min((now - last) / 16.67, 3);
    last = now;

    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = elapsed > MAX_MS - FADE_MS ? Math.max(0, (MAX_MS - elapsed) / FADE_MS) : 1;

    let alive = 0;
    for (const p of pieces) {
      p.vx *= DRAG ** k;
      p.vy = p.vy * DRAG ** k + GRAVITY * k;
      // Falling pieces flutter: slower descent and a sideways sway.
      if (p.vy > 2.5) p.vy = 2.5 + (p.vy - 2.5) * 0.9;
      p.sway += 0.05 * k;
      p.x += (p.vx + (p.vy > 0 ? Math.sin(p.sway) * 0.8 : 0)) * k;
      p.y += p.vy * k;
      p.angle += p.spin * k;
      p.flip += p.flipSpeed * k;
      if (p.y > height + 40) continue;
      alive++;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      // 3D flip: squash along one axis.
      const scale = Math.cos(p.flip);
      ctx.scale(1, scale);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }

    if (alive > 0 && elapsed < MAX_MS) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}
