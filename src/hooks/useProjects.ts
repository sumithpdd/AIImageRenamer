import { useState, useCallback } from 'react';
import * as api from '@/lib/api';

export function useProjects(showNotification: (msg: string, type?: string) => void) {
  const [projects, setProjects] = useState<any[]>([]);
  const [currentProject, setCurrentProject] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await api.fetchProjects();
      setProjects(data.projects || []);
    } catch (err) {
      showNotification('Failed to load projects', 'error');
    }
  }, [showNotification]);

  const createProject = useCallback(async (name: string, folderPath: string, description: string) => {
    setLoading(true);
    try {
      const data = await api.createProject(name, folderPath, description);
      if (data.error) {
        showNotification(data.error, 'error');
        return null;
      }
      showNotification(`Project "${name}" created!`);
      await loadProjects();
      return data;
    } catch (err) {
      showNotification('Failed to create project', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  }, [showNotification, loadProjects]);

  const removeProject = useCallback(async (projectId: string) => {
    try {
      await api.deleteProject(projectId);
      showNotification('Project deleted');
      loadProjects();
    } catch (err) {
      showNotification('Failed to delete project', 'error');
    }
  }, [showNotification, loadProjects]);

  const refreshProject = useCallback(async () => {
    if (!currentProject) return;
    const data = await api.fetchProject(currentProject.id);
    setCurrentProject(data);
  }, [currentProject]);

  return {
    projects,
    currentProject,
    setCurrentProject,
    loading,
    loadProjects,
    createProject,
    removeProject,
    refreshProject
  };
}
