import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { isStorageConfigured } from '@/lib/firebase';
import { ImageData, generateImageId } from '@/lib/storage';
import { SUPPORTED_EXTENSIONS, generateCleanName } from '@/lib/helpers';
import { updateJobProgress, completeJob, shouldStopJob, setJobTotalItems } from '@/lib/jobs';
import { getImageDimensions, calculateImageMetadata } from '@/lib/utils/image.utils';
import { BATCH_CONCURRENCY, processConcurrently } from '@/lib/utils/batch.utils';
import { updateProject } from '@/lib/services/project.service';
import { saveImages, clearProjectImages, getProjectImages } from '@/lib/services/image.service';
import { uploadImage } from '@/lib/services/storage.service';

export interface ScanWorkerParams {
  projectId: string;
  projectName: string;
  folderPath: string;
  scanMode: 'scan' | 'rescan';
  jobId: string;
}

export interface ScanWorkerResult {
  success: boolean;
  jobId: string;
  mode: 'scan' | 'rescan';
  imageCount: number;
  duplicateCount: number;
  uploadedCount?: number;
  skippedCount?: number;
  images: Array<ImageData & { id: string }>;
  newCount: number;
}

type ScanFileResult =
  | { ok: true; file: string; imageData: Omit<ImageData, 'id'>; uploaded: boolean; skipped: boolean }
  | { ok: false; file: string; error: string; skippedExisting?: boolean };

