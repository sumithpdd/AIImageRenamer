## Architecture, Data Model & Job System

This document describes how data flows through the app, how it’s stored, and how jobs are tracked.

### High‑Level Architecture

```text
src/
├── app/               # Next.js App Router (pages + API routes)
├── components/        # UI components
├── hooks/             # Custom React hooks
└── lib/
    ├── services/      # Business logic (projects, images, storage, taxonomy)
    ├── firebase.ts    # Firebase Admin setup
    ├── gemini.ts      # Gemini API client
    ├── jobs.ts        # Job management (in-memory + Firestore)
    └── storage.ts     # Types + in-memory fallback
```

The UI calls `src/lib/api.ts`, which hits Next.js API routes in `src/app/api/**`.  
Those API routes call **service layer** functions under `src/lib/services/**`.

### Firestore Collections

#### Projects & Images

```text
projects/
└── {projectId}/
    ├── name: string
    ├── folderPath: string
    ├── createdAt: timestamp
    ├── updatedAt: timestamp
    ├── imageCount: number
    ├── analyzedCount: number
    ├── renamedCount: number
    └── images/              # Subcollection
        └── {imageId}/
            ├── originalName: string
            ├── currentName: string
            ├── path: string               # Local filesystem path
            ├── storageUrl?: string        # Firebase Storage URL
            ├── storagePath?: string
            ├── suggestedName?: string     # From Gemini
            ├── aiDescription?: string
            ├── status: 'scanned' | 'analyzed' | 'renamed' | 'error'
            ├── scannedAt: timestamp
            ├── analyzedAt?: timestamp
            ├── renamedAt?: timestamp
            ├── isDuplicate: boolean
            ├── duplicateOf?: string[]
            └── metadata: {
                 width, height, megapixels,
                 tags[], colors[], objects[],
                 category, style, mood,
                 confidence, analysisModel,
                 analysisError?,
                 tagIds[], colorIds[],
                 categoryId?, styleId?, moodId?,
                 lastModified: timestamp
               }
```

#### Taxonomy (Tags, Colors, Categories, Styles, Moods)

```text
taxonomies/
└── {taxonomyId}/
    ├── type: 'tag' | 'color' | 'category' | 'style' | 'mood'
    ├── name: string
    ├── description?: string
    ├── createdAt: timestamp
    └── updatedAt: timestamp
```

Each image stores references (`tagIds`, `colorIds`, `categoryId`, `styleId`, `moodId`) to these documents for consistent classification.

#### Jobs (Audit Trail)

```text
jobs/
└── {jobId}/
    ├── projectId: string
    ├── projectName: string
    ├── type: 'scan' | 'analyze' | 'rename' | 'cleanup'
    ├── status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    ├── priority: 'low' | 'normal' | 'high'
    ├── totalItems: number
    ├── processedItems: number
    ├── successCount: number
    ├── errorCount: number
    ├── createdAt: timestamp
    ├── startedAt?: timestamp
    ├── completedAt?: timestamp
    ├── duration?: number          # milliseconds
    ├── statusMessage: string
    ├── targets: [{
    │     name: string,            # Typically image ID or filename
    │     status: string,
    │     startedAt?: timestamp,
    │     completedAt?: timestamp,
    │     error?: string,
    │     data?: {...}             # Extra info (e.g., suggestedName)
    │   }, ...]
    └── errors: string[]           # Summary error lines
```

This makes it easy to answer questions like:

- “Which jobs modified project X last week?”
- “Which images failed during the last analyze run?”

### Job Types and Their Effects

- **scan** – Recursively walks a folder tree from disk, computes hashes/dimensions, uploads to Storage.
- **analyze** – Sends images to Gemini for classification and naming (categories, tags, style, mood, etc.).
- **rename** – Renames files on disk and in Firebase Storage based on AI/patterns.
- **cleanup** – Cleans prefixes and/or removes duplicate images.

Each of these writes a job document and fills `targets[]` as it iterates through images.

### Rescanning Without Losing AI Data

When **Scan Folder** is triggered again for a project:

