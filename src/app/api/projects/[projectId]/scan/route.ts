import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { initFirebase, isStorageConfigured } from '@/lib/firebase';
import { ImageData, generateImageId } from '@/lib/storage';
import { SUPPORTED_EXTENSIONS, generateCleanName } from '@/lib/helpers';
import { createJob, startJob, updateJobProgress, completeJob } from '@/lib/jobs';
import { getImageDimensions, calculateImageMetadata } from '@/lib/utils/image.utils';
import { getProject, updateProject } from '@/lib/services/project.service';
import { saveImages, clearProjectImages, getProjectImages } from '@/lib/services/image.service';
import { uploadImage } from '@/lib/services/storage.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  console.log('🔍 Starting folder scan...');
  
  let job = null;
  
  try {
    await initFirebase();
    const { projectId } = params;
    
    // Get project using service
    const projectResult = await getProject(projectId);
    if (!projectResult.success || !projectResult.project) {
      return NextResponse.json({ error: projectResult.error || 'Project not found' }, { status: 404 });
    }
    
    const project = projectResult.project;
    const folderPath = project.folderPath;
    const projectName = project.name;
    
    console.log(`📁 Scanning folder: ${folderPath}`);
    console.log(`📦 Project: ${projectName}`);
    
    // Check if Storage is configured
    const useCloudStorage = isStorageConfigured();
    console.log(`☁️  Cloud Storage: ${useCloudStorage ? 'Enabled' : 'Disabled'}`);
    
    // Get file list
    let files: string[];
    try {
      files = await fs.readdir(folderPath);
      files = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return SUPPORTED_EXTENSIONS.includes(ext);
      });
    } catch (err: any) {
      console.error(`❌ Cannot read folder: ${err.message}`);
      return NextResponse.json({ error: `Cannot read folder: ${err.message}` }, { status: 400 });
    }
    
    // Create job
    job = await createJob({
      projectId,
      projectName,
      type: 'scan',
      totalItems: files.length,
      config: { uploadToCloud: useCloudStorage }
    });
    await startJob(job.id);
    
    // Load existing images so we can preserve AI analysis/rename info on rescan
    const existingResult = await getProjectImages(projectId);
    const existingImages = existingResult.success && existingResult.images ? existingResult.images : [];

    // Index existing images by hash for quick lookup
    const existingByHash = new Map<string, any[]>();
    for (const img of existingImages) {
      if (!img.hash) continue;
      if (!existingByHash.has(img.hash)) existingByHash.set(img.hash, []);
      existingByHash.get(img.hash)!.push(img);
    }

    // Clear existing images for this project - we'll recreate them,
    // but copy over any AI analysis/rename metadata from existingImages.
    await clearProjectImages(projectId);
    
    const images: Omit<ImageData, 'id'>[] = [];
    const duplicateHashes = new Map<string, string[]>();
    let uploadedCount = 0;
    let processedCount = 0;

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      const filePath = path.join(folderPath, file);
      
      // Update job progress
      await updateJobProgress(job.id, {
        processedItems: processedCount,
        statusMessage: `Scanning: ${file}`,
        currentTarget: { name: file, status: 'running' }
      });
      
      console.log(`  📷 [${processedCount + 1}/${files.length}] ${file}`);
      
      try {
        const stats = await fs.stat(filePath);
        const fileBuffer = await fs.readFile(filePath);
        const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        
        // Extract dimensions and calculate metadata
        const dimensions = getImageDimensions(fileBuffer, ext);
        const fileMetadata = calculateImageMetadata(stats.size, dimensions);
        
        // Track duplicates
        if (duplicateHashes.has(hash)) {
          duplicateHashes.get(hash)!.push(file);
        } else {
          duplicateHashes.set(hash, [file]);
        }
        
        // Upload to Firebase Storage if configured (skip if already exists)
        let storageUrl: string | undefined;
        let storagePath: string | undefined;
        let wasSkipped = false;
        
        if (useCloudStorage) {
          const uploadResult = await uploadImage(filePath, projectName, file, true); // skipIfExists = true
          if (uploadResult.success) {
            storageUrl = uploadResult.url;
            storagePath = uploadResult.storagePath;
            if (uploadResult.skipped) {
              wasSkipped = true;
              console.log(`    ⏭️  Already in Storage`);
            } else {
              uploadedCount++;
              console.log(`    ☁️ Uploaded to Storage`);
            }
          } else {
            console.log(`    ⚠️ Upload failed: ${uploadResult.error}`);
          }
        }

        // Build metadata without undefined values (Firestore doesn't allow undefined)
        // Only include fields that have actual values - AI fields will be added during analysis
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
        
        // Only add resolution if we have dimensions
        if (fileMetadata.resolution) {
          metadata.resolution = fileMetadata.resolution;
        }
        
        // Only add colorspace if we have it
        if (fileMetadata.colorspace) {
          metadata.colorspace = fileMetadata.colorspace;
        }

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
          scannedAt: new Date().toISOString(),
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

        // If this file matches an existing image (by hash), preserve AI fields
        const existingList = existingByHash.get(hash) || [];
        if (existingList.length > 0) {
          // Prefer an existing entry that matches by path or filename
          const existing =
            existingList.find(img => img.path === filePath) ||
            existingList.find(img => img.currentName === file || img.originalName === file) ||
            existingList[0];

          if (existing) {
            imageData = {
              ...imageData,
              // Preserve analysis/rename-related fields
              aiDescription: existing.aiDescription ?? imageData.aiDescription,
              suggestedName: existing.suggestedName ?? imageData.suggestedName,
              patternCleanName: existing.patternCleanName ?? imageData.patternCleanName,
              status: existing.status ?? imageData.status,
              analyzedAt: existing.analyzedAt ?? imageData.scannedAt,
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

        images.push(imageData);
        
        await updateJobProgress(job.id, {
          successCount: images.length,
          currentTarget: {
            name: file,
            status: 'completed',
            data: { 
              size: stats.size, 
              dimensions, 
              uploaded: !!storageUrl && !wasSkipped,
              skipped: wasSkipped
            }
          }
        });
        
      } catch (err: any) {
        console.error(`  ❌ Error: ${err.message}`);
        await updateJobProgress(job.id, {
          errorCount: (job.errorCount || 0) + 1,
          currentTarget: { name: file, status: 'failed', error: err.message }
        });
      }
      
      processedCount++;
    }

    // Mark duplicates
    let duplicateCount = 0;
    for (const [hash, fileNames] of Array.from(duplicateHashes.entries())) {
      if (fileNames.length > 1) {
        duplicateCount += fileNames.length;
        images.forEach(img => {
          if (img.hash === hash) {
            img.isDuplicate = true;
            img.duplicateOf = fileNames.filter((f: string) => f !== img.originalName);
          }
        });
      }
    }

    const skippedCount = images.length - uploadedCount;
    console.log(`📊 Found ${images.length} images, ${duplicateCount} duplicates`);
    if (useCloudStorage) {
      console.log(`☁️ Storage: ${uploadedCount} uploaded, ${skippedCount} already existed`);
    }

    // Save all images using service
    await saveImages(projectId, images);

    // Recompute project stats from images (preserving analysis/rename counts)
    const analyzedCount = images.filter(img => !!img.suggestedName).length;
    const renamedCount = images.filter(img => !!img.renamed).length;

    // Update project stats
    await updateProject(projectId, {
      imageCount: images.length,
      analyzedCount,
      renamedCount,
      status: 'scanned'
    });
    
    console.log('💾 Saved to database');

    // Complete the job
    await completeJob(job.id, {
      status: 'completed',
      statusMessage: useCloudStorage 
        ? `Scanned ${images.length} images, ${uploadedCount} uploaded (${skippedCount} skipped), ${duplicateCount} duplicates`
        : `Scanned ${images.length} images, ${duplicateCount} duplicates`
    });

    // Add IDs to response
    const imagesWithIds = images.map(img => ({
      ...img,
      id: generateImageId(img.hash, img.originalName)
    }));

    return NextResponse.json({ 
      success: true, 
      jobId: job.id,
      imageCount: images.length,
      duplicateCount,
      uploadedCount: useCloudStorage ? uploadedCount : undefined,
      skippedCount: useCloudStorage ? skippedCount : undefined,
      images: imagesWithIds
    });
    
  } catch (error: any) {
    console.error('❌ Scan error:', error);
    
    if (job) {
      await completeJob(job.id, {
        status: 'failed',
        statusMessage: `Scan failed: ${error.message}`
      });
    }
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
