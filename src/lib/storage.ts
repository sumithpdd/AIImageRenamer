// In-memory storage fallback when Firebase is not configured

export interface Project {
  id?: string;
  name: string;
  folderPath: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
  analyzedCount: number;
  renamedCount: number;
  status: string;
}

export interface ImageMetadata {
  // File properties
  width?: number;
  height?: number;
  resolution?: string;
  colorspace?: string;
  megapixels?: number;
  filesizeKB?: number;
  filesizeMB?: number;
  
  // AI Analysis
  title?: string;
  description?: string;
  tags?: string[];
  colors?: string[];
  objects?: string[];
  style?: string;
  mood?: string;

  // Taxonomy references (IDs into the central taxonomy collection)
  tagIds?: string[];
  colorIds?: string[];
  categoryId?: string;
  styleId?: string;
  moodId?: string;
  
  // Content classification
  category?: string;
  subcategory?: string;
  
  // Processing info
  analysisError?: string;
  analysisModel?: string;
  confidence?: number;
}

export interface ImageData {
  id: string;
  projectId: string;
  originalName: string;
  currentName: string;
  path: string;
  size: number;
  hash: string;
  extension: string;
  createdAt: string;
  modifiedAt: string;
  scannedAt: string;
  status: string;
  aiDescription: string | null;
  suggestedName: string | null;
  patternCleanName: string | null;
  isDuplicate: boolean;
  duplicateOf: string[] | null;
  renamed: boolean;
  analyzedAt?: string;
  renamedAt?: string;
  
  // Firebase Storage
  storageUrl?: string;
  storagePath?: string;
  
  // Enhanced metadata
  metadata?: ImageMetadata;
}

export const inMemoryProjects = new Map<string, Project>();
export const inMemoryImages = new Map<string, ImageData>();

// Helper to generate consistent image ID
export function generateImageId(hash: string, originalName: string): string {
  return `${hash.substring(0, 8)}_${originalName.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 50)}`;
}

// Helper to get images for a project
export function getProjectImages(projectId: string): ImageData[] {
  const images: ImageData[] = [];
  for (const img of inMemoryImages.values()) {
    if (img.projectId === projectId) {
      images.push(img);
    }
  }
  return images;
}

// Helper to get image by ID
export function getImageById(imageId: string): ImageData | undefined {
  return inMemoryImages.get(imageId);
}

// Helper to update image
export function updateImage(imageId: string, updates: Partial<ImageData>): ImageData | null {
  const image = inMemoryImages.get(imageId);
  if (!image) return null;
  Object.assign(image, updates);
  return image;
}

// Helper to delete images for a project
export function clearProjectImages(projectId: string): number {
  let count = 0;
  for (const [key, img] of inMemoryImages) {
    if (img.projectId === projectId) {
      inMemoryImages.delete(key);
      count++;
    }
  }
  return count;
}
