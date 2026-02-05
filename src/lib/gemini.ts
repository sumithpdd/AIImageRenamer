import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

/**
 * Default model - can be overridden via env.
 *
 * The latest Gemini API docs for image understanding show models like `gemini-3-flash-preview`.
 * See: https://ai.google.dev/gemini-api/docs/image-understanding#javascript
 */
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

export function initGemini() {
  if (process.env.GEMINI_API_KEY) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

export function getGenAI() {
  if (!client && process.env.GEMINI_API_KEY) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

export function getDefaultModel(): string {
  return DEFAULT_MODEL;
}

/**
 * The SDK doesn't currently provide a stable "list models" method across environments,
 * so we keep a curated list that matches the documentation / common availability.
 */
export function getCandidateModels(): string[] {
  const user = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : [];
  return [
    ...user,
    'gemini-3-flash-preview',
    'gemini-3-pro-preview',
    'gemini-2.0-flash',
    'gemini-2.0-pro',
    'gemini-1.5-flash',
    'gemini-1.5-pro'
  ].filter(Boolean);
}
