// Facebook / Instagram photo card (1080x1350, 4:5) in the same look as the Reels:
// dark ink background, publisher photo, lime accents, border frame.

export type PhotoCardLayout = 'story' | 'headline';

export interface PhotoCardInput {
  layout: PhotoCardLayout;
  headline: string;
  points: string[];
  category: string;
  dateLine: string;
  sourceLine: string;
  image: HTMLImageElement | null;
  logo: HTMLImageElement | null;
}

export const CARD_W = 1080;
export const CARD_H = 1350;
const PAD = 64;
const TEXT_W = CARD_W - PAD * 2;
const FONT = '"Hind Siliguri", "Noto Sans Bengali", sans-serif';
const C = { ink: '#0d1b24', lime: '#c6ff00', white: '#ffffff', muted: 'rgba(255,255,255,0.78)', faint: 'rgba(255,255,255,0.5)' };

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

function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, min: number, maxLines: number, width = TEXT_W) {
  for (let size = max; size >= min; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = wrap(ctx, text, width);
    if (lines.length <= maxLines) return { size, lines };
  }
  ctx.font = `${weight} ${min}px ${FONT}`;
  const lines = wrap(ctx, text, width);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return { size: min, lines };
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

function drawPhotoArea(ctx: CanvasRenderingContext2D, input: PhotoCardInput, height: number) {
  if (input.image) {
    const img = input.image;
    const scale = Math.max(CARD_W / img.width, height / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CARD_W, height);
    ctx.clip();
    ctx.drawImage(img, (CARD_W - dw) / 2, (height - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, 0, CARD_W, height);
    g.addColorStop(0, '#1d3b47');
    g.addColorStop(1, C.ink);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, height);
    ctx.save();
    ctx.strokeStyle = 'rgba(198,255,0,0.07)';
    ctx.lineWidth = 2;
    for (let x = -height; x < CARD_W + height; x += 56) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();
    }
    if (input.logo) {
      ctx.globalAlpha = 0.1;
      const s = Math.min(520, height * 0.9);
      ctx.drawImage(input.logo, (CARD_W - s) / 2, (height - s) / 2, s, s);
    }
    ctx.restore();
  }
  const fade = ctx.createLinearGradient(0, height * 0.45, 0, height);
  fade.addColorStop(0, 'rgba(13,27,36,0)');
  fade.addColorStop(1, 'rgba(13,27,36,1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, height * 0.45, CARD_W, height * 0.55 + 1);
  const top = ctx.createLinearGradient(0, 0, 0, 200);
  top.addColorStop(0, 'rgba(0,0,0,0.55)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, CARD_W, 200);
}

function drawHeaderChips(ctx: CanvasRenderingContext2D, input: PhotoCardInput) {
  let x = PAD;
  if (input.logo) {
    ctx.save();
    roundRect(ctx, x, 52, 72, 72, 16);
    ctx.clip();
    ctx.drawImage(input.logo, x, 52, 72, 72);
    ctx.restore();
    x += 88;
  }
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.white;
  ctx.font = `700 38px ${FONT}`;
  ctx.fillText('সন্দেশ এক্সপ্রেস', x, 76);
  ctx.fillStyle = C.muted;
  ctx.font = `500 26px ${FONT}`;
  ctx.fillText(input.dateLine, x, 112);

  ctx.font = `700 28px ${FONT}`;
  const w = ctx.measureText(input.category).width + 40;
  ctx.fillStyle = C.lime;
  roundRect(ctx, CARD_W - PAD - w, 60, w, 52, 26);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.fillText(input.category, CARD_W - PAD - w + 20, 87);
  ctx.textBaseline = 'alphabetic';
}

function drawFooter(ctx: CanvasRenderingContext2D, input: PhotoCardInput) {
  const y = CARD_H - 86;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(PAD, y - 34, TEXT_W, 2);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = C.faint;
  ctx.font = `500 26px ${FONT}`;
  const src = wrap(ctx, input.sourceLine || '', TEXT_W - 300)[0] || '';
  ctx.fillText(src, PAD, y + 4);
  ctx.textAlign = 'right';
  ctx.fillStyle = C.lime;
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText('sondesh.web.app', CARD_W - PAD, y + 4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawFrame(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = C.lime;
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, CARD_W - 12, CARD_H - 12);
}

export function drawPhotoCard(ctx: CanvasRenderingContext2D, input: PhotoCardInput) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  if (input.layout === 'headline') {
    // Big headline card: photo fills most of the card, headline sits over the fade.
    drawPhotoArea(ctx, input, 900);
    drawHeaderChips(ctx, input);
    const { size, lines } = fit(ctx, input.headline, 700, 92, 60, 5);
    const lineH = size * 1.3;
    const bottom = CARD_H - 170;
    const top = bottom - lines.length * lineH;
    ctx.fillStyle = C.lime;
    ctx.fillRect(PAD, top - 30, 130, 10);
    ctx.fillStyle = C.white;
    ctx.font = `700 ${size}px ${FONT}`;
    lines.forEach((l, i) => ctx.fillText(l, PAD, top + size + i * lineH - size * 0.25));
  } else {
    // Story card: photo, headline, then up to three key points.
    drawPhotoArea(ctx, input, 560);
    drawHeaderChips(ctx, input);
    const head = fit(ctx, input.headline, 700, 66, 48, 3);
    const lineH = head.size * 1.3;
    let y = 470;
    ctx.fillStyle = C.lime;
    ctx.fillRect(PAD, y - 30, 120, 9);
    ctx.fillStyle = C.white;
    ctx.font = `700 ${head.size}px ${FONT}`;
    head.lines.forEach((l, i) => ctx.fillText(l, PAD, y + head.size + i * lineH - head.size * 0.2));
    y += head.lines.length * lineH + 40;

    const points = input.points.slice(0, 3);
    const room = CARD_H - 150 - y;
    const per = points.length ? room / points.length : room;
    const bn = '০১২৩৪৫৬৭৮৯';
    points.forEach((p, i) => {
      const pt = fit(ctx, p, 500, 40, 30, 3, TEXT_W - 80);
      const ph = pt.lines.length * pt.size * 1.45;
      const top = y + i * per + Math.max(0, (per - ph) / 2) - 10;
      ctx.fillStyle = C.lime;
      roundRect(ctx, PAD, top + 4, 50, 50, 25);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = `700 28px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(bn[i + 1], PAD + 25, top + 40);
      ctx.textAlign = 'left';
      ctx.fillStyle = C.muted;
      ctx.font = `500 ${pt.size}px ${FONT}`;
      pt.lines.forEach((l, j) => ctx.fillText(l, PAD + 76, top + pt.size + j * pt.size * 1.45));
    });
  }

  drawFooter(ctx, input);
  drawFrame(ctx);
}
