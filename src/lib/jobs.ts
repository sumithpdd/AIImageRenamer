// Job Management System

import { getDb } from '@/lib/firebase';
import { prepareForFirestore } from '@/lib/utils/firestore.utils';
import {
  isQuotaError,
  isFirestoreQuotaCoolingDown,
  markFirestoreQuotaExceeded
} from '@/lib/utils/firestore-quota';

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

export const DEFAULT_JOB_LIST_LIMIT = 50;
const PROGRESS_FLUSH_MS = 2500;

// Persist across Next.js route compiles / HMR so workers and GET /api/jobs share one Map
type JobsGlobal = {
  __aiImageRenamerJobs?: Map<string, Job>;
  __aiImageRenamerJobProgressFlush?: Map<string, number>;
};
const jobsGlobal = globalThis as typeof globalThis & JobsGlobal;

// In-memory job storage (source of truth while workers run)
export const inMemoryJobs: Map<string, Job> =
  jobsGlobal.__aiImageRenamerJobs ?? new Map<string, Job>();
jobsGlobal.__aiImageRenamerJobs = inMemoryJobs;

// Throttle Firestore progress writes per job
const lastProgressFlushAt: Map<string, number> =
  jobsGlobal.__aiImageRenamerJobProgressFlush ?? new Map<string, number>();
jobsGlobal.__aiImageRenamerJobProgressFlush = lastProgressFlushAt;

function sortJobsNewestFirst(jobs: Job[]): Job[] {
  return jobs.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function getMemoryJobs(limit = DEFAULT_JOB_LIST_LIMIT): Job[] {
  return sortJobsNewestFirst(Array.from(inMemoryJobs.values())).slice(0, limit);
}

function getMemoryProjectJobs(projectId: string, limit = DEFAULT_JOB_LIST_LIMIT): Job[] {
  return sortJobsNewestFirst(
    Array.from(inMemoryJobs.values()).filter(j => j.projectId === projectId)
  ).slice(0, limit);
}

function noteFirestoreError(error: unknown, context: string): void {
  if (isQuotaError(error)) {
    markFirestoreQuotaExceeded(error);
    return;
  }
  console.error(`❌ ${context}:`, (error as any)?.message || error);
}

async function writeJobDoc(jobId: string, data: Record<string, any>, force = false): Promise<void> {
  if (!force && isFirestoreQuotaCoolingDown()) return;
  const db = getDb();
  if (!db) return;
  try {
    // merge:true so completion still persists if the initial create never landed
    await db.collection('jobs').doc(jobId).set(prepareForFirestore(data), { merge: true });
  } catch (e: any) {
    noteFirestoreError(e, 'Failed to update job in Firestore');
  }
}

// Generate unique job ID
export function generateJobId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `job_${timestamp}_${random}`;
}

// Create a new job
export async function createJob(params: {
  projectId: string;
  projectName: string;
  type: JobType;
  totalItems: number;
  config?: Record<string, any>;
}): Promise<Job> {
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
    config: params.config || {}
  };
  
  inMemoryJobs.set(job.id, job);
  console.log(`📋 Job created: ${job.id} (${job.type})`);

  if (!isFirestoreQuotaCoolingDown()) {
    const db = getDb();
    if (db) {
      try {
        await db.collection('jobs').doc(job.id).set(prepareForFirestore(job));
      } catch (e: any) {
        noteFirestoreError(e, 'Failed to persist job to Firestore');
      }
    }
  }

  return job;
}

// Start a job
export async function startJob(jobId: string): Promise<Job | null> {
  const job = inMemoryJobs.get(jobId);
  if (!job) return null;
  
  job.status = 'running';
  job.startedAt = new Date().toISOString();
  job.statusMessage = `Processing ${job.type}...`;
  
  await writeJobDoc(jobId, {
    status: job.status,
    startedAt: job.startedAt,
    statusMessage: job.statusMessage
  });

  console.log(`▶️ Job started: ${job.id}`);
  return job;
}

// Update total items (e.g. after scan discovers file count)
export async function setJobTotalItems(jobId: string, totalItems: number): Promise<Job | null> {
  const job = inMemoryJobs.get(jobId);
  if (!job) return null;

  job.totalItems = totalItems;
  job.statusMessage = `Processing ${totalItems} items...`;

  await writeJobDoc(jobId, {
    totalItems: job.totalItems,
    statusMessage: job.statusMessage
  });

  return job;
}

function buildProgressPayload(job: Job) {
  return {
    progress: job.progress,
    processedItems: job.processedItems,
    successCount: job.successCount,
    errorCount: job.errorCount,
    statusMessage: job.statusMessage,
    // Cap targets written to Firestore to avoid huge docs + write cost
    targets: job.targets.slice(-100),
    errors: job.errors.slice(-50)
  };
}

