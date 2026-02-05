import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

let db: admin.firestore.Firestore | null = null;
let storage: admin.storage.Storage | null = null;
let bucket: ReturnType<admin.storage.Storage['bucket']> | null = null;
let initialized = false;

const STORAGE_BUCKET = 'aiimagerenamer.firebasestorage.app';

export async function initFirebase() {
  if (initialized) return { db, storage, bucket };
  
  try {
    // Check for service account file
    const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
    let serviceAccount = null;
    
    try {
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccountData = fs.readFileSync(serviceAccountPath, 'utf8');
        serviceAccount = JSON.parse(serviceAccountData);
      }
    } catch {
      // No service account file
    }

    if (!admin.apps.length) {
      if (serviceAccount) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID || 'aiimagerenamer',
          storageBucket: STORAGE_BUCKET
        });
        console.log('✅ Firebase initialized with service account');
      } else {
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'aiimagerenamer',
          storageBucket: STORAGE_BUCKET
        });
        console.log('✅ Firebase initialized with ADC');
      }
    }
    
    db = admin.firestore();
    
    // Note: Admin SDK doesn't support ignoreUndefinedProperties setting
    // We handle undefined values in prepareForFirestore() utility
    
    storage = admin.storage();
    bucket = storage.bucket(STORAGE_BUCKET);
    
    // Test Firestore connection
    try {
      await db.collection('_test').doc('_ping').set({ timestamp: new Date() });
      await db.collection('_test').doc('_ping').delete();
      console.log('✅ Firestore connection verified (undefined properties ignored)');
    } catch (e) {
      console.log('⚠️  Firestore connection failed, using in-memory storage');
      db = null;
    }
    
    // Test Storage connection
    try {
      const [exists] = await bucket.exists();
      if (exists) {
        console.log('✅ Firebase Storage connected:', STORAGE_BUCKET);
      }
    } catch (e) {
      console.log('⚠️  Storage connection failed:', (e as Error).message);
      bucket = null;
    }
    
    initialized = true;
  } catch (error: any) {
    console.log('⚠️  Firebase init error:', error.message);
    console.log('📦 Running with in-memory storage');
  }
  
  return { db, storage, bucket };
}

export function getDb() {
  return db;
}

export function getStorage() {
  return storage;
}

export function getBucket() {
  return bucket;
}

export function getAdmin() {
  return admin;
}

export function isFirebaseConfigured(): boolean {
  return db !== null;
}

export function isStorageConfigured(): boolean {
  return bucket !== null;
}
