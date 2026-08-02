/**
 * Image Service
 * Handles CRUD operations for images in Firestore or in-memory storage.
 */

import { getDb } from '@/lib/firebase';
import {
  inMemoryImages,
  ImageData,
  generateImageId,
  getProjectImages as getMemoryImages,
  getImageById as getMemoryImage,
  updateImage as updateMemoryImage,
  clearProjectImages as clearMemoryImages
} from '@/lib/storage';
import { deleteImage as deleteFromStorage, uploadImage } from './storage.service';
import { prepareForFirestore } from '@/lib/utils/firestore.utils';
import {
  isQuotaError,
  isFirestoreQuotaCoolingDown,
  markFirestoreQuotaExceeded
} from '@/lib/utils/firestore-quota';

// Keep below Firestore's 500-operation batch limit.
const FIRESTORE_BATCH_SIZE = 400;

// Tracks projects whose complete image collection has been loaded this process.
const loadedProjectCaches = new Set<string>();

function cacheImage(image: ImageData): ImageData {
  inMemoryImages.set(image.id, image);
  return image;
}

function makeFullImage(
  projectId: string,
  imageData: Omit<ImageData, 'id'>
): ImageData {
  const id = generateImageId(
    imageData.hash,
    imageData.originalName,
    imageData.relativePath
  );
  return { ...imageData, id, projectId };
}

function noteQuota(error: unknown): boolean {
  if (!isQuotaError(error)) return false;
  markFirestoreQuotaExceeded(error);
  return true;
}

// Get all images for a project
export async function getProjectImages(
  projectId: string
): Promise<{ success: boolean; images?: ImageData[]; error?: string; quotaExceeded?: boolean }> {
  if (loadedProjectCaches.has(projectId)) {
    return { success: true, images: getMemoryImages(projectId) };
  }

  if (isFirestoreQuotaCoolingDown()) {
    return {
      success: true,
      images: getMemoryImages(projectId),
      quotaExceeded: true
    };
  }

  const db = getDb();
  if (!db) {
    loadedProjectCaches.add(projectId);
    return { success: true, images: getMemoryImages(projectId) };
  }

  try {
    const snapshot = await db.collection('projects')
      .doc(projectId)
      .collection('images')
      .get();

    // Warm the cache once so analyze/rename workers don't reread each document.
    clearMemoryImages(projectId);
    const images = snapshot.docs.map(doc => cacheImage({
      id: doc.id,
      ...doc.data()
    } as ImageData));
    loadedProjectCaches.add(projectId);

    return { success: true, images };
  } catch (error: any) {
    if (noteQuota(error)) {
      return {
        success: true,
        images: getMemoryImages(projectId),
        quotaExceeded: true
      };
    }
    console.error('❌ Get images error:', error.message);
    return { success: false, error: error.message };
  }
}

// Get a single image by ID
export async function getImage(
  projectId: string,
  imageId: string
): Promise<{ success: boolean; image?: ImageData; error?: string }> {
  // Workers repeatedly access images; always use the warmed cache first.
  const cached = getMemoryImage(imageId);
  if (cached?.projectId === projectId) {
    return { success: true, image: cached };
  }

  if (isFirestoreQuotaCoolingDown()) {
    return { success: false, error: 'Image not available in memory while Firestore quota is paused' };
  }

  const db = getDb();
  if (!db) return { success: false, error: 'Image not found' };

  try {
    const doc = await db.collection('projects')
      .doc(projectId)
      .collection('images')
      .doc(imageId)
      .get();

    if (!doc.exists) return { success: false, error: 'Image not found' };

    const image = cacheImage({ id: doc.id, ...doc.data() } as ImageData);
    return { success: true, image };
  } catch (error: any) {
    if (noteQuota(error)) {
      return { success: false, error: 'Firestore quota exceeded' };
    }
    console.error('❌ Get image error:', error.message);
    return { success: false, error: error.message };
  }
}

// Save a new image
export async function saveImage(
  projectId: string,
  imageData: Omit<ImageData, 'id'>
): Promise<{ success: boolean; image?: ImageData; error?: string }> {
  const fullImageData = cacheImage(makeFullImage(projectId, imageData));
  loadedProjectCaches.add(projectId);

  if (isFirestoreQuotaCoolingDown()) {
    return { success: true, image: fullImageData };
  }

  const db = getDb();
  if (!db) return { success: true, image: fullImageData };

  try {
    await db.collection('projects')
      .doc(projectId)
      .collection('images')
      .doc(fullImageData.id)
      .set(prepareForFirestore(fullImageData));
    return { success: true, image: fullImageData };
  } catch (error: any) {
    if (noteQuota(error)) return { success: true, image: fullImageData };
    console.error('❌ Save image error:', error.message);
    return { success: false, image: fullImageData, error: error.message };
  }
}

