import sharp from 'sharp';

interface HatchingOptions {
  lineSpacing?: number;
  angle?: number;
  threshold?: number;
}

export async function processHatching(imageBuffer: Buffer, options: HatchingOptions = {}): Promise<string> {
  const { lineSpacing = 8, angle = 45, threshold = 0.7 } = options;

  const { data, info } = await sharp(imageBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pathParts: string[] = [];

  const angleRad = (angle * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const diag = Math.sqrt(width * width + height * height);

  for (let d = -diag; d < diag; d += lineSpacing) {
    const cx = width / 2 + d * cos;
    const cy = height / 2 + d * sin;

    let inSeg = false;
    let segPts: string[] = [];

    for (let t = -diag; t <= diag; t += 1.5) {
      const x = cx - sin * t;
      const y = cy + cos * t;
      if (x < 0 || x >= width || y < 0 || y >= height) {
        if (inSeg && segPts.length > 1) {
          pathParts.push(`M${segPts[0]} L${segPts.slice(1).join(' L')}`);
        }
        inSeg = false; segPts = [];
        continue;
      }
      const brightness = data[Math.floor(y) * width + Math.floor(x)] / 255;
      if (brightness < threshold) {
        inSeg = true;
        segPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      } else {
        if (inSeg && segPts.length > 1) pathParts.push(`M${segPts[0]} L${segPts.slice(1).join(' L')}`);
        inSeg = false; segPts = [];
      }
    }
    if (inSeg && segPts.length > 1) pathParts.push(`M${segPts[0]} L${segPts.slice(1).join(' L')}`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <path d="${pathParts.join(' ')}" fill="none" stroke="black" stroke-width="0.8" stroke-linecap="round"/>
</svg>`;
}

export function extractPathsFromSvg(svg: string): string[] {
  const paths: string[] = [];
  const pathRe = /\sd="([^"]+)"/g;
  let m;
  while ((m = pathRe.exec(svg)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}
