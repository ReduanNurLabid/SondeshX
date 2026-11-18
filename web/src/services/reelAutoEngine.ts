// Automatic news reel renderer (1080x1920, 30 fps) for the Facebook posting job.
// The video follows a voiceover timeline produced by pipeline/social/post_reel.py:
// hook, then the key point, then a short end card. Video only; the job mixes in the
// voiceover, music and sound effects with ffmpeg.
//
// Look (modelled on how leading Bangla news pages make Reels): the photo fills the frame
// edge to edge, the hook sits in tight "sticker" boxes (white, then red) from the first
// frame, branding is a small corner mark, and the picture keeps moving: a new camera move
// on every beat travels across the photo, so a single still never looks like a still.
// No borders, bands or edge lines: Facebook limits videos that look framed.
//
// Layout respects Facebook Reels safe zones: nothing important in the bottom 400px
// (caption and buttons) or the right 150px (like/comment/share column).

export interface ReelSegment {
  kind: 'intro' | 'headline' | 'point' | 'outro';
  start: number; // seconds
  end: number;
  index?: number; // point number, 0-based
}

export interface AutoReelInput {
  headline: string; // the hook: short, shown from the first frame
  points: string[];
  sourceLine: string; // e.g. "সূত্র: প্রথম আলো, বাংলা ট্রিবিউন"
  category: string;
  dateLine: string; // e.g. "১৫ নভেম্বর ২০২৬"
  kicker?: string; // optional 1-2 word label above the hook, e.g. "নতুন তারিখ"
  image: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  segments: ReelSegment[];
  duration: number;
}

const W = 1080;
const H = 1920;
const PAD_L = 64;
const SAFE_R = 150;
const SAFE_BOTTOM = 400;
const TEXT_W = W - PAD_L - SAFE_R;
const FONT = '"Hind Siliguri", "Noto Sans Bengali", sans-serif';
const WATERMARK_TRIM = 0.09; // bottom share of the source photo left out (publisher marks)

const C = {
  ink: '#0b0b0c',
  paper: '#ffffff',
  red: '#d7191f',
  muted: 'rgba(255,255,255,0.85)',
};

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const ease = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

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
function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, maxLines: number, width = TEXT_W - 40) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = wrap(ctx, text, width);
    if (lines.length <= maxLines) return { size, lines };
  }
  // Never drop words: at the smallest size, use as many lines as the text needs.
  ctx.font = `${weight} ${min}px ${FONT}`;
  return { size: min, lines: wrap(ctx, text, width) };
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

// ---------------------------------------------------------------- picture
// The photo always reaches the left, right and top edges of the frame. Facebook flags
// videos whose picture sits inside bands (blurred copies, bars, frames) as a "border",
// which it treats as a sign of reposted content and shows to fewer people.

const PHOTO_H = 1240; // the photo fills the frame down to here, then fades into the text area

interface Prepared {
  sx: number; sy: number; sw: number; sh: number; // source rect, watermark strip removed
}

const prepared = new WeakMap<HTMLImageElement, Prepared>();

function prepare(img: HTMLImageElement): Prepared {
  const hit = prepared.get(img);
  if (hit) return hit;
  const sw = img.naturalWidth || img.width;
  const sh = Math.round((img.naturalHeight || img.height) * (1 - WATERMARK_TRIM));
  const p = { sx: 0, sy: 0, sw, sh };
  prepared.set(img, p);
  return p;
}

/** Camera move for each beat: zoom and pan (-1..1 of the spare room), eased. A wide news
 *  photo is cropped to the portrait frame, so the pans travel across it and show it all. */
