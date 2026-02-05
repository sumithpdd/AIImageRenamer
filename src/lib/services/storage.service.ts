/**
 * Firebase Storage Service
 * Handles image upload, download, and deletion in Firebase Storage
 */

import fs from 'fs/promises';
import path from 'path';
import { getBucket, isStorageConfigured } from '@/lib/firebase';

// Sanitize project name for storage path
function sanitizePathSegment(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);
}

// Generate storage path for an image
export function getStoragePath(projectName: string, filename: string): string {
  const sanitizedProject = sanitizePathSegment(projectName);
  return `projects/${sanitizedProject}/images/${filename}`;
}

// Check if an image exists in Firebase Storage
export async function imageExistsInStorage(
  projectName: string,
  filename: string
): Promise<{ exists: boolean; url?: string; storagePath?: string }> {
  if (!isStorageConfigured()) {
    return { exists: false };
  }

  const bucket = getBucket();
  if (!bucket) {
    return { exists: false };
  }

  try {
    const storagePath = getStoragePath(projectName, filename);
    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    
    if (exists) {
      const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
      return { exists: true, url, storagePath };
    }
    
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

// Upload a single image to Firebase Storage (skips if already exists)
export async function uploadImage(
  localPath: string,
  projectName: string,
  filename: string,
  skipIfExists = true
): Promise<{ success: boolean; url?: string; storagePath?: string; error?: string; skipped?: boolean }> {
  if (!isStorageConfigured()) {
    return { success: false, error: 'Firebase Storage not configured' };
  }

  const bucket = getBucket();
  if (!bucket) {
    return { success: false, error: 'Storage bucket not available' };
  }

  try {
    const storagePath = getStoragePath(projectName, filename);
    const file = bucket.file(storagePath);
    
    // Check if file already exists
    if (skipIfExists) {
      const [exists] = await file.exists();
      if (exists) {
        const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        console.log(`  ⏭️  Skipping ${filename} (already in Storage)`);
        return { success: true, url, storagePath, skipped: true };
      }
    }
    
    // Read local file
    const fileBuffer = await fs.readFile(localPath);
    
    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    
    // Upload to Firebase Storage
    await file.save(fileBuffer, {
      metadata: {
        contentType,
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalPath: localPath
        }
      }
    });
    
    // Make the file publicly readable
    await file.makePublic();
    
    // Get public URL
    const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
    
    return { success: true, url, storagePath, skipped: false };
  } catch (error: any) {
    console.error(`❌ Upload failed for ${filename}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Upload multiple images with progress callback
export async function uploadImages(
  images: Array<{ localPath: string; filename: string }>,
  projectName: string,
  onProgress?: (current: number, total: number, filename: string) => void
): Promise<{
  uploaded: number;
  failed: number;
  results: Array<{
    filename: string;
    success: boolean;
    url?: string;
    storagePath?: string;
    error?: string;
  }>;
}> {
  const results = [];
  let uploaded = 0;
  let failed = 0;

  for (let i = 0; i < images.length; i++) {
    const { localPath, filename } = images[i];
    
    if (onProgress) {
      onProgress(i + 1, images.length, filename);
    }
    
    const result = await uploadImage(localPath, projectName, filename);
    results.push({ filename, ...result });
    
    if (result.success) {
      uploaded++;
    } else {
      failed++;
    }
  }

  return { uploaded, failed, results };
}

// Delete a single image from Firebase Storage
export async function deleteImage(
  projectName: string,
  filename: string
): Promise<{ success: boolean; error?: string }> {
  if (!isStorageConfigured()) {
    return { success: false, error: 'Firebase Storage not configured' };
  }

  const bucket = getBucket();
  if (!bucket) {
    return { success: false, error: 'Storage bucket not available' };
  }

  try {
    const storagePath = getStoragePath(projectName, filename);
    const file = bucket.file(storagePath);
    
    const [exists] = await file.exists();
    if (!exists) {
      return { success: true }; // Already deleted
    }
    
    await file.delete();
    return { success: true };
  } catch (error: any) {
    console.error(`❌ Delete failed for ${filename}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Delete all images for a project
export async function deleteProjectImages(
  projectName: string
): Promise<{ success: boolean; deleted: number; error?: string }> {
  if (!isStorageConfigured()) {
    return { success: false, deleted: 0, error: 'Firebase Storage not configured' };
  }

  const bucket = getBucket();
  if (!bucket) {
    return { success: false, deleted: 0, error: 'Storage bucket not available' };
  }

  try {
    const prefix = `projects/${sanitizePathSegment(projectName)}/images/`;
    const [files] = await bucket.getFiles({ prefix });
    
    let deleted = 0;
    for (const file of files) {
      await file.delete();
      deleted++;
    }
    
    console.log(`🗑️ Deleted ${deleted} images for project: ${projectName}`);
    return { success: true, deleted };
  } catch (error: any) {
    console.error(`❌ Delete project images failed:`, error.message);
    return { success: false, deleted: 0, error: error.message };
  }
}

// Get signed URL for private access (if not using public URLs)
export async function getSignedUrl(
  projectName: string,
  filename: string,
  expiresInMinutes = 60
): Promise<{ success: boolean; url?: string; error?: string }> {
  if (!isStorageConfigured()) {
    return { success: false, error: 'Firebase Storage not configured' };
  }

  const bucket = getBucket();
  if (!bucket) {
    return { success: false, error: 'Storage bucket not available' };
  }

  try {
    const storagePath = getStoragePath(projectName, filename);
    const file = bucket.file(storagePath);
    
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + expiresInMinutes * 60 * 1000
    });
    
    return { success: true, url };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// List all images in a project
export async function listProjectImages(
  projectName: string
): Promise<{ success: boolean; files?: string[]; error?: string }> {
  if (!isStorageConfigured()) {
    return { success: false, error: 'Firebase Storage not configured' };
  }

  const bucket = getBucket();
  if (!bucket) {
    return { success: false, error: 'Storage bucket not available' };
  }

  try {
    const prefix = `projects/${sanitizePathSegment(projectName)}/images/`;
    const [files] = await bucket.getFiles({ prefix });
    
    const filenames = files.map(f => path.basename(f.name));
    return { success: true, files: filenames };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// Rename (move) an image in Firebase Storage
export async function renameImageInStorage(
  projectName: string,
  oldFilename: string,
  newFilename: string
): Promise<{ success: boolean; url?: string; storagePath?: string; error?: string }> {
  if (!isStorageConfigured()) {
    return { success: false, error: 'Firebase Storage not configured' };
  }

  const bucket = getBucket();
  if (!bucket) {
    return { success: false, error: 'Storage bucket not available' };
  }

  try {
    const oldPath = getStoragePath(projectName, oldFilename);
    const newPath = getStoragePath(projectName, newFilename);
    
    const oldFile = bucket.file(oldPath);
    const [exists] = await oldFile.exists();
    
    if (!exists) {
      // File doesn't exist in storage, just return success
      return { success: true };
    }
    
    // Copy to new location
    const newFile = bucket.file(newPath);
    await oldFile.copy(newFile);
    
    // Make new file public
    await newFile.makePublic();
    
    // Delete old file
    await oldFile.delete();
    
    // Get new URL
    const url = `https://storage.googleapis.com/${bucket.name}/${newPath}`;
    
    console.log(`📦 Storage renamed: ${oldFilename} → ${newFilename}`);
    return { success: true, url, storagePath: newPath };
  } catch (error: any) {
    console.error(`❌ Storage rename failed:`, error.message);
    return { success: false, error: error.message };
  }
}
