## AI Image Renamer – Overview

AI Image Renamer is a Next.js 14 application that uses **Google Gemini** to analyze images and suggest meaningful filenames, with Firebase providing persistent storage for metadata and files.

### Features

- 🗂️ **Project-Based Organization** – Create projects for different image folders (scans recursively into nested subfolders).
- 🤖 **AI-Powered Analysis** – Gemini extracts tags, colors, objects, category, style, mood, scene, and descriptions.
- ☁️ **Firebase Storage** – Images uploaded to cloud storage, organized by project.
- 🔍 **Duplicate Detection** – MD5 hashing highlights duplicate files.
- 🧹 **Smart Pattern Cleaning** – Strips prefixes like `imgi_65_`, `IMG_`, `DSC_`.
- ✏️ **Batch Rename** – Apply AI suggestions to many files at once.
- 🖼️ **Rich Image Preview** – Tabbed UI with overview, AI analysis, and metadata.
- 📋 **Job System** – Scan, analyze, rename, and cleanup run in parallel with a live running-tasks bar.

### Why Next.js (vs. Separate React + Express)

This project started as a separate React frontend and Express backend, then migrated to **Next.js App Router** for:

- **Single codebase** – Frontend + backend API routes in one project.
- **One dev server** – `npm run dev` runs everything on a single port.
- **No CORS issues** – API routes are same-origin.
- **Shared types** – TypeScript interfaces reused across UI and APIs.
- **Simpler deployment** – Deploy one Next.js app instead of two services.

### High-Level Architecture

```text
AiImageRenamer/
├── src/
│   ├── app/                      # Next.js App Router (pages + API routes)
│   ├── components/               # React UI components
│   ├── hooks/                    # Custom React hooks
│   └── lib/                      # Services, Firebase, Gemini, utilities
├── docs/                         # Detailed documentation
└── tools/                        # Utility scripts (e.g., rename-local.mjs)
```

See also:

- `docs/setup.md` – Installation, environment variables, Firebase setup.
- `docs/architecture-and-jobs.md` – Service layer, Firestore/Storage schema, job system.
- `docs/gemini-image-analysis.md` – How Gemini analyzes images and why AI helps. 

