// Headless reel renderer used by the automatic posting job (pipeline/social/post_reel.py).
// Served at /__reel: instead of the app, it exposes window.renderReel(), which draws a
// story with the same engine as the Card Studio and returns the video as base64.
import { renderAndExportReelVideo } from './services/reelVideoEngine';
import { loadSafeCanvasImage } from './services/imageLoader';

export interface ReelRequest {
  headline: string;
  keyPoints: string[];
  sourceName: string;
  categoryName: string;
  imageUrl?: string | null;
  lang?: 'bn' | 'en';
  durationSeconds?: number;
}

function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/Sondesh_logo.png';
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function installReelRenderHost() {
  document.title = 'reel renderer';
  (window as any).renderReel = async (req: ReelRequest) => {
    await document.fonts.ready;
    const [logo, image] = await Promise.all([
      loadLogo(),
      req.imageUrl ? loadSafeCanvasImage(req.imageUrl).then((r) => (r.status === 'preview_only' ? null : r.image)) : Promise.resolve(null),
    ]);
    const result = await renderAndExportReelVideo({
      aspectRatio: '9:16',
      durationSeconds: req.durationSeconds ?? 13,
      fps: 30,
      includeAudio: true,
      lang: req.lang ?? 'bn',
      tone: 'critical',
      fontFamily: 'Hind Siliguri',
      isJustified: false,
      headline: req.headline,
      keyPoints: req.keyPoints.slice(0, 3),
      sourceName: req.sourceName,
      categoryName: req.categoryName,
      imageElement: image,
      imageBrightness: 105,
      logoElement: logo,
      headlineSize: 62,
      bulletSize: 34,
    });
    return { base64: await blobToBase64(result.blob), mimeType: result.mimeType };
  };
  (window as any).reelHostReady = true;
}
