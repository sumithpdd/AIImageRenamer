/**
 * Service Layer Exports
 * Centralized exports for all service modules
 */

// Project operations
export {
  createProject,
  getProjects,
  getProject,
  updateProject,
  updateProjectStats,
  deleteProject
} from './project.service';

// Image operations
export {
  getProjectImages,
  getImage,
  saveImage,
  saveImages,
  updateImage,
  deleteImage,
  clearProjectImages,
  uploadImageToCloud
} from './image.service';

// Taxonomy operations (tags, colors, categories, styles, moods)
export {
  listTaxonomies,
  getOrCreateTaxonomy,
  createTaxonomy,
  updateTaxonomy,
  deleteTaxonomy
} from './taxonomy.service';

// Storage operations
export {
  uploadImage,
  uploadImages,
  deleteImage as deleteImageFromStorage,
  deleteProjectImages as deleteProjectImagesFromStorage,
  getSignedUrl,
  listProjectImages,
  getStoragePath,
  renameImageInStorage,
  imageExistsInStorage
} from './storage.service';
