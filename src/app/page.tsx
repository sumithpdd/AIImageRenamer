'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Header } from '@/components/Header';
import { Notification } from '@/components/Notification';
import { ProjectsView } from '@/components/ProjectsView';
import { ProjectView } from '@/components/ProjectView';
import { ImagePreview } from '@/components/ImagePreview';
import { CreateProjectModal } from '@/components/CreateProjectModal';
import { JobViewer } from '@/components/JobViewer';
import { RunningJobsBar } from '@/components/RunningJobsBar';
import { useNotification } from '@/hooks/useNotification';
import { useProjects } from '@/hooks/useProjects';
import { useImages } from '@/hooks/useImages';
import { useJobs, Job, formatJobType } from '@/hooks/useJobs';
import * as api from '@/lib/api';

const ACTION_BY_JOB_TYPE: Record<string, string> = {
  scan: 'scan',
  analyze: 'analyze',
  rename: 'rename',
  cleanup: 'duplicates'
};

export default function Home() {
  const [view, setView] = useState('projects');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [previewImage, setPreviewImage] = useState<any>(null);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [health, setHealth] = useState({ hasGemini: false, hasFirebase: false });

  const { notification, showNotification } = useNotification();
  
  const { 
    projects, 
    currentProject, 
    setCurrentProject,
    loading: projectsLoading, 
    loadProjects, 
    createProject: createProjectFn,
    removeProject,
    refreshProject 
  } = useProjects(showNotification);

  const fetchJobsRef = useRef<() => void>(() => {});

  const {
    images,
    selectedImages,
    loading: imagesLoading,
    isActionPending,
    loadImages,
    scanFolder,
    rescanFolder,
    analyzeImages,
    renameWithAI,
    cleanPatterns,
    removeDuplicates,
    renameSingleImage,
    removeImage,
    toggleSelect,
    selectAll,
    resetImages,
    clearPendingAction
  } = useImages(showNotification, refreshProject, () => fetchJobsRef.current());

  const handleJobComplete = useCallback(async (job: Job) => {
    const action = ACTION_BY_JOB_TYPE[job.type];
    if (action) {
      clearPendingAction(action);
    }
    if (job.type === 'rename' && job.config?.usePatternClean) {
      clearPendingAction('clean');
    }

    if (currentProject?.id === job.projectId) {
      await loadImages(job.projectId);
      await refreshProject();
    }

    const typeLabel = formatJobType(job.type);
    if (job.status === 'completed') {
      showNotification(`${typeLabel} finished: ${job.statusMessage}`);
    } else if (job.status === 'failed') {
      showNotification(`${typeLabel} failed: ${job.statusMessage}`, 'error');
    } else if (job.status === 'cancelled') {
      showNotification(`${typeLabel} cancelled`, 'warning');
    }
  }, [currentProject?.id, showNotification, refreshProject, loadImages, clearPendingAction]);

  const {
    jobs,
    runningJobs,
    projectRunningJobs,
    selectedJob,
    isOpen: jobViewerOpen,
    openJobViewer,
    closeJobViewer,
    cancelJob,
    removeJob,
    setSelectedJob,
    fetchJobs
  } = useJobs(undefined, { onJobComplete: handleJobComplete });

  fetchJobsRef.current = fetchJobs;

  // Initialize app
  useEffect(() => {
    const init = async () => {
      try {
        const healthData = await api.checkHealth();
        setHealth(healthData);
      } catch (err) {
        console.error('Health check failed:', err);
      }
      loadProjects();
      fetchJobs();
    };
    init();
  }, [loadProjects, fetchJobs]);

  // Filter images based on current filter and search query
  const filteredImages = useMemo(() => {
    let base = images;

    switch (filter) {
      case 'new':
        base = base.filter(img => !!img.isNew);
        break;
      case 'duplicates':
        base = base.filter(img => img.isDuplicate);
        break;
      case 'analyzed':
        base = base.filter(img => img.suggestedName);
        break;
      case 'renamed':
        base = base.filter(img => img.renamed);
        break;
      case 'pending':
        base = base.filter(img => !img.suggestedName && !img.renamed);
        break;
      default:
        break;
    }

    if (!search.trim()) return base;

    const q = search.toLowerCase();
    return base.filter(img => {
      const nameMatch =
        img.currentName?.toLowerCase().includes(q) ||
        img.originalName?.toLowerCase().includes(q) ||
        img.suggestedName?.toLowerCase().includes(q);

      const title = img.metadata?.title || '';
      const desc = img.metadata?.description || img.aiDescription || '';
      const tags = (img.metadata?.tags || []).join(' ');

      const metaMatch =
        title.toLowerCase().includes(q) ||
        desc.toLowerCase().includes(q) ||
        tags.toLowerCase().includes(q);

      return nameMatch || metaMatch;
    });
  }, [images, filter, search]);

  const stats = useMemo(() => ({
    total: images.length,
    new: images.filter(img => !!img.isNew).length,
    analyzed: images.filter(img => img.suggestedName).length,
    renamed: images.filter(img => img.renamed).length,
    duplicates: images.filter(img => img.isDuplicate).length,
    pending: images.filter(img => !img.suggestedName && !img.renamed).length
  }), [images]);

  const isBusy = projectRunningJobs.length > 0 || isActionPending('scan') || isActionPending('rescan');

  const handleCreateProject = async (name: string, folderPath: string, description: string) => {
    const project = await createProjectFn(name, folderPath, description);
    if (project) {
      setShowCreateProject(false);
      handleOpenProject(project);
    }
  };

  const handleOpenProject = async (project: any) => {
    setCurrentProject(project);
    setView('project');
    resetImages();
    await loadImages(project.id);
    fetchJobs();
  };

  const handleBackToProjects = () => {
    setView('projects');
    setCurrentProject(null);
    resetImages();
    setSearch('');
  };

  const handleDeleteProject = async (projectId: string) => {
    await removeProject(projectId);
  };

  const handleScanProject = async () => {
    if (currentProject) {
      await scanFolder(currentProject.id);
    }
  };

  const handleRescanProject = async () => {
    if (currentProject) {
      await rescanFolder(currentProject.id);
    }
  };

  const handleAnalyzeSelected = async () => {
    if (currentProject) {
      await analyzeImages(currentProject.id, Array.from(selectedImages));
    }
  };

  const handleAnalyzeAll = async () => {
    if (currentProject) {
      const pendingIds = images
        .filter(img => !img.suggestedName)
        .map(img => img.id);
      
      if (pendingIds.length === 0) {
        showNotification('All images already analyzed', 'info');
        return;
      }
      await analyzeImages(currentProject.id, pendingIds);
    }
  };

  const handleRenameWithAI = async () => {
    if (currentProject && confirm(`Rename images using AI suggestions?`)) {
      await renameWithAI(currentProject.id);
    }
  };

  const handleCleanPatterns = async () => {
    if (currentProject && confirm(`Clean prefixes from filenames?`)) {
      await cleanPatterns(currentProject.id);
    }
  };

  const handleRemoveDuplicates = async () => {
    if (currentProject && confirm(`Remove duplicate images (keep one copy of each)? This will also delete duplicates from disk and cloud storage.`)) {
      await removeDuplicates(currentProject.id);
    }
  };

  const handleRenameSingle = (image: any, newName: string) => {
    if (currentProject) {
      renameSingleImage(currentProject.id, image, newName);
    }
  };

  const handleDeleteImage = (image: any) => {
    if (currentProject && confirm(`Remove ${image.currentName}?`)) {
      removeImage(currentProject.id, image, false);
    }
  };

  const handleSelectAll = () => {
    selectAll(filteredImages);
  };

  const handleOpenJob = (job?: Job) => {
    openJobViewer(job);
  };

  return (
    <div className="app">
      <AnimatePresence>
        {notification && <Notification notification={notification} />}
      </AnimatePresence>

      <Header 
        health={health}
        view={view}
        currentProject={currentProject}
        onBackToProjects={handleBackToProjects}
        jobs={jobs}
        runningJobs={runningJobs}
        onOpenJobs={() => handleOpenJob()}
      />

      <main className="main">
        {view === 'projects' ? (
          <ProjectsView
            projects={projects}
            onOpenProject={handleOpenProject}
            onDeleteProject={handleDeleteProject}
            onCreateProject={() => setShowCreateProject(true)}
          />
        ) : (
          <>
            <RunningJobsBar
              jobs={projectRunningJobs}
              onViewJobs={() => handleOpenJob()}
              onSelectJob={handleOpenJob}
            />
            <ProjectView
              project={currentProject}
              images={filteredImages}
              stats={stats}
              filter={filter}
              setFilter={setFilter}
              search={search}
              setSearch={setSearch}
              selectedImages={selectedImages}
              loading={imagesLoading}
              isBusy={isBusy}
              isActionPending={isActionPending}
              onScan={handleScanProject}
              onRescan={handleRescanProject}
              onAnalyzeSelected={handleAnalyzeSelected}
              onAnalyzeAll={handleAnalyzeAll}
              onRenameWithAI={handleRenameWithAI}
              onCleanPatterns={handleCleanPatterns}
              onRemoveDuplicates={handleRemoveDuplicates}
              onToggleSelect={toggleSelect}
              onSelectAll={handleSelectAll}
              onPreview={setPreviewImage}
              onRename={handleRenameSingle}
              onDelete={handleDeleteImage}
            />
          </>
        )}
      </main>

      <AnimatePresence>
        {showCreateProject && (
          <CreateProjectModal
            onClose={() => setShowCreateProject(false)}
            onCreate={handleCreateProject}
            loading={projectsLoading}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewImage && (
          <ImagePreview
            image={previewImage}
            onClose={() => setPreviewImage(null)}
            onRename={(newName: string) => {
              handleRenameSingle(previewImage, newName);
              setPreviewImage(null);
            }}
            onDelete={() => {
              handleDeleteImage(previewImage);
              setPreviewImage(null);
            }}
          />
        )}
      </AnimatePresence>

      <JobViewer
        jobs={jobs}
        selectedJob={selectedJob}
        isOpen={jobViewerOpen}
        onClose={closeJobViewer}
        onSelectJob={setSelectedJob}
        onCancelJob={cancelJob}
        onRemoveJob={removeJob}
      />
    </div>
  );
}
