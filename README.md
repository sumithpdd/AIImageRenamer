# AI Image Renamer

A Next.js 14 application that uses Google Gemini AI to analyze images and suggest meaningful filenames. Built with TypeScript, React, Firebase, and a modular service-layer architecture.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Firebase](https://img.shields.io/badge/Firebase-Storage-orange)
![Gemini](https://img.shields.io/badge/AI-Google%20Gemini-blue)

---

## Table of Contents

1. [Features](#features)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Why Next.js?](#why-nextjs)
5. [Project Architecture](#project-architecture)
6. [Core Concepts for Junior Developers](#core-concepts-for-junior-developers)
7. [Service Layer](#service-layer)
8. [Job System](#job-system)
9. [How File Renaming Works](#how-file-renaming-works)
10. [Firebase Setup](#firebase-setup)
11. [API Reference](#api-reference)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)

---

## Features

- 🗂️ **Project-Based Organization** - Create projects for different image folders
- 🤖 **AI-Powered Analysis** - Google Gemini analyzes images with rich metadata (tags, colors, mood, style)
- ☁️ **Firebase Storage** - Images uploaded to cloud storage organized by project name
- 📋 **Job Queue System** - Track progress of scan, analyze, and rename operations
- 🧹 **Smart Pattern Cleaning** - Removes prefixes like `imgi_65_`, `IMG_`, `DSC_`
- 🔍 **Duplicate Detection** - Finds duplicate images using MD5 hashing
- 🔥 **Firestore Integration** - Persistent metadata storage with timestamps
- 📊 **Progress Tracking** - Real-time job progress with error reporting
- 🖼️ **Rich Image Preview** - Tabbed interface showing AI analysis, metadata, and file info
- ✏️ **Batch Operations** - Analyze and rename multiple images at once
- 📁 **Local File Renaming** - Files are renamed on your local disk AND in cloud storage

---

## Prerequisites

Before you begin, make sure you have:

1. **Node.js 18+** - [Download here](https://nodejs.org/)
   ```bash
   node --version  # Should be 18.x or higher
   ```

2. **npm or yarn** - Comes with Node.js
   ```bash
   npm --version
   ```

3. **Google Gemini API Key** - Get one free at [Google AI Studio](https://aistudio.google.com/)

4. **Firebase Project** - Required for Storage, recommended for Firestore
   - Create at [Firebase Console](https://console.firebase.google.com/)
   - Enable **Cloud Storage** for image uploads
   - Enable **Firestore** for persistent metadata (optional)

---

## Quick Start

### Step 1: Clone and Install

```bash
# Clone the repository
git clone <repository-url>
cd AiImageRenamer

# Install dependencies
npm install
```

### Step 2: Set Up Environment Variables

Create a file called `.env.local` in the project root:

```env
# Required: Your Gemini API key
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Gemini model to use (default: gemini-3-flash-preview)
# Valid options: gemini-3-flash-preview (recommended), gemini-3-pro-preview, gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro
# The app will automatically try fallback models if the specified one isn't available
GEMINI_MODEL=gemini-3-flash-preview

# Firebase project ID (default: aiimagerenamer)
FIREBASE_PROJECT_ID=aiimagerenamer
```

### Step 3: Set Up Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project → **Project Settings** → **Service Accounts**
3. Click **"Generate new private key"**
4. Save the downloaded JSON file as `serviceAccountKey.json` in the project root

### Step 4: Enable Firebase Storage

1. In Firebase Console, go to **Storage**
2. Click **"Get Started"** to enable
3. Choose a location (e.g., `us-central1`)
4. Set security rules for development:
   ```
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if true;
       }
     }
   }
   ```
   > ⚠️ For production, add proper authentication rules

### Step 5: Run the App

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### Step 6: Stop the App

Press `Ctrl+C` in the terminal.

---

## Why Next.js?

This project was initially built with **separate React (Vite) frontend** and **Express.js backend**. We migrated to **Next.js** for several important reasons:

### Problems with React + Express

| Issue | Description |
|-------|-------------|
| **Two servers** | Had to run `npm run dev` in both `/client` and `/server` folders |
| **CORS headaches** | Frontend on port 5173, backend on port 3001 - needed CORS configuration |
| **Two builds** | Separate build processes, deployment complexity |
| **Duplicate code** | Types and interfaces duplicated between frontend and backend |
| **Port conflicts** | Users often forgot which port was which |

### Benefits of Next.js

| Benefit | Description |
|---------|-------------|
| **Single codebase** | Frontend and backend in one project |
| **One command** | `npm run dev` starts everything on port 3000 |
| **No CORS** | API routes are same-origin, no cross-origin issues |
| **Shared types** | TypeScript interfaces used by both frontend and API |
| **Simpler deployment** | Deploy once to Vercel, Netlify, or any Node.js host |
| **Better DX** | Hot reload for both frontend AND API routes |
| **Built-in optimization** | Automatic code splitting, image optimization |

### How Next.js Combines Everything

```
Traditional (React + Express):
┌─────────────────┐    HTTP    ┌─────────────────┐
│  React (Vite)   │  ←──────→  │  Express.js     │
│  Port 5173      │   CORS!    │  Port 3001      │
└─────────────────┘            └─────────────────┘

Next.js (Unified):
┌─────────────────────────────────────────────────┐
│                   Next.js                        │
│  ┌─────────────┐         ┌─────────────────┐   │
│  │   React     │         │   API Routes    │   │
│  │   Pages     │ ←─────→ │   (Server)      │   │
│  └─────────────┘         └─────────────────┘   │
│                    Port 3000                    │
└─────────────────────────────────────────────────┘
```

### What is the App Router?

Next.js 14 uses the **App Router** - a file-based routing system:

```
src/app/
├── page.tsx              → renders at /
├── layout.tsx            → wraps all pages
├── globals.css           → global styles
└── api/                  → API endpoints
    ├── health/
    │   └── route.ts      → GET /api/health
    └── projects/
        └── route.ts      → GET, POST /api/projects
```

**Key concept:** The file `route.ts` in a folder becomes an API endpoint. The folder path is the URL path.

---

## Project Architecture

```
AiImageRenamer/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # Backend API routes
│   │   │   ├── health/           # GET /api/health
│   │   │   ├── jobs/             # Job queue endpoints
│   │   │   ├── projects/         # Project CRUD + nested routes
│   │   │   └── image/            # Image file serving
│   │   ├── globals.css           # All styles
│   │   ├── layout.tsx            # HTML wrapper
│   │   └── page.tsx              # Main React page
│   │
│   ├── components/               # React UI components
│   │   ├── Header.tsx            
│   │   ├── ProjectsView.tsx      
│   │   ├── ProjectView.tsx       
│   │   ├── ImageCard.tsx         
│   │   ├── ImagePreview.tsx      
│   │   ├── JobViewer.tsx         
│   │   └── index.ts              # Barrel export
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useNotification.ts    
│   │   ├── useProjects.ts        
│   │   ├── useImages.ts          
│   │   └── useJobs.ts            
│   │
│   └── lib/                      # Backend & shared utilities
│       ├── services/             # Service layer (business logic)
│       │   ├── project.service.ts
│       │   ├── image.service.ts
│       │   ├── storage.service.ts
│       │   ├── taxonomy.service.ts  # Central tags/colors/category/style/mood
│       │   └── index.ts
│       ├── utils/                # Helper functions
│       │   ├── image.utils.ts
│       │   └── index.ts
│       ├── api.ts                # Frontend API client
│       ├── firebase.ts           # Firebase Admin SDK
│       ├── gemini.ts             # Gemini AI client
│       ├── helpers.ts            # Filename utilities
│       ├── jobs.ts               # Job queue system
│       └── storage.ts            # In-memory fallback + types
│
├── .env.local                    # Secrets (you create this)
├── serviceAccountKey.json        # Firebase credentials (you create this)
├── next.config.mjs               # Next.js config
├── package.json                  # Dependencies
└── tsconfig.json                 # TypeScript config
```

---

## Core Concepts for Junior Developers

### What is TypeScript?

TypeScript is JavaScript with **types**. It catches errors before you run your code.

```typescript
// JavaScript - no types, errors at runtime
function greet(name) {
  return "Hello " + name.toUpperCase();  // crashes if name is null
}

// TypeScript - types catch errors at compile time
function greet(name: string): string {
  return "Hello " + name.toUpperCase();  // TypeScript warns if name might be null
}
```

### What is a React Hook?

A hook is a function that lets you use React features. Custom hooks (like `useProjects`) encapsulate reusable logic.

```typescript
// Custom hook - encapsulates project logic
function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const loadProjects = async () => {
    setLoading(true);
    const data = await fetch('/api/projects').then(r => r.json());
    setProjects(data.projects);
    setLoading(false);
  };
  
  return { projects, loading, loadProjects };
}

// Using the hook in a component
function ProjectList() {
  const { projects, loading, loadProjects } = useProjects();
  
  useEffect(() => { loadProjects(); }, []);
  
  if (loading) return <div>Loading...</div>;
  return <div>{projects.map(p => <div>{p.name}</div>)}</div>;
}
```

### What is an API Route?

An API route is a server-side function that handles HTTP requests. In Next.js, you export functions named after HTTP methods:

```typescript
// src/app/api/hello/route.ts

// Handles GET /api/hello
export async function GET(request: NextRequest) {
  return NextResponse.json({ message: "Hello World" });
}

// Handles POST /api/hello
export async function POST(request: NextRequest) {
  const body = await request.json();
  return NextResponse.json({ received: body });
}
```

### What is a Service Layer?

Services separate **business logic** from **HTTP handling**. This makes code reusable and testable.

```typescript
// ❌ Without services - logic in API route (bad)
export async function POST(request) {
  const { name, folderPath } = await request.json();
  
  // All logic mixed in here
  const db = getDb();
  const project = { name, folderPath, createdAt: new Date() };
  await db.collection('projects').add(project);
  
  return NextResponse.json(project);
}

// ✅ With services - logic separated (good)
// In project.service.ts
export async function createProject(name, folderPath) {
  const db = getDb();
  const project = { name, folderPath, createdAt: new Date() };
  await db.collection('projects').add(project);
  return project;
}

// In route.ts
export async function POST(request) {
  const { name, folderPath } = await request.json();
  const project = await createProject(name, folderPath);  // Clean!
  return NextResponse.json(project);
}
```

### Database Timestamps

**Every database operation includes timestamps** for auditability:

| Field | When Updated | Purpose |
|-------|-------------|---------|
| `createdAt` | Once, at creation | When the record was first created |
| `updatedAt` | On every update | Last modification time |
| `scannedAt` | When scanned | When image was discovered |
| `analyzedAt` | After AI analysis | When AI processed the image |
| `renamedAt` | After rename | When file was renamed |
| `metadata.lastModified` | Any metadata change | Fine-grained change tracking |

---

## Service Layer

The app uses a **clean service architecture**:

```
src/lib/services/
├── project.service.ts    # Project CRUD operations
├── image.service.ts      # Image CRUD operations
├── storage.service.ts    # Firebase Storage (upload/delete/rename)
└── index.ts              # Exports all services
```

### Why Services?

- **Reusable** - Same logic works in different API routes
- **Testable** - Easy to unit test without HTTP
- **Maintainable** - One place to fix bugs
- **Clean routes** - API routes just handle HTTP

### Example: Renaming an Image

```typescript
// In the rename API route
import { getProject } from '@/lib/services/project.service';
import { getImage, updateImage } from '@/lib/services/image.service';
import { renameImageInStorage } from '@/lib/services/storage.service';

// 1. Get project name for storage path
const project = await getProject(projectId);

// 2. Get current image data
const image = await getImage(projectId, imageId);

// 3. Rename local file
await fs.rename(oldPath, newPath);

// 4. Rename in Firebase Storage
await renameImageInStorage(project.name, oldName, newName);

// 5. Update database with timestamps
await updateImage(projectId, imageId, {
  currentName: newName,
  path: newPath,
  renamedAt: new Date().toISOString()
});
```

---

## Job System

Long-running operations are tracked as **jobs**:

### Job Types

| Type | Triggered By | What It Does |
|------|-------------|--------------|
| `scan` | "Scan Folder" button | Reads folder, uploads to Storage |
| `analyze` | "AI Analyze" button | Sends images to Gemini AI |
| `rename` | "Apply AI Names" button | Renames local files + Storage |
| `cleanup` | "Clean Patterns" button | Removes prefixes from filenames |

### Job Lifecycle

```
pending → running → completed
                 ↘ failed
```

### Viewing Jobs

Click the **📋** indicator in the header to see:
- All recent jobs with status
- Per-item progress (each image)
- Error messages for failures
- Timing information

---

## How File Renaming Works

**Important:** The server has access to your local filesystem because Next.js runs on your machine.

### Rename Flow

```
1. User clicks "Apply AI Names"
          ↓
2. Frontend sends POST /api/projects/:id/rename-batch
          ↓
3. Server reads image paths from database
          ↓
4. For each image:
   a. fs.rename(oldPath, newPath)  ← Renames LOCAL file
   b. renameImageInStorage()       ← Renames in Firebase Storage
   c. updateImage()                ← Updates database with new path
          ↓
5. Response sent back to frontend
          ↓
6. UI refreshes to show new names
```

### What Gets Renamed?

| Location | What Happens |
|----------|--------------|
| **Local disk** | `fs.rename()` moves the actual file |
| **Firebase Storage** | File copied to new name, old deleted |
| **Database** | `path`, `currentName`, `storageUrl` updated |

### Collision Handling

If `sunset.jpg` already exists:
```
sunset.jpg → sunset_1.jpg
sunset_1.jpg already exists? → sunset_2.jpg
...and so on
```

---

## Firebase Setup

### Storage Structure

Images are organized by project:

```
projects/
└── {project-name}/
    └── images/
        ├── sunset_beach.jpg
        ├── mountain_view.png
        └── ...
```

### Firestore Collections

```
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
            ├── path: string
            ├── storageUrl: string
            ├── storagePath: string
            ├── suggestedName: string
            ├── status: string
            ├── scannedAt: timestamp
            ├── analyzedAt: timestamp
            ├── renamedAt: timestamp
            └── metadata: {...}
```

---

## API Reference

Base URL: `http://localhost:3000/api`

### Health Check

```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "hasGemini": true,
  "hasFirebase": true,
  "hasStorage": true,
  "services": {
    "gemini": "connected",
    "firestore": "connected",
    "storage": "connected"
  }
}
```

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/projects` | List all projects |
| `POST` | `/projects` | Create project |
| `GET` | `/projects/:id` | Get project details |
| `DELETE` | `/projects/:id` | Delete project + files |

### Images

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/projects/:id/scan` | Scan folder, upload to Storage |
| `GET` | `/projects/:id/images` | List all images |
| `POST` | `/projects/:id/analyze-batch` | AI analysis |
| `POST` | `/projects/:id/rename-batch` | Batch rename |
| `POST` | `/projects/:id/images/:imgId/rename` | Single rename |
| `DELETE` | `/projects/:id/images/:imgId` | Delete image |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/jobs` | List all jobs |
| `GET` | `/jobs/:id` | Get job details |
| `DELETE` | `/jobs/:id` | Cancel job |

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key from [Google AI Studio](https://aistudio.google.com/) |
| `GEMINI_MODEL` | No | Gemini model to use (default: `gemini-3-flash-preview`). Common options: `gemini-3-flash-preview` (recommended), `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`. The app will automatically try fallback models if the specified one isn't available. |
| `FIREBASE_PROJECT_ID` | No | Firebase project ID (default: `aiimagerenamer`) |

### Supported Image Formats

- `.jpg`, `.jpeg`
- `.png`
- `.gif`
- `.webp`
- `.bmp`

---

## Troubleshooting

### Common Issues

**"Gemini API key not configured"**
1. Create `.env.local` in project root
2. Add `GEMINI_API_KEY=your_key_here`
3. Restart dev server (`Ctrl+C`, then `npm run dev`)

**"Model not found" or "404 Not Found" errors**
- The app automatically tries fallback models if your specified model isn't available
- Supported models follow the official Gemini image-understanding docs (e.g. `gemini-3-flash-preview`)
- To specify a model, add `GEMINI_MODEL=gemini-3-flash-preview` to `.env.local`
- Check available models: `GET /api/gemini/models`

**"Storage bucket not available"**
1. Ensure `serviceAccountKey.json` exists
2. Enable Storage in Firebase Console
3. Check bucket name in `firebase.ts`

**Images not renaming locally**
1. The server needs read/write access to the folder
2. Check the folder path in project settings
3. Files might be locked by another program

**Port 3000 already in use**

```powershell
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
```

```bash
# macOS/Linux
kill $(lsof -t -i:3000)
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Check for code issues |

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [Next.js 14](https://nextjs.org/) | React framework with App Router |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe JavaScript |
| [React 18](https://react.dev/) | UI library |
| [Framer Motion](https://www.framer.com/motion/) | Animations |
| [Firebase Admin](https://firebase.google.com/docs/admin/setup) | Server-side Firebase |
| [Firebase Storage](https://firebase.google.com/docs/storage) | Cloud image storage |
| [Google Gemini](https://ai.google.dev/) | AI image analysis |

---

## License

MIT License - feel free to use this project for learning or commercial purposes.
