import fs from 'fs/promises';
import path from 'path';
import { SUPPORTED_EXTENSIONS } from '@/lib/helpers';

export interface MediaFileEntry {
  /** Absolute path to the file */
  absolutePath: string;
  /** Filename only, e.g. Screenshot.png */
  fileName: string;
  /** Path relative to the scan root, using OS separators */
  relativePath: string;
  /** Relative directory ('' for root-level files) */
  relativeDir: string;
}

/**
 * Recursively collect supported media files under a root folder.
 * Skips hidden directories (names starting with '.') and common junk folders.
 */
export async function collectMediaFilesRecursive(
  rootFolder: string
): Promise<MediaFileEntry[]> {
  const results: MediaFileEntry[] = [];
  const skipDirs = new Set(['node_modules', '.git', '.Trash', '$RECYCLE.BIN', 'System Volume Information']);

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const name = entry.name;
      if (name.startsWith('.')) continue;

      const absolutePath = path.join(currentDir, name);

      if (entry.isDirectory()) {
        if (skipDirs.has(name)) continue;
        await walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;

      const relativePath = path.relative(rootFolder, absolutePath);
      const relativeDir = path.dirname(relativePath);
      results.push({
        absolutePath,
        fileName: name,
        relativePath,
        relativeDir: relativeDir === '.' ? '' : relativeDir
      });
    }
  }

  await walk(rootFolder);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}
