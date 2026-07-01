import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { createJob, startJob, completeJob } from '@/lib/jobs';
import { getProject } from '@/lib/services/project.service';
import { getProjectImages } from '@/lib/services/image.service';
import { runRenameWorker } from '@/lib/workers/rename.worker';

function isAsyncMode(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('async') !== 'false';
}

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
    const asyncMode = isAsyncMode(request);

    const projectResult = await getProject(projectId);
    if (!projectResult.success || !projectResult.project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const projectName = projectResult.project.name;

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

    job = await createJob({
      projectId,
      projectName,
      type: 'rename',
      totalItems: targetIds.length,
      config: { useAiSuggestion, usePatternClean, async: asyncMode }
    });
    await startJob(job.id);

    const workerParams = {
      projectId,
      projectName,
      targetIds,
      useAiSuggestion,
      usePatternClean,
      jobId: job.id
    };

    if (asyncMode) {
      void runRenameWorker(workerParams).catch(async (error: any) => {
        console.error('❌ Background rename error:', error);
        await completeJob(job!.id, {
          status: 'failed',
          statusMessage: `Rename failed: ${error.message}`
        });
      });

      return NextResponse.json(
        {
          accepted: true,
          jobId: job.id,
          status: 'running',
          totalItems: targetIds.length,
          message: `Rename started for ${targetIds.length} images`
        },
        { status: 202 }
      );
    }

    const result = await runRenameWorker(workerParams);

    return NextResponse.json({
      results: result.results,
      renamed: result.renamed,
      errors: result.errors,
      jobId: result.jobId
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
