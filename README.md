# AI Image Renamer

A Next.js 14 application that uses **Google Gemini** to analyze images and suggest meaningful filenames. Built with TypeScript, React, Firebase, and a modular service-layer architecture.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![React](https://img.shields.io/badge/React-18-61DAFB)
![Firebase](https://img.shields.io/badge/Firebase-Storage-orange)
![Gemini](https://img.shields.io/badge/AI-Google%20Gemini-blue)

---

## Documentation Map

- **Overview & architecture**: `docs/overview.md`
- **Setup & configuration**: `docs/setup.md`
- **Architecture, Firestore schema & jobs**: `docs/architecture-and-jobs.md`
- **Gemini image analysis & AI naming**: `docs/gemini-image-analysis.md`

The rest of this README focuses on **quick start**, **API overview**, and **operations**.

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

### Step 2: Configure Environment & Firebase

See `docs/setup.md` for detailed steps on:

- `.env.local` (Gemini + Firebase)
- Firebase service account
- Storage rules

### Step 3: Run the App

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### Step 4: Stop the App

Press `Ctrl+C` in the terminal.

---

## Why Next.js & Architecture

See `docs/overview.md` and `docs/architecture-and-jobs.md` for a full explanation of:

- Why the project uses Next.js App Router instead of separate React + Express.
- How the folder structure is organized.
- How API routes, services, and components fit together.

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

See `docs/architecture-and-jobs.md` for a full description of:

- Job types (`scan`, `analyze`, `rename`, `cleanup`)
- Job lifecycle and progress tracking
- The `jobs` collection schema in Firestore and how it links to projects/images

---

## How File Renaming Works

See `docs/architecture-and-jobs.md` for a detailed flow of rename operations (local disk + Firebase Storage + Firestore) and the standalone `rename-local` script.

---

## Firebase Setup

See `docs/setup.md` and `docs/architecture-and-jobs.md` for Storage structure, Firestore collections, and taxonomy details.

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
| `POST` | `/projects/:id/cleanup-duplicates` | Remove duplicate images (keep one copy per hash) |
| `GET` | `/projects/:id/download-zip` | Download all project images as a ZIP |

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/jobs` | List all jobs |
| `GET` | `/jobs/:id` | Get job details |
| `DELETE` | `/jobs/:id` | Cancel job |

---

## Configuration (Summary)

For detailed configuration and troubleshooting, see `docs/setup.md`.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key from [Google AI Studio](https://aistudio.google.com/) |
| `GEMINI_MODEL` | No | Gemini model to use (default: `gemini-3-flash-preview`). See [Gemini models](https://ai.google.dev/gemini-api/docs/models). |
| `FIREBASE_PROJECT_ID` | No | Firebase project ID (default: `aiimagerenamer`) |

Supported image formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`.

---

## Scripts (Summary)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Check for code issues |
| `npm run rename-local -- <projectId> [--dry-run]` | Standalone Node script to rename files on disk based on AI suggestions |

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

Apache-2.0 License — see the `LICENSE` file in the repository for full terms.
