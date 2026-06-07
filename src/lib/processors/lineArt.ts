import sharp from 'sharp';
import potrace from 'potrace';

interface LineArtOptions {
  threshold?: number;
  blur?: number;
}

function gaussianBlur(data: Uint8Array, width: number, height: number, sigma: number): Uint8Array {
  const k = Math.max(3, Math.ceil(sigma * 3) * 2 + 1);
  const half = Math.floor(k / 2);
  const kernel = new Float32Array(k * k);
  let sum = 0;
  for (let ky = 0; ky < k; ky++) {
    for (let kx = 0; kx < k; kx++) {
      const dx = kx - half, dy = ky - half;
      const val = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      kernel[ky * k + kx] = val;
      sum += val;
    }
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let val = 0;
      for (let ky = 0; ky < k; ky++) {
        for (let kx = 0; kx < k; kx++) {
          const sx = Math.min(Math.max(x + kx - half, 0), width - 1);
          const sy = Math.min(Math.max(y + ky - half, 0), height - 1);
          val += data[sy * width + sx] * kernel[ky * k + kx];
        }
      }
      result[y * width + x] = Math.round(val);
    }
  }
  return result;
}

function sobelEdges(data: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = (dx: number, dy: number) => data[(y + dy) * width + (x + dx)];
      const gx = -p(-1,-1) - 2*p(-1,0) - p(-1,1) + p(1,-1) + 2*p(1,0) + p(1,1);
      const gy = -p(-1,-1) - 2*p(0,-1) - p(1,-1) + p(-1,1) + 2*p(0,1) + p(1,1);
      result[y * width + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }
  return result;
}

export async function processLineArt(imageBuffer: Buffer, options: LineArtOptions = {}): Promise<string> {
  const { threshold = 40, blur = 1.5 } = options;

  const { data, info } = await sharp(imageBuffer)
    .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const blurred = gaussianBlur(new Uint8Array(data), width, height, blur);
  const edges = sobelEdges(blurred, width, height);

  const binary = Buffer.alloc(width * height);
  for (let i = 0; i < edges.length; i++) {
    binary[i] = edges[i] > threshold ? 0 : 255;
  }

  const pngBuffer = await sharp(binary, { raw: { width, height, channels: 1 } }).png().toBuffer();

  return new Promise<string>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (potrace as any).trace(pngBuffer, { turdSize: 2, optCurve: true, color: '#000000', background: 'transparent' }, (err: Error | null, svg: string) => {
      if (err) reject(err);
      else resolve(svg);
    });
  });
}
