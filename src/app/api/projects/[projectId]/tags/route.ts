import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { batchUpdateImageTags } from '@/lib/services/tagging.service';
import { getProjectImages } from '@/lib/services/image.service';

/** Collect distinct tags used by images in this project */
export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    await initFirebase();
    const { projectId } = params;
    const result = await getProjectImages(projectId);
    if (!result.success || !result.images) {
      return NextResponse.json({ error: result.error || 'Failed to load images' }, { status: 500 });
    }

    const counts = new Map<string, number>();
    for (const img of result.images) {
      for (const tag of img.metadata?.tags || []) {
        const key = tag.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    const tags = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return NextResponse.json({ tags });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Batch add/remove tags on many images */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    await initFirebase();
    const { projectId } = params;
    const body = await request.json();
    const imageIds = Array.isArray(body.imageIds) ? body.imageIds.map(String) : [];
    const add = Array.isArray(body.add) ? body.add.map(String) : undefined;
    const remove = Array.isArray(body.remove) ? body.remove.map(String) : undefined;

    if (imageIds.length === 0) {
      return NextResponse.json({ error: 'imageIds required' }, { status: 400 });
    }
    if (!add?.length && !remove?.length) {
      return NextResponse.json({ error: 'Provide add and/or remove tag arrays' }, { status: 400 });
    }

    const result = await batchUpdateImageTags(projectId, imageIds, { add, remove });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
