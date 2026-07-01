'use client';

import { Job, formatJobType, getJobStatusColor, getJobTypeIcon } from '@/hooks/useJobs';

interface RunningJobsBarProps {
  jobs: Job[];
  onViewJobs: () => void;
  onSelectJob?: (job: Job) => void;
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
        {jobs.map(job => (
          <button
            key={job.id}
            type="button"
            className="running-job-card"
            onClick={() => onSelectJob?.(job)}
          >
            <span className="running-job-icon">{getJobTypeIcon(job.type)}</span>
            <div className="running-job-info">
              <div className="running-job-name">{formatJobType(job.type)}</div>
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
            </div>
            <span
              className="running-job-status"
              style={{ backgroundColor: getJobStatusColor(job.status) }}
            >
              {job.progress}%
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
