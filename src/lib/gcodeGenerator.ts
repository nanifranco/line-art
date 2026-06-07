interface GcodeOptions {
  widthMm?: number;
  heightMm?: number;
  feedRate?: number;
  travelRate?: number;
  penUpCmd?: string;
  penDownCmd?: string;
}

interface Point { x: number; y: number }

function getViewBox(svg: string): { x: number; y: number; w: number; h: number } {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (m) {
    const [x, y, w, h] = m[1].split(/[\s,]+/).map(Number);
    return { x, y, w, h };
  }
  const wm = svg.match(/width="(\d+)"/);
  const hm = svg.match(/height="(\d+)"/);
  return { x: 0, y: 0, w: wm ? +wm[1] : 500, h: hm ? +hm[1] : 500 };
}

function tokenizePath(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?[\d.]+(?:e[-+]?\d+)?)/gi;
  let m;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push(m[1]);
    else tokens.push(parseFloat(m[2]));
  }
  return tokens;
}

function cubicBezier(p0: Point, p1: Point, p2: Point, p3: Point, steps = 20): Point[] {
  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    pts.push({
      x: mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x,
      y: mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y,
    });
  }
  return pts;
}

function parseSvgPaths(svg: string): Point[][] {
  const polylines: Point[][] = [];
  const pathRe = /\sd="([^"]+)"/g;
  let pm;
  while ((pm = pathRe.exec(svg)) !== null) {
    const tokens = tokenizePath(pm[1]);
    let i = 0;
    let cur: Point = { x: 0, y: 0 };
    let startPt: Point = { x: 0, y: 0 };
    let currentPolyline: Point[] | null = null;

    const getNum = () => typeof tokens[i] === 'number' ? tokens[i++] as number : 0;

    while (i < tokens.length) {
      const cmd = tokens[i];
      if (typeof cmd !== 'string') { i++; continue; }
      i++;

      switch (cmd) {
        case 'M': {
          if (currentPolyline && currentPolyline.length > 1) polylines.push(currentPolyline);
          cur = { x: getNum(), y: getNum() };
          startPt = { ...cur };
          currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            cur = { x: getNum(), y: getNum() };
            currentPolyline.push({ ...cur });
          }
          break;
        }
        case 'm': {
          if (currentPolyline && currentPolyline.length > 1) polylines.push(currentPolyline);
          cur = { x: cur.x + getNum(), y: cur.y + getNum() };
          startPt = { ...cur };
          currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            cur = { x: cur.x + getNum(), y: cur.y + getNum() };
            currentPolyline.push({ ...cur });
          }
          break;
        }
        case 'L': {
          if (!currentPolyline) currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            cur = { x: getNum(), y: getNum() };
            currentPolyline.push({ ...cur });
          }
          break;
        }
        case 'l': {
          if (!currentPolyline) currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            cur = { x: cur.x + getNum(), y: cur.y + getNum() };
            currentPolyline.push({ ...cur });
          }
          break;
        }
        case 'H': {
          if (!currentPolyline) currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            cur = { x: getNum(), y: cur.y };
            currentPolyline.push({ ...cur });
          }
          break;
        }
        case 'h': {
          if (!currentPolyline) currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            cur = { x: cur.x + getNum(), y: cur.y };
            currentPolyline.push({ ...cur });
          }
          break;
        }
        case 'V': {
          if (!currentPolyline) currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            cur = { x: cur.x, y: getNum() };
            currentPolyline.push({ ...cur });
          }
          break;
        }
        case 'v': {
          if (!currentPolyline) currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            cur = { x: cur.x, y: cur.y + getNum() };
            currentPolyline.push({ ...cur });
          }
          break;
        }
        case 'C': {
          if (!currentPolyline) currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            const p1 = { x: getNum(), y: getNum() };
            const p2 = { x: getNum(), y: getNum() };
            const p3 = { x: getNum(), y: getNum() };
            cubicBezier(cur, p1, p2, p3).forEach(p => currentPolyline!.push(p));
            cur = { ...p3 };
          }
          break;
        }
        case 'c': {
          if (!currentPolyline) currentPolyline = [{ ...cur }];
          while (i < tokens.length && typeof tokens[i] === 'number') {
            const p1 = { x: cur.x + getNum(), y: cur.y + getNum() };
            const p2 = { x: cur.x + getNum(), y: cur.y + getNum() };
            const p3 = { x: cur.x + getNum(), y: cur.y + getNum() };
            cubicBezier(cur, p1, p2, p3).forEach(p => currentPolyline!.push(p));
            cur = { ...p3 };
          }
          break;
        }
        case 'Z':
        case 'z': {
          if (currentPolyline) {
            currentPolyline.push({ ...startPt });
            polylines.push(currentPolyline);
            currentPolyline = null;
          }
          cur = { ...startPt };
          break;
        }
        default: {
          while (i < tokens.length && typeof tokens[i] === 'number') i++;
        }
      }
    }
    if (currentPolyline && currentPolyline.length > 1) polylines.push(currentPolyline);
  }
  return polylines;
}

export function svgToGcode(svgString: string, options: GcodeOptions = {}): string {
  const {
    widthMm = 200,
    heightMm = 200,
    feedRate = 3000,
    travelRate = 6000,
    penUpCmd = 'M3 S0',
    penDownCmd = 'M3 S30',
  } = options;

  const vb = getViewBox(svgString);
  const scaleX = widthMm / vb.w;
  const scaleY = heightMm / vb.h;

  const toMm = (p: Point) => ({
    x: ((p.x - vb.x) * scaleX).toFixed(3),
    y: ((p.y - vb.y) * scaleY).toFixed(3),
  });

  const polylines = parseSvgPaths(svgString);

  const lines: string[] = [
    '; Generated by Line Art Plotter',
    `; Styles SVG -> ${widthMm}x${heightMm}mm`,
    'G21 ; units: mm',
    'G90 ; absolute positioning',
    `${penUpCmd}`,
    'G4 P300',
    `G0 X0 Y0 F${travelRate}`,
  ];

  for (const poly of polylines) {
    if (poly.length < 2) continue;
    const start = toMm(poly[0]);
    lines.push(`G0 X${start.x} Y${start.y} F${travelRate}`);
    lines.push(`${penDownCmd}`);
    lines.push('G4 P200');
    for (const pt of poly.slice(1)) {
      const mm = toMm(pt);
      lines.push(`G1 X${mm.x} Y${mm.y} F${feedRate}`);
    }
    lines.push(`${penUpCmd}`);
    lines.push('G4 P200');
  }

  lines.push(`G0 X0 Y0 F${travelRate}`);
  lines.push('M5');
  lines.push('; END');

  return lines.join('\n');
}