- The scanner walks the project folder **recursively**, including nested paths like `Screenshots/2025-08`.
- Existing images for that project are loaded and indexed by **hash**.
- The previous Firestore image docs are cleared and re-created from the current folder tree.
- For files whose hash matches an existing image, the app **preserves**:
  - `suggestedName`, `aiDescription`, `patternCleanName`
  - `status`, `analyzedAt`, `renamed`, `renamedAt`
  - `isDuplicate`, `duplicateOf`
  - `storageUrl`, `storagePath`
  - `metadata` (tags, colors, category, style, mood, etc.)
- Project stats (`imageCount`, `analyzedCount`, `renamedCount`) are recomputed.

This means you can safely rescan folders to pick up **new files** (including deeper subfolders) without losing previous AI analysis.

### Firestore Usage, Quotas & Cost Controls

Firestore free-tier (Spark) allocations are **global per Firebase project** and **reset daily** — roughly:

- **50,000 document reads / day**
- **20,000 document writes / day**
- **20,000 deletes / day**

These are shared across every collection (`projects`, `images`, `jobs`, `taxonomies`) and every running client/tab. A moderately sized library can exhaust them quickly if the app talks to Firestore naively, producing:

```text
❌ RESOURCE_EXHAUSTED: Quota exceeded.
```

#### Where reads/writes come from

| Operation | Firestore cost | Notes |
|-----------|----------------|-------|
| Load a project's images | **1 read per image** | 3,500 images = 3,500 reads per load |
| Scan (save images) | 1 write per image (batched) | Batching reduces round-trips, not billed doc count |
| AI analyze (per image) | 1 read + 1 write | Plus taxonomy lookups below |
| `getOrCreateTaxonomy` (per tag/color/style/mood) | 1 query read each (uncached) | ~8 lookups/image → **28,000 reads** for 3,500 images |
| Job progress updates | 1 write each | Naive per-file writes explode quickly |
| Job/project polling | 1+ reads per poll | A UI poll loop can burn reads while **idle** |

**Key insight:** file count is rarely the culprit. Repeated **taxonomy queries**, **full-collection image reads**, and **background polling** dominate usage.

#### Cost controls implemented

- **Quota cooldown** (`src/lib/utils/firestore-quota.ts`): on any `RESOURCE_EXHAUSTED`, Firestore I/O pauses for ~5 minutes and the app falls back to in-memory data instead of retrying in a loop.
- **Throttled job writes** (`src/lib/jobs.ts`): progress is flushed to Firestore at most every ~2.5s (not per file); `targets`/`errors` arrays are capped before writing.
- **In-memory-first job reads**: while any job is running, job lists come from memory; Firestore is only queried when idle, and queries are **limited to the most recent 50**.
- **No idle polling** (`src/hooks/useJobs.ts`): the UI polls only while jobs are active (every 3s), with exponential backoff on quota/`429` responses.
- **Soft-fail project reads**: `getProjects`/`getProject` return the in-memory cache during a cooldown instead of surfacing quota errors.
- **One-time taxonomy cache** (`src/lib/services/taxonomy.service.ts`): taxonomy documents are loaded once per server process. Repeated tag/color/category/style/mood lookups are served from memory, and concurrent requests for the same new value share one Firestore operation.
- **Warmed image cache** (`src/lib/services/image.service.ts`): the first project image load fills the in-memory cache. Analyze, rename, and tagging workers then reuse those image documents instead of reading each one again.
- **Firestore-safe image batches**: image writes/deletes are committed in chunks of 400 (under Firestore's 500-operation limit). When a complete image cache is available, clearing a project uses cached document IDs instead of rereading the whole image collection.

#### Recommended further optimizations

- **Avoid reloading all images** after every job; update only changed docs client-side where possible.
- Consider **enabling billing (Blaze)** for large libraries, or batching analyze runs across days to stay under the free tier.

#### Expected effect for a 3,500-image analysis

Before caching, ~8 taxonomy fields per image could cause roughly **28,000 taxonomy query reads**, plus up to **3,500 repeated image reads** by workers. With the caches warmed:

- Existing taxonomy values: **0 repeated reads** after the one-time taxonomy collection load.
- Worker image lookups: **0 repeated reads** after the initial project image collection load.
- New taxonomy values: one write per unique new value, with duplicate concurrent requests coalesced.

The initial project load still costs one read per image (about 3,500 reads), because Firestore bills each returned document. Restarting the server clears in-memory caches, so the first load after each restart incurs that cost again.

