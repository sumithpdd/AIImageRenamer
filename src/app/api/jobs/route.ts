import { NextRequest, NextResponse } from 'next/server';
import { getAllJobs, getProjectJobs, DEFAULT_JOB_LIST_LIMIT } from '@/lib/jobs';
import { isFirestoreQuotaCoolingDown } from '@/lib/utils/firestore-quota';

// GET /api/jobs - List all jobs or jobs for a specific project
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const limit = Math.min(
      Math.max(parseInt(searchParams.get('limit') || String(DEFAULT_JOB_LIST_LIMIT), 10) || DEFAULT_JOB_LIST_LIMIT, 1),
      100
    );
    
    let jobs = projectId
      ? await getProjectJobs(projectId, limit)
      : await getAllJobs(limit);
    
    if (status) {
      jobs = jobs.filter(j => j.status === status);
    }
    
    if (type) {
      jobs = jobs.filter(j => j.type === type);
    }
    
    jobs = jobs.slice(0, limit);
    
    jobs = jobs.map(job => ({
      ...job,
      targets: job.targets || [],
      errors: job.errors || []
    }));
    
    const summary = {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      running: jobs.filter(j => j.status === 'running').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length
    };
    
    return NextResponse.json({
      jobs,
      summary,
      quotaExceeded: isFirestoreQuotaCoolingDown()
    });
  } catch (error: any) {
    console.error('Error listing jobs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