export async function runScanWorker(params: ScanWorkerParams): Promise<ScanWorkerResult> {
  const { projectId, projectName, folderPath, scanMode, jobId } = params;
  const isRescanOnly = scanMode === 'rescan';
  const useCloudStorage = isStorageConfigured();

  const files = (await fs.readdir(folderPath)).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  });

  await updateJobProgress(jobId, {
    processedItems: 0,
    statusMessage: `Found ${files.length} files, scanning with ${BATCH_CONCURRENCY.scan} parallel workers`
  });

  await setJobTotalItems(jobId, files.length);

  const existingResult = await getProjectImages(projectId);
  const existingImages = existingResult.success && existingResult.images ? existingResult.images : [];

  const existingByHash = new Map<string, any[]>();
  for (const img of existingImages) {
    if (!img.hash) continue;
    if (!existingByHash.has(img.hash)) existingByHash.set(img.hash, []);
    existingByHash.get(img.hash)!.push(img);
  }

  if (!isRescanOnly) {
    await clearProjectImages(projectId);
  }

  const scanStartedAt = new Date().toISOString();
  const counts = { success: 0, error: 0, uploaded: 0 };

  const fileResults = await processConcurrently(
    files,
    BATCH_CONCURRENCY.scan,
    async (file): Promise<ScanFileResult> => {
      if (shouldStopJob(jobId)) {
        return { ok: false, file, error: 'Cancelled' };
      }

      const ext = path.extname(file).toLowerCase();
      const filePath = path.join(folderPath, file);

      try {
        const stats = await fs.stat(filePath);
        const fileBuffer = await fs.readFile(filePath);
        const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');

        if (isRescanOnly) {
          const existingList = existingByHash.get(hash) || [];
          const alreadyTracked = existingList.some(img =>
            img?.path === filePath ||
            img?.currentName === file ||
            img?.originalName === file
          );
          if (alreadyTracked) {
            return { ok: false, file, error: 'Already tracked', skippedExisting: true };
          }
        }

        const dimensions = getImageDimensions(fileBuffer, ext);
        const fileMetadata = calculateImageMetadata(stats.size, dimensions);

        let storageUrl: string | undefined;
        let storagePath: string | undefined;
        let wasSkipped = false;

        if (useCloudStorage) {
          const uploadResult = await uploadImage(filePath, projectName, file, true);
          if (uploadResult.success) {
            storageUrl = uploadResult.url;
            storagePath = uploadResult.storagePath;
            if (uploadResult.skipped) {
              wasSkipped = true;
            }
          }
        }

        const metadata: any = {
          width: fileMetadata.width || 0,
          height: fileMetadata.height || 0,
          megapixels: fileMetadata.megapixels || 0,
          filesizeKB: fileMetadata.filesizeKB || 0,
          filesizeMB: fileMetadata.filesizeMB || 0,
          tags: [],
          colors: [],
          objects: []
        };

        if (fileMetadata.resolution) metadata.resolution = fileMetadata.resolution;
        if (fileMetadata.colorspace) metadata.colorspace = fileMetadata.colorspace;

        let imageData: Omit<ImageData, 'id'> = {
          projectId,
          originalName: file,
          currentName: file,
          path: filePath,
          size: stats.size,
          hash,
          extension: ext,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
          scannedAt: scanStartedAt,
          firstSeenAt: scanStartedAt,
          isNew: true,
          status: 'scanned',
          aiDescription: null,
          suggestedName: null,
          patternCleanName: generateCleanName(file, null),
          isDuplicate: false,
          duplicateOf: null,
          renamed: false,
          storageUrl,
          storagePath,
          metadata
        };

        if (!isRescanOnly) {
          const existingList = existingByHash.get(hash) || [];
          if (existingList.length > 0) {
            const existing =
              existingList.find(img => img.path === filePath) ||
              existingList.find(img => img.currentName === file || img.originalName === file) ||
              existingList[0];

            if (existing) {
              imageData = {
                ...imageData,
                firstSeenAt: existing.firstSeenAt ?? existing.scannedAt ?? imageData.firstSeenAt,
                isNew: false,
                aiDescription: existing.aiDescription ?? imageData.aiDescription,
                suggestedName: existing.suggestedName ?? imageData.suggestedName,
                patternCleanName: existing.patternCleanName ?? imageData.patternCleanName,
                status: existing.status ?? imageData.status,
                analyzedAt: existing.analyzedAt ?? imageData.analyzedAt,
                renamed: existing.renamed ?? imageData.renamed,
                renamedAt: existing.renamedAt ?? imageData.renamedAt,
                isDuplicate: existing.isDuplicate ?? imageData.isDuplicate,
                duplicateOf: existing.duplicateOf ?? imageData.duplicateOf,
                storageUrl: existing.storageUrl ?? imageData.storageUrl,
                storagePath: existing.storagePath ?? imageData.storagePath,
                metadata: {
                  ...(existing.metadata || {}),
                  ...(imageData.metadata || {})
                }
              };
            }
          }
        }

        return {
          ok: true,
          file,
          imageData,
          uploaded: !!storageUrl && !wasSkipped,
          skipped: wasSkipped
        };
      } catch (err: any) {
        return { ok: false, file, error: err.message };
      }
    },
    {
      shouldCancel: () => shouldStopJob(jobId),
      onItemComplete: async (completed, total) => {
        await updateJobProgress(jobId, {
          processedItems: completed,
          successCount: counts.success,
          errorCount: counts.error,
          statusMessage: `Scanning files ${completed}/${total} (${BATCH_CONCURRENCY.scan} parallel)`
        });
      }
    }
  );

  const images: Omit<ImageData, 'id'>[] = [];
  const newImages: Omit<ImageData, 'id'>[] = [];
  const duplicateHashes = new Map<string, string[]>();

  for (const result of fileResults) {
    if (result.ok) {
      counts.success++;
      if (result.uploaded) counts.uploaded++;

      const hash = result.imageData.hash;
      if (duplicateHashes.has(hash)) {
        duplicateHashes.get(hash)!.push(result.file);
      } else {
        duplicateHashes.set(hash, [result.file]);
      }

      if (isRescanOnly) {
        newImages.push(result.imageData);
      } else {
        images.push(result.imageData);
      }

      await updateJobProgress(jobId, {
        successCount: counts.success,
        currentTarget: {
          name: result.file,
          status: 'completed',
          data: { uploaded: result.uploaded, skipped: result.skipped }
        }
      });
    } else {
      const failed = result as Extract<ScanFileResult, { ok: false }>;
      if (failed.skippedExisting) {
        counts.success++;
        await updateJobProgress(jobId, {
          successCount: counts.success,
          currentTarget: { name: failed.file, status: 'completed', data: { skippedExisting: true } }
        });
      } else if (failed.error !== 'Cancelled') {
        counts.error++;
        await updateJobProgress(jobId, {
          errorCount: counts.error,
          currentTarget: { name: failed.file, status: 'failed', error: failed.error }
        });
      }
    }
  }

  const outputImages = isRescanOnly ? newImages : images;
  let duplicateCount = 0;

  for (const [hash, fileNames] of Array.from(duplicateHashes.entries())) {
    if (fileNames.length > 1) {
      duplicateCount += fileNames.length;
      outputImages.forEach(img => {
        if (img.hash === hash) {
          img.isDuplicate = true;
          img.duplicateOf = fileNames.filter(f => f !== img.originalName);
        }
      });
    }
  }

  if (isRescanOnly) {
    for (const img of newImages) {
      const existingList = existingByHash.get(img.hash) || [];
      if (existingList.length > 0) {
        img.isDuplicate = true;
        const existingNames = existingList
          .map(e => e.currentName || e.originalName)
          .filter(Boolean);
        img.duplicateOf = Array.from(new Set([...(img.duplicateOf || []), ...existingNames]));
      }
    }
    duplicateCount = newImages.filter(i => i.isDuplicate).length;
  }

  const skippedCount = outputImages.length - counts.uploaded;

  if (isRescanOnly) {
    if (newImages.length > 0) {
      await saveImages(projectId, newImages);
    }
  } else {
    await saveImages(projectId, images);
  }

  const allForStats = isRescanOnly ? [...existingImages, ...newImages] : outputImages;
  const analyzedCount = allForStats.filter(img => !!img.suggestedName).length;
  const renamedCount = allForStats.filter(img => !!(img as any).renamed).length;

  await updateProject(projectId, {
    imageCount: allForStats.length,
    analyzedCount,
    renamedCount,
    status: 'scanned',
    lastScannedAt: scanStartedAt
  });

  const status = shouldStopJob(jobId) ? 'failed' : 'completed';
  const statusMessage = shouldStopJob(jobId)
    ? `Scan cancelled after ${counts.success} files`
    : useCloudStorage
      ? `${isRescanOnly ? 'Rescanned' : 'Scanned'} ${outputImages.length} images, ${counts.uploaded} uploaded (${skippedCount} skipped), ${duplicateCount} duplicates`
      : `${isRescanOnly ? 'Rescanned' : 'Scanned'} ${outputImages.length} images, ${duplicateCount} duplicates`;

  await completeJob(jobId, { status, statusMessage });

  const imagesWithIds = outputImages.map(img => ({
    ...img,
    id: generateImageId(img.hash, img.originalName)
  }));

  return {
    success: status === 'completed',
    jobId,
    mode: scanMode,
    imageCount: outputImages.length,
    duplicateCount,
    uploadedCount: useCloudStorage ? counts.uploaded : undefined,
    skippedCount: useCloudStorage ? skippedCount : undefined,
    images: imagesWithIds,
    newCount: isRescanOnly ? newImages.length : outputImages.filter(i => (i as any).isNew).length
  };
}
