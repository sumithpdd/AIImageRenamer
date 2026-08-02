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

type AsyncJobResponse = {
  accepted?: boolean;
  jobId?: string;
  status?: string;
  message?: string;
  error?: string;
  totalItems?: number;
  // Sync response fields
  success?: boolean;
  images?: any[];
  imageCount?: number;
  duplicateCount?: number;
  newCount?: number;
  results?: any[];
  analyzed?: number;
  errors?: number;
  renamed?: number;
  removed?: number;
  kept?: number;
};

async function startAsyncJob(url: string, options?: RequestInit): Promise<AsyncJobResponse> {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok && !data.jobId) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const scanFolder = async (projectId: string, asyncMode = true) => {
  const query = asyncMode ? '?async=true' : '?async=false';
  return startAsyncJob(`${API_BASE}/projects/${projectId}/scan${query}`, { method: 'POST' });
};

export const rescanFolder = async (projectId: string, asyncMode = true) => {
  const query = asyncMode ? '?mode=rescan&async=true' : '?mode=rescan&async=false';
  return startAsyncJob(`${API_BASE}/projects/${projectId}/scan${query}`, { method: 'POST' });
};

export const analyzeImagesBatch = async (projectId: string, imageIds: string[], asyncMode = true) => {
  const query = asyncMode ? '?async=true' : '?async=false';
  return startAsyncJob(`${API_BASE}/projects/${projectId}/analyze-batch${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageIds })
  });
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
  options: { useAiSuggestion?: boolean; usePatternClean?: boolean },
  asyncMode = true
) => {
  const query = asyncMode ? '?async=true' : '?async=false';
  return startAsyncJob(`${API_BASE}/projects/${projectId}/rename-batch${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageIds, ...options })
  });
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

// Tags / taxonomy
export const fetchTaxonomies = async (type?: 'tag' | 'color' | 'category' | 'style' | 'mood') => {
  const query = type ? `?type=${type}` : '';
  const res = await fetch(`${API_BASE}/taxonomies${query}`);
  return res.json();
};

export const fetchProjectTags = async (projectId: string) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/tags`);
  return res.json();
};

export const updateImageTags = async (
  projectId: string,
  imageId: string,
  ops: { add?: string[]; remove?: string[]; set?: string[] }
) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/images/${imageId}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ops)
  });
  return res.json();
};

export const batchUpdateImageTags = async (
  projectId: string,
  imageIds: string[],
  ops: { add?: string[]; remove?: string[] }
) => {
  const res = await fetch(`${API_BASE}/projects/${projectId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageIds, ...ops })
  });
  return res.json();
};

// Helpers
export const getImageUrl = (imagePath: string) => {
  return `${API_BASE}/image?path=${encodeURIComponent(imagePath)}`;
};
