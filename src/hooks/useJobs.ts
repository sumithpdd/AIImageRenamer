import { useState, useCallback, useEffect, useRef } from 'react';

export interface JobTarget {
  name: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  data?: Record<string, any>;
}

export interface Job {
  id: string;
  projectId: string;
  projectName: string;
  type: 'scan' | 'analyze' | 'rename' | 'cleanup';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority: string;
  progress: number;
  totalItems: number;
  processedItems: number;
  successCount: number;
  errorCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  duration?: number;
  statusMessage: string;
  targets?: JobTarget[];
  errors?: string[];
  config?: Record<string, any>;
}

const ACTIVE_POLL_MS = 3000;
const BACKOFF_START_MS = 15_000;
const BACKOFF_MAX_MS = 5 * 60_000;

function isTerminalStatus(status: Job['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function useJobs(projectId?: string, options?: {
  onJobComplete?: (job: Job) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  /** Extra poll signal for jobs we started but may not yet see as running */
  const [watchingCount, setWatchingCount] = useState(0);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const prevJobsRef = useRef<Map<string, Job['status']>>(new Map());
  const watchedJobIdsRef = useRef<Set<string>>(new Set());
  const onJobCompleteRef = useRef(options?.onJobComplete);
  const selectedJobIdRef = useRef<string | null>(null);
  const backoffUntilRef = useRef(0);
  const backoffMsRef = useRef(BACKOFF_START_MS);
  const fetchInFlightRef = useRef(false);
  const fetchQueuedRef = useRef(false);
  const fetchJobsRef = useRef<() => Promise<void>>(async () => {});
  onJobCompleteRef.current = options?.onJobComplete;
  selectedJobIdRef.current = selectedJob?.id ?? null;

  const fetchJobs = useCallback(async () => {
    if (fetchInFlightRef.current) {
      fetchQueuedRef.current = true;
      return;
    }
    if (Date.now() < backoffUntilRef.current) {
      fetchQueuedRef.current = true;
      return;
    }

    fetchInFlightRef.current = true;
    fetchQueuedRef.current = false;
    try {
      const url = projectId 
        ? `/api/jobs?projectId=${projectId}&limit=50`
        : '/api/jobs?limit=50';
      const res = await fetch(url);

      if (res.status === 429) {
        backoffUntilRef.current = Date.now() + backoffMsRef.current;
        backoffMsRef.current = Math.min(backoffMsRef.current * 2, BACKOFF_MAX_MS);
        fetchQueuedRef.current = true;
        return;
      }

      const data = await res.json();

      if (data.quotaExceeded) {
        backoffUntilRef.current = Date.now() + backoffMsRef.current;
        backoffMsRef.current = Math.min(backoffMsRef.current * 2, BACKOFF_MAX_MS);
      } else {
        backoffMsRef.current = BACKOFF_START_MS;
      }

      const byId = new Map<string, Job>();
      for (const job of (data.jobs || []) as Job[]) {
        byId.set(job.id, job);
      }

      // Watched jobs: fetch by id so completion is seen even if list endpoint is stale
      const watchedIds = Array.from(watchedJobIdsRef.current);
      if (watchedIds.length > 0) {
        await Promise.all(
          watchedIds.map(async (id) => {
            const listed = byId.get(id);
            if (listed && isTerminalStatus(listed.status)) return;
            try {
              const jobRes = await fetch(`/api/jobs/${id}`);
              if (!jobRes.ok) return;
              const jobData = await jobRes.json();
              if (jobData.job) {
                byId.set(id, jobData.job as Job);
              }
            } catch {
              // keep listed snapshot if any
            }
          })
        );
      }

      if (data.jobs || watchedIds.length > 0) {
        const nextJobs = Array.from(byId.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setJobs(nextJobs);

        const completedNow: Job[] = [];
        for (const job of nextJobs) {
          const prevStatus = prevJobsRef.current.get(job.id);
          const watched = watchedJobIdsRef.current.has(job.id);
          if (isTerminalStatus(job.status) && (prevStatus === 'running' || prevStatus === 'pending' || watched)) {
            completedNow.push(job);
          }
        }

        // Preserve watched seeds for jobs not yet returned by the API
        const nextStatusMap = new Map<string, Job['status']>();
        for (const [id, status] of prevJobsRef.current) {
          if (watchedJobIdsRef.current.has(id) && !isTerminalStatus(status)) {
            nextStatusMap.set(id, status);
          }
        }
        for (const job of nextJobs) {
          nextStatusMap.set(job.id, job.status);
        }
        prevJobsRef.current = nextStatusMap;

        if (completedNow.length > 0) {
          let clearedWatch = false;
          for (const job of completedNow) {
            if (watchedJobIdsRef.current.delete(job.id)) {
              clearedWatch = true;
            }
            onJobCompleteRef.current?.(job);
          }
          if (clearedWatch) {
            setWatchingCount(watchedJobIdsRef.current.size);
          }
        }
        
        const selectedId = selectedJobIdRef.current;
        if (selectedId) {
          const updated = nextJobs.find((j: Job) => j.id === selectedId);
          if (updated) {
            setSelectedJob(updated);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
      backoffUntilRef.current = Date.now() + backoffMsRef.current;
      backoffMsRef.current = Math.min(backoffMsRef.current * 2, BACKOFF_MAX_MS);
      fetchQueuedRef.current = true;
    } finally {
      fetchInFlightRef.current = false;
      if (fetchQueuedRef.current) {
        fetchQueuedRef.current = false;
        // Trailing refetch so a job-started signal is never dropped
        queueMicrotask(() => {
          void fetchJobsRef.current();
        });
      }
    }
  }, [projectId]);

  fetchJobsRef.current = fetchJobs;

  /** Call when the UI starts a background job so completion always refreshes state */
  const watchJob = useCallback((jobId: string) => {
    if (!jobId) return;
    if (!watchedJobIdsRef.current.has(jobId)) {
      watchedJobIdsRef.current.add(jobId);
      setWatchingCount(watchedJobIdsRef.current.size);
    }
    // Seed pending so a completed-first sighting still counts as a transition
    if (!prevJobsRef.current.has(jobId)) {
      prevJobsRef.current.set(jobId, 'pending');
    }
    // Optimistic row so the running bar / polling engage immediately
    setJobs(prev => {
      if (prev.some(j => j.id === jobId)) return prev;
      const placeholder: Job = {
        id: jobId,
        projectId: '',
        projectName: '',
        type: 'scan',
        status: 'pending',
        priority: 'normal',
        progress: 0,
        totalItems: 0,
        processedItems: 0,
        successCount: 0,
        errorCount: 0,
        createdAt: new Date().toISOString(),
        statusMessage: 'Starting…'
      };
      return [placeholder, ...prev];
    });
    void fetchJobs();
  }, [fetchJobs]);

  const fetchJob = useCallback(async (jobId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = await res.json();
      if (data.job) {
        setSelectedJob(data.job);
      }
    } catch (err) {
      console.error('Failed to fetch job:', err);
    }
    setLoading(false);
  }, []);

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      fetchJobs();
    } catch (err) {
      console.error('Failed to cancel job:', err);
    }
  }, [fetchJobs]);

  const removeJob = useCallback(async (jobId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}?remove=true`, { method: 'DELETE' });
      if (selectedJobIdRef.current === jobId) {
        setSelectedJob(null);
      }
      fetchJobs();
    } catch (err) {
      console.error('Failed to remove job:', err);
    }
  }, [fetchJobs]);

  const openJobViewer = useCallback((job?: Job) => {
    if (job) {
      setSelectedJob(job);
    } else {
      setSelectedJob(prev => {
        if (prev) return prev;
        const running = jobs.find(j => j.status === 'running' || j.status === 'pending');
        if (running) return running;
        return jobs[0] || null;
      });
    }
    setIsOpen(true);
  }, [jobs]);

  const closeJobViewer = useCallback(() => {
    setIsOpen(false);
    setSelectedJob(null);
  }, []);

  const hasRunningJobs = jobs.some(j => j.status === 'running' || j.status === 'pending');
  const shouldPoll = hasRunningJobs || watchingCount > 0;

  // Poll while jobs are active or we are waiting on a job we started
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (!shouldPoll) return;

    pollingRef.current = setInterval(() => {
      fetchJobs();
    }, ACTIVE_POLL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [shouldPoll, fetchJobs]);
  
  // Refresh when viewer opens
  useEffect(() => {
    if (isOpen) {
      fetchJobs();
    }
  }, [isOpen, fetchJobs]);

  // Initial fetch once
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const runningJobs = jobs.filter(j => j.status === 'running' || j.status === 'pending');
  const projectRunningJobs = projectId
    ? runningJobs.filter(j => j.projectId === projectId)
    : runningJobs;
  const recentJobs = jobs.slice(0, 10);

  return {
    jobs,
    runningJobs,
    projectRunningJobs,
    recentJobs,
    selectedJob,
    loading,
    isOpen,
    hasRunningJobs,
    fetchJobs,
    watchJob,
    fetchJob,
    cancelJob,
    removeJob,
    openJobViewer,
    closeJobViewer,
    setSelectedJob
  };
}

// Helper functions
export function formatJobType(type: string): string {
  const types: Record<string, string> = {
    scan: 'Folder Scan',
    analyze: 'AI Analysis',
    rename: 'Batch Rename',
    cleanup: 'Pattern Cleanup'
  };
  return types[type] || type;
}

export function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export function getJobStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: '#f59e0b',
    running: '#3b82f6',
    completed: '#10b981',
    failed: '#ef4444',
    cancelled: '#6b7280'
  };
  return colors[status] || '#6b7280';
}

export function getJobTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    scan: '🔍',
    analyze: '🤖',
    rename: '✏️',
    cleanup: '🧹'
  };
  return icons[type] || '📋';
}