function cameraFor(input: AutoReelInput, t: number) {
  const segs = input.segments;
  const i = Math.max(0, segs.findIndex((s) => t >= s.start && t < s.end));
  const seg = segs[i] || segs[segs.length - 1];
  const k = easeInOut((t - seg.start) / Math.max(0.1, seg.end - seg.start));
  const moves = [
    { z0: 1.0, z1: 1.1, x0: 0, x1: 0, y0: 0, y1: -0.3 },      // push in on the centre
    { z0: 1.05, z1: 1.08, x0: -0.9, x1: 0.2, y0: 0, y1: 0 },  // travel left to right
    { z0: 1.08, z1: 1.05, x0: 0.9, x1: -0.2, y0: 0, y1: 0 },  // travel right to left
    { z0: 1.12, z1: 1.0, x0: 0, x1: 0, y0: -0.2, y1: 0 },     // pull back
  ];
  const m = seg.kind === 'outro' ? moves[3] : i === 0 ? moves[0] : moves[1 + ((i - 1) % 2)];
  return {
    zoom: m.z0 + (m.z1 - m.z0) * k,
    panX: m.x0 + (m.x1 - m.x0) * k,
    panY: m.y0 + (m.y1 - m.y0) * k,
    beatStart: seg.start,
    k,
  };
}

