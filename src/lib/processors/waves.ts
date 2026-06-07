import sharp from 'sharp';

interface WavesOptions {
  rowSpacing?: number;
  maxAmplitude?: number;
}

export async function processWaves(imageBuffer: Buffer, options: WavesOptions = {}): Promise<string> {
  const { rowSpacing = 10, maxAmplitude = 10 } = options;

  const { data, info } = await sharp(imageBuffer)
    .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const paths: string[] = [];

  for (let baseY = rowSpacing; baseY < height; baseY += rowSpacing) {
    let d = '';
    for (let x = 0; x < width; x++) {
      const brightness = data[Math.floor(baseY) * width + Math.min(x, width - 1)] / 255;
      const waveY = baseY + maxAmplitude * (1 - brightness) * Math.sin((2 * Math.PI * x) / 20);
      d += x === 0 ? `M${x},${waveY.toFixed(2)}` : ` L${x},${waveY.toFixed(2)}`;
    }
    paths.push(d);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <g fill="none" stroke="black" stroke-width="0.8">
    ${paths.map(p => `<path d="${p}"/>`).join('\n    ')}
  </g>
</svg>`;
}
