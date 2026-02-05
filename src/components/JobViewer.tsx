'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { 
  Job, 
  formatJobType, 
  formatDuration, 
  getJobStatusColor,
  getJobTypeIcon 
} from '@/hooks/useJobs';

interface JobViewerProps {
  jobs: Job[];
  selectedJob: Job | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectJob: (job: Job) => void;
  onCancelJob: (jobId: string) => void;
  onRemoveJob: (jobId: string) => void;
}

export function JobViewer({
  jobs,
  selectedJob,
  isOpen,
  onClose,
  onSelectJob,
  onCancelJob,
  onRemoveJob
}: JobViewerProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="job-viewer-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="job-viewer-container"
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="job-viewer-header">
            <h2>📋 Job Queue</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          
          <div className="job-viewer-content">
            {/* Job List */}
            <div className="job-list">
              <div className="job-list-header">
                <span>Recent Jobs</span>
                <span className="job-count">{jobs.length}</span>
              </div>
              
              {jobs.length === 0 ? (
                <div className="no-jobs">
                  <p>No jobs yet</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Jobs will appear here when you scan, analyze, or rename images
                  </p>
                </div>
              ) : (
                <div className="job-list-items">
                  {jobs.map(job => {
                    const isRunning = job.status === 'running' || job.status === 'pending';
                    return (
                      <div
                        key={job.id}
                        className={`job-list-item ${selectedJob?.id === job.id ? 'selected' : ''} ${isRunning ? 'running' : ''}`}
                        onClick={() => onSelectJob(job)}
                      >
                        <div className="job-item-icon">{getJobTypeIcon(job.type)}</div>
                        <div className="job-item-info">
                          <div className="job-item-title">
                            {formatJobType(job.type)}
                            {isRunning && <span style={{ marginLeft: '8px', fontSize: '0.7rem', opacity: 0.7 }}>⟳</span>}
                          </div>
                          <div className="job-item-project">{job.projectName}</div>
                          {isRunning && (
                            <div className="job-item-progress" style={{ fontSize: '0.7rem', marginTop: '4px', color: 'var(--text-muted)' }}>
                              {job.processedItems}/{job.totalItems} ({job.progress}%)
                            </div>
                          )}
                        </div>
                        <div className="job-item-status">
                          <span 
                            className="status-badge"
                            style={{ backgroundColor: getJobStatusColor(job.status) }}
                          >
                            {job.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            {/* Job Details */}
            <div className="job-details">
              {selectedJob ? (
                <JobDetails 
                  job={selectedJob} 
                  onCancel={() => onCancelJob(selectedJob.id)}
                  onRemove={() => onRemoveJob(selectedJob.id)}
                />
              ) : (
                <div className="no-job-selected">
                  <p>Select a job to view details</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

interface JobDetailsProps {
  job: Job;
  onCancel: () => void;
  onRemove: () => void;
}

function JobDetails({ job, onCancel, onRemove }: JobDetailsProps) {
  const isRunning = job.status === 'running' || job.status === 'pending';
  const targets = job.targets || [];
  const errors = job.errors || [];
  
  return (
    <div className="job-detail-panel">
      <div className="job-detail-header">
        <h3>{getJobTypeIcon(job.type)} {formatJobType(job.type)}</h3>
        <span 
          className="status-badge large"
          style={{ backgroundColor: getJobStatusColor(job.status) }}
        >
          {job.status}
        </span>
      </div>
      
      {/* Progress Bar */}
      {isRunning && (
        <div className="job-progress-section">
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <div className="progress-text">
            {job.processedItems} / {job.totalItems} items ({job.progress}%)
          </div>
        </div>
      )}
      
      {/* Info Grid */}
      <div className="job-info-grid">
        <div className="info-section">
          <h4>General</h4>
          <div className="info-row">
            <span className="info-label">Job ID</span>
            <span className="info-value mono">{job.id}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Project</span>
            <span className="info-value">{job.projectName}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Type</span>
            <span className="info-value">{formatJobType(job.type)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Status</span>
            <span className="info-value">{job.statusMessage}</span>
          </div>
        </div>
        
        <div className="info-section">
          <h4>Timing</h4>
          <div className="info-row">
            <span className="info-label">Created</span>
            <span className="info-value">{formatDateTime(job.createdAt)}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Started</span>
            <span className="info-value">{job.startedAt ? formatDateTime(job.startedAt) : '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Completed</span>
            <span className="info-value">{job.completedAt ? formatDateTime(job.completedAt) : '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Duration</span>
            <span className="info-value">{formatDuration(job.duration)}</span>
          </div>
        </div>
        
        <div className="info-section">
          <h4>Results</h4>
          <div className="info-row">
            <span className="info-label">Total Items</span>
            <span className="info-value">{job.totalItems}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Processed</span>
            <span className="info-value">{job.processedItems}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Succeeded</span>
            <span className="info-value success">{job.successCount}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Failed</span>
            <span className="info-value error">{job.errorCount}</span>
          </div>
        </div>
      </div>
      
      {/* Targets List */}
      {targets.length > 0 && (
        <div className="job-targets-section">
          <h4>Targets ({targets.length})</h4>
          <div className="targets-list">
            {targets.slice(0, 50).map((target, idx) => (
              <div key={idx} className={`target-item ${target.status}`}>
                <span className="target-status-icon">
                  {target.status === 'completed' ? '✓' : 
                   target.status === 'failed' ? '✗' : 
                   target.status === 'running' ? '⟳' : '○'}
                </span>
                <span className="target-name" title={target.name}>
                  {target.name.length > 40 ? target.name.slice(0, 40) + '...' : target.name}
                </span>
                {target.error && (
                  <span className="target-error" title={target.error}>
                    {target.error.length > 30 ? target.error.slice(0, 30) + '...' : target.error}
                  </span>
                )}
              </div>
            ))}
            {targets.length > 50 && (
              <div className="targets-more">
                +{targets.length - 50} more items...
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Errors */}
      {errors.length > 0 && (
        <div className="job-errors-section">
          <h4>Errors ({errors.length})</h4>
          <div className="errors-list">
            {errors.slice(0, 20).map((error, idx) => (
              <div key={idx} className="error-item">
                {error}
              </div>
            ))}
            {errors.length > 20 && (
              <div className="errors-more">
                +{errors.length - 20} more errors...
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Actions */}
      <div className="job-actions">
        {isRunning && (
          <button className="btn btn-warning" onClick={onCancel}>
            Cancel Job
          </button>
        )}
        {!isRunning && (
          <button className="btn btn-danger" onClick={onRemove}>
            Remove from History
          </button>
        )}
      </div>
    </div>
  );
}

function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Mini job indicator for the header
interface JobIndicatorProps {
  jobs: Job[];
  onClick: () => void;
}

export function JobIndicator({ jobs, onClick }: JobIndicatorProps) {
  const runningCount = jobs.filter(j => j.status === 'running').length;
  const pendingCount = jobs.filter(j => j.status === 'pending').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;
  
  if (jobs.length === 0) return null;
  
  return (
    <button className="job-indicator" onClick={onClick} title="View Jobs">
      <span className="job-indicator-icon">📋</span>
      <span className="job-indicator-count">{jobs.length}</span>
      {runningCount > 0 && (
        <span className="job-indicator-badge running">{runningCount}</span>
      )}
      {failedCount > 0 && (
        <span className="job-indicator-badge failed">{failedCount}</span>
      )}
    </button>
  );
}
