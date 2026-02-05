import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { createJob, startJob, updateJobProgress, completeJob } from '@/lib/jobs';
import { getProject, updateProjectStats } from '@/lib/services/project.service';
import { getProjectImages, deleteImage, updateImage } from '@/lib/services/image.service';

// POST /api/projects/[projectId]/cleanup-duplicates
// Remove duplicate images (by hash), keeping a single copy in Firestore, disk, and Storage.
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  console.log('🧹 Starting duplicate cleanup...');

  let job = null;

  try {
    await initFirebase();
    const { projectId } = params;

    // Load project
    const projectResult = await getProject(projectId);
    if (!projectResult.success || !projectResult.project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const project = projectResult.project;
    const projectName = project.name;

    // Load all images
    const imagesResult = await getProjectImages(projectId);
    if (!imagesResult.success || !imagesResult.images || imagesResult.images.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'No images found for this project' 
      }, { status: 400 });
    }

    const images = imagesResult.images;

    // Group images by hash
    const groups = new Map<string, any[]>();
    for (const img of images) {
      const hash = img.hash;
      if (!hash) continue;
      if (!groups.has(hash)) {
        groups.set(hash, []);
      }
      groups.get(hash)!.push(img);
    }

    const duplicatesToDelete: any[] = [];
    const primaries: any[] = [];

    for (const [, group] of groups) {
      if (group.length <= 1) continue;

      // Sort by originalName so we keep the "first" deterministically
      group.sort((a, b) => a.originalName.localeCompare(b.originalName));
      const primary = group[0];
      const dups = group.slice(1);

      primaries.push(primary);
      duplicatesToDelete.push(...dups);
    }

    if (duplicatesToDelete.length === 0) {
      console.log('🧹 No duplicates found to clean up.');
      return NextResponse.json({
        success: true,
        message: 'No duplicates found',
        removed: 0,
        kept: images.length
      });
    }

    // Create job
    job = await createJob({
      projectId,
      projectName,
      type: 'cleanup',
      totalItems: duplicatesToDelete.length,
      config: { mode: 'duplicates' }
    });
    await startJob(job.id);

    console.log(`🧹 Removing ${duplicatesToDelete.length} duplicate images for project "${projectName}"`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < duplicatesToDelete.length; i++) {
      const img = duplicatesToDelete[i];

      await updateJobProgress(job.id, {
        processedItems: i,
        successCount,
        errorCount,
        statusMessage: `Removing duplicate ${i + 1}/${duplicatesToDelete.length}`,
        currentTarget: { name: img.id, status: 'running' }
      });

      try {
        const result = await deleteImage(
          projectId,
          img.id,
          projectName,
          true,  // deleteFromDisk
          true   // deleteFromCloudStorage
        );

        if (!result.success) {
          throw new Error(result.error || 'Unknown delete error');
        }

        successCount++;

        await updateJobProgress(job.id, {
          successCount,
          currentTarget: {
            name: img.id,
            status: 'completed',
            data: { originalName: img.originalName, currentName: img.currentName }
          }
        });

        console.log(`  🗑️ Removed duplicate: ${img.currentName}`);
      } catch (err: any) {
        errorCount++;
        console.error(`  ❌ Failed to remove duplicate ${img.currentName}:`, err.message);
        await updateJobProgress(job.id, {
          errorCount,
          currentTarget: {
            name: img.id,
            status: 'failed',
            error: err.message
          }
        });
      }
    }

    // Clear duplicate flags on primaries we kept
    const now = new Date().toISOString();
    for (const primary of primaries) {
      try {
        await updateImage(projectId, primary.id, {
          isDuplicate: false,
          duplicateOf: null,
          metadata: {
            ...primary.metadata,
            lastModified: now
          }
        });
      } catch (err: any) {
        console.warn(`  ⚠️ Failed to update primary image ${primary.id}:`, err.message);
      }
    }

    // Update project stats (image count minus removed duplicates)
    const removed = successCount;
    const remaining = images.length - removed;

    await updateProjectStats(projectId, { imageCount: remaining });

    console.log(`📊 Duplicate cleanup complete: ${removed} removed, ${errorCount} errors`);

    await completeJob(job.id, {
      status: errorCount > 0 ? 'failed' : 'completed',
      statusMessage: `Removed ${removed} duplicates, ${errorCount} failed`
    });

    return NextResponse.json({
      success: errorCount === 0,
      removed,
      errors: errorCount,
      kept: remaining,
      jobId: job.id
    });
  } catch (error: any) {
    console.error('❌ Duplicate cleanup error:', error);

    if (job) {
      await completeJob(job.id, {
        status: 'failed',
        statusMessage: `Duplicate cleanup failed: ${error.message}`
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

