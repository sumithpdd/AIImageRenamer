import { NextResponse } from 'next/server';
import { getDb, initFirebase, isFirebaseConfigured, isStorageConfigured } from '@/lib/firebase';
import { getGenAI } from '@/lib/gemini';

export async function GET() {
  await initFirebase();
  
  return NextResponse.json({ 
    status: 'ok', 
    hasGemini: !!getGenAI(),
    hasFirebase: isFirebaseConfigured(),
    hasStorage: isStorageConfigured(),
    services: {
      gemini: getGenAI() ? 'connected' : 'not configured',
      firestore: isFirebaseConfigured() ? 'connected' : 'in-memory mode',
      storage: isStorageConfigured() ? 'connected' : 'disabled'
    }
  });
}
