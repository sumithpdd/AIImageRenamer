'use client';

import { motion } from 'framer-motion';
import { JobIndicator } from './JobViewer';
import { Job } from '@/hooks/useJobs';

interface HeaderProps {
  health: { hasGemini: boolean; hasFirebase: boolean };
  view: string;
  currentProject: any;
  onBackToProjects: () => void;
  jobs?: Job[];
  onOpenJobs?: () => void;
}

export function Header({ 
  health, 
  view, 
  currentProject, 
  onBackToProjects,
  jobs = [],
  onOpenJobs 
}: HeaderProps) {
  return (
    <header className="header">
      <motion.div 
        className="logo"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="logo-icon" onClick={onBackToProjects}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
        </div>
        <div>
          <h1>AI Image Renamer</h1>
          <div className="header-status">
            <span className={`status-dot ${health.hasGemini ? 'active' : ''}`} />
            <span>Gemini {health.hasGemini ? 'Connected' : 'Not configured'}</span>
            <span className={`status-dot ${health.hasFirebase ? 'active' : ''}`} />
            <span>Firebase {health.hasFirebase ? 'Connected' : 'Local mode'}</span>
          </div>
        </div>
      </motion.div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Always show jobs button */}
        {onOpenJobs && (
          <button 
            className="btn-secondary" 
            onClick={onOpenJobs}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            title="View Jobs"
          >
            <span>📋</span>
            <span>Jobs</span>
            {jobs.length > 0 && (
              <span style={{ 
                background: jobs.some(j => j.status === 'running') ? '#3b82f6' : '#6b7280',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '10px',
                fontSize: '0.75rem',
                fontWeight: '600'
              }}>
                {jobs.length}
              </span>
            )}
          </button>
        )}
        
        {view === 'project' && currentProject && (
          <div className="header-project">
            <button className="btn-ghost" onClick={onBackToProjects}>
              ← Back to Projects
            </button>
            <span className="project-name">{currentProject.name}</span>
          </div>
        )}
      </div>
    </header>
  );
}
