import { NextRequest, NextResponse } from 'next/server';
import { getAllJobs, getProjectJobs } from '@/lib/jobs';

// GET /api/jobs - List all jobs or jobs for a specific project
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '200');
    
    let jobs = projectId ? await getProjectJobs(projectId) : await getAllJobs();
    
    // Filter by status if provided
    if (status) {
      jobs = jobs.filter(j => j.status === status);
    }
    
    // Filter by type if provided
    if (type) {
      jobs = jobs.filter(j => j.type === type);
    }
    
    // Limit results
    jobs = jobs.slice(0, limit);
    
    // Ensure all jobs have targets and errors arrays
    jobs = jobs.map(job => ({
      ...job,
      targets: job.targets || [],
      errors: job.errors || []
    }));
    
    // Calculate summary stats
    const summary = {
      total: jobs.length,
      pending: jobs.filter(j => j.status === 'pending').length,
      running: jobs.filter(j => j.status === 'running').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length
    };
    
    return NextResponse.json({ jobs, summary });
  } catch (error: any) {
    console.error('Error listing jobs:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
