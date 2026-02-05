/**
 * Image Service
 * Handles CRUD operations for images in Firestore or in-memory storage
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

// Get all images for a project
export async function getProjectImages(
  projectId: string
): Promise<{ success: boolean; images?: ImageData[]; error?: string }> {
  const db = getDb();

  try {
    if (db) {
      const snapshot = await db.collection('projects')
        .doc(projectId)
        .collection('images')
        .get();
      
      const images = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ImageData[];
      
      return { success: true, images };
    } else {
      const images = getMemoryImages(projectId);
      return { success: true, images };
    }
  } catch (error: any) {
    console.error('❌ Get images error:', error.message);
    return { success: false, error: error.message };
  }
}

// Get a single image by ID
export async function getImage(
  projectId: string,
  imageId: string
): Promise<{ success: boolean; image?: ImageData; error?: string }> {
  const db = getDb();

  try {
    if (db) {
      const doc = await db.collection('projects')
        .doc(projectId)
        .collection('images')
        .doc(imageId)
        .get();
      
      if (!doc.exists) {
        return { success: false, error: 'Image not found' };
      }
      
      return { success: true, image: { id: doc.id, ...doc.data() } as ImageData };
    } else {
      const image = getMemoryImage(imageId);
      if (!image) {
        return { success: false, error: 'Image not found' };
      }
      return { success: true, image };
    }
  } catch (error: any) {
    console.error('❌ Get image error:', error.message);
    return { success: false, error: error.message };
  }
}

// Save a new image
export async function saveImage(
  projectId: string,
  imageData: Omit<ImageData, 'id'>
): Promise<{ success: boolean; image?: ImageData; error?: string }> {
  const db = getDb();
  const imageId = generateImageId(imageData.hash, imageData.originalName);

  try {
    const fullImageData: ImageData = {
      ...imageData,
      id: imageId,
      projectId
    };

    if (db) {
      // Remove undefined values for Firestore
      const cleanedData = prepareForFirestore(fullImageData);
      await db.collection('projects')
        .doc(projectId)
        .collection('images')
        .doc(imageId)
        .set(cleanedData);
    } else {
      inMemoryImages.set(imageId, fullImageData);
    }

    return { success: true, image: fullImageData };
  } catch (error: any) {
    console.error('❌ Save image error:', error.message);
    return { success: false, error: error.message };
  }
}

// Save multiple images in batch
export async function saveImages(
  projectId: string,
  images: Array<Omit<ImageData, 'id'>>
): Promise<{ success: boolean; saved: number; error?: string }> {
  const db = getDb();

  try {
    if (db) {
      const batch = db.batch();
      const imagesRef = db.collection('projects').doc(projectId).collection('images');
      
      for (const imageData of images) {
        const imageId = generateImageId(imageData.hash, imageData.originalName);
        const fullImageData: ImageData = { ...imageData, id: imageId, projectId };
        // Remove undefined values for Firestore (includes validation)
        const cleanedData = prepareForFirestore(fullImageData);
        batch.set(imagesRef.doc(imageId), cleanedData);
      }
      
      await batch.commit();
    } else {
      for (const imageData of images) {
        const imageId = generateImageId(imageData.hash, imageData.originalName);
        const fullImageData: ImageData = { ...imageData, id: imageId, projectId };
        inMemoryImages.set(imageId, fullImageData);
      }
    }

    return { success: true, saved: images.length };
  } catch (error: any) {
    console.error('❌ Save images error:', error.message);
    return { success: false, saved: 0, error: error.message };
  }
}

// Update an image
export async function updateImage(
  projectId: string,
  imageId: string,
  updates: Partial<ImageData>
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    if (db) {
      // Remove undefined values for Firestore
      const cleanedUpdates = prepareForFirestore(updates);
      await db.collection('projects')
        .doc(projectId)
        .collection('images')
        .doc(imageId)
        .update(cleanedUpdates);
    } else {
      const result = updateMemoryImage(imageId, updates);
      if (!result) {
        return { success: false, error: 'Image not found' };
      }
    }

    return { success: true };
  } catch (error: any) {
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
  const db = getDb();

  try {
    // Get image data first
    const imageResult = await getImage(projectId, imageId);
    
    if (db) {
      await db.collection('projects')
        .doc(projectId)
        .collection('images')
        .doc(imageId)
        .delete();
    } else {
      inMemoryImages.delete(imageId);
    }

    // Delete from cloud storage if requested
    if (deleteFromCloudStorage && imageResult.success && imageResult.image) {
      await deleteFromStorage(projectName, imageResult.image.currentName);
    }

    // Delete from disk if requested
    if (deleteFromDisk && imageResult.success && imageResult.image) {
      const fs = await import('fs/promises');
      try {
        await fs.unlink(imageResult.image.path);
      } catch {
        // File might not exist
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
  const db = getDb();

  try {
    if (db) {
      const imagesRef = db.collection('projects').doc(projectId).collection('images');
      const snapshot = await imagesRef.get();
      
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      
      return { success: true, deleted: snapshot.size };
    } else {
      const deleted = clearMemoryImages(projectId);
      return { success: true, deleted };
    }
  } catch (error: any) {
    console.error('❌ Clear images error:', error.message);
    return { success: false, deleted: 0, error: error.message };
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
      // Update image metadata with storage URL
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