function drawPicture(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  const cam = cameraFor(input, t);

  if (!input.image) {
    // No publisher photo: dark backdrop with a slowly drifting red glow, no big logo.
    const gx = W * (0.3 + 0.4 * Math.sin(t * 0.35));
    const g = ctx.createRadialGradient(gx, 700, 60, gx, 700, 1100);
    g.addColorStop(0, 'rgba(215,25,31,0.35)');
    g.addColorStop(1, 'rgba(11,11,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  const img = input.image;
  const p = prepare(img);
  const scale = Math.max(W / p.sw, PHOTO_H / p.sh) * cam.zoom;
  const dw = p.sw * scale;
  const dh = p.sh * scale;
  const x = (W - dw) / 2 + ((dw - W) / 2) * cam.panX;
  const y = (PHOTO_H - dh) / 2 + ((dh - PHOTO_H) / 2) * cam.panY;
  ctx.drawImage(img, p.sx, p.sy, p.sw, p.sh, x, y, dw, dh);

  // Fade the photo into the dark text area (a gradient, not a band), and shade the top.
  const fade = ctx.createLinearGradient(0, 760, 0, PHOTO_H);
  fade.addColorStop(0, 'rgba(11,11,12,0)');
  fade.addColorStop(1, 'rgba(11,11,12,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 760, W, PHOTO_H - 760 + 2);
  const top = ctx.createLinearGradient(0, 0, 0, 300);
  top.addColorStop(0, 'rgba(0,0,0,0.5)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 300);
}

/** A quick white flash at the start of each beat after the first: marks the cut. */
function drawBeatFlash(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number) {
  const cam = cameraFor(input, t);
  if (cam.beatStart <= 0) return;
  const a = 0.35 * (1 - clamp01((t - cam.beatStart) / 0.2));
  if (a <= 0) return;
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- text

/** Lines in tight boxes, one box per line, like a news sticker. */
function drawSticker(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  size: number,
  top: number,
  styleFor: (i: number) => { bg: string; fg: string },
  appear = 1,
) {
  const padX = Math.round(size * 0.32);
  const lineH = Math.round(size * 1.42);
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    const a = ease((appear * (lines.length + 1) - i) / 1.2);
    if (a <= 0) return;
    const { bg, fg } = styleFor(i);
    const w = ctx.measureText(line).width + padX * 2;
    const y = top + i * lineH;
    ctx.globalAlpha = a;
    ctx.fillStyle = bg;
    ctx.fillRect(PAD_L - (1 - a) * 40, y, w, lineH - 6);
    ctx.fillStyle = fg;
    ctx.fillText(line, PAD_L + padX - (1 - a) * 40, y + (lineH - 6) / 2 + size * 0.04);
  });
  ctx.globalAlpha = 1;
  ctx.textBaseline = 'alphabetic';
  return lines.length * lineH;
}

function drawHook(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number, seg: ReelSegment) {
  // Fully visible on the first frame: it is also the cover image.
  const local = t - seg.start;
  const { size, lines } = fitText(ctx, input.headline, 700, 92, 56, 4);
  const lineH = Math.round(size * 1.42);
  const blockH = lines.length * lineH;
  const top = Math.min(1060, H - SAFE_BOTTOM - blockH - 40);
  const punch = local < 0.6 ? 1 + 0.04 * Math.sin((local / 0.6) * Math.PI) : 1;
  ctx.save();
  ctx.translate(PAD_L, top);
  ctx.scale(punch, punch);
  ctx.translate(-PAD_L, -top);
  if (input.kicker) {
    ctx.font = `700 40px ${FONT}`;
    const kw = ctx.measureText(input.kicker).width + 32;
    ctx.fillStyle = C.red;
    ctx.fillRect(PAD_L, top - 74, kw, 58);
    ctx.fillStyle = C.paper;
    ctx.textBaseline = 'middle';
    ctx.fillText(input.kicker, PAD_L + 16, top - 44);
    ctx.textBaseline = 'alphabetic';
  }
  // First line(s) white with dark text, the last line red: the eye lands on the payoff.
  const last = lines.length - 1;
  drawSticker(ctx, lines, size, top, (i) =>
    i === last && lines.length > 1 ? { bg: C.red, fg: C.paper } : { bg: C.paper, fg: C.ink },
  );
  ctx.restore();
}

function drawPoint(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number, seg: ReelSegment) {
  const text = input.points[seg.index ?? 0] || '';
  const appear = clamp01((t - seg.start) / 0.6);
  const { size, lines } = fitText(ctx, text, 700, 64, 44, 6);
  const lineH = Math.round(size * 1.42);
  const top = Math.min(1080, H - SAFE_BOTTOM - lines.length * lineH - 40);
  drawSticker(ctx, lines, size, top, () => ({ bg: 'rgba(11,11,12,0.88)', fg: C.paper }), appear);
}

/** Small brand mark top-left, source and date top-right: present but quiet. */
function drawCorners(ctx: CanvasRenderingContext2D, input: AutoReelInput) {
  let x = 48;
  if (input.logo) {
    ctx.save();
    roundRect(ctx, x, 84, 56, 56, 12);
    ctx.clip();
    ctx.drawImage(input.logo, x, 84, 56, 56);
    ctx.restore();
    x += 68;
  }
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.paper;
  ctx.font = `700 30px ${FONT}`;
  ctx.fillText('সন্দেশ এক্সপ্রেস', x, 113);

  const right = W - 48;
  ctx.font = `500 26px ${FONT}`;
  const tags = [input.sourceLine.replace(/^সূত্র:\s*/, '').split(',')[0]?.trim(), input.dateLine].filter(Boolean) as string[];
  tags.forEach((label, i) => {
    const w = ctx.measureText(label).width + 20;
    const y = 86 + i * 46;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(right - w, y, w, 40);
    ctx.fillStyle = C.paper;
    ctx.fillText(label, right - w + 10, y + 21);
  });
  ctx.textBaseline = 'alphabetic';
}

function drawOutro(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number, seg: ReelSegment) {
  const appear = ease((t - seg.start) / 0.35);
  ctx.fillStyle = `rgba(11,11,12,${0.8 * appear})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = appear;
  const cx = (W - SAFE_R / 2) / 2;
  if (input.logo) {
    ctx.save();
    roundRect(ctx, cx - 90, 640, 180, 180, 32);
    ctx.clip();
    ctx.drawImage(input.logo, cx - 90, 640, 180, 180);
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = C.paper;
  ctx.font = `700 60px ${FONT}`;
  ctx.fillText('সন্দেশ এক্সপ্রেস', cx, 900);
  ctx.font = `600 40px ${FONT}`;
  const cta = 'পুরো খবর কমেন্টের লিংকে';
  const w = ctx.measureText(cta).width + 48;
  ctx.fillStyle = C.red;
  ctx.fillRect(cx - w / 2, 950, w, 72);
  ctx.fillStyle = C.paper;
  ctx.fillText(cta, cx, 999);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

export function drawAutoReelFrame(ctx: CanvasRenderingContext2D, input: AutoReelInput, t: number) {
  const seg = input.segments.find((s) => t >= s.start && t < s.end) || input.segments[input.segments.length - 1];
  drawPicture(ctx, input, t);
  if (seg.kind === 'outro') {
    drawOutro(ctx, input, t, seg);
    return;
  }
  drawCorners(ctx, input);
  if (seg.kind === 'headline' || seg.kind === 'intro') drawHook(ctx, input, t, seg);
  else if (seg.kind === 'point') drawPoint(ctx, input, t, seg);
  drawBeatFlash(ctx, input, t);
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
