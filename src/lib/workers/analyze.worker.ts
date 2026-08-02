import fs from 'fs/promises';
import path from 'path';
import { getGenAI, getCandidateModels, getDefaultModel } from '@/lib/gemini';
import { MIME_TYPES } from '@/lib/helpers';
import { updateJobProgress, completeJob, shouldStopJob } from '@/lib/jobs';
import { BATCH_CONCURRENCY, processConcurrently } from '@/lib/utils/batch.utils';
import { updateProjectStats } from '@/lib/services/project.service';
import { getImage, updateImage } from '@/lib/services/image.service';
import { getOrCreateTaxonomy } from '@/lib/services/taxonomy.service';

const ANALYSIS_PROMPT = `Analyze this image comprehensively and return a JSON object with the following structure. Be detailed and accurate.

{
  "suggestedName": "descriptive_filename_max_40_chars",
  "title": "A short descriptive title for this image",
  "description": "A detailed 2-3 sentence description of what's in the image",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "colors": ["primary_color", "secondary_color", "accent_color"],
  "objects": ["main_object", "object2", "object3"],
  "category": "one of: photo, illustration, graphic, screenshot, website-screenshot, logo, icon, banner, product, stock, document, artwork, ai-generated, design, social",
  "subcategory": "more specific category like: landscape, portrait, product, interior, food, ui, marketing, event, personal, etc",
  "style": "style description like: modern, vintage, minimalist, colorful, etc",
  "mood": "emotional mood like: peaceful, energetic, professional, cozy, etc",
  "textVisible": false,
  "scene": "short scene type e.g. outdoor, desktop-ui, product-shot, people",
  "confidence": 0.95
}

Rules for suggestedName:
- Lowercase only
- Use underscores instead of spaces
- Max 40 characters
- No file extension
- Be descriptive: "modern_living_room_beige_sofa" not "image1"

If a folder context is provided, use it as a soft hint for category/tags but prefer what you see in the image.

Return ONLY valid JSON, no markdown, no explanation.`;

function buildAnalysisPrompt(folderHint?: string | null): string {
  if (!folderHint) return ANALYSIS_PROMPT;
  return `${ANALYSIS_PROMPT}\n\nFolder context (soft hint): ${folderHint}`;
}

export interface AnalyzeWorkerParams {
  projectId: string;
  imageIds: string[];
  jobId: string;
}

export interface AnalyzeResultItem {
  imageId: string;
  suggestedName?: string;
  metadata?: any;
  error?: string;
  success: boolean;
}

export interface AnalyzeWorkerResult {
  results: AnalyzeResultItem[];
  analyzed: number;
  errors: number;
  jobId: string;
}