// Save multiple images in Firestore-safe chunks.
export async function saveImages(
  projectId: string,
  images: Array<Omit<ImageData, 'id'>>
): Promise<{ success: boolean; saved: number; error?: string }> {
  const fullImages = images.map(image => cacheImage(makeFullImage(projectId, image)));
  loadedProjectCaches.add(projectId);

  if (isFirestoreQuotaCoolingDown()) {
    return { success: true, saved: fullImages.length };
  }

  const db = getDb();
  if (!db) return { success: true, saved: fullImages.length };

  const imagesRef = db.collection('projects').doc(projectId).collection('images');
  let saved = 0;

  try {
    for (let start = 0; start < fullImages.length; start += FIRESTORE_BATCH_SIZE) {
      if (isFirestoreQuotaCoolingDown()) break;

      const chunk = fullImages.slice(start, start + FIRESTORE_BATCH_SIZE);
      const batch = db.batch();
      for (const image of chunk) {
        batch.set(imagesRef.doc(image.id), prepareForFirestore(image));
      }
      await batch.commit();
      saved += chunk.length;
    }

    // Memory contains every image even if quota interrupted persistence.
    return { success: true, saved: fullImages.length };
  } catch (error: any) {
    if (noteQuota(error)) {
      return { success: true, saved: fullImages.length };
    }
    console.error('❌ Save images error:', error.message);
    return { success: false, saved, error: error.message };
  }
}

// Update an image
export async function updateImage(
  projectId: string,
  imageId: string,
  updates: Partial<ImageData>
): Promise<{ success: boolean; error?: string }> {
  const cached = getMemoryImage(imageId);
  if (cached?.projectId === projectId) {
    updateMemoryImage(imageId, updates);
  }

  if (isFirestoreQuotaCoolingDown()) {
    return cached
      ? { success: true }
      : { success: false, error: 'Image not available in memory while Firestore quota is paused' };
  }

  const db = getDb();
  if (!db) {
    const result = cached || updateMemoryImage(imageId, updates);
    return result ? { success: true } : { success: false, error: 'Image not found' };
  }

  try {
    await db.collection('projects')
      .doc(projectId)
      .collection('images')
      .doc(imageId)
      .update(prepareForFirestore(updates));
    return { success: true };
  } catch (error: any) {
    if (noteQuota(error) && cached) return { success: true };
    console.error('❌ Update image error:', error.message);
    return { success: false, error: error.message };
  }
}

// Delete an image
export async function deleteImage(
  projectId: string,
  imageId: string,
  projectName: string,
  deleteFromDisk = false,
  deleteFromCloudStorage = true
): Promise<{ success: boolean; error?: string }> {
  try {
    const imageResult = await getImage(projectId, imageId);
    inMemoryImages.delete(imageId);

    const db = getDb();
    if (db && !isFirestoreQuotaCoolingDown()) {
      try {
        await db.collection('projects')
          .doc(projectId)
          .collection('images')
          .doc(imageId)
          .delete();
      } catch (error) {
        if (!noteQuota(error)) throw error;
      }
    }

    if (deleteFromCloudStorage && imageResult.success && imageResult.image) {
      await deleteFromStorage(
        projectName,
        imageResult.image.currentName
      );
    }

    if (deleteFromDisk && imageResult.success && imageResult.image) {
      const fs = await import('fs/promises');
      try {
        await fs.unlink(imageResult.image.path);
      } catch {
        // File might not exist.
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('❌ Delete image error:', error.message);
    return { success: false, error: error.message };
  }
}

// Clear all images for a project
export async function clearProjectImages(
  projectId: string
): Promise<{ success: boolean; deleted: number; error?: string }> {
  const hadCompleteCache = loadedProjectCaches.has(projectId);
  const cachedImages = hadCompleteCache ? getMemoryImages(projectId) : [];
  const memoryDeleted = clearMemoryImages(projectId);
  loadedProjectCaches.add(projectId);

  if (isFirestoreQuotaCoolingDown()) {
    return { success: true, deleted: memoryDeleted };
  }

  const db = getDb();
  if (!db) return { success: true, deleted: memoryDeleted };

  try {
    const imagesRef = db.collection('projects').doc(projectId).collection('images');
    const refs = hadCompleteCache
      ? cachedImages.map(image => imagesRef.doc(image.id))
      : (await imagesRef.get()).docs.map(doc => doc.ref);

    for (let start = 0; start < refs.length; start += FIRESTORE_BATCH_SIZE) {
      const batch = db.batch();
      for (const ref of refs.slice(start, start + FIRESTORE_BATCH_SIZE)) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    return { success: true, deleted: refs.length };
  } catch (error: any) {
    if (noteQuota(error)) return { success: true, deleted: memoryDeleted };
    console.error('❌ Clear images error:', error.message);
    return { success: false, deleted: memoryDeleted, error: error.message };
  }
}

// Upload image to cloud storage and update metadata
export async function uploadImageToCloud(
  projectId: string,
  imageId: string,
  projectName: string,
  localPath: string,
  filename: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const result = await uploadImage(localPath, projectName, filename);

    if (result.success && result.url) {
      await updateImage(projectId, imageId, {
        storageUrl: result.url,
        storagePath: result.storagePath
      } as Partial<ImageData>);
    }

    return result;
  } catch (error: any) {
    console.error('❌ Upload to cloud error:', error.message);
    return { success: false, error: error.message };
  }
}

export function clearImageServiceCache(projectId?: string): void {
  if (projectId) {
    clearMemoryImages(projectId);
    loadedProjectCaches.delete(projectId);
    return;
  }
  inMemoryImages.clear();
  loadedProjectCaches.clear();
}
