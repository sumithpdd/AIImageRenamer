import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { initFirebase, isStorageConfigured } from '@/lib/firebase';
import { createJob, startJob, updateJobProgress, completeJob } from '@/lib/jobs';
import { getProject, updateProjectStats } from '@/lib/services/project.service';
import { getImage, updateImage, getProjectImages } from '@/lib/services/image.service';
import { renameImageInStorage } from '@/lib/services/storage.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  console.log('📝 Starting batch rename...');
  
  let job = null;
  
  try {
    await initFirebase();
    const { projectId } = params;
    const { imageIds, useAiSuggestion, usePatternClean } = await request.json();
    
    // Get project
    const projectResult = await getProject(projectId);
    if (!projectResult.success || !projectResult.project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    const projectName = projectResult.project.name;
    const useStorage = isStorageConfigured();
    
    // If no IDs provided, get all eligible images
    let targetIds = imageIds;
    if (!targetIds || targetIds.length === 0) {
      const imagesResult = await getProjectImages(projectId);
      if (imagesResult.success && imagesResult.images) {
        targetIds = imagesResult.images
          .filter(img => !img.renamed && (
            (useAiSuggestion && img.suggestedName) ||
            (usePatternClean && img.patternCleanName)
          ))
          .map(img => img.id);
      }
    }
    
    if (!targetIds || targetIds.length === 0) {
      return NextResponse.json({ 
        error: 'No images to rename', 
        results: [], 
        renamed: 0 
      });
    }
    
    // Create job
    job = await createJob({
      projectId,
      projectName,
      type: 'rename',
      totalItems: targetIds.length,
      config: { useAiSuggestion, usePatternClean, useStorage }
    });
    await startJob(job.id);
    
    const results: Array<{
      imageId: string;
      oldName?: string;
      newName?: string;
      success: boolean;
      error?: string;
    }> = [];
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < targetIds.length; i++) {
      const imageId = targetIds[i];
      
      await updateJobProgress(job.id, {
        processedItems: i,
        successCount,
        errorCount,
        statusMessage: `Renaming image ${i + 1}/${targetIds.length}`,
        currentTarget: { name: imageId, status: 'running' }
      });
      
      try {
        // Get image data
        const imageResult = await getImage(projectId, imageId);
        if (!imageResult.success || !imageResult.image) {
          results.push({ imageId, success: false, error: 'Image not found' });
          errorCount++;
          continue;
        }
        
        const imageData = imageResult.image;
        
        // Determine new name
        let newName: string | null = null;
        if (useAiSuggestion && imageData.suggestedName) {
          newName = imageData.suggestedName;
        } else if (usePatternClean && imageData.patternCleanName) {
          newName = imageData.patternCleanName;
        }
        
        if (!newName) {
        results.push({ imageId, success: false, error: 'No suggested name available' });
        errorCount++;
        continue;
        }
        
        const oldPath = imageData.path;
        const oldName = imageData.currentName;
        const dir = path.dirname(oldPath);
        const ext = imageData.extension;
        
        // Find unique filename
        let newPath = path.join(dir, newName + ext);
        let finalName = newName;
        let counter = 1;
        
        while (true) {
          try {
            await fs.access(newPath);
            finalName = `${newName}_${counter}`;
            newPath = path.join(dir, finalName + ext);
            counter++;
          } catch {
            break; // File doesn't exist, we can use this name
          }
        }
        
        const newFullName = finalName + ext;
        
        console.log(`  📝 [${i + 1}/${targetIds.length}] ${oldName} → ${newFullName}`);
        
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
          }
        }
        
        // Update database with timestamps
        const now = new Date().toISOString();
        await updateImage(projectId, imageId, {
          currentName: newFullName,
          path: newPath,
          renamed: true,
          renamedAt: now,
          status: 'renamed',
          storageUrl,
          storagePath,
          metadata: {
            ...imageData.metadata,
            lastModified: now
          }
        });
        
        results.push({ 
          imageId, 
          oldName, 
          newName: newFullName, 
          success: true 
        });
        successCount++;
        
        await updateJobProgress(job.id, {
          successCount,
          currentTarget: { 
            name: imageId, 
            status: 'completed',
            data: { oldName, newName: newFullName }
          }
        });
        
      } catch (err: any) {
        console.error(`  ❌ Error: ${err.message}`);
        results.push({ imageId, success: false, error: err.message });
        errorCount++;
        
        await updateJobProgress(job.id, {
          errorCount,
          currentTarget: { name: imageId, status: 'failed', error: err.message }
        });
      }
    }
    
    // Update project stats
    if (successCount > 0) {
      await updateProjectStats(projectId, { renamedCount: successCount });
    }
    
    console.log(`📊 Rename complete: ${successCount} renamed, ${errorCount} errors`);
    
    // Complete the job
    await completeJob(job.id, {
      status: errorCount === targetIds.length ? 'failed' : 'completed',
      statusMessage: `Renamed ${successCount} files, ${errorCount} failed`
    });

    return NextResponse.json({ 
      results, 
      renamed: successCount,
      errors: errorCount,
      jobId: job.id
    });
    
  } catch (error: any) {
    console.error('❌ Batch rename error:', error);
    
    if (job) {
      await completeJob(job.id, {
        status: 'failed',
        statusMessage: `Rename failed: ${error.message}`
      });
    }
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
