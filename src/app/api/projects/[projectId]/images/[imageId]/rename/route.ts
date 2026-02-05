import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { initFirebase, isStorageConfigured } from '@/lib/firebase';
import { sanitizeFileName } from '@/lib/helpers';
import { getProject, updateProjectStats } from '@/lib/services/project.service';
import { getImage, updateImage } from '@/lib/services/image.service';
import { renameImageInStorage } from '@/lib/services/storage.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; imageId: string } }
) {
  try {
    await initFirebase();
    const { projectId, imageId } = params;
    const { newName } = await request.json();
    
    if (!newName) {
      return NextResponse.json({ error: 'New name required' }, { status: 400 });
    }
    
    // Get project
    const projectResult = await getProject(projectId);
    if (!projectResult.success || !projectResult.project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    const projectName = projectResult.project.name;
    const useStorage = isStorageConfigured();

    // Get image data
    const imageResult = await getImage(projectId, imageId);
    if (!imageResult.success || !imageResult.image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    
    const imageData = imageResult.image;
    const oldPath = imageData.path;
    const oldName = imageData.currentName;
    const dir = path.dirname(oldPath);
    const ext = imageData.extension;
    
    // Sanitize and create new path
    const sanitizedName = sanitizeFileName(newName);
    let newPath = path.join(dir, sanitizedName + ext);
    
    // Find unique filename (handle existing files)
    let counter = 1;
    let finalName = sanitizedName;
    while (true) {
      try {
        await fs.access(newPath);
        finalName = `${sanitizedName}_${counter}`;
        newPath = path.join(dir, finalName + ext);
        counter++;
      } catch {
        break; // File doesn't exist, we can use this name
      }
    }
    
    const newFullName = finalName + ext;
    
    console.log(`📝 Renaming: ${oldName} → ${newFullName}`);

    // Rename local file
    await fs.rename(oldPath, newPath);
    
    // Rename in Firebase Storage if configured
    let storageUrl = imageData.storageUrl;
    let storagePath = imageData.storagePath;
    
    if (useStorage && imageData.storageUrl) {
      const storageResult = await renameImageInStorage(projectName, oldName, newFullName);
      if (storageResult.success && storageResult.url) {
        storageUrl = storageResult.url;
        storagePath = storageResult.storagePath;
        console.log(`  ☁️ Storage updated`);
      }
    }
    
    // Update database with timestamps
    const now = new Date().toISOString();
    const wasAlreadyRenamed = imageData.renamed;
    
    await updateImage(projectId, imageId, {
      currentName: newFullName,
      path: newPath,
      renamed: true,
      renamedAt: now,
      status: 'renamed',
      storageUrl,
      storagePath,
      metadata: {
        ...imageData.metadata
      }
    });
    
    // Update project stats (only if this is first rename)
    if (!wasAlreadyRenamed) {
      await updateProjectStats(projectId, { renamedCount: 1 });
    }

    console.log(`✅ Renamed successfully`);
    
    return NextResponse.json({ 
      success: true, 
      oldName,
      newName: newFullName,
      newPath,
      storageUrl,
      renamedAt: now
    });
  } catch (error: any) {
    console.error('❌ Rename error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
