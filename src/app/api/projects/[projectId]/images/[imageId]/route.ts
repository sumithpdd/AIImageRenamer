import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { getImage, deleteImage } from '@/lib/services/image.service';
import { getProject } from '@/lib/services/project.service';

// GET single image
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; imageId: string } }
) {
  try {
    await initFirebase();
    const { projectId, imageId } = params;
    
    const result = await getImage(projectId, imageId);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result.image);
  } catch (error: any) {
    console.error('Get image error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE image (optionally from disk and cloud storage)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string; imageId: string } }
) {
  try {
    await initFirebase();
    const { projectId, imageId } = params;
    const searchParams = request.nextUrl.searchParams;
    
    // Parse options
    const deleteFromDisk = searchParams.get('deleteFile') === 'true';
    const deleteFromCloud = searchParams.get('deleteFromCloud') !== 'false'; // default true
    
    // Get project name for storage path
    const projectResult = await getProject(projectId);
    const projectName = projectResult.project?.name || 'unknown';
    
    const result = await deleteImage(
      projectId, 
      imageId, 
      projectName,
      deleteFromDisk,
      deleteFromCloud
    );
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log(`🗑️ Image deleted: ${imageId}`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete image error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
