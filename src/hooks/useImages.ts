import { useState, useCallback } from 'react';
import * as api from '@/lib/api';

export function useImages(
  showNotification: (msg: string, type?: string) => void, 
  refreshProject: () => Promise<void>
) {
  const [images, setImages] = useState<any[]>([]);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState({ 
    active: false, 
    current: 0, 
    total: 0, 
    action: '' 
  });

  const loadImages = useCallback(async (projectId: string) => {
    try {
      const data = await api.fetchImages(projectId);
      if (data.images && data.images.length > 0) {
        setImages(data.images);
      }
    } catch (err) {
      console.error('Failed to load images:', err);
    }
  }, []);

  const scanFolder = useCallback(async (projectId: string) => {
    setLoading(true);
    try {
      const data = await api.scanFolder(projectId);
      if (data.error) {
        showNotification(data.error, 'error');
      } else {
        setImages(data.images || []);
        showNotification(`Found ${data.imageCount} images, ${data.duplicateCount} duplicates`);
        refreshProject();
      }
    } catch (err) {
      showNotification('Failed to scan folder', 'error');
    }
    setLoading(false);
  }, [showNotification, refreshProject]);

  const analyzeImages = useCallback(async (projectId: string, imageIds: string[]) => {
    if (imageIds.length === 0) {
      showNotification('No images to analyze', 'warning');
      return;
    }

    setProcessing({ active: true, current: 0, total: imageIds.length, action: 'Analyzing' });

    try {
      const data = await api.analyzeImagesBatch(projectId, imageIds);
      
      // Check for API-level error
      if (data.error && !data.results) {
        showNotification(data.error, 'error');
        setProcessing({ active: false, current: 0, total: 0, action: '' });
        return;
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
          // Mark as error
          return {
            ...img,
            status: 'error',
            metadata: {
              ...img.metadata,
              analysisError: result.error
            }
          };
        }
        return img;
      }));

      // Show appropriate notification
      const errors = data.errors || 0;
      const analyzed = data.analyzed || 0;
      
      if (errors > 0 && analyzed > 0) {
        showNotification(`Analyzed ${analyzed} images, ${errors} failed`, 'warning');
      } else if (errors > 0 && analyzed === 0) {
        showNotification(`Analysis failed for all ${errors} images`, 'error');
      } else if (analyzed > 0) {
        showNotification(`Successfully analyzed ${analyzed} images`);
      } else {
        showNotification('No images were analyzed', 'warning');
      }
      
      refreshProject();
    } catch (err: any) {
      console.error('Analysis error:', err);
      showNotification(err.message || 'Analysis failed', 'error');
    }
    
    setProcessing({ active: false, current: 0, total: 0, action: '' });
  }, [showNotification, refreshProject]);

  const renameWithAI = useCallback(async (projectId: string) => {
    const imageIds = images.filter(img => img.suggestedName && !img.renamed).map(img => img.id);
    if (imageIds.length === 0) {
      showNotification('No AI suggestions available', 'warning');
      return;
    }

    setProcessing({ active: true, current: 0, total: imageIds.length, action: 'Renaming' });

    try {
      const data = await api.renameImagesBatch(projectId, imageIds, { useAiSuggestion: true });
      
      const resultsMap = new Map(data.results.map((r: any) => [r.imageId, r]));
      setImages(prev => prev.map(img => {
        const result = resultsMap.get(img.id) as any;
        if (result && result.success) {
          return { ...img, currentName: result.newName, renamed: true, status: 'renamed' };
        }
        return img;
      }));

      showNotification(`Renamed ${data.renamed} images`);
      refreshProject();
    } catch (err) {
      showNotification('Rename failed', 'error');
    }
    
    setProcessing({ active: false, current: 0, total: 0, action: '' });
  }, [images, showNotification, refreshProject]);

  const cleanPatterns = useCallback(async (projectId: string) => {
    const imageIds = images.filter(img => img.patternCleanName && !img.renamed).map(img => img.id);
    if (imageIds.length === 0) {
      showNotification('No pattern-based names available', 'warning');
      return;
    }

    setProcessing({ active: true, current: 0, total: imageIds.length, action: 'Cleaning' });

    try {
      const data = await api.renameImagesBatch(projectId, imageIds, { usePatternClean: true });
      
      const resultsMap = new Map(data.results.map((r: any) => [r.imageId, r]));
      setImages(prev => prev.map(img => {
        const result = resultsMap.get(img.id) as any;
        if (result && result.success) {
          return { ...img, currentName: result.newName, renamed: true, status: 'renamed' };
        }
        return img;
      }));

      showNotification(`Cleaned ${data.renamed} filenames`);
      refreshProject();
    } catch (err) {
      showNotification('Cleanup failed', 'error');
    }
    
    setProcessing({ active: false, current: 0, total: 0, action: '' });
  }, [images, showNotification, refreshProject]);

  const removeDuplicates = useCallback(async (projectId: string) => {
    setProcessing({ active: true, current: 0, total: 0, action: 'Removing duplicates' });

    try {
      const data = await api.cleanupDuplicates(projectId);

      if (data.error) {
        showNotification(data.error, 'error');
      } else {
        const removed = data.removed || 0;
        const kept = data.kept ?? images.length - removed;
        showNotification(`Removed ${removed} duplicates, kept ${kept} images`);

        // Reload images so UI reflects removals
        const refreshed = await api.fetchImages(projectId);
        if (refreshed.images) {
          setImages(refreshed.images);
        }
        await refreshProject();
      }
    } catch (err: any) {
      console.error('Duplicate cleanup error:', err);
      showNotification(err.message || 'Failed to remove duplicates', 'error');
    }

    setProcessing({ active: false, current: 0, total: 0, action: '' });
  }, [images.length, showNotification, refreshProject]);

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
  }, []);

  return {
    images,
    selectedImages,
    loading,
    processing,
    loadImages,
    scanFolder,
    analyzeImages,
    renameWithAI,
    cleanPatterns,
    removeDuplicates,
    renameSingleImage,
    removeImage,
    toggleSelect,
    selectAll,
    resetImages
  };
}
