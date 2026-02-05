import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { initFirebase } from '@/lib/firebase';
import { getProjects, createProject } from '@/lib/services/project.service';

// GET all projects
export async function GET() {
  try {
    await initFirebase();
    const result = await getProjects();
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ projects: result.projects });
  } catch (error: any) {
    console.error('Get projects error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST create project
export async function POST(request: NextRequest) {
  try {
    await initFirebase();
    const { name, folderPath, description } = await request.json();
    
    if (!name || !folderPath) {
      return NextResponse.json(
        { error: 'Project name and folder path are required' }, 
        { status: 400 }
      );
    }

    const normalizedPath = path.normalize(folderPath);
    
    // Verify folder exists
    try {
      await fs.access(normalizedPath);
    } catch {
      return NextResponse.json({ error: 'Folder does not exist' }, { status: 400 });
    }

    const result = await createProject(name, normalizedPath, description || '');
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log(`✅ Project created: ${result.project?.name}`);
    return NextResponse.json(result.project);
  } catch (error: any) {
    console.error('Create project error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
