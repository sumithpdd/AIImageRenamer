import { NextRequest, NextResponse } from 'next/server';
import { getJob, inMemoryJobs } from '@/lib/jobs';
import { getDb } from '@/lib/firebase';

// GET /api/jobs/[jobId] - Get single job details
export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    const job = await getJob(jobId);
    
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Ensure targets and errors arrays exist
    const normalizedJob = {
      ...job,
      targets: job.targets || [],
      errors: job.errors || []
    };
    
    return NextResponse.json({ job: normalizedJob });
  } catch (error: any) {
    console.error('Error getting job:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/jobs/[jobId] - Cancel/delete a job
export async function DELETE(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    const job = await getJob(jobId);
    
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    
    // Can only cancel pending or running jobs
    if (job.status === 'pending' || job.status === 'running') {
      job.status = 'cancelled';
      job.completedAt = new Date().toISOString();
      job.statusMessage = 'Job cancelled by user';

      const db = getDb();
      if (db) {
        await db.collection('jobs').doc(jobId).update({
          status: job.status,
          completedAt: job.completedAt,
          statusMessage: job.statusMessage
        });
      }
    }
    
    // For completed/failed jobs, remove from history
    const searchParams = request.nextUrl.searchParams;
    const removeFromHistory = searchParams.get('remove') === 'true';
    
    if (removeFromHistory) {
      const db = getDb();
      if (db) {
        await db.collection('jobs').doc(jobId).delete();
      }
      inMemoryJobs.delete(jobId);
      return NextResponse.json({ success: true, message: 'Job removed from history' });
    }
    
    return NextResponse.json({ success: true, job });
  } catch (error: any) {
    console.error('Error deleting job:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
