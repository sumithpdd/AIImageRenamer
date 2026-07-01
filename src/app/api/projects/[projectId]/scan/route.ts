import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import { createJob, startJob, completeJob } from '@/lib/jobs';
import { getProject } from '@/lib/services/project.service';
import { runScanWorker } from '@/lib/workers/scan.worker';

function isAsyncMode(request: NextRequest): boolean {
  return request.nextUrl.searchParams.get('async') !== 'false';
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  console.log('🔍 Starting folder scan...');

  let job = null;

  try {
    await initFirebase();
    const { projectId } = params;
    const scanMode = request.nextUrl.searchParams.get('mode') === 'rescan' ? 'rescan' : 'scan';

    const projectResult = await getProject(projectId);
    if (!projectResult.success || !projectResult.project) {
      return NextResponse.json({ error: projectResult.error || 'Project not found' }, { status: 404 });
    }

    const project = projectResult.project;
    const asyncMode = isAsyncMode(request);

    job = await createJob({
      projectId,
      projectName: project.name,
      type: 'scan',
      totalItems: 0,
      config: { mode: scanMode, async: asyncMode }
    });
    await startJob(job.id);

    const workerParams = {
      projectId,
      projectName: project.name,
      folderPath: project.folderPath,
      scanMode: scanMode as 'scan' | 'rescan',
      jobId: job.id
    };

    if (asyncMode) {
      void runScanWorker(workerParams).catch(async (error: any) => {
        console.error('❌ Background scan error:', error);
        await completeJob(job!.id, {
          status: 'failed',
          statusMessage: `Scan failed: ${error.message}`
        });
      });

      return NextResponse.json(
        {
          accepted: true,
          jobId: job.id,
          status: 'running',
          mode: scanMode,
          message: `Scan started in background (${scanMode})`
        },
        { status: 202 }
      );
    }

    const result = await runScanWorker(workerParams);
    return NextResponse.json({
      success: result.success,
      jobId: result.jobId,
      mode: result.mode,
      imageCount: result.imageCount,
      duplicateCount: result.duplicateCount,
      uploadedCount: result.uploadedCount,
      skippedCount: result.skippedCount,
      images: result.images,
      newCount: result.newCount
    });
  } catch (error: any) {
    console.error('❌ Scan error:', error);

    if (job) {
      await completeJob(job.id, {
        status: 'failed',
        statusMessage: `Scan failed: ${error.message}`
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
