import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { getProject, deleteProject } from '@/lib/services/project.service';

// GET single project
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    await initFirebase();
    const { projectId } = params;
    
    const result = await getProject(projectId);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    return NextResponse.json(result.project);
  } catch (error: any) {
    console.error('Get project error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE project (also deletes images from Firestore and Storage)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    await initFirebase();
    const { projectId } = params;
    
    // Get query param to control storage deletion
    const deleteStorage = request.nextUrl.searchParams.get('deleteStorage') !== 'false';
    
    const result = await deleteProject(projectId, deleteStorage);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log(`🗑️ Project deleted: ${projectId}`);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete project error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
