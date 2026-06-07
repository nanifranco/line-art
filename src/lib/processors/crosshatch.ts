import sharp from 'sharp';
import { processHatching, extractPathsFromSvg } from './hatching';

interface CrosshatchOptions {
  lineSpacing?: number;
}

export async function processCrosshatch(imageBuffer: Buffer, options: CrosshatchOptions = {}): Promise<string> {
  const { lineSpacing = 8 } = options;

  const { info } = await sharp(imageBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;

  const svg1 = await processHatching(imageBuffer, { lineSpacing, angle: 45, threshold: 0.7 });
  const svg2 = await processHatching(imageBuffer, { lineSpacing, angle: 135, threshold: 0.7 });
  const svg3 = await processHatching(imageBuffer, { lineSpacing, angle: 90, threshold: 0.35 });

  const paths1 = extractPathsFromSvg(svg1);
  const paths2 = extractPathsFromSvg(svg2);
  const paths3 = extractPathsFromSvg(svg3);

  const allPaths = [...paths1, ...paths2, ...paths3];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <path d="${allPaths.join(' ')}" fill="none" stroke="black" stroke-width="0.8" stroke-linecap="round"/>
</svg>`;
}