// Update job progress (in-memory always; Firestore throttled)
export async function updateJobProgress(jobId: string, update: {
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
  flush?: boolean;
}): Promise<Job | null> {
  const job = inMemoryJobs.get(jobId);
  if (!job) return null;
  
  if (update.processedItems !== undefined) {
    job.processedItems = update.processedItems;
    job.progress = job.totalItems > 0
      ? Math.round((update.processedItems / job.totalItems) * 100)
      : 0;
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

  const now = Date.now();
  const lastFlush = lastProgressFlushAt.get(jobId) || 0;
  const shouldFlush = update.flush || now - lastFlush >= PROGRESS_FLUSH_MS;

  if (shouldFlush) {
    lastProgressFlushAt.set(jobId, now);
    await writeJobDoc(jobId, buildProgressPayload(job));
  }
  
  return job;
}

// Complete a job
export async function completeJob(jobId: string, params: {
  status: 'completed' | 'failed';
  statusMessage?: string;
}): Promise<Job | null> {
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

  lastProgressFlushAt.delete(jobId);

  // Persist full job so list/detail endpoints see completion even if create never wrote
  await writeJobDoc(jobId, {
    ...job,
    targets: job.targets.slice(-100),
    errors: job.errors.slice(-50)
  }, true);
  
  console.log(`${params.status === 'completed' ? '✅' : '❌'} Job ${params.status}: ${job.id}`);
  return job;
}

// Get all jobs for a project
export async function getProjectJobs(
  projectId: string,
  limit = DEFAULT_JOB_LIST_LIMIT
): Promise<Job[]> {
  // Prefer live in-memory jobs while anything is running (avoids stale Firestore + quota burn)
  const memory = getMemoryProjectJobs(projectId, limit);
  const hasActive = memory.some(j => j.status === 'running' || j.status === 'pending');
  if (hasActive || isFirestoreQuotaCoolingDown()) {
    return memory;
  }

  const db = getDb();
  if (db) {
    try {
      const snap = await db
        .collection('jobs')
        .where('projectId', '==', projectId)
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      const jobs: Job[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Job));

      for (const job of jobs) {
        // Don't overwrite a newer in-memory running job with older Firestore snapshot
        const existing = inMemoryJobs.get(job.id);
        if (existing && (existing.status === 'running' || existing.status === 'pending')) {
          continue;
        }
        inMemoryJobs.set(job.id, job);
      }

      return getMemoryProjectJobs(projectId, limit);
    } catch (e: any) {
      noteFirestoreError(e, 'Failed to load jobs from Firestore');
    }
  }

  return memory;
}

// Get all jobs
export async function getAllJobs(limit = DEFAULT_JOB_LIST_LIMIT): Promise<Job[]> {
  const memory = getMemoryJobs(limit);
  const hasActive = memory.some(j => j.status === 'running' || j.status === 'pending');
  if (hasActive || isFirestoreQuotaCoolingDown()) {
    return memory;
  }

  const db = getDb();
  if (db) {
    try {
      const snap = await db
        .collection('jobs')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      const jobs: Job[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as Job));

      for (const job of jobs) {
        const existing = inMemoryJobs.get(job.id);
        if (existing && (existing.status === 'running' || existing.status === 'pending')) {
          continue;
        }
        inMemoryJobs.set(job.id, job);
      }

      return getMemoryJobs(limit);
    } catch (e: any) {
      noteFirestoreError(e, 'Failed to load all jobs from Firestore');
    }
  }

  return memory;
}

// Check if a job was cancelled (reads in-memory first for speed during workers)
export function isJobCancelled(jobId: string): boolean {
  const job = inMemoryJobs.get(jobId);
  return job?.status === 'cancelled';
}

export async function isJobCancelledAsync(jobId: string): Promise<boolean> {
  if (isJobCancelled(jobId)) return true;
  const job = await getJob(jobId);
  return job?.status === 'cancelled';
}

export function shouldStopJob(jobId: string): boolean {
  return isJobCancelled(jobId);
}

// Get a single job
export async function getJob(jobId: string): Promise<Job | null> {
  const cached = inMemoryJobs.get(jobId);
  if (cached && (cached.status === 'running' || cached.status === 'pending' || isFirestoreQuotaCoolingDown())) {
    return cached;
  }

  const db = getDb();
  if (db && !isFirestoreQuotaCoolingDown()) {
    try {
      const doc = await db.collection('jobs').doc(jobId).get();
      if (doc.exists) {
        const job = { id: doc.id, ...doc.data() } as Job;
        const existing = inMemoryJobs.get(job.id);
        if (existing && (existing.status === 'running' || existing.status === 'pending')) {
          return existing;
        }
        inMemoryJobs.set(job.id, job);
        return job;
      }
    } catch (e: any) {
      noteFirestoreError(e, 'Failed to get job from Firestore');
    }
  }

  return cached || null;
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
