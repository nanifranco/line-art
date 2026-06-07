import sharp from 'sharp';

interface StipplingOptions {
  numPoints?: number;
  maxRadius?: number;
  minRadius?: number;
}

export async function processStippling(imageBuffer: Buffer, options: StipplingOptions = {}): Promise<string> {
  const { numPoints = 15000, maxRadius = 3, minRadius = 0.3 } = options;

  const { data, info } = await sharp(imageBuffer)
    .resize(700, 700, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const circles: string[] = [];

  let attempts = 0;
  const maxAttempts = numPoints * 30;
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

  while (circles.length < numPoints && attempts < maxAttempts) {
    attempts++;
    const x = rand() * width;
    const y = rand() * height;
    const px = Math.min(Math.floor(x), width - 1);
    const py = Math.min(Math.floor(y), height - 1);
    const brightness = data[py * width + px] / 255;

    if (rand() > brightness) {
      const darkness = 1 - brightness;
      const r = minRadius + darkness * (maxRadius - minRadius);
      circles.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}"/>`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <g fill="black">${circles.join('')}</g>
</svg>`;
}
