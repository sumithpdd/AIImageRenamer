import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { initFirebase } from '@/lib/firebase';
import { getGenAI, getCandidateModels, getDefaultModel } from '@/lib/gemini';
import { MIME_TYPES } from '@/lib/helpers';
import { createJob, startJob, updateJobProgress, completeJob } from '@/lib/jobs';
import { getProject, updateProjectStats } from '@/lib/services/project.service';
import {
  getImage,
  updateImage,
  getProjectImages as getProjectImagesService
} from '@/lib/services/image.service';
import { getOrCreateTaxonomy } from '@/lib/services/taxonomy.service';

const ANALYSIS_PROMPT = `Analyze this image comprehensively and return a JSON object with the following structure. Be detailed and accurate.

{
  "suggestedName": "descriptive_filename_max_40_chars",
  "title": "A short descriptive title for this image",
  "description": "A detailed 2-3 sentence description of what's in the image",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "colors": ["primary_color", "secondary_color", "accent_color"],
  "objects": ["main_object", "object2", "object3"],
  "category": "one of: photo, illustration, graphic, screenshot, document, artwork",
  "subcategory": "more specific category like: landscape, portrait, product, interior, food, etc",
  "style": "style description like: modern, vintage, minimalist, colorful, etc",
  "mood": "emotional mood like: peaceful, energetic, professional, cozy, etc",
  "confidence": 0.95
}

Rules for suggestedName:
- Lowercase only
- Use underscores instead of spaces
- Max 40 characters
- No file extension
- Be descriptive: "modern_living_room_beige_sofa" not "image1"

Return ONLY valid JSON, no markdown, no explanation.`;

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  console.log('📸 Starting batch analysis...');
  
  let job = null;
  
  try {
    await initFirebase();
    const genAI = getGenAI();
    
    if (!genAI) {
      console.error('❌ Gemini API key not configured');
      return NextResponse.json({ 
        error: 'Gemini API key not configured. Add GEMINI_API_KEY to .env.local' 
      }, { status: 400 });
    }

    const { projectId } = params;
    let { imageIds } = await request.json();
    
    // Get project
    const projectResult = await getProject(projectId);
    if (!projectResult.success || !projectResult.project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    
    const projectName = projectResult.project.name;
    
    // If no imageIds provided, get all unanalyzed images
    if (!imageIds || imageIds.length === 0) {
      console.log('📋 No image IDs provided, fetching unanalyzed images...');
      const imagesResult = await getProjectImagesService(projectId);
      if (imagesResult.success && imagesResult.images) {
        imageIds = imagesResult.images
          .filter(img => img.status === 'scanned' || !img.suggestedName)
          .map(img => img.id);
      }
      console.log(`📋 Found ${imageIds?.length || 0} unanalyzed images`);
    }
    
    if (!imageIds || imageIds.length === 0) {
      return NextResponse.json({ 
        error: 'No images to analyze', 
        results: [], 
        analyzed: 0 
      });
    }
    
    // Create job
    job = createJob({
      projectId,
      projectName,
      type: 'analyze',
      totalItems: imageIds.length,
      config: { model: getDefaultModel() }
    });
    startJob(job.id);
    
    console.log(`📋 Analyzing ${imageIds.length} images for project "${projectName}"`);
    console.log(`📋 Job ID: ${job.id}`);
    
    const results: Array<{
      imageId: string;
      suggestedName?: string;
      metadata?: any;
      error?: string;
      success: boolean;
    }> = [];
    
    const modelName = getDefaultModel();
    console.log(`🤖 Using Gemini model: ${modelName}`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < imageIds.length; i++) {
      const imageId = imageIds[i];
      // Ensure this is defined for both success + error paths
      let usedModel = modelName;
      
      // Update job progress
      updateJobProgress(job.id, {
        processedItems: i,
        successCount,
        errorCount,
        statusMessage: `Analyzing image ${i + 1}/${imageIds.length}`,
        currentTarget: { name: imageId, status: 'running' }
      });
      
      console.log(`\n🔍 [${i + 1}/${imageIds.length}] Processing: ${imageId}`);
      
      try {
        // Get image data using service
        const imageResult = await getImage(projectId, imageId);
        if (!imageResult.success || !imageResult.image) {
          console.warn(`⚠️ Image not found: ${imageId}`);
          results.push({ imageId, error: 'Image not found', success: false });
          errorCount++;
          updateJobProgress(job.id, {
            errorCount,
            currentTarget: { name: imageId, status: 'failed', error: 'Image not found' }
          });
          continue;
        }
        
        const imageData = imageResult.image;
        const imagePath = imageData.path;
        console.log(`   📁 Path: ${imagePath}`);
        
        // Check if file exists
        try {
          await fs.access(imagePath);
        } catch {
          console.error(`   ❌ File not accessible: ${imagePath}`);
          results.push({ imageId, error: `File not found: ${imagePath}`, success: false });
          errorCount++;
          updateJobProgress(job.id, {
            errorCount,
            currentTarget: { name: imageId, status: 'failed', error: 'File not found' }
          });
          continue;
        }
        
        const imageBuffer = await fs.readFile(imagePath);
        const base64Image = imageBuffer.toString('base64');
        const ext = path.extname(imagePath).toLowerCase();
        
        console.log(`   📤 Sending to Gemini (${(imageBuffer.length / 1024).toFixed(1)} KB)...`);

        // Try models in order if one fails (404 / not found)
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
                { text: ANALYSIS_PROMPT }
              ]
            });

            usedModel = tryModel;
            if (tryModel !== modelName) {
              console.log(`   ⚠️  Using fallback model: ${tryModel}`);
            }

            // The new SDK returns `.text` (string) for convenience
            responseText = (res as any).text?.trim?.() ?? null;
            if (!responseText) {
              // Fallback: some environments return candidates
              responseText = (res as any).response?.text?.()?.trim?.() ?? null;
            }

            if (!responseText) {
              throw new Error('Empty response from Gemini');
            }

            break;
          } catch (modelError: any) {
            lastError = modelError;
            const msg = String(modelError?.message || modelError);
            if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
              console.log(`   ⚠️  Model ${tryModel} not available, trying next...`);
              continue;
            }
            throw modelError;
          }
        }

        if (!responseText) {
          throw new Error(
            `No working model found. Last error: ${String(lastError?.message || lastError || 'Unknown')}`
          );
        }

        console.log(`   📥 Response received (${responseText.length} chars)`);
        
        // Parse JSON response
        let analysisResult: any;
        try {
          let cleanJson = responseText;
          if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/```json\n?/g, '').replace(/```\n?/g, '');
          }
          analysisResult = JSON.parse(cleanJson);
          console.log(`   ✅ Parsed: "${analysisResult.suggestedName}"`);
        } catch {
          console.error(`   ⚠️ JSON parse failed, extracting filename...`);
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

        // Map strings to taxonomy items (central collections)
        const tagNames = Array.isArray(analysisResult.tags)
          ? analysisResult.tags.slice(0, 10)
          : [];
        const colorNames = Array.isArray(analysisResult.colors)
          ? analysisResult.colors.slice(0, 5)
          : [];

        const categoryName = analysisResult.category || 'photo';
        const styleName = analysisResult.style || null;
        const moodName = analysisResult.mood || null;

        const [tagItems, colorItems, categoryItem, styleItem, moodItem] =
          await Promise.all([
            Promise.all(
              tagNames.map((name: string) =>
                getOrCreateTaxonomy('tag', name)
              )
            ),
            Promise.all(
              colorNames.map((name: string) =>
                getOrCreateTaxonomy('color', name)
              )
            ),
            getOrCreateTaxonomy('category', categoryName),
            styleName ? getOrCreateTaxonomy('style', styleName) : Promise.resolve(null),
            moodName ? getOrCreateTaxonomy('mood', moodName) : Promise.resolve(null)
          ]);

        const tagIds = tagItems.filter(Boolean).map(t => t!.id);
        const colorIds = colorItems.filter(Boolean).map(c => c!.id);

        // Build metadata with timestamps and references
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
          tagIds,
          colorIds,
          categoryId: categoryItem ? categoryItem.id : undefined,
          styleId: styleItem ? styleItem.id : undefined,
          moodId: moodItem ? moodItem.id : undefined,
          confidence: analysisResult.confidence || 0.8,
          analysisModel: usedModel,
          analysisError: null,
          analyzedAt: now,
          lastModified: now
        };

        // Update using service
        await updateImage(projectId, imageId, {
          status: 'analyzed',
          suggestedName,
          aiDescription: metadata.description,
          analyzedAt: now,
          metadata
        });

        results.push({ imageId, suggestedName, metadata, success: true });
        successCount++;
        
        updateJobProgress(job.id, {
          successCount,
          currentTarget: { 
            name: imageId, 
            status: 'completed',
            data: { suggestedName, title: metadata.title }
          }
        });
        
        console.log(`   ✅ Success: ${imageData.originalName} → ${suggestedName}`);
        
      } catch (err: any) {
        console.error(`   ❌ Error: ${err.message}`);
        
        // Save error using service
        const now = new Date().toISOString();
        await updateImage(projectId, imageId, {
          status: 'error',
          metadata: {
            analysisError: err.message,
            analysisModel: usedModel,
            lastModified: now
          }
        });
        
        results.push({ imageId, error: err.message, success: false });
        errorCount++;
        
        updateJobProgress(job.id, {
          errorCount,
          currentTarget: { name: imageId, status: 'failed', error: err.message }
        });
      }
    }

    // Update project stats using service
    console.log(`\n📊 Analysis complete: ${successCount} success, ${errorCount} errors`);
    
    if (successCount > 0) {
      await updateProjectStats(projectId, { analyzedCount: successCount });
    }

    // Complete the job
    completeJob(job.id, {
      status: errorCount === imageIds.length ? 'failed' : 'completed',
      statusMessage: `Analyzed ${successCount} images, ${errorCount} failed`
    });

    return NextResponse.json({ 
      results, 
      analyzed: successCount,
      errors: errorCount,
      jobId: job.id,
      message: errorCount > 0 ? `${errorCount} images failed to analyze` : 'All images analyzed successfully'
    });
    
  } catch (error: any) {
    console.error('❌ Batch analysis error:', error);
    
    if (job) {
      completeJob(job.id, {
        status: 'failed',
        statusMessage: `Analysis failed: ${error.message}`
      });
    }
    
    return NextResponse.json({ 
      error: error.message, 
      results: [],
      analyzed: 0,
      jobId: job?.id 
    }, { status: 500 });
  }
}
