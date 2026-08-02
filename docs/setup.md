## Setup & Configuration

This guide walks through setting up AI Image Renamer from scratch.

### Prerequisites

- **Node.js 18+** – Recommended LTS.  
- **npm or yarn** – Comes with Node.js.
- **Google Gemini API key** – From [Google AI Studio](https://aistudio.google.com/).
- **Firebase project** – With **Storage** and optionally **Firestore** enabled.

### 1. Install dependencies

```bash
git clone <your-fork-or-repo-url>
cd AiImageRenamer
npm install
```

### 2. Environment variables

Create `.env.local` in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Gemini model to use (default: gemini-3-flash-preview)
GEMINI_MODEL=gemini-3-flash-preview

# Firebase project ID (default: aiimagerenamer)
FIREBASE_PROJECT_ID=aiimagerenamer
```

The Gemini model names follow the official docs for image understanding, e.g.  
see [Gemini image understanding – JavaScript](https://ai.google.dev/gemini-api/docs/image-understanding#javascript).

### 3. Firebase service account

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Open your project → **Project Settings** → **Service Accounts**.
3. Click **“Generate new private key”** and download the JSON.
4. Save it as `serviceAccountKey.json` in the project root (this file is **gitignored**).

The app uses this file (or ADC) to initialize the Firebase Admin SDK on the server.

### 4. Storage rules (development)

For quick local development you can temporarily allow open rules:

```text
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ For production, lock these rules down and require auth.

### 4b. Firestore quotas (free tier)

Firestore's free (Spark) plan allocates roughly **50,000 reads**, **20,000 writes**, and **20,000 deletes per day**, **shared globally across the whole Firebase project** and reset daily. Large scans/analyses can hit these limits and log:

```text
❌ RESOURCE_EXHAUSTED: Quota exceeded.
```

The app mitigates this automatically (quota cooldown, throttled job writes, in-memory fallback, no idle polling — see `docs/architecture-and-jobs.md` → *Firestore Usage, Quotas & Cost Controls*). If you hit the limit:

- **Wait** for the daily reset, or
- **Enable billing (Blaze plan)** for higher limits, or
- Run large **AI analyze** batches spread across days.

You can also run fully **in-memory** (no `serviceAccountKey.json`) for local testing, which uses no Firestore quota at all.

### 5. Run the dev server

```bash
npm run dev
```

Open `http://localhost:3000` (or another port if 3000 is taken).  
Click **“Create Project”**, choose a local folder, then **“Scan Folder”**.

### 6. Helpful scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Check for code issues |
| `npm run rename-local -- <projectId> [--dry-run]` | Standalone Node script to rename files on disk based on AI suggestions |

