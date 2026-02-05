/**
 * Firestore Utilities
 * Helper functions for working with Firestore
 */

/**
 * Deep check for undefined values in an object
 */
function hasUndefinedValue(obj: any, path = ''): string | null {
  if (obj === undefined) {
    return path || 'root';
  }
  
  if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof Buffer) {
    return null;
  }
  
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = hasUndefinedValue(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
    return null;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (value === undefined) {
      return currentPath;
    }
    const nested = hasUndefinedValue(value, currentPath);
    if (nested) return nested;
  }
  
  return null;
}

/**
 * Removes undefined values from an object recursively
 * Firestore doesn't allow undefined values
 */
export function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  // Handle null, undefined, or non-objects
  if (obj === null || obj === undefined) {
    return obj as any;
  }
  
  if (typeof obj !== 'object') {
    return obj as any;
  }
  
  // Handle Date, Buffer, and other special objects
  if (obj instanceof Date || obj instanceof Buffer || obj instanceof Uint8Array) {
    return obj as any;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => 
      typeof item === 'object' && item !== null && !(item instanceof Date)
        ? removeUndefined(item as any)
        : item
    ) as any;
  }
  
  const cleaned: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip undefined values
    if (value === undefined) {
      continue;
    }
    
    // Keep null values
    if (value === null) {
      cleaned[key] = null;
      continue;
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      cleaned[key] = value.map(item => 
        typeof item === 'object' && item !== null && !(item instanceof Date)
          ? removeUndefined(item as any)
          : item
      );
      continue;
    }
    
    // Handle nested objects (but not special objects like Date, Buffer)
    if (typeof value === 'object' && !(value instanceof Date) && !(value instanceof Buffer) && !(value instanceof Uint8Array)) {
      const cleanedNested = removeUndefined(value as any);
      // Only include if the cleaned object has at least one property
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      }
      continue;
    }
    
    // Primitive values
    cleaned[key] = value;
  }
  
  return cleaned;
}

/**
 * Prepares data for Firestore by removing undefined values
 * Throws error if undefined values are still found (for debugging)
 */
export function prepareForFirestore<T extends Record<string, any>>(data: T): Partial<T> {
  if (!data || typeof data !== 'object') {
    return data as any;
  }
  
  const cleaned = removeUndefined(data);
  
  // Debug check - log if undefined still exists
  const undefinedPath = hasUndefinedValue(cleaned);
  if (undefinedPath) {
    console.error(`⚠️  Warning: Undefined value found at path: ${undefinedPath}`);
    console.error('   Data sample:', JSON.stringify(cleaned, null, 2).substring(0, 200));
  }
  
  return cleaned;
}
