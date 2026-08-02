/**
 * Tagging Service
 * Add / remove / set tags on images while keeping taxonomy IDs in sync.
 */

import { getImage, updateImage } from './image.service';
import { getOrCreateTaxonomy } from './taxonomy.service';

function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function uniquePreserveCase(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = normalizeTagName(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

async function resolveTagNames(names: string[]): Promise<{ tags: string[]; tagIds: string[] }> {
  const unique = uniquePreserveCase(names);
  const items = await Promise.all(unique.map(name => getOrCreateTaxonomy('tag', name)));
  const tags: string[] = [];
  const tagIds: string[] = [];
  for (let i = 0; i < unique.length; i++) {
    const item = items[i];
    if (!item) continue;
    tags.push(item.name);
    tagIds.push(item.id);
  }
  return { tags, tagIds };
}

export async function setImageTags(
  projectId: string,
  imageId: string,
  tagNames: string[]
): Promise<{ success: boolean; tags?: string[]; tagIds?: string[]; error?: string }> {
  const imageResult = await getImage(projectId, imageId);
  if (!imageResult.success || !imageResult.image) {
    return { success: false, error: imageResult.error || 'Image not found' };
  }

  const { tags, tagIds } = await resolveTagNames(tagNames);
  const metadata = {
    ...(imageResult.image.metadata || {}),
    tags,
    tagIds
  };

  const updateResult = await updateImage(projectId, imageId, { metadata });
  if (!updateResult.success) {
    return { success: false, error: updateResult.error };
  }

  return { success: true, tags, tagIds };
}

export async function updateImageTags(
  projectId: string,
  imageId: string,
  ops: { add?: string[]; remove?: string[]; set?: string[] }
): Promise<{ success: boolean; tags?: string[]; tagIds?: string[]; error?: string }> {
  if (ops.set) {
    return setImageTags(projectId, imageId, ops.set);
  }

  const imageResult = await getImage(projectId, imageId);
  if (!imageResult.success || !imageResult.image) {
    return { success: false, error: imageResult.error || 'Image not found' };
  }

  const current = uniquePreserveCase(imageResult.image.metadata?.tags || []);
  const removeSet = new Set(
    (ops.remove || []).map(normalizeTagName).filter(Boolean).map(t => t.toLowerCase())
  );

  let next = current.filter(t => !removeSet.has(t.toLowerCase()));
  if (ops.add?.length) {
    next = uniquePreserveCase([...next, ...ops.add]);
  }

  return setImageTags(projectId, imageId, next);
}

export async function batchUpdateImageTags(
  projectId: string,
  imageIds: string[],
  ops: { add?: string[]; remove?: string[] }
): Promise<{
  success: boolean;
  updated: number;
  failed: number;
  results: Array<{ imageId: string; success: boolean; tags?: string[]; error?: string }>;
}> {
  const results: Array<{ imageId: string; success: boolean; tags?: string[]; error?: string }> = [];
  let updated = 0;
  let failed = 0;

  for (const imageId of imageIds) {
    const result = await updateImageTags(projectId, imageId, ops);
    if (result.success) {
      updated++;
      results.push({ imageId, success: true, tags: result.tags });
    } else {
      failed++;
      results.push({ imageId, success: false, error: result.error });
    }
  }

  return { success: failed === 0, updated, failed, results };
}
