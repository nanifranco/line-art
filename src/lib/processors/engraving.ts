import { toGrayscale, gaussianBlur } from './imageUtils';

interface EngravingOptions {
  minSpacing?: number;
  maxSpacing?: number;
  outlineWidth?: number;
}

function separableBlur(data: Uint8Array, width: number, height: number, sigma: number): Uint8Array {
  const k = Math.max(3, Math.ceil(sigma * 2.5) * 2 + 1);
  const half = Math.floor(k / 2);
  const kernel = new Float32Array(k);
  let kSum = 0;
  for (let i = 0; i < k; i++) { const v = Math.exp(-((i - half) ** 2) / (2 * sigma * sigma)); kernel[i] = v; kSum += v; }
  for (let i = 0; i < k; i++) kernel[i] /= kSum;
  const tmp = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let val = 0;
      for (let i = 0; i < k; i++) val += data[y * width + Math.max(0, Math.min(width - 1, x + i - half))] * kernel[i];
      tmp[y * width + x] = Math.round(val);
    }
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let val = 0;
      for (let i = 0; i < k; i++) val += tmp[Math.max(0, Math.min(height - 1, y + i - half)) * width + x] * kernel[i];
      out[y * width + x] = Math.round(val);
    }
  return out;
}

function borderBrightness(gray: Uint8Array, width: number, height: number): number {
  const m = Math.max(3, Math.floor(Math.min(width, height) * 0.07));
  let sum = 0, count = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (x < m || x >= width - m || y < m || y >= height - m) { sum += gray[y * width + x]; count++; }
  return sum / count;
}

function buildSubjectMask(gray: Uint8Array, width: number, height: number): Uint8Array {
  const bgVal = borderBrightness(gray, width, height);
  const raw = new Uint8Array(width * height);
  for (let i = 0; i < raw.length; i++)
    raw[i] = Math.min(255, Math.abs(gray[i] - bgVal) * 5.0);
  return separableBlur(raw, width, height, 4);
}

// Moore-neighborhood contour tracing — produces ordered SVG path strings
function traceContours(mask: Uint8Array, width: number, height: number, threshold: number): string[] {
  const visited = new Uint8Array(width * height);
  const paths: string[] = [];

  // 8-directional neighbors in clockwise order starting from right
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1,  1,  0, -1,-1,-1];

  for (let sy = 1; sy < height - 1; sy++) {
    for (let sx = 1; sx < width - 1; sx++) {
      if (mask[sy * width + sx] < threshold || visited[sy * width + sx]) continue;

      // Follow the contour
      const xs: number[] = [], ys: number[] = [];
      let x = sx, y = sy, dir = 0;

      for (let step = 0; step < 8000; step++) {
        if (visited[y * width + x]) break;
        visited[y * width + x] = 1;
        xs.push(x); ys.push(y);

        // Look for next edge pixel starting from (dir + 5) mod 8 (backtrack side)
        let found = false;
        for (let i = 0; i < 8; i++) {
          const nd = (dir + 5 + i) & 7;
          const nx = x + dx[nd], ny = y + dy[nd];
          if (nx < 1 || nx >= width - 1 || ny < 1 || ny >= height - 1) continue;
          if (mask[ny * width + nx] >= threshold && !visited[ny * width + nx]) {
            x = nx; y = ny; dir = nd; found = true; break;
          }
        }
        if (!found) break;
      }

      if (xs.length < 4) continue;
      let d = `M${xs[0]},${ys[0]}`;
      for (let i = 1; i < xs.length; i++) d += ` L${xs[i]},${ys[i]}`;
      paths.push(d);
    }
  }
  return paths;
}

export function processEngraving(imageData: ImageData, options: EngravingOptions = {}): string {
  const { minSpacing = 2, maxSpacing = 18 } = options;
  const { width, height } = imageData;

  const gray     = toGrayscale(imageData);
  const smoothed = gaussianBlur(gray, width, height, 1.4);
  const subject  = buildSubjectMask(gray, width, height);

  // ── OUTLINE ────────────────────────────────────────────────────────────────
  // Erode the mask slightly so the contour sits just inside the subject edge
  const erodedMask = separableBlur(subject, width, height, 1.5);
  const outlinePaths = traceContours(erodedMask, width, height, 90);

  // ── HORIZONTAL HATCHING ────────────────────────────────────────────────────
  // Lines spaced by brightness: dark → dense (minSpacing), bright → sparse (maxSpacing)
  // Each row y is potentially drawn for pixels whose "target spacing" divides y
  const hatchSegs: string[] = [];
  const range = maxSpacing - minSpacing;

  for (let y = 1; y < height - 1; y++) {
    let segStart = -1;

    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (subject[idx] < 60) {
        if (segStart !== -1 && x - segStart > 1) {
          hatchSegs.push(`M${segStart},${y} H${x - 1}`);
        }
        segStart = -1;
        continue;
      }

      const bright = smoothed[idx] / 255;
      // Spacing this pixel "wants" — exponential curve so highlights look clean
      const spacing = minSpacing + Math.round(range * Math.pow(bright, 0.65));
      const draw = (spacing <= 1) || (y % spacing === 0);

      if (draw) {
        if (segStart === -1) segStart = x;
      } else {
        if (segStart !== -1 && x - segStart > 1) {
          hatchSegs.push(`M${segStart},${y} H${x - 1}`);
        }
        segStart = -1;
      }
    }
    if (segStart !== -1 && width - 2 - segStart > 1) {
      hatchSegs.push(`M${segStart},${y} H${width - 2}`);
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  <path d="${hatchSegs.join(' ')}"   fill="none" stroke="black" stroke-width="0.5" stroke-linecap="square" stroke-linejoin="round"/>
  <path d="${outlinePaths.join(' ')}" fill="none" stroke="black" stroke-width="1.2" stroke-linecap="round"  stroke-linejoin="round"/>
</svg>`;
}
