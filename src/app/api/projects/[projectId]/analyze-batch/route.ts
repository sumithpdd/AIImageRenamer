import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { getGenAI, getDefaultModel } from '@/lib/gemini';
import { createJob, startJob, completeJob } from '@/lib/jobs';
import { getProject } from '@/lib/services/project.service';
import { getProjectImages as getProjectImagesService } from '@/lib/services/image.service';
import { runAnalyzeWorker } from '@/lib/workers/analyze.worker';

function isAsyncMode(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('async') !== 'false';
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  console.log('📸 Starting batch analysis...');

  let job = null;

  try {
    await initFirebase();
    const genAI = getGenAI();

    if (!genAI) {
      return NextResponse.json({
        error: 'Gemini API key not configured. Add GEMINI_API_KEY to .env.local'
      }, { status: 400 });
    }

    const { projectId } = params;
    let { imageIds } = await request.json();
    const asyncMode = isAsyncMode(request);

    const projectResult = await getProject(projectId);
    if (!projectResult.success || !projectResult.project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const projectName = projectResult.project.name;

    if (!imageIds || imageIds.length === 0) {
      const imagesResult = await getProjectImagesService(projectId);
      if (imagesResult.success && imagesResult.images) {
        imageIds = imagesResult.images
          .filter(img => img.status === 'scanned' || !img.suggestedName)
          .map(img => img.id);
      }
    }

    if (!imageIds || imageIds.length === 0) {
      return NextResponse.json({
        error: 'No images to analyze',
        results: [],
        analyzed: 0
      });
    }

    job = await createJob({
      projectId,
      projectName,
      type: 'analyze',
      totalItems: imageIds.length,
      config: { model: getDefaultModel(), async: asyncMode }
    });
    await startJob(job.id);

    const workerParams = { projectId, imageIds, jobId: job.id };

    if (asyncMode) {
      void runAnalyzeWorker(workerParams).catch(async (error: any) => {
        console.error('❌ Background analysis error:', error);
        await completeJob(job!.id, {
          status: 'failed',
          statusMessage: `Analysis failed: ${error.message}`
        });
      });

      return NextResponse.json(
        {
          accepted: true,
          jobId: job.id,
          status: 'running',
          totalItems: imageIds.length,
          message: `Analysis started for ${imageIds.length} images`
        },
        { status: 202 }
      );
    }

    const result = await runAnalyzeWorker(workerParams);

    return NextResponse.json({
      results: result.results,
      analyzed: result.analyzed,
      errors: result.errors,
      jobId: result.jobId,
      message:
        result.errors > 0
          ? `${result.errors} images failed to analyze`
          : 'All images analyzed successfully'
    });
  } catch (error: any) {
    console.error('❌ Batch analysis error:', error);

    if (job) {
      await completeJob(job.id, {
        status: 'failed',
        statusMessage: `Analysis failed: ${error.message}`
      });
    }

    return NextResponse.json(
      {
        error: error.message,
        results: [],
        analyzed: 0,
        jobId: job?.id
      },
      { status: 500 }
    );
  }
}
