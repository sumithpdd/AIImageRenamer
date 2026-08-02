/**
 * Taxonomy Service
 * Central cache for tags, colors, categories, styles, and moods.
 */

import { getDb } from '@/lib/firebase';
import { prepareForFirestore } from '@/lib/utils/firestore.utils';
import {
  isQuotaError,
  isFirestoreQuotaCoolingDown,
  markFirestoreQuotaExceeded
} from '@/lib/utils/firestore-quota';

export type TaxonomyType = 'tag' | 'color' | 'category' | 'style' | 'mood';

export interface TaxonomyItem {
  id: string;
  type: TaxonomyType;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

const taxonomyCache = new Map<string, TaxonomyItem>();
const pendingLookups = new Map<string, Promise<TaxonomyItem | null>>();
let cacheLoaded = false;
let cacheLoadPromise: Promise<void> | null = null;

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function makeKey(type: TaxonomyType, name: string): string {
  return `${type}:${normalizeName(name).toLocaleLowerCase()}`;
}

function cacheItem(item: TaxonomyItem): TaxonomyItem {
  taxonomyCache.set(makeKey(item.type, item.name), item);
  return item;
}

function cachedItems(type?: TaxonomyType): TaxonomyItem[] {
  return Array.from(taxonomyCache.values())
    .filter(item => !type || item.type === type)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Load the taxonomy collection once per server process. Subsequent analysis
 * lookups use memory and do not issue one Firestore query per image tag.
 */
async function ensureTaxonomyCache(): Promise<void> {
  if (cacheLoaded || isFirestoreQuotaCoolingDown()) return;
  if (cacheLoadPromise) return cacheLoadPromise;

  const db = getDb();
  if (!db) {
    cacheLoaded = true;
    return;
  }

  cacheLoadPromise = (async () => {
    try {
      const snapshot = await db.collection('taxonomies').get();
      for (const doc of snapshot.docs) {
        cacheItem({ id: doc.id, ...(doc.data() as Omit<TaxonomyItem, 'id'>) });
      }
      cacheLoaded = true;
    } catch (error: any) {
      if (isQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
      } else {
        console.error('❌ Failed to warm taxonomy cache:', error.message);
      }
    } finally {
      cacheLoadPromise = null;
    }
  })();

  return cacheLoadPromise;
}

export async function listTaxonomies(
  type?: TaxonomyType
): Promise<{ success: boolean; items: TaxonomyItem[]; error?: string }> {
  try {
    await ensureTaxonomyCache();
    return { success: true, items: cachedItems(type) };
  } catch (error: any) {
    return { success: false, items: cachedItems(type), error: error.message };
  }
}

async function resolveOrCreateTaxonomy(
  type: TaxonomyType,
  name: string
): Promise<TaxonomyItem | null> {
  await ensureTaxonomyCache();

  const normalized = normalizeName(name);
  const key = makeKey(type, normalized);
  const cached = taxonomyCache.get(key);
  if (cached) return cached;

  const now = new Date().toISOString();
  const memoryItem: TaxonomyItem = {
    id: key,
    type,
    name: normalized,
    createdAt: now,
    updatedAt: now
  };

  const db = getDb();
  if (!db || isFirestoreQuotaCoolingDown()) {
    return cacheItem(memoryItem);
  }

  try {
    // The one-time cache load means this is reached only for genuinely new values.
    const data = prepareForFirestore({
      type,
      name: normalized,
      normalizedName: normalized.toLocaleLowerCase(),
      createdAt: now,
      updatedAt: now
    });
    const docRef = await db.collection('taxonomies').add(data);
    return cacheItem({ id: docRef.id, ...(data as Omit<TaxonomyItem, 'id'>) });
  } catch (error: any) {
    if (isQuotaError(error)) {
      markFirestoreQuotaExceeded(error);
      return cacheItem(memoryItem);
    }
    console.error('❌ getOrCreateTaxonomy error:', error.message);
    return null;
  }
}

export async function getOrCreateTaxonomy(
  type: TaxonomyType,
  name: string
): Promise<TaxonomyItem | null> {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  const key = makeKey(type, normalized);
  const cached = taxonomyCache.get(key);
  if (cached) return cached;

  // Concurrent image workers requesting the same new tag share one operation.
  const pending = pendingLookups.get(key);
  if (pending) return pending;

  const operation = resolveOrCreateTaxonomy(type, normalized)
    .finally(() => pendingLookups.delete(key));
  pendingLookups.set(key, operation);
  return operation;
}

export async function createTaxonomy(
  type: TaxonomyType,
  name: string,
  description?: string
): Promise<{ success: boolean; item?: TaxonomyItem; error?: string }> {
  const normalized = normalizeName(name);
  if (!normalized) return { success: false, error: 'Name is required' };

  const item = await getOrCreateTaxonomy(type, normalized);
  if (!item) return { success: false, error: 'Failed to create taxonomy' };

  if (description && item.description !== description) {
    const result = await updateTaxonomy(item.id, { description });
    if (!result.success) return { success: false, item, error: result.error };
    item.description = description;
  }

  return { success: true, item };
}

export async function updateTaxonomy(
  id: string,
  updates: Partial<Pick<TaxonomyItem, 'name' | 'description'>>
): Promise<{ success: boolean; error?: string }> {
  await ensureTaxonomyCache();
  const existing = Array.from(taxonomyCache.values()).find(item => item.id === id);
  const now = new Date().toISOString();
  const normalizedUpdates = {
    ...updates,
    ...(updates.name ? { name: normalizeName(updates.name) } : {}),
    updatedAt: now
  };

  const db = getDb();
  if (db && !isFirestoreQuotaCoolingDown()) {
    try {
      await db.collection('taxonomies').doc(id).update(
        prepareForFirestore(normalizedUpdates)
      );
    } catch (error: any) {
      if (isQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
      } else {
        return { success: false, error: error.message };
      }
    }
  }

  if (!existing) return { success: false, error: 'Item not found' };

  taxonomyCache.delete(makeKey(existing.type, existing.name));
  Object.assign(existing, normalizedUpdates);
  cacheItem(existing);
  return { success: true };
}

export async function deleteTaxonomy(
  id: string
): Promise<{ success: boolean; error?: string }> {
  await ensureTaxonomyCache();
  const existing = Array.from(taxonomyCache.values()).find(item => item.id === id);
  const db = getDb();

  if (db && !isFirestoreQuotaCoolingDown()) {
    try {
      await db.collection('taxonomies').doc(id).delete();
    } catch (error: any) {
      if (isQuotaError(error)) {
        markFirestoreQuotaExceeded(error);
      } else {
        return { success: false, error: error.message };
      }
    }
  }

  if (existing) taxonomyCache.delete(makeKey(existing.type, existing.name));
  return { success: true };
}

/** Useful for tests and explicit cache refreshes. */
export function clearTaxonomyCache(): void {
  taxonomyCache.clear();
  pendingLookups.clear();
  cacheLoaded = false;
  cacheLoadPromise = null;
}
