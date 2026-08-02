import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { isStorageConfigured } from '@/lib/firebase';
import { ImageData, generateImageId } from '@/lib/storage';
import { generateCleanName } from '@/lib/helpers';
import { updateJobProgress, completeJob, shouldStopJob, setJobTotalItems } from '@/lib/jobs';
import { getImageDimensions, calculateImageMetadata } from '@/lib/utils/image.utils';
import { BATCH_CONCURRENCY, processConcurrently } from '@/lib/utils/batch.utils';
import { collectMediaFilesRecursive, MediaFileEntry } from '@/lib/utils/fs.utils';
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
  folderCount?: number;
}

type ScanFileResult =
  | { ok: true; file: string; imageData: Omit<ImageData, 'id'>; uploaded: boolean; skipped: boolean }
  | { ok: false; file: string; error: string; skippedExisting?: boolean };

/** Storage object key that preserves nested folders under the project */
function storageObjectName(entry: MediaFileEntry): string {
  return entry.relativePath.split(path.sep).join('/');
}

export async function runScanWorker(params: ScanWorkerParams): Promise<ScanWorkerResult> {
  const { projectId, projectName, folderPath, scanMode, jobId } = params;
  const isRescanOnly = scanMode === 'rescan';
  const useCloudStorage = isStorageConfigured();

  await updateJobProgress(jobId, {
    processedItems: 0,
    statusMessage: 'Walking folder tree recursively…'
  });

  const mediaFiles = await collectMediaFilesRecursive(folderPath);
  const folderCount = new Set(
    mediaFiles.map(f => f.relativeDir).filter(Boolean)
  ).size;

  console.log(
    `📂 Scan ${scanMode}: found ${mediaFiles.length} media file(s) under ${folderPath}`
  );

  await updateJobProgress(jobId, {
    processedItems: 0,
    statusMessage: `Found ${mediaFiles.length} images across ${folderCount || 1} folder(s); scanning with ${BATCH_CONCURRENCY.scan} parallel workers`
  });

  await setJobTotalItems(jobId, mediaFiles.length);

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
    mediaFiles,
    BATCH_CONCURRENCY.scan,
    async (entry): Promise<ScanFileResult> => {
      if (shouldStopJob(jobId)) {
        return { ok: false, file: entry.relativePath, error: 'Cancelled' };
      }

      const ext = path.extname(entry.fileName).toLowerCase();
      const filePath = entry.absolutePath;
      const displayName = entry.relativePath;

      await updateJobProgress(jobId, {
        currentTarget: { name: displayName, status: 'running' }
      });

      try {
        const stats = await fs.stat(filePath);
        const fileBuffer = await fs.readFile(filePath);
        const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');

        if (isRescanOnly) {
          const existingList = existingByHash.get(hash) || [];
          const alreadyTracked = existingList.some(img =>
            img?.path === filePath ||
            img?.relativePath === entry.relativePath ||
            img?.currentName === entry.fileName ||
            img?.originalName === entry.fileName
          );
          if (alreadyTracked) {
            return { ok: false, file: displayName, error: 'Already tracked', skippedExisting: true };
          }
        }

        const dimensions = getImageDimensions(fileBuffer, ext);
        const fileMetadata = calculateImageMetadata(stats.size, dimensions);

        let storageUrl: string | undefined;
        let storagePath: string | undefined;
        let wasSkipped = false;

        if (useCloudStorage) {
          const uploadResult = await uploadImage(
            filePath,
            projectName,
            storageObjectName(entry),
            true
          );
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
          objects: [],
          sourceFolder: entry.relativeDir || null
        };

        if (fileMetadata.resolution) metadata.resolution = fileMetadata.resolution;
        if (fileMetadata.colorspace) metadata.colorspace = fileMetadata.colorspace;

        let imageData: Omit<ImageData, 'id'> = {
          projectId,
          originalName: entry.fileName,
          currentName: entry.fileName,
          path: filePath,
          relativePath: entry.relativePath,
          relativeDir: entry.relativeDir,
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
          patternCleanName: generateCleanName(entry.fileName, null),
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
              existingList.find(img => img.relativePath === entry.relativePath) ||
              existingList.find(img => img.currentName === entry.fileName || img.originalName === entry.fileName) ||
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
          file: displayName,
          imageData,
          uploaded: !!storageUrl && !wasSkipped,
          skipped: wasSkipped
        };
      } catch (err: any) {
        return { ok: false, file: displayName, error: err.message };
      }
    },
    {
      shouldCancel: () => shouldStopJob(jobId),
      onItemComplete: async (completed, total) => {
        await updateJobProgress(jobId, {
          processedItems: completed,
          successCount: counts.success,
          errorCount: counts.error,
          statusMessage: `Scanning ${completed}/${total} (${BATCH_CONCURRENCY.scan} parallel, deep walk)`
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
      const label = result.imageData.relativePath || result.file;
      if (duplicateHashes.has(hash)) {
        duplicateHashes.get(hash)!.push(label);
      } else {
        duplicateHashes.set(hash, [label]);
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
        const label = img.relativePath || img.originalName;
        if (img.hash === hash) {
          img.isDuplicate = true;
          img.duplicateOf = fileNames.filter(f => f !== label);
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
          .map(e => e.relativePath || e.currentName || e.originalName)
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
      ? `${isRescanOnly ? 'Rescanned' : 'Scanned'} ${outputImages.length} images in ${folderCount || 1} folder(s), ${counts.uploaded} uploaded (${skippedCount} skipped), ${duplicateCount} duplicates`
      : `${isRescanOnly ? 'Rescanned' : 'Scanned'} ${outputImages.length} images in ${folderCount || 1} folder(s), ${duplicateCount} duplicates`;

  await completeJob(jobId, { status, statusMessage });

  const imagesWithIds = outputImages.map(img => ({
    ...img,
    id: generateImageId(img.hash, img.originalName, img.relativePath)
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
    newCount: isRescanOnly ? newImages.length : outputImages.filter(i => (i as any).isNew).length,
    folderCount
  };
}
