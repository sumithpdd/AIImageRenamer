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

export function useJobs(projectId?: string, options?: {
  onJobComplete?: (job: Job) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const prevJobsRef = useRef<Map<string, Job['status']>>(new Map());
  const onJobCompleteRef = useRef(options?.onJobComplete);
  onJobCompleteRef.current = options?.onJobComplete;

  const fetchJobs = useCallback(async () => {
    try {
      const url = projectId 
        ? `/api/jobs?projectId=${projectId}`
        : '/api/jobs';
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.jobs) {
        const nextJobs: Job[] = data.jobs;
        setJobs(nextJobs);

        // Fire completion callbacks when jobs transition to terminal states
        if (onJobCompleteRef.current) {
          for (const job of nextJobs) {
            const prevStatus = prevJobsRef.current.get(job.id);
            const isTerminal = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';
            const wasRunning = prevStatus === 'running' || prevStatus === 'pending';
            if (wasRunning && isTerminal) {
              onJobCompleteRef.current(job);
            }
          }
        }

        const nextStatusMap = new Map<string, Job['status']>();
        for (const job of nextJobs) {
          nextStatusMap.set(job.id, job.status);
        }
        prevJobsRef.current = nextStatusMap;
        
        // Update selected job if it exists
        if (selectedJob) {
          const updated = data.jobs.find((j: Job) => j.id === selectedJob.id);
          if (updated) {
            setSelectedJob(updated);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  }, [projectId, selectedJob]);

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
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }
      fetchJobs();
    } catch (err) {
      console.error('Failed to remove job:', err);
    }
  }, [fetchJobs, selectedJob]);

  const openJobViewer = useCallback((job?: Job) => {
    if (job) {
      setSelectedJob(job);
    } else {
      // When opening without a specific job, prefer a running job,
      // otherwise fall back to the most recent job.
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

  // Poll for job updates when there are running jobs (even if viewer is closed)
  useEffect(() => {
    const hasRunningJobs = jobs.some(j => j.status === 'running' || j.status === 'pending');
    
    if (hasRunningJobs || selectedJob?.status === 'running' || selectedJob?.status === 'pending') {
      // Poll more frequently when jobs are running
      pollingRef.current = setInterval(() => {
        fetchJobs();
      }, 2000);
      
      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
      };
    } else {
      // Poll less frequently when no running jobs
      pollingRef.current = setInterval(() => {
        fetchJobs();
      }, 10000); // Every 10 seconds
      
      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
        }
      };
    }
  }, [jobs, selectedJob?.status, fetchJobs]);
  
  // Initial fetch when viewer opens
  useEffect(() => {
    if (isOpen) {
      fetchJobs();
    }
  }, [isOpen, fetchJobs]);

  // Fetch jobs on mount (always, not just for specific project)
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const hasRunningJobs = jobs.some(j => j.status === 'running' || j.status === 'pending');
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
    pending: '#f59e0b',    // amber
    running: '#3b82f6',    // blue
    completed: '#10b981',  // green
    failed: '#ef4444',     // red
    cancelled: '#6b7280'   // gray
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
