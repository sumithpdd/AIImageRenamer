/**
 * Taxonomy Service
 * Central place to manage tags, colors, categories, styles, and moods.
 * 
 * Physically stored in a single `taxonomies` collection with a `type` field,
 * but conceptually this gives you one place per "collection" in the UI.
 */

import { getDb } from '@/lib/firebase';
import { prepareForFirestore } from '@/lib/utils/firestore.utils';

export type TaxonomyType = 'tag' | 'color' | 'category' | 'style' | 'mood';

export interface TaxonomyItem {
  id: string;
  type: TaxonomyType;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory fallback when Firestore is not configured
const inMemoryTaxonomies = new Map<string, TaxonomyItem>();

function makeKey(type: TaxonomyType, name: string): string {
  return `${type}:${name.toLowerCase()}`;
}

export async function listTaxonomies(
  type?: TaxonomyType
): Promise<{ success: boolean; items: TaxonomyItem[]; error?: string }> {
  const db = getDb();

  try {
    if (db) {
      let query = db.collection('taxonomies') as FirebaseFirestore.Query;
      if (type) {
        query = query.where('type', '==', type);
      }
      const snapshot = await query.orderBy('name').get();
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      })) as TaxonomyItem[];
      return { success: true, items };
    }

    const items: TaxonomyItem[] = [];
    for (const item of inMemoryTaxonomies.values()) {
      if (!type || item.type === type) {
        items.push(item);
      }
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { success: true, items };
  } catch (error: any) {
    console.error('❌ listTaxonomies error:', error.message);
    return { success: false, items: [], error: error.message };
  }
}

export async function getOrCreateTaxonomy(
  type: TaxonomyType,
  name: string
): Promise<TaxonomyItem | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const db = getDb();

  try {
    if (db) {
      const col = db.collection('taxonomies');
      const existingSnap = await col
        .where('type', '==', type)
        .where('name', '==', trimmed)
        .limit(1)
        .get();

      if (!existingSnap.empty) {
        const doc = existingSnap.docs[0];
        return { id: doc.id, ...(doc.data() as any) } as TaxonomyItem;
      }

      const now = new Date().toISOString();
      const data = prepareForFirestore({
        type,
        name: trimmed,
        createdAt: now,
        updatedAt: now
      });
      const docRef = await col.add(data);
      return {
        id: docRef.id,
        ...(data as any)
      } as TaxonomyItem;
    }

    // In-memory mode
    const key = makeKey(type, trimmed);
    const existing = inMemoryTaxonomies.get(key);
    if (existing) return existing;

    const now = new Date().toISOString();
    const item: TaxonomyItem = {
      id: key,
      type,
      name: trimmed,
      createdAt: now,
      updatedAt: now
    };
    inMemoryTaxonomies.set(key, item);
    return item;
  } catch (error: any) {
    console.error('❌ getOrCreateTaxonomy error:', error.message);
    return null;
  }
}

export async function createTaxonomy(
  type: TaxonomyType,
  name: string,
  description?: string
): Promise<{ success: boolean; item?: TaxonomyItem; error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { success: false, error: 'Name is required' };
  }

  const db = getDb();

  try {
    if (db) {
      const col = db.collection('taxonomies');
      const now = new Date().toISOString();
      const data = prepareForFirestore({
        type,
        name: trimmed,
        description: description || null,
        createdAt: now,
        updatedAt: now
      });
      const docRef = await col.add(data);
      const item: TaxonomyItem = {
        id: docRef.id,
        ...(data as any)
      };
      return { success: true, item };
    }

    const key = makeKey(type, trimmed);
    const now = new Date().toISOString();
    const item: TaxonomyItem = {
      id: key,
      type,
      name: trimmed,
      description,
      createdAt: now,
      updatedAt: now
    };
    inMemoryTaxonomies.set(key, item);
    return { success: true, item };
  } catch (error: any) {
    console.error('❌ createTaxonomy error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function updateTaxonomy(
  id: string,
  updates: Partial<Pick<TaxonomyItem, 'name' | 'description'>>
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    if (db) {
      const ref = db.collection('taxonomies').doc(id);
      const now = new Date().toISOString();
      const data = prepareForFirestore({
        ...updates,
        updatedAt: now
      });
      await ref.update(data);
      return { success: true };
    }

    // In-memory
    const item = Array.from(inMemoryTaxonomies.values()).find(t => t.id === id);
    if (!item) {
      return { success: false, error: 'Item not found' };
    }
    Object.assign(item, updates, { updatedAt: new Date().toISOString() });
    return { success: true };
  } catch (error: any) {
    console.error('❌ updateTaxonomy error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function deleteTaxonomy(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    if (db) {
      await db.collection('taxonomies').doc(id).delete();
      return { success: true };
    }

    // In-memory
    for (const [key, item] of inMemoryTaxonomies.entries()) {
      if (item.id === id) {
        inMemoryTaxonomies.delete(key);
        break;
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('❌ deleteTaxonomy error:', error.message);
    return { success: false, error: error.message };
  }
}

