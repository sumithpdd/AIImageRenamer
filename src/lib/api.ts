const API_BASE = '/api';

// Health & Config
export const checkHealth = async () => {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
};

// Projects
export const fetchProjects = async () => {
  const res = await fetch(`${API_BASE}/projects`);
  return res.json();
};

export const fetchProject = async (projectId: string) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}`);
  return res.json();
};

export const createProject = async (name: string, folderPath: string, description: string) => {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, folderPath, description })
  });
  return res.json();
};

export const deleteProject = async (projectId: string) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, { 
    method: 'DELETE' 
  });
  return res.json();
};

// Images
export const fetchImages = async (projectId: string) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/images`);
  return res.json();
};

export const scanFolder = async (projectId: string) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/scan`, {
    method: 'POST'
  });
  return res.json();
};

export const analyzeImagesBatch = async (projectId: string, imageIds: string[]) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/analyze-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageIds })
  });
  return res.json();
};

export const renameImage = async (projectId: string, imageId: string, newName: string) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/images/${imageId}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newName })
  });
  return res.json();
};

export const renameImagesBatch = async (
  projectId: string, 
  imageIds: string[], 
  options: { useAiSuggestion?: boolean; usePatternClean?: boolean }
) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/rename-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageIds, ...options })
  });
  return res.json();
};

export const deleteImage = async (projectId: string, imageId: string, deleteFile = false) => {
  const res = await fetch(
    `${API_BASE}/projects/${projectId}/images/${imageId}?deleteFile=${deleteFile}`,
    { method: 'DELETE' }
  );
  return res.json();
};

// Duplicate cleanup
export const cleanupDuplicates = async (projectId: string) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/cleanup-duplicates`, {
    method: 'POST'
  });
  return res.json();
};

// Jobs
export const fetchJobs = async (projectId?: string) => {
  const url = projectId 
    ? `${API_BASE}/jobs?projectId=${projectId}`
    : `${API_BASE}/jobs`;
  const res = await fetch(url);
  return res.json();
};

export const fetchJob = async (jobId: string) => {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`);
  return res.json();
};

export const cancelJob = async (jobId: string) => {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, { method: 'DELETE' });
  return res.json();
};

export const removeJob = async (jobId: string) => {
  const res = await fetch(`${API_BASE}/jobs/${jobId}?remove=true`, { method: 'DELETE' });
  return res.json();
};

// Helpers
export const getImageUrl = (imagePath: string) => {
  return `${API_BASE}/image?path=${encodeURIComponent(imagePath)}`;
};
