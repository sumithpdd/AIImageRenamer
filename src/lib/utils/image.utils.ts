/**
 * Image Utilities
 * Helper functions for image processing and metadata extraction
 */

// Extract image dimensions from buffer
export function getImageDimensions(
  buffer: Buffer, 
  ext: string
): { width: number; height: number } | null {
  try {
    if (ext === '.png') {
      if (buffer.length > 24 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height };
      }
    } else if (ext === '.jpg' || ext === '.jpeg') {
      let i = 2;
      while (i < buffer.length - 9) {
        if (buffer[i] === 0xFF) {
          const marker = buffer[i + 1];
          if (marker === 0xC0 || marker === 0xC2) {
            const height = buffer.readUInt16BE(i + 5);
            const width = buffer.readUInt16BE(i + 7);
            return { width, height };
          }
          if (marker === 0xD8 || marker === 0xD9) {
            i += 2;
          } else {
            const length = buffer.readUInt16BE(i + 2);
            i += 2 + length;
          }
        } else {
          i++;
        }
      }
    } else if (ext === '.gif') {
      if (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'GIF') {
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        return { width, height };
      }
    } else if (ext === '.webp') {
      if (buffer.length > 30 && buffer.toString('ascii', 0, 4) === 'RIFF') {
        const vp8Index = buffer.indexOf('VP8 ');
        if (vp8Index > 0 && buffer.length > vp8Index + 14) {
          const width = buffer.readUInt16LE(vp8Index + 10) & 0x3fff;
          const height = buffer.readUInt16LE(vp8Index + 12) & 0x3fff;
          if (width > 0 && height > 0) {
            return { width, height };
          }
        }
      }
    } else if (ext === '.bmp') {
      if (buffer.length > 26 && buffer.toString('ascii', 0, 2) === 'BM') {
        const width = buffer.readUInt32LE(18);
        const height = Math.abs(buffer.readInt32LE(22));
        return { width, height };
      }
    }
  } catch {
    // Dimension extraction failed
  }
  return null;
}

// Calculate image metadata from file stats and dimensions
export function calculateImageMetadata(
  size: number,
  dimensions: { width: number; height: number } | null
) {
  const width = dimensions?.width || 0;
  const height = dimensions?.height || 0;
  const megapixels = width && height 
    ? parseFloat(((width * height) / 1000000).toFixed(2)) 
    : 0;
  
  return {
    width,
    height,
    resolution: width && height ? `${width}x${height}` : undefined,
    megapixels,
    colorspace: 'RGB',
    filesizeKB: parseFloat((size / 1024).toFixed(2)),
    filesizeMB: parseFloat((size / (1024 * 1024)).toFixed(3))
  };
}

// Get MIME type from extension
export function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml'
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
