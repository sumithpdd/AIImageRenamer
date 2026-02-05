/**
 * Project Service
 * Handles CRUD operations for projects in Firestore or in-memory storage
 */

import { getDb, getAdmin } from '@/lib/firebase';
import { inMemoryProjects, Project } from '@/lib/storage';
import { deleteProjectImages } from './storage.service';
import { prepareForFirestore } from '@/lib/utils/firestore.utils';

// Generate unique project ID
function generateProjectId(): string {
  return `proj_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

// Create a new project
export async function createProject(
  name: string,
  folderPath: string,
  description: string = ''
): Promise<{ success: boolean; project?: Project & { id: string }; error?: string }> {
  const db = getDb();
  
  const projectData: Project = {
    name,
    folderPath,
    description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    imageCount: 0,
    analyzedCount: 0,
    renamedCount: 0,
    status: 'created'
  };

  try {
    if (db) {
      const cleanedData = prepareForFirestore(projectData);
      const docRef = await db.collection('projects').add(cleanedData);
      console.log(`✅ Project created in Firestore: ${docRef.id}`);
      return { success: true, project: { id: docRef.id, ...projectData } };
    } else {
      const id = generateProjectId();
      inMemoryProjects.set(id, projectData);
      console.log(`✅ Project created in memory: ${id}`);
      return { success: true, project: { id, ...projectData } };
    }
  } catch (error: any) {
    console.error('❌ Create project error:', error.message);
    return { success: false, error: error.message };
  }
}

// Get all projects
export async function getProjects(): Promise<{ 
  success: boolean; 
  projects?: Array<Project & { id: string }>; 
  error?: string 
}> {
  const db = getDb();

  try {
    if (db) {
      const snapshot = await db.collection('projects')
        .orderBy('updatedAt', 'desc')
        .get();
      
      const projects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Array<Project & { id: string }>;
      
      return { success: true, projects };
    } else {
      const projects = Array.from(inMemoryProjects.entries()).map(([id, data]) => ({
        id,
        ...data
      }));
      
      // Sort by updatedAt descending
      projects.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      
      return { success: true, projects };
    }
  } catch (error: any) {
    console.error('❌ Get projects error:', error.message);
    return { success: false, error: error.message };
  }
}

// Get a single project by ID
export async function getProject(
  projectId: string
): Promise<{ success: boolean; project?: Project & { id: string }; error?: string }> {
  const db = getDb();

  try {
    if (db) {
      const doc = await db.collection('projects').doc(projectId).get();
      if (!doc.exists) {
        return { success: false, error: 'Project not found' };
      }
      return { success: true, project: { id: doc.id, ...doc.data() } as Project & { id: string } };
    } else {
      const data = inMemoryProjects.get(projectId);
      if (!data) {
        return { success: false, error: 'Project not found' };
      }
      return { success: true, project: { id: projectId, ...data } };
    }
  } catch (error: any) {
    console.error('❌ Get project error:', error.message);
    return { success: false, error: error.message };
  }
}

// Update project
export async function updateProject(
  projectId: string,
  updates: Partial<Project>
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  
  const updateData = {
    ...updates,
    updatedAt: new Date().toISOString()
  };

  try {
    if (db) {
      const cleanedData = prepareForFirestore(updateData);
      await db.collection('projects').doc(projectId).update(cleanedData);
    } else {
      const existing = inMemoryProjects.get(projectId);
      if (!existing) {
        return { success: false, error: 'Project not found' };
      }
      Object.assign(existing, updateData);
    }
    return { success: true };
  } catch (error: any) {
    console.error('❌ Update project error:', error.message);
    return { success: false, error: error.message };
  }
}

// Update project stats
export async function updateProjectStats(
  projectId: string,
  stats: { imageCount?: number; analyzedCount?: number; renamedCount?: number }
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  const admin = getAdmin();

  try {
    if (db) {
      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString()
      };
      
      // Use increment for Firestore
      if (stats.imageCount !== undefined) {
        updateData.imageCount = stats.imageCount;
      }
      if (stats.analyzedCount !== undefined) {
        updateData.analyzedCount = admin.firestore.FieldValue.increment(stats.analyzedCount);
      }
      if (stats.renamedCount !== undefined) {
        updateData.renamedCount = admin.firestore.FieldValue.increment(stats.renamedCount);
      }
      
      await db.collection('projects').doc(projectId).update(updateData);
    } else {
      const existing = inMemoryProjects.get(projectId);
      if (!existing) {
        return { success: false, error: 'Project not found' };
      }
      
      if (stats.imageCount !== undefined) existing.imageCount = stats.imageCount;
      if (stats.analyzedCount !== undefined) existing.analyzedCount += stats.analyzedCount;
      if (stats.renamedCount !== undefined) existing.renamedCount += stats.renamedCount;
      existing.updatedAt = new Date().toISOString();
    }
    return { success: true };
  } catch (error: any) {
    console.error('❌ Update project stats error:', error.message);
    return { success: false, error: error.message };
  }
}

// Delete project and all its images
export async function deleteProject(
  projectId: string,
  deleteStorageFiles = true
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();

  try {
    // First get project to know the name for storage deletion
    const projectResult = await getProject(projectId);
    
    if (db) {
      // Delete all images in subcollection
      const imagesRef = db.collection('projects').doc(projectId).collection('images');
      const images = await imagesRef.get();
      
      const batch = db.batch();
      images.docs.forEach(doc => batch.delete(doc.ref));
      
      // Delete project document
      batch.delete(db.collection('projects').doc(projectId));
      await batch.commit();
    } else {
      // Delete from in-memory
      inMemoryProjects.delete(projectId);
      
      // Also delete images from in-memory
      const { clearProjectImages } = await import('@/lib/storage');
      clearProjectImages(projectId);
    }
    
    // Delete from Firebase Storage if project was found
    if (deleteStorageFiles && projectResult.success && projectResult.project) {
      await deleteProjectImages(projectResult.project.name);
    }
    
    console.log(`✅ Project deleted: ${projectId}`);
    return { success: true };
  } catch (error: any) {
    console.error('❌ Delete project error:', error.message);
    return { success: false, error: error.message };
  }
}
