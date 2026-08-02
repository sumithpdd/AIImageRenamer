'use client';

import { Job, formatJobType, getJobStatusColor, getJobTypeIcon } from '@/hooks/useJobs';

interface RunningJobsBarProps {
  jobs: Job[];
  onViewJobs: () => void;
  onSelectJob?: (job: Job) => void;
}

function getActiveTargets(job: Job, limit = 4): string[] {
  const running = (job.targets || [])
    .filter(t => t.status === 'running')
    .map(t => t.name);
  if (running.length > 0) return running.slice(0, limit);
  // Fall back to most recent targets still in flight for display
  return (job.targets || [])
    .filter(t => t.status === 'pending' || t.status === 'running')
    .slice(-limit)
    .map(t => t.name);
}

export function RunningJobsBar({ jobs, onViewJobs, onSelectJob }: RunningJobsBarProps) {
  if (jobs.length === 0) return null;

  return (
    <div className="running-jobs-bar">
      <div className="running-jobs-header">
        <span className="running-jobs-title">
          <span className="running-jobs-pulse" />
          {jobs.length} job{jobs.length !== 1 ? 's' : ''} running
        </span>
        <button className="btn-ghost btn-sm" onClick={onViewJobs}>
          View all jobs
        </button>
      </div>
      <div className="running-jobs-list">
        {jobs.map(job => {
          const activeTargets = getActiveTargets(job);
          return (
            <button
              key={job.id}
              type="button"
              className="running-job-card"
              onClick={() => onSelectJob?.(job)}
            >
              <span className="running-job-icon">{getJobTypeIcon(job.type)}</span>
              <div className="running-job-info">
                <div className="running-job-name">
                  {formatJobType(job.type)}
                  <span className="running-job-project"> · {job.projectName}</span>
                </div>
                <div className="running-job-message">{job.statusMessage}</div>
                <div className="running-job-progress-track">
                  <div
                    className="running-job-progress-fill"
                    style={{
                      width: `${Math.max(job.progress, job.totalItems > 0 ? 1 : 0)}%`,
                      backgroundColor: getJobStatusColor(job.status)
                    }}
                  />
                </div>
                <div className="running-job-stats">
                  {job.processedItems}/{job.totalItems || '…'} · {job.successCount} ok
                  {job.errorCount > 0 ? ` · ${job.errorCount} failed` : ''}
                </div>
                {activeTargets.length > 0 && (
                  <div className="running-job-targets">
                    <span className="running-job-targets-label">Active:</span>
                    {activeTargets.map(name => (
                      <span key={name} className="running-job-target" title={name}>
                        {name.length > 36 ? `…${name.slice(-35)}` : name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <span
                className="running-job-status"
                style={{ backgroundColor: getJobStatusColor(job.status) }}
              >
                {job.progress}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
