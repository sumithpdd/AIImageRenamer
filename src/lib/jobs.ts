// Job Management System

export type JobType = 'scan' | 'analyze' | 'rename' | 'cleanup';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobTarget {
  name: string;
  status: JobStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  data?: Record<string, any>;
}

export interface Job {
  id: string;
  projectId: string;
  projectName: string;
  type: JobType;
  status: JobStatus;
  priority: 'low' | 'normal' | 'high';
  
  // Progress
  progress: number; // 0-100
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  
  // Timing
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number; // milliseconds
  
  // Details
  statusMessage: string;
  targets: JobTarget[];
  errors: string[];
  
  // Metadata
  createdBy?: string;
  config?: Record<string, any>;
}

// In-memory job storage
export const inMemoryJobs = new Map<string, Job>();

// Generate unique job ID
export function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `job_${timestamp}_${random}`;
}

// Create a new job
export function createJob(params: {
  projectId: string;
  projectName: string;
  type: JobType;
  totalItems: number;
  config?: Record<string, any>;
}): Job {
  const job: Job = {
    id: generateJobId(),
    projectId: params.projectId,
    projectName: params.projectName,
    type: params.type,
    status: 'pending',
    priority: 'normal',
    progress: 0,
    totalItems: params.totalItems,
    processedItems: 0,
    successCount: 0,
    errorCount: 0,
    createdAt: new Date().toISOString(),
    statusMessage: `Job created: ${params.type} ${params.totalItems} items`,
    targets: [],
    errors: [],
    config: params.config
  };
  
  inMemoryJobs.set(job.id, job);
  console.log(`📋 Job created: ${job.id} (${job.type})`);
  return job;
}

// Start a job
export function startJob(jobId: string): Job | null {
  const job = inMemoryJobs.get(jobId);
  if (!job) return null;
  
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  job.statusMessage = `Processing ${job.type}...`;
  
  console.log(`▶️ Job started: ${job.id}`);
  return job;
}

// Update job progress
export function updateJobProgress(jobId: string, update: {
  processedItems?: number;
  successCount?: number;
  errorCount?: number;
  statusMessage?: string;
  currentTarget?: {
    name: string;
    status: JobStatus;
    error?: string;
    data?: Record<string, any>;
  };
}): Job | null {
  const job = inMemoryJobs.get(jobId);
  if (!job) return null;
  
  if (update.processedItems !== undefined) {
    job.processedItems = update.processedItems;
    job.progress = Math.round((update.processedItems / job.totalItems) * 100);
  }
  if (update.successCount !== undefined) job.successCount = update.successCount;
  if (update.errorCount !== undefined) job.errorCount = update.errorCount;
  if (update.statusMessage) job.statusMessage = update.statusMessage;
  
  if (update.currentTarget) {
    const existingTarget = job.targets.find(t => t.name === update.currentTarget!.name);
    if (existingTarget) {
      Object.assign(existingTarget, update.currentTarget);
      if (update.currentTarget.status === 'completed' || update.currentTarget.status === 'failed') {
        existingTarget.completedAt = new Date().toISOString();
      }
    } else {
      job.targets.push({
        ...update.currentTarget,
        startedAt: new Date().toISOString()
      });
    }
    
    if (update.currentTarget.error) {
      job.errors.push(`${update.currentTarget.name}: ${update.currentTarget.error}`);
    }
  }
  
  return job;
}

// Complete a job
export function completeJob(jobId: string, params: {
  status: 'completed' | 'failed';
  statusMessage?: string;
}): Job | null {
  const job = inMemoryJobs.get(jobId);
  if (!job) return null;
  
  job.status = params.status;
  job.completedAt = new Date().toISOString();
  job.progress = 100;
  
  if (job.startedAt) {
    job.duration = new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
  }
  
  job.statusMessage = params.statusMessage || 
    (params.status === 'completed' 
      ? `Completed: ${job.successCount} succeeded, ${job.errorCount} failed`
      : `Failed: ${job.errorCount} errors`);
  
  console.log(`${params.status === 'completed' ? '✅' : '❌'} Job ${params.status}: ${job.id}`);
  return job;
}

// Get all jobs for a project
export function getProjectJobs(projectId: string): Job[] {
  const jobs: Job[] = [];
  for (const job of inMemoryJobs.values()) {
    if (job.projectId === projectId) {
      jobs.push(job);
    }
  }
  return jobs.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// Get all jobs
export function getAllJobs(): Job[] {
  return Array.from(inMemoryJobs.values()).sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// Get a single job
export function getJob(jobId: string): Job | null {
  return inMemoryJobs.get(jobId) || null;
}

// Format job type for display
export function formatJobType(type: JobType): string {
  const types: Record<JobType, string> = {
    scan: 'Folder Scan',
    analyze: 'AI Analysis',
    rename: 'Batch Rename',
    cleanup: 'Pattern Cleanup'
  };
  return types[type] || type;
}

// Format duration for display
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
