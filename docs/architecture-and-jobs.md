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

- **scan** – Reads a folder from disk, computes hashes/dimensions, uploads to Storage.
- **analyze** – Sends images to Gemini for classification and naming.
- **rename** – Renames files on disk and in Firebase Storage based on AI/patterns.
- **cleanup** – Cleans prefixes and/or removes duplicate images.

Each of these writes a job document and fills `targets[]` as it iterates through images.

### Rescanning Without Losing AI Data

When **Scan Folder** is triggered again for a project:

- Existing images for that project are loaded and indexed by **hash**.
- The previous Firestore image docs are cleared and re-created from the current folder.
- For files whose hash matches an existing image, the app **preserves**:
  - `suggestedName`, `aiDescription`, `patternCleanName`
  - `status`, `analyzedAt`, `renamed`, `renamedAt`
  - `isDuplicate`, `duplicateOf`
  - `storageUrl`, `storagePath`
  - `metadata` (tags, colors, category, style, mood, etc.)
- Project stats (`imageCount`, `analyzedCount`, `renamedCount`) are recomputed.

This means you can safely rescan folders to pick up **new files** without losing previous AI analysis.

