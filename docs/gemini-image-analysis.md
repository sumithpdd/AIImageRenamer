## Gemini Image Analysis & AI‑Driven Renaming

This document explains how Google Gemini is used to understand images and why AI is a powerful tool for renaming and classifying them.

### How Gemini Processes Images

Gemini models are **multimodal** – they can accept both **image** and **text** inputs and respond with structured information.  
Official docs: [Gemini image understanding – JavaScript](https://ai.google.dev/gemini-api/docs/image-understanding#javascript).

In this project we:

1. Read the image from disk and convert it to **base64**.
2. Call `GoogleGenAI` from `@google/genai` with:
   - an inline image part (`mimeType` + `data`)
   - a carefully designed **prompt** that asks for structured JSON.
3. Parse the JSON into rich metadata and store it on the image document.

High‑level call (simplified):

```ts
const res = await ai.models.generateContent({
  model: 'gemini-3-flash-preview',
  contents: [
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Image,
      },
    },
    { text: ANALYSIS_PROMPT },      // prompt asking for JSON fields
  ],
});

const responseText = res.text?.trim() ?? '';
const analysis = JSON.parse(responseText);
```

For more examples of inline image data with Gemini, see the official docs’ JavaScript section:  
[Image understanding – JavaScript example](https://ai.google.dev/gemini-api/docs/image-understanding#javascript).

### Fields Extracted From Gemini

The prompt asks Gemini to return a JSON object like:

```json
{
  "suggestedName": "descriptive_filename_max_40_chars",
  "title": "Short descriptive title",
  "description": "2-3 sentence description",
  "tags": ["tag1", "tag2", "tag3"],
  "colors": ["primary_color", "secondary_color"],
  "objects": ["main_object", "object2"],
  "category": "photo | illustration | graphic | screenshot | document | artwork",
  "subcategory": "landscape | portrait | product | interior | food | ...",
  "style": "modern | vintage | minimalist | ...",
  "mood": "peaceful | energetic | professional | cozy | ...",
  "confidence": 0.95
}
```

The app then:

- Normalizes `suggestedName` to a safe, lowercase, underscore‑separated base name.
- Stores all the other fields in `image.metadata`.
- Maps tags/colors/category/style/mood into the central **taxonomy collection** so they can be reused and filtered across images.

### Why Use AI for Renaming & Classification?

Traditional file naming is often:

- **Opaque** – camera names like `IMG_1234.JPG`, exports like `imgi_22_lion-king-leaping...`.
- **Inconsistent** – different tools/users adopt different patterns.
- **Hard to search** – finding “all blue night cityscapes” is nearly impossible from filenames alone.

AI‑driven naming & classification helps by:

- Turning **visual content** into **semantic labels** (tags, categories, mood).
- Generating **descriptive, human‑readable filenames** like `london_tower_bridge_night_skyline`.
- Providing consistent structures for organizing large collections.
- Enabling **future automation** (e.g. auto‑album creation, search filters like “portraits with warm mood”).

Because the model “sees” the image, it can capture details humans might miss or never bother to type into a filename.

### Why Gemini Specifically?

Gemini’s multimodal API is a good fit for this project because:

- It natively supports **image + text** in a single `generateContent` call.
- It’s optimized for tasks like **captioning**, **classification**, and **visual Q&A**.
- The same API can be extended later for:
  - Fine‑grained object descriptions.
  - Scene summaries.
  - Suggestions for folder/collection groupings.

The current implementation uses models like `gemini-3-flash-preview` and can be configured via the `GEMINI_MODEL` environment variable, following the model names described in the official docs:  
[Gemini API models](https://ai.google.dev/gemini-api/docs/models).

