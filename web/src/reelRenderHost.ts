// Headless reel renderer used by the automatic posting job (pipeline/social/post_reel.py).
// Served at /__reel: instead of the app, it exposes
//   window.renderReel(req)       records the reel and returns the video as base64
//   window.previewReelFrame(req, t)  draws one frame on screen (for checking the layout)
import { drawAutoReelFrame, renderAutoReel, ReelSegment } from './services/reelAutoEngine';
import { loadSafeCanvasImage } from './services/imageLoader';
import { CARD_H, CARD_W, drawPhotoCard, PhotoCardLayout } from './services/photoCardEngine';

export interface ReelRequest {
  headline: string;
  points: string[];
  sourceLine: string;
  category: string;
  dateLine: string;
  imageUrl?: string | null;
  segments: ReelSegment[];
  duration: number;
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/icon-512.png';
  });
}

async function loadAssets(req: ReelRequest) {
  // Fonts load lazily, so request the weights the reel uses before drawing.
  await Promise.all(
    ['500', '600', '700'].map((w) => document.fonts.load(`${w} 48px "Hind Siliguri"`, 'বাংলা খবর')),
  ).catch(() => undefined);
  const [logo, image] = await Promise.all([
    loadLogo(),
    req.imageUrl
      ? loadSafeCanvasImage(req.imageUrl).then((r) => (r.status === 'preview_only' ? null : r.image)).catch(() => null)
      : Promise.resolve(null),
  ]);
  return { logo, image };
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function installReelRenderHost() {
  document.title = 'reel renderer';
  document.body.style.margin = '0';
  document.body.style.background = '#111';

  (window as any).renderReel = async (req: ReelRequest) => {
    const { logo, image } = await loadAssets(req);
    const result = await renderAutoReel({ ...req, logo, image });
    return { base64: await blobToBase64(result.blob), mimeType: result.mimeType };
  };

  // Photo card as a PNG (base64) for the automatic photo posts.
  (window as any).renderPhotoCard = async (req: ReelRequest & { layout: PhotoCardLayout }) => {
    const { logo, image } = await loadAssets(req);
    const canvas = document.createElement('canvas');
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    drawPhotoCard(canvas.getContext('2d')!, {
      layout: req.layout,
      headline: req.headline,
      points: req.points,
      category: req.category,
      dateLine: req.dateLine,
      sourceLine: req.sourceLine,
      image,
      logo,
    });
    return canvas.toDataURL('image/png').split(',')[1];
  };

  (window as any).previewReelFrame = async (req: ReelRequest, t: number) => {
    const { logo, image } = await loadAssets(req);
    let canvas = document.getElementById('reel-preview') as HTMLCanvasElement | null;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'reel-preview';
      canvas.width = 1080;
      canvas.height = 1920;
      canvas.style.height = '100vh';
      document.body.appendChild(canvas);
    }
    drawAutoReelFrame(canvas.getContext('2d')!, { ...req, logo, image }, t);
    return true;
  };

  (window as any).reelHostReady = true;
}
