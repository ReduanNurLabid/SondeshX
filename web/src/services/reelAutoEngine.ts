// Automatic news reel renderer (1080x1920, 30 fps) for the Facebook posting job.
// The video follows a voiceover timeline produced by pipeline/social/post_reel.py:
// headline, then each key point one at a time, then an outro. Video only; the job
// mixes in the voiceover and music with ffmpeg.
//
// Layout respects Facebook Reels safe zones: nothing important in the bottom 400px
// (caption and buttons) or the right 150px (like/comment/share column).

export interface ReelSegment {
  kind: 'headline' | 'point' | 'outro';
  start: number; // seconds
  end: number;
  index?: number; // point number, 0-based
}

export interface AutoReelInput {
  headline: string;
  points: string[];
  sourceLine: string; // e.g. "সূত্র: প্রথম আলো, বাংলা ট্রিবিউন"
  category: string;
  dateLine: string; // e.g. "১৫ নভেম্বর ২০২৬"
  image: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  segments: ReelSegment[];
  duration: number;
}

const W = 1080;
const H = 1920;
const PAD_L = 72;
const SAFE_R = 150;
const SAFE_BOTTOM = 400;
const TEXT_W = W - PAD_L - SAFE_R;
const FONT = '"Hind Siliguri", "Noto Sans Bengali", sans-serif';

const C = {
  ink: '#0d1b24',
  lime: '#c6ff00',
  white: '#ffffff',
  muted: 'rgba(255,255,255,0.72)',
  card: 'rgba(13,27,36,0.86)',
};

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest font size (from max down to min) at which text fits in maxLines. */
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, maxLines: number) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = wrap(ctx, text, TEXT_W);
    if (lines.length <= maxLines) return { size, lines };
  }
  ctx.font = `${weight} ${min}px ${FONT}`;
  return { size: min, lines: wrap(ctx, text, TEXT_W).slice(0, maxLines) };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  const imgH = 1180;
  if (input.image) {
    // Slow push-in over the whole reel.
    const zoom = 1.04 + 0.1 * (t / input.duration);
    const img = input.image;
    const scale = Math.max(W / img.width, imgH / img.height) * zoom;
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, imgH);
    ctx.clip();
    ctx.drawImage(img, (W - dw) / 2, (imgH - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    // No publisher photo: branded backdrop with fine diagonal lines and a large, faded,
    // slowly drifting logo so the upper half never looks empty.
    const g = ctx.createLinearGradient(0, 0, W, imgH);
    g.addColorStop(0, '#1d3b47');
    g.addColorStop(1, '#0d1b24');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, imgH);
    ctx.save();
    ctx.strokeStyle = 'rgba(198,255,0,0.06)';
    ctx.lineWidth = 2;
    const drift = (t * 12) % 60;
    for (let x = -imgH; x < W + imgH; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x + drift, 0);
      ctx.lineTo(x + drift + imgH, imgH);
      ctx.stroke();
    }
    if (input.logo) {
      const size = 620 + 30 * (t / input.duration);
      ctx.globalAlpha = 0.09;
      ctx.drawImage(input.logo, (W - size) / 2, 330 - size / 2 + 120, size, size);
    }
    ctx.restore();
  }
  // Fade the photo into the dark lower half where the text sits.
  const fade = ctx.createLinearGradient(0, 520, 0, imgH);
  fade.addColorStop(0, 'rgba(13,27,36,0)');
  fade.addColorStop(1, 'rgba(13,27,36,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 520, W, imgH - 520);
  const topShade = ctx.createLinearGradient(0, 0, 0, 260);
  topShade.addColorStop(0, 'rgba(0,0,0,0.55)');
  topShade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, W, 260);
}

