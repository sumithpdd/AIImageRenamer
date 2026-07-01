import fs from 'fs/promises';
import path from 'path';
import { isStorageConfigured } from '@/lib/firebase';
import { updateJobProgress, completeJob, shouldStopJob } from '@/lib/jobs';
import { BATCH_CONCURRENCY, processConcurrently } from '@/lib/utils/batch.utils';
import { updateProjectStats } from '@/lib/services/project.service';
import { getImage, updateImage } from '@/lib/services/image.service';
import { renameImageInStorage } from '@/lib/services/storage.service';

export interface RenameWorkerParams {
  projectId: string;
  projectName: string;
  targetIds: string[];
  useAiSuggestion?: boolean;
  usePatternClean?: boolean;
  jobId: string;
}

export interface RenameResultItem {
  imageId: string;
  oldName?: string;
  newName?: string;
  success: boolean;
  error?: string;
}

export interface RenameWorkerResult {
  results: RenameResultItem[];
  renamed: number;
  errors: number;
  jobId: string;
}

async function renameSingleImage(
  projectId: string,
  projectName: string,
  imageId: string,
  useAiSuggestion?: boolean,
  usePatternClean?: boolean
): Promise<RenameResultItem> {
  const useStorage = isStorageConfigured();

  try {
    const imageResult = await getImage(projectId, imageId);
    if (!imageResult.success || !imageResult.image) {
      return { imageId, success: false, error: 'Image not found' };
    }

    const imageData = imageResult.image;

    let newName: string | null = null;
    if (useAiSuggestion && imageData.suggestedName) {
      newName = imageData.suggestedName;
    } else if (usePatternClean && imageData.patternCleanName) {
      newName = imageData.patternCleanName;
    }

    if (!newName) {
      return { imageId, success: false, error: 'No suggested name available' };
    }

    const oldPath = imageData.path;
    const oldName = imageData.currentName;
    const dir = path.dirname(oldPath);
    const ext = imageData.extension;

    let newPath = path.join(dir, newName + ext);
    let finalName = newName;
    let counter = 1;

    while (true) {
      try {
        await fs.access(newPath);
        finalName = `${newName}_${counter}`;
        newPath = path.join(dir, finalName + ext);
        counter++;
      } catch {
        break;
      }
    }

    const newFullName = finalName + ext;
    await fs.rename(oldPath, newPath);

    let storageUrl = imageData.storageUrl;
    let storagePath = imageData.storagePath;

    if (useStorage && imageData.storageUrl) {
      const storageResult = await renameImageInStorage(projectName, oldName, newFullName);
      if (storageResult.success && storageResult.url) {
        storageUrl = storageResult.url;
        storagePath = storageResult.storagePath;
      }
    }

    const now = new Date().toISOString();
    await updateImage(projectId, imageId, {
      currentName: newFullName,
      path: newPath,
      renamed: true,
      renamedAt: now,
      status: 'renamed',
      storageUrl,
      storagePath,
      metadata: { ...imageData.metadata }
    });

    return { imageId, oldName, newName: newFullName, success: true };
  } catch (err: any) {
    return { imageId, success: false, error: err.message };
  }
}

export async function runRenameWorker(params: RenameWorkerParams): Promise<RenameWorkerResult> {
  const { projectId, projectName, targetIds, useAiSuggestion, usePatternClean, jobId } = params;
  const counts = { success: 0, error: 0 };

  const results = await processConcurrently(
    targetIds,
    BATCH_CONCURRENCY.rename,
    async (imageId) => {
      if (shouldStopJob(jobId)) {
        return { imageId, success: false, error: 'Cancelled' };
      }

      await updateJobProgress(jobId, {
        currentTarget: { name: imageId, status: 'running' }
      });

      const result = await renameSingleImage(
        projectId,
        projectName,
        imageId,
        useAiSuggestion,
        usePatternClean
      );

      if (result.success) {
        counts.success++;
        await updateJobProgress(jobId, {
          successCount: counts.success,
          currentTarget: {
            name: imageId,
            status: 'completed',
            data: { oldName: result.oldName, newName: result.newName }
          }
        });
      } else if (result.error !== 'Cancelled') {
        counts.error++;
        await updateJobProgress(jobId, {
          errorCount: counts.error,
          currentTarget: { name: imageId, status: 'failed', error: result.error }
        });
      }

      return result;
    },
    {
      shouldCancel: () => shouldStopJob(jobId),
      onItemComplete: async (completed, total) => {
        await updateJobProgress(jobId, {
          processedItems: completed,
          successCount: counts.success,
          errorCount: counts.error,
          statusMessage: `Renaming ${completed}/${total} (${BATCH_CONCURRENCY.rename} parallel)`
        });
      }
    }
  );

  if (counts.success > 0) {
    await updateProjectStats(projectId, { renamedCount: counts.success });
  }

  const status = shouldStopJob(jobId)
    ? 'failed'
    : counts.error === targetIds.length
      ? 'failed'
      : 'completed';

  await completeJob(jobId, {
    status,
    statusMessage: shouldStopJob(jobId)
      ? `Rename cancelled after ${counts.success} files`
      : `Renamed ${counts.success} files, ${counts.error} failed`
  });

  return {
    results,
    renamed: counts.success,
    errors: counts.error,
    jobId
  };
}
