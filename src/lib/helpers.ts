import path from 'path';

export const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

export const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp'
};

// Remove common prefixes like imgi_65_, IMG_, DSC_, etc.
const PREFIX_PATTERNS = [
  /^imgi?_?\d+_?/i,
  /^img_?\d+_?/i,
  /^dsc_?\d+_?/i,
  /^photo_?\d+_?/i,
  /^image_?\d+_?/i,
  /^pic_?\d+_?/i,
  /^screenshot_?\d+_?/i,
  /^\d{4}-\d{2}-\d{2}_?/,
  /^\d{8}_?\d*_?/,
];

export function generateCleanName(originalName: string, aiSuggestion: string | null): string | null {
  let cleanName = originalName;
  const ext = path.extname(originalName);
  const nameWithoutExt = path.basename(originalName, ext);

  // Apply prefix removal
  for (const pattern of PREFIX_PATTERNS) {
    cleanName = nameWithoutExt.replace(pattern, '');
  }

  // If AI suggestion is provided, use it
  if (aiSuggestion) {
    return aiSuggestion.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);
  }

  // If name is too short after cleanup, return null to trigger AI analysis
  if (cleanName.length < 3 || cleanName === nameWithoutExt) {
    return null;
  }

  return cleanName.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 50);
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}