function drawTopBar(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number) {
  // Segmented progress, one bar per voiced segment.
  const segs = input.segments;
  const gap = 8;
  const barW = (W - 2 * 48 - gap * (segs.length - 1)) / segs.length;
  segs.forEach((s, i) => {
    const x = 48 + i * (barW + gap);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(ctx, x, 56, barW, 8, 4);
    ctx.fill();
    const p = Math.min(1, Math.max(0, (t - s.start) / Math.max(0.01, s.end - s.start)));
    if (p > 0) {
      ctx.fillStyle = C.lime;
      roundRect(ctx, x, 56, barW * p, 8, 4);
      ctx.fill();
    }
  });

  // Brand.
  let x = 48;
  if (input.logo) {
    ctx.save();
    roundRect(ctx, x, 96, 76, 76, 16);
    ctx.clip();
    ctx.drawImage(input.logo, x, 96, 76, 76);
    ctx.restore();
    x += 92;
  }
  ctx.fillStyle = C.white;
  ctx.font = `700 40px ${FONT}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('সন্দেশ এক্সপ্রেস', x, 122);
  ctx.fillStyle = C.muted;
  ctx.font = `500 28px ${FONT}`;
  ctx.fillText(input.dateLine, x, 160);

  // Category chip.
  ctx.font = `700 30px ${FONT}`;
  const chipW = ctx.measureText(input.category).width + 44;
  ctx.fillStyle = C.lime;
  roundRect(ctx, W - 48 - chipW, 104, chipW, 56, 28);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.fillText(input.category, W - 48 - chipW + 22, 133);
  ctx.textBaseline = 'alphabetic';
}

function drawHeadline(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number, seg: ReelSegment, compact: boolean) {
  const appear = ease((t - seg.start) / 0.6);
  if (!compact) {
    // Full-size headline: the hook of the reel.
    const { size, lines } = fitText(ctx, input.headline, 700, 88, 60, 5);
    const lineH = size * 1.32;
    const blockH = lines.length * lineH;
    const top = H - SAFE_BOTTOM - blockH - 40 + (1 - appear) * 60;
    ctx.globalAlpha = appear;
    ctx.fillStyle = C.lime;
    ctx.fillRect(PAD_L, top - 36, 120, 10);
    ctx.fillStyle = C.white;
    ctx.font = `700 ${size}px ${FONT}`;
    lines.forEach((l, i) => ctx.fillText(l, PAD_L, top + size + i * lineH));
    ctx.globalAlpha = 1;
    return;
  }
  // Small headline above the points.
  const { size, lines } = fitText(ctx, input.headline, 700, 46, 36, 3);
  const lineH = size * 1.3;
  ctx.fillStyle = C.muted;
  ctx.font = `700 ${size}px ${FONT}`;
  const top = 1000 - lines.length * lineH;
  lines.forEach((l, i) => ctx.fillText(l, PAD_L, top + size + i * lineH));
}

function drawPoint(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number, seg: ReelSegment) {
  const idx = seg.index ?? 0;
  const text = input.points[idx] || '';
  const appear = ease((t - seg.start) / 0.5);
  const { size, lines } = fitText(ctx, text, 600, 64, 44, 6);
  const lineH = size * 1.42;
  const cardTop = 1040;
  const cardH = Math.max(lines.length * lineH + 96, 300);
  const slide = (1 - appear) * 80;

  ctx.globalAlpha = appear;
  ctx.fillStyle = C.card;
  roundRect(ctx, PAD_L - 24, cardTop + slide, TEXT_W + 48, cardH, 28);
  ctx.fill();
  ctx.fillStyle = C.lime;
  roundRect(ctx, PAD_L - 24, cardTop + slide, 12, cardH, 6);
  ctx.fill();

  // Point counter: ১/৩
  const bn = '০১২৩৪৫৬৭৮৯';
  const toBn = (n: number) => String(n).split('').map((d) => bn[+d] ?? d).join('');
  ctx.fillStyle = C.lime;
  ctx.font = `700 34px ${FONT}`;
  ctx.fillText(`${toBn(idx + 1)}/${toBn(input.points.length)}`, PAD_L + 12, cardTop + slide + 58);

  ctx.fillStyle = C.white;
  ctx.font = `600 ${size}px ${FONT}`;
  lines.forEach((l, i) => ctx.fillText(l, PAD_L + 12, cardTop + slide + 76 + size + i * lineH));
  ctx.globalAlpha = 1;
}

function drawSource(ctx: CanvasRenderingContext2D, input: AutoReelInput) {
  if (!input.sourceLine) return;
  ctx.fillStyle = C.muted;
  ctx.font = `500 30px ${FONT}`;
  const line = wrap(ctx, input.sourceLine, TEXT_W)[0];
  ctx.fillText(line, PAD_L, H - SAFE_BOTTOM + 10);
}

function drawOutro(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number, seg: ReelSegment) {
  const appear = ease((t - seg.start) / 0.5);
  ctx.fillStyle = `rgba(13,27,36,${0.92 * appear})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = appear;
  const cx = (W - SAFE_R / 2) / 2;
  if (input.logo) {
    ctx.save();
    roundRect(ctx, cx - 140, 520, 280, 280, 48);
    ctx.clip();
    ctx.drawImage(input.logo, cx - 140, 520, 280, 280);
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = C.white;
  ctx.font = `700 76px ${FONT}`;
  ctx.fillText('সন্দেশ এক্সপ্রেস', cx, 930);
  ctx.fillStyle = C.muted;
  ctx.font = `500 42px ${FONT}`;
  ctx.fillText('এক মিনিটে দিনের খবর', cx, 1000);
  ctx.fillStyle = C.lime;
  roundRect(ctx, cx - 300, 1080, 600, 104, 52);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText('পুরো খবর কমেন্টের লিংকে', cx, 1146);
  ctx.fillStyle = C.white;
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText('ফলো করুন, প্রতিদিনের খবর পেতে', cx, 1270);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

export function drawAutoReelFrame(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number) {
  const seg = input.segments.find((s) => t >= s.start && t < s.end) || input.segments[input.segments.length - 1];
  drawBackground(ctx, input, t);
  drawTopBar(ctx, input, t);
  if (seg.kind === 'headline') {
    drawHeadline(ctx, input, t, seg, false);
  } else if (seg.kind === 'point') {
    drawHeadline(ctx, input, t, seg, true);
    drawPoint(ctx, input, t, seg);
  }
  if (seg.kind !== 'outro') drawSource(ctx, input);
  if (seg.kind === 'outro') drawOutro(ctx, input, t, seg);
}

/** Records the reel in real time and returns a silent video blob. */
export async function renderAutoReel(input: AutoReelInput): Promise<{ blob: Blob; mimeType: string }> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const mimeType = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm'].find((m) =>
    MediaRecorder.isTypeSupported(m),
  ) || 'video/webm';
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));

  drawAutoReelFrame(ctx, input, 0);
  recorder.start(250);
  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      drawAutoReelFrame(ctx, input, Math.min(t, input.duration));
      if (t >= input.duration) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  recorder.stop();
  await stopped;
  return { blob: new Blob(chunks, { type: mimeType }), mimeType };
}
