/**
 * Utility Exports
 */

export {
  getImageDimensions,
  calculateImageMetadata,
  getMimeType,
  formatFileSize
} from './image.utils';

export {
  removeUndefined,
  prepareForFirestore
} from './firestore.utils';

export {
  collectMediaFilesRecursive
} from './fs.utils';
export type { MediaFileEntry } from './fs.utils';

export {
  isQuotaError,
  isFirestoreQuotaCoolingDown,
  markFirestoreQuotaExceeded,
  clearFirestoreQuotaCooldown
} from './firestore-quota';
