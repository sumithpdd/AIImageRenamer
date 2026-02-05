import { NextResponse } from 'next/server';
import { getCandidateModels, getDefaultModel, getGenAI } from '@/lib/gemini';

// GET /api/gemini/models - List available Gemini models
export async function GET() {
  try {
    const genAI = getGenAI();
    
    if (!genAI) {
      return NextResponse.json({ 
        error: 'Gemini API not configured',
        available: false 
      }, { status: 400 });
    }
    
    return NextResponse.json({
      candidates: getCandidateModels(),
      note: 'Add GEMINI_MODEL to .env.local to specify which model to use',
      recommended: 'gemini-3-flash-preview',
      currentDefault: getDefaultModel()
    });
  } catch (error: any) {
    console.error('Error getting models:', error);
    return NextResponse.json({ 
      error: error.message,
      available: false 
    }, { status: 500 });
  }
}
