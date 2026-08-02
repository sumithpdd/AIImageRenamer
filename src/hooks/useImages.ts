'use client';

import { useState, useCallback } from 'react';
import * as api from '@/lib/api';

export function useImages(
  showNotification: (msg: string, type?: string) => void, 
  refreshProject: () => Promise<void>,
  onJobStarted?: (jobId: string, action: string) => void
) {
  const [images, setImages] = useState<any[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());

  const startAction = useCallback((action: string) => {
    setPendingActions(prev => new Set(prev).add(action));
  }, []);

  const endAction = useCallback((action: string) => {
    setPendingActions(prev => {
      const next = new Set(prev);
      next.delete(action);
      return next;
    });
  }, []);

  const isActionPending = useCallback(
    (action: string) => pendingActions.has(action),
    [pendingActions]
  );

  const loadImages = useCallback(async (projectId: string) => {
    try {
      const data = await api.fetchImages(projectId);
      if (data.images && data.images.length > 0) {
        setImages(data.images);
      } else if (data.images) {
        setImages([]);
      }
    } catch (err) {
      console.error('Failed to load images:', err);
    }
  }, []);

  const scanFolder = useCallback(async (projectId: string) => {
    const action = 'scan';
    startAction(action);
    try {
      const data = await api.scanFolder(projectId);
      if (data.error) {
        showNotification(data.error, 'error');
        endAction(action);
        return null;
      }
      if (data.accepted && data.jobId) {
        showNotification(data.message || 'Scan started in background');
        onJobStarted?.(data.jobId, 'scan');
        return data.jobId;
      }
      setImages(data.images || []);
      showNotification(`Found ${data.imageCount} images, ${data.duplicateCount} duplicates`);
      refreshProject();
      endAction(action);
      return data.jobId || null;
    } catch (err) {
      showNotification('Failed to scan folder', 'error');
      endAction(action);
      return null;
    }
  }, [showNotification, refreshProject, onJobStarted, startAction, endAction]);

  const rescanFolder = useCallback(async (projectId: string) => {
    const action = 'rescan';
    startAction(action);
    try {
      const data = await api.rescanFolder(projectId);
      if (data.error) {
        showNotification(data.error, 'error');
        endAction(action);
        return null;
      }
      if (data.accepted && data.jobId) {
        showNotification(data.message || 'Rescan started in background');
        onJobStarted?.(data.jobId, 'rescan');
        return data.jobId;
      }
      await loadImages(projectId);
      const newCount = data.newCount ?? data.imageCount ?? 0;
      showNotification(newCount > 0 ? `Rescan found ${newCount} new images` : 'Rescan: no new images found');
      refreshProject();
      endAction(action);
      return data.jobId || null;
    } catch (err) {
      showNotification('Failed to rescan folder', 'error');
      endAction(action);
      return null;
    }
  }, [showNotification, refreshProject, loadImages, onJobStarted, startAction, endAction]);

  const analyzeImages = useCallback(async (projectId: string, imageIds: string[]) => {
    if (imageIds.length === 0) {
      showNotification('No images to analyze', 'warning');
      return null;
    }

    const action = 'analyze';
    startAction(action);
    try {
      const data = await api.analyzeImagesBatch(projectId, imageIds);

      if (data.error && !data.accepted) {
        showNotification(data.error, 'error');
        endAction(action);
        return null;
      }

      if (data.accepted && data.jobId) {
        showNotification(`Analyzing ${data.totalItems || imageIds.length} images in background`);
        onJobStarted?.(data.jobId, 'analyze');
        return data.jobId;
      }

      const resultsMap = new Map((data.results || []).map((r: any) => [r.imageId, r]));
      setImages(prev => prev.map(img => {
        const result = resultsMap.get(img.id) as any;
        if (result && result.success) {
          return { 
            ...img, 
            suggestedName: result.suggestedName, 
            status: 'analyzed',
            metadata: result.metadata || img.metadata,
            aiDescription: result.metadata?.description || img.aiDescription
          };
        } else if (result && !result.success) {
          return {
            ...img,
            status: 'error',
            metadata: { ...img.metadata, analysisError: result.error }
          };
        }
        return img;
      }));

      const errors = data.errors || 0;
      const analyzed = data.analyzed || 0;
      if (errors > 0 && analyzed > 0) {
        showNotification(`Analyzed ${analyzed} images, ${errors} failed`, 'warning');
      } else if (errors > 0 && analyzed === 0) {
        showNotification(`Analysis failed for all ${errors} images`, 'error');
      } else if (analyzed > 0) {
        showNotification(`Successfully analyzed ${analyzed} images`);
      }
      refreshProject();
      endAction(action);
      return data.jobId || null;
    } catch (err: any) {
      showNotification(err.message || 'Analysis failed', 'error');
      endAction(action);
      return null;
    }
  }, [showNotification, refreshProject, onJobStarted, startAction, endAction]);

  const renameWithAI = useCallback(async (projectId: string) => {
    const imageIds = images.filter(img => img.suggestedName && !img.renamed).map(img => img.id);
    if (imageIds.length === 0) {
      showNotification('No AI suggestions available', 'warning');
      return null;
    }

    const action = 'rename';
    startAction(action);
    try {
      const data = await api.renameImagesBatch(projectId, imageIds, { useAiSuggestion: true });

      if (data.accepted && data.jobId) {
        showNotification(`Renaming ${data.totalItems || imageIds.length} images in background`);
        onJobStarted?.(data.jobId, 'rename');
        return data.jobId;
      }

      const resultsMap = new Map((data.results || []).map((r: any) => [r.imageId, r]));
      setImages(prev => prev.map(img => {
        const result = resultsMap.get(img.id) as any;
        if (result && result.success) {
          return { ...img, currentName: result.newName, renamed: true, status: 'renamed' };
        }
        return img;
      }));

      showNotification(`Renamed ${data.renamed} images`);
      refreshProject();
      endAction(action);
      return data.jobId || null;
    } catch (err) {
      showNotification('Rename failed', 'error');
      endAction(action);
      return null;
    }
  }, [images, showNotification, refreshProject, onJobStarted, startAction, endAction]);

  const cleanPatterns = useCallback(async (projectId: string) => {
    const imageIds = images.filter(img => img.patternCleanName && !img.renamed).map(img => img.id);
    if (imageIds.length === 0) {
      showNotification('No pattern-based names available', 'warning');
      return null;
    }

    const action = 'clean';
    startAction(action);
    try {
      const data = await api.renameImagesBatch(projectId, imageIds, { usePatternClean: true });

      if (data.accepted && data.jobId) {
        showNotification(`Cleaning ${data.totalItems || imageIds.length} filenames in background`);
        onJobStarted?.(data.jobId, 'rename');
        return data.jobId;
      }

      const resultsMap = new Map((data.results || []).map((r: any) => [r.imageId, r]));
      setImages(prev => prev.map(img => {
        const result = resultsMap.get(img.id) as any;
        if (result && result.success) {
          return { ...img, currentName: result.newName, renamed: true, status: 'renamed' };
        }
        return img;
      }));

      showNotification(`Cleaned ${data.renamed} filenames`);
      refreshProject();
      endAction(action);
      return data.jobId || null;
    } catch (err) {
      showNotification('Cleanup failed', 'error');
      endAction(action);
      return null;
    }
  }, [images, showNotification, refreshProject, onJobStarted, startAction, endAction]);

  const removeDuplicates = useCallback(async (projectId: string) => {
    const action = 'duplicates';
    startAction(action);
    try {
      const data = await api.cleanupDuplicates(projectId);

      if (data.error) {
        showNotification(data.error, 'error');
      } else if (data.accepted && data.jobId) {
        showNotification('Duplicate cleanup started in background');
        onJobStarted?.(data.jobId, 'cleanup');
        return data.jobId;
      } else {
        const removed = data.removed || 0;
        const kept = data.kept ?? images.length - removed;
        showNotification(`Removed ${removed} duplicates, kept ${kept} images`);

        const refreshed = await api.fetchImages(projectId);
        if (refreshed.images) {
          setImages(refreshed.images);
        }
        await refreshProject();
      }
      endAction(action);
      return data.jobId || null;
    } catch (err: any) {
      showNotification(err.message || 'Failed to remove duplicates', 'error');
      endAction(action);
      return null;
    }
  }, [images.length, showNotification, refreshProject, onJobStarted, startAction, endAction]);

  const clearPendingAction = useCallback((action: string) => {
    endAction(action);
  }, [endAction]);

  const renameSingleImage = useCallback(async (projectId: string, image: any, newName: string) => {
    try {
      const data = await api.renameImage(projectId, image.id, newName);
      if (data.success) {
        setImages(prev => prev.map(img => 
          img.id === image.id 
            ? { ...img, currentName: data.newName, renamed: true, status: 'renamed' }
            : img
        ));
        showNotification(`Renamed to ${data.newName}`);
      } else {
        showNotification(data.error || 'Rename failed', 'error');
      }
    } catch (err) {
      showNotification('Rename failed', 'error');
    }
  }, [showNotification]);

  const removeImage = useCallback(async (projectId: string, image: any, deleteFile = false) => {
    try {
      await api.deleteImage(projectId, image.id, deleteFile);
      setImages(prev => prev.filter(img => img.id !== image.id));
      setSelectedImages(prev => {
        const newSet = new Set(prev);
        newSet.delete(image.id);
        return newSet;
      });
      showNotification('Image removed');
    } catch (err) {
      showNotification('Failed to remove image', 'error');
    }
  }, [showNotification]);

  const updateImageTags = useCallback(async (
    projectId: string,
    imageId: string,
    ops: { add?: string[]; remove?: string[]; set?: string[] }
  ) => {
    try {
      const data = await api.updateImageTags(projectId, imageId, ops);
      if (data.error || !data.success) {
        showNotification(data.error || 'Failed to update tags', 'error');
        return null;
      }

      setImages(prev => prev.map(img => {
        if (img.id !== imageId) return img;
        return {
          ...img,
          metadata: {
            ...(img.metadata || {}),
            tags: data.tags || [],
            tagIds: data.tagIds || []
          }
        };
      }));

      return data;
    } catch (err) {
      showNotification('Failed to update tags', 'error');
      return null;
    }
  }, [showNotification]);

  const batchUpdateTags = useCallback(async (
    projectId: string,
    imageIds: string[],
    ops: { add?: string[]; remove?: string[] }
  ) => {
    if (imageIds.length === 0) {
      showNotification('Select images first', 'warning');
      return null;
    }

    try {
      const data = await api.batchUpdateImageTags(projectId, imageIds, ops);
      if (data.error) {
        showNotification(data.error, 'error');
        return null;
      }

      const byId = new Map(
        (data.results || [])
          .filter((r: any) => r.success)
          .map((r: any) => [r.imageId, r.tags as string[]])
      );

      setImages(prev => prev.map(img => {
        const tags = byId.get(img.id);
        if (!tags) return img;
        return {
          ...img,
          metadata: {
            ...(img.metadata || {}),
            tags
          }
        };
      }));

      showNotification(`Updated tags on ${data.updated} image${data.updated === 1 ? '' : 's'}`);
      return data;
    } catch (err) {
      showNotification('Failed to update tags', 'error');
      return null;
    }
  }, [showNotification]);

  const toggleSelect = useCallback((imageId: string) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) newSet.delete(imageId);
      else newSet.add(imageId);
      return newSet;
    });
  }, []);

  const selectAll = useCallback((filteredImages: any[]) => {
    if (selectedImages.size === filteredImages.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(filteredImages.map(img => img.id)));
    }
  }, [selectedImages.size]);

  const resetImages = useCallback(() => {
    setImages([]);
    setSelectedImages(new Set());
    setPendingActions(new Set());
  }, []);

  return {
    images,
    selectedImages,
    loading,
    pendingActions,
    isActionPending,
    clearPendingAction,
    loadImages,
    scanFolder,
    rescanFolder,
    analyzeImages,
    renameWithAI,
    cleanPatterns,
    removeDuplicates,
    renameSingleImage,
    removeImage,
    updateImageTags,
    batchUpdateTags,
    toggleSelect,
    selectAll,
    resetImages
  };
}