async function analyzeSingleImage(
  projectId: string,
  imageId: string,
  genAI: NonNullable<ReturnType<typeof getGenAI>>
): Promise<AnalyzeResultItem> {
  const modelName = getDefaultModel();
  let usedModel = modelName;

  try {
    const imageResult = await getImage(projectId, imageId);
    if (!imageResult.success || !imageResult.image) {
      return { imageId, error: 'Image not found', success: false };
    }

    const imageData = imageResult.image;
    const imagePath = imageData.path;

    try {
      await fs.access(imagePath);
    } catch {
      return { imageId, error: `File not found: ${imagePath}`, success: false };
    }

    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const ext = path.extname(imagePath).toLowerCase();
    const modelsToTry = getCandidateModels();

    let responseText: string | null = null;
    let lastError: any = null;

    for (const tryModel of modelsToTry) {
      try {
        const res = await genAI.models.generateContent({
          model: tryModel,
          contents: [
            {
              inlineData: {
                mimeType: MIME_TYPES[ext] || 'image/jpeg',
                data: base64Image
              }
            },
            { text: buildAnalysisPrompt(imageData.relativeDir || imageData.metadata?.sourceFolder) }
          ]
        });

        usedModel = tryModel;
        responseText = (res as any).text?.trim?.() ?? null;
        if (!responseText) {
          responseText = (res as any).response?.text?.()?.trim?.() ?? null;
        }
        if (!responseText) throw new Error('Empty response from Gemini');
        break;
      } catch (modelError: any) {
        lastError = modelError;
        const msg = String(modelError?.message || modelError);
        if (msg.includes('404') || msg.toLowerCase().includes('not found')) continue;
        throw modelError;
      }
    }

    if (!responseText) {
      throw new Error(
        `No working model found. Last error: ${String(lastError?.message || lastError || 'Unknown')}`
      );
    }

    let analysisResult: any;
    try {
      let cleanJson = responseText;
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      }
      analysisResult = JSON.parse(cleanJson);
    } catch {
      const nameMatch = responseText.match(/suggestedName["\s:]+([a-z0-9_]+)/i);
      analysisResult = {
        suggestedName: nameMatch ? nameMatch[1].toLowerCase().slice(0, 40) : 'image',
        description: 'Analysis parsing failed',
        tags: [],
        colors: [],
        objects: [],
        confidence: 0.5
      };
    }

    const suggestedName = (analysisResult.suggestedName || 'image')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 40);

    const tagNames = Array.isArray(analysisResult.tags) ? analysisResult.tags.slice(0, 10) : [];
    const colorNames = Array.isArray(analysisResult.colors) ? analysisResult.colors.slice(0, 5) : [];
    const categoryName = analysisResult.category || 'photo';
    const styleName = analysisResult.style || null;
    const moodName = analysisResult.mood || null;

    const [tagItems, colorItems, categoryItem, styleItem, moodItem] = await Promise.all([
      Promise.all(tagNames.map((name: string) => getOrCreateTaxonomy('tag', name))),
      Promise.all(colorNames.map((name: string) => getOrCreateTaxonomy('color', name))),
      getOrCreateTaxonomy('category', categoryName),
      styleName ? getOrCreateTaxonomy('style', styleName) : Promise.resolve(null),
      moodName ? getOrCreateTaxonomy('mood', moodName) : Promise.resolve(null)
    ]);

    const now = new Date().toISOString();
    const metadata = {
      ...imageData.metadata,
      title: analysisResult.title || suggestedName.replace(/_/g, ' '),
      description: analysisResult.description || null,
      tags: tagNames,
      colors: colorNames,
      objects: Array.isArray(analysisResult.objects) ? analysisResult.objects.slice(0, 10) : [],
      category: categoryName,
      subcategory: analysisResult.subcategory || null,
      style: styleName,
      mood: moodName,
      textVisible: typeof analysisResult.textVisible === 'boolean' ? analysisResult.textVisible : undefined,
      scene: analysisResult.scene || null,
      sourceFolder: imageData.relativeDir || imageData.metadata?.sourceFolder || null,
      tagIds: tagItems.filter(Boolean).map(t => t!.id),
      colorIds: colorItems.filter(Boolean).map(c => c!.id),
      categoryId: categoryItem ? categoryItem.id : undefined,
      styleId: styleItem ? styleItem.id : undefined,
      moodId: moodItem ? moodItem.id : undefined,
      confidence: analysisResult.confidence || 0.8,
      analysisModel: usedModel,
      analysisError: null
    };

    await updateImage(projectId, imageId, {
      status: 'analyzed',
      suggestedName,
      aiDescription: metadata.description,
      analyzedAt: now,
      metadata
    });

    return { imageId, suggestedName, metadata, success: true };
  } catch (err: any) {
    await updateImage(projectId, imageId, {
      status: 'error',
      metadata: {
        analysisError: err.message,
        analysisModel: usedModel
      }
    });
    return { imageId, error: err.message, success: false };
  }
}

export async function runAnalyzeWorker(params: AnalyzeWorkerParams): Promise<AnalyzeWorkerResult> {
  const { projectId, imageIds, jobId } = params;
  const genAI = getGenAI();

  if (!genAI) {
    await completeJob(jobId, { status: 'failed', statusMessage: 'Gemini API key not configured' });
    return { results: [], analyzed: 0, errors: imageIds.length, jobId };
  }

  const counts = { success: 0, error: 0 };

  const results = await processConcurrently(
    imageIds,
    BATCH_CONCURRENCY.analyze,
    async (imageId) => {
      if (shouldStopJob(jobId)) {
        return { imageId, error: 'Cancelled', success: false };
      }

      const imageLookup = await getImage(projectId, imageId);
      const targetLabel =
        imageLookup.success && imageLookup.image
          ? (imageLookup.image.relativePath || imageLookup.image.currentName || imageId)
          : imageId;

      await updateJobProgress(jobId, {
        currentTarget: { name: targetLabel, status: 'running' }
      });

      const result = await analyzeSingleImage(projectId, imageId, genAI);

      if (result.success) {
        counts.success++;
        await updateJobProgress(jobId, {
          successCount: counts.success,
          currentTarget: {
            name: targetLabel,
            status: 'completed',
            data: { suggestedName: result.suggestedName, title: result.metadata?.title, imageId }
          }
        });
      } else if (result.error !== 'Cancelled') {
        counts.error++;
        await updateJobProgress(jobId, {
          errorCount: counts.error,
          currentTarget: { name: targetLabel, status: 'failed', error: result.error }
        });
      }

      return result;
    },
    {
      shouldCancel: () => shouldStopJob(jobId),
      onItemComplete: async (completed, total) => {
        await updateJobProgress(jobId, {
          processedItems: completed,
          successCount: counts.success,
          errorCount: counts.error,
          statusMessage: `Analyzing ${completed}/${total} (${BATCH_CONCURRENCY.analyze} parallel)`
        });
      }
    }
  );

  if (counts.success > 0) {
    await updateProjectStats(projectId, { analyzedCount: counts.success });
  }

  const status = shouldStopJob(jobId)
    ? 'failed'
    : counts.error === imageIds.length
      ? 'failed'
      : 'completed';

  await completeJob(jobId, {
    status,
    statusMessage: shouldStopJob(jobId)
      ? `Analysis cancelled after ${counts.success} images`
      : `Analyzed ${counts.success} images, ${counts.error} failed`
  });

  return {
    results,
    analyzed: counts.success,
    errors: counts.error,
    jobId
  };
}
