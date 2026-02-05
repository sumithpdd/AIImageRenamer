import fs from 'fs/promises';
import path from 'path';
import admin from 'firebase-admin';

/**
 * Standalone script to rename files locally based on Firestore data.
 *
 * Usage:
 *   node tools/rename-local.mjs <projectId> [--dry-run]
 *
 * Requirements:
 *   - serviceAccountKey.json present in the project root (or ADC configured)
 *   - FIREBASE_PROJECT_ID set in .env.local (or default aiimagerenamer)
 *
 * This script:
 *   - Reads images from Firestore: projects/{projectId}/images
 *   - For each image with a suggestedName and not yet renamed:
 *       * Renames the local file on disk (like the API rename-batch route)
 *       * Updates Firestore with new currentName, path, renamed flags, timestamps
 */

function logUsageAndExit() {
  console.log('Usage: node tools/rename-local.mjs <projectId> [--dry-run]');
  process.exit(1);
}

if (process.argv.length < 3) {
  logUsageAndExit();
}

const projectId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!projectId || projectId.startsWith('-')) {
  logUsageAndExit();
}

async function initFirebase() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.join(process.cwd(), 'serviceAccountKey.json');
  let serviceAccount = null;

  try {
    const raw = await fs.readFile(serviceAccountPath, 'utf8');
    serviceAccount = JSON.parse(raw);
  } catch {
    // No service account file; fall back to ADC
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || 'aiimagerenamer'
    });
    console.log('✅ Firebase initialized with service account (rename-local)');
  } else {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'aiimagerenamer'
    });
    console.log('✅ Firebase initialized with ADC (rename-local)');
  }
}

async function main() {
  console.log('📝 Local rename script');
  console.log(`   Project ID: ${projectId}`);
  console.log(`   Mode: ${dryRun ? 'DRY RUN (no actual renames)' : 'APPLY CHANGES'}`);
  console.log('');

  await initFirebase();
  const db = admin.firestore();

  // Load project for name (optional)
  let projectName = projectId;
  try {
    const projDoc = await db.collection('projects').doc(projectId).get();
    if (projDoc.exists) {
      const data = projDoc.data() || {};
      projectName = data.name || projectId;
    }
  } catch {
    // ignore
  }

  const imagesRef = db.collection('projects').doc(projectId).collection('images');
  const snap = await imagesRef.get();

  if (snap.empty) {
    console.log('❌ No images found for this project.');
    process.exit(1);
  }

  const images = snap.docs.map(d => {
    const data = d.data() || {};
    return { id: d.id, ...data };
  });
  const candidates = images.filter(img => img.suggestedName && !img.renamed);

  if (candidates.length === 0) {
    console.log('ℹ️ No images with suggested names pending rename.');
    process.exit(0);
  }

  console.log(`📷 Found ${images.length} images, ${candidates.length} pending rename.`);
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < candidates.length; i++) {
    const img = candidates[i];
    const oldPath = String(img.path);
    const oldName = img.currentName || path.basename(oldPath);
    const ext = img.extension || path.extname(oldPath);
    const baseName = String(img.suggestedName);

    let newNameBase = baseName;
    let newPath = path.join(path.dirname(oldPath), newNameBase + ext);
    let counter = 1;

    // Ensure unique filename on disk
    while (true) {
      try {
        await fs.access(newPath);
        newNameBase = `${baseName}_${counter}`;
        newPath = path.join(path.dirname(oldPath), newNameBase + ext);
        counter++;
      } catch {
        break;
      }
    }

    const newFullName = newNameBase + ext;

    console.log(`  [${i + 1}/${candidates.length}] ${oldName} → ${newFullName}`);

    try {
      if (!dryRun) {
        await fs.rename(oldPath, newPath);

        const now = new Date().toISOString();
        const update = {
          currentName: newFullName,
          path: newPath,
          renamed: true,
          renamedAt: now,
          status: 'renamed'
        };

        if (img.metadata && typeof img.metadata === 'object') {
          update.metadata = {
            ...img.metadata,
            lastModified: now
          };
        }

        await imagesRef.doc(img.id).update(update);
      }

      successCount++;
    } catch (err) {
      errorCount++;
      console.error(`    ❌ Error renaming ${oldName}: ${err.message}`);
    }
  }

  console.log('');
  console.log(`📊 Done. ${successCount} renamed, ${errorCount} errors.${dryRun ? ' (DRY RUN)' : ''}`);
}

main().catch(err => {
  console.error('❌ Unexpected error in rename-local script:', err);
  process.exit(1);
});

