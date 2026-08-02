import { NextRequest, NextResponse } from 'next/server';
import { initFirebase } from '@/lib/firebase';
import {
  listTaxonomies,
  getOrCreateTaxonomy,
  TaxonomyType
} from '@/lib/services/taxonomy.service';

const VALID_TYPES: TaxonomyType[] = ['tag', 'color', 'category', 'style', 'mood'];

export async function GET(request: NextRequest) {
  try {
    await initFirebase();
    const typeParam = request.nextUrl.searchParams.get('type');
    const type = typeParam && VALID_TYPES.includes(typeParam as TaxonomyType)
      ? (typeParam as TaxonomyType)
      : undefined;

    const result = await listTaxonomies(type);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ items: result.items });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await initFirebase();
    const body = await request.json();
    const type = (body.type || 'tag') as TaxonomyType;
    const name = String(body.name || '').trim();

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid taxonomy type' }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const item = await getOrCreateTaxonomy(type, name);
    if (!item) {
      return NextResponse.json({ error: 'Failed to create taxonomy item' }, { status: 500 });
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
