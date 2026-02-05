'use client';

import { motion } from 'framer-motion';

interface ProjectsViewProps {
  projects: any[];
  onOpenProject: (project: any) => void;
  onDeleteProject: (projectId: string) => void;
  onCreateProject: () => void;
}

export function ProjectsView({ projects, onOpenProject, onDeleteProject, onCreateProject }: ProjectsViewProps) {
  return (
    <motion.div 
      className="projects-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="projects-header">
        <h2>Your Projects</h2>
        <button className="btn-primary" onClick={onCreateProject}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyProjects onCreateProject={onCreateProject} />
      ) : (
        <div className="projects-grid">
          {projects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              onOpen={() => onOpenProject(project)}
              onDelete={() => onDeleteProject(project.id)}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function EmptyProjects({ onCreateProject }: { onCreateProject: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h3>No projects yet</h3>
      <p>Create a project to start organizing your images</p>
      <button className="btn-primary" onClick={onCreateProject}>
        Create First Project
      </button>
    </div>
  );
}

interface ProjectCardProps {
  project: any;
  index: number;
  onOpen: () => void;
  onDelete: () => void;
}

function ProjectCard({ project, index, onOpen, onDelete }: ProjectCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this project? Image files will not be deleted.')) {
      onDelete();
    }
  };

  return (
    <motion.div
      className="project-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onOpen}
    >
      <div className="project-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div className="project-info">
        <h3>{project.name}</h3>
        {project.id && (
          <p className="mono small">
            Project ID: <span>{project.id}</span>
          </p>
        )}
        <p className="mono">{project.folderPath}</p>
        <div className="project-stats">
          <span>{project.imageCount || 0} images</span>
          <span>{project.analyzedCount || 0} analyzed</span>
          <span>{project.renamedCount || 0} renamed</span>
        </div>
      </div>
      <button 
        className="btn-icon danger" 
        onClick={handleDelete}
        title="Delete project"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </motion.div>
  );
}
