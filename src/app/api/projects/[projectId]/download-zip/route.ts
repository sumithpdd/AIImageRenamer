import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import { initFirebase } from '@/lib/firebase';
import { getProject } from '@/lib/services/project.service';
import { getProjectImages } from '@/lib/services/image.service';

// GET /api/projects/[projectId]/download-zip
// Streams a ZIP file containing all images for a project.
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    await initFirebase();
    const { projectId } = params;

    // Get project (for friendly filename)
    const projectResult = await getProject(projectId);
    if (!projectResult.success || !projectResult.project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = projectResult.project;
    const projectName = project.name || `project_${projectId}`;

    // Load all images
    const imagesResult = await getProjectImages(projectId);
    if (!imagesResult.success || !imagesResult.images || imagesResult.images.length === 0) {
      return NextResponse.json(
        { error: 'No images found for this project' },
        { status: 400 }
      );
    }

    const images = imagesResult.images;

    // Build ZIP in memory
    const zip = new JSZip();

    for (const img of images) {
      const filePath = img.path as string;
      const filename = img.currentName || path.basename(filePath);

      try {
        const buffer = await fs.readFile(filePath);
        zip.file(filename, buffer);
      } catch (err: any) {
        console.warn(`⚠️ Skipping missing file for ZIP: ${filePath} (${err.message})`);
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const safeName = projectName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 50);

    const headers = new Headers();
    headers.set('Content-Type', 'application/zip');
    headers.set(
      'Content-Disposition',
      `attachment; filename="${safeName || 'images'}.zip"`
    );

    return new NextResponse(zipBuffer, {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error('Download ZIP error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

