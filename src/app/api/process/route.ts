import { NextRequest, NextResponse } from 'next/server';
import { processLineArt } from '@/lib/processors/lineArt';
import { processStippling } from '@/lib/processors/stippling';
import { processHatching } from '@/lib/processors/hatching';
import { processCrosshatch } from '@/lib/processors/crosshatch';
import { processSpiral } from '@/lib/processors/spiral';
import { processWaves } from '@/lib/processors/waves';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const style = formData.get('style') as string;
    const optionsStr = formData.get('options') as string;

    if (!file) return NextResponse.json({ error: 'No image' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const options = optionsStr ? JSON.parse(optionsStr) : {};

    let svg: string;
    switch (style) {
      case 'lineArt': svg = await processLineArt(buffer, options); break;
      case 'stippling': svg = await processStippling(buffer, options); break;
      case 'hatching': svg = await processHatching(buffer, options); break;
      case 'crosshatch': svg = await processCrosshatch(buffer, options); break;
      case 'spiral': svg = await processSpiral(buffer, options); break;
      case 'waves': svg = await processWaves(buffer, options); break;
      default: return NextResponse.json({ error: 'Unknown style' }, { status: 400 });
    }

    return new NextResponse(svg, {
      headers: { 'Content-Type': 'image/svg+xml' },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
