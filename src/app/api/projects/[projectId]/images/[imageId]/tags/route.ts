import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { updateImageTags } from '@/lib/services/tagging.service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; imageId: string } }
) {
  try {
    await initFirebase();
    const { projectId, imageId } = params;
    const body = await request.json();

    const add = Array.isArray(body.add) ? body.add.map(String) : undefined;
    const remove = Array.isArray(body.remove) ? body.remove.map(String) : undefined;
    const set = Array.isArray(body.set) ? body.set.map(String) : undefined;

    if (!add?.length && !remove?.length && !set) {
      return NextResponse.json(
        { error: 'Provide add, remove, and/or set tag arrays' },
        { status: 400 }
      );
    }

    const result = await updateImageTags(projectId, imageId, { add, remove, set });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      tags: result.tags,
      tagIds: result.tagIds
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
