import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { getProjectImages } from '@/lib/services/image.service';

// GET all images for a project
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    await initFirebase();
    const { projectId } = params;
    
    const result = await getProjectImages(projectId);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log(`📋 Returning ${result.images?.length || 0} images for project ${projectId}`);
    return NextResponse.json({ images: result.images });
  } catch (error: any) {
    console.error('Get images error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
