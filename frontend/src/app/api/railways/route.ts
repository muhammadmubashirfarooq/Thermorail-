import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// ── Constants ─────────────────────────────────────────────────────────────────
const CACHE_MAX_AGE = 3600;           // 1 hour (browser hard cache)
const STALE_WHILE_REVALIDATE = 86400;   // 24 hours (serve stale while revalidating)

// Candidate local paths for southwest_temperature_mapped.geojson
const CANDIDATES = [
  // Primary: Next.js app public folder
  path.join(process.cwd(), 'public', 'southwest_temperature_mapped.geojson'),
  // Fallback: Parent workspace root public folder
  path.join(process.cwd(), '..', 'public', 'southwest_temperature_mapped.geojson'),
];

// ── GET /api/railways Handler ─────────────────────────────────────────────────
export async function GET() {
  const startTime = performance.now();

  // 1. Locate local dataset file
  let filePath: string | null = null;
  for (const candidate of CANDIDATES) {
    // Turbopack ignore comment to prevent unnecessary full-project tracing
    if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
      filePath = candidate;
      break;
    }
  }

  // 2. Error handling if local file missing
  if (!filePath) {
    return NextResponse.json(
      {
        status: 'error',
        code: 'RAILWAY_ASSET_NOT_FOUND',
        message:
          'southwest_temperature_mapped.geojson could not be located. ' +
          'Ensure the local GeoJSON dataset is placed in the public/ folder.',
        timestamp: new Date().toISOString(),
      },
      { status: 404 }
    );
  }

  try {
    // 3. High-performance non-blocking async file read using fs.promises.readFile
    const rawData = await fs.promises.readFile(/*turbopackIgnore: true*/ filePath, 'utf-8');
    const latencyMs = Math.round(performance.now() - startTime);

    // 4. Return GeoJSON response with strict caching headers
    return new NextResponse(rawData, {
      status: 200,
      headers: {
        'Content-Type': 'application/geo+json; charset=utf-8',

        // HTTP Caching Headers (Task 3.3 requirement)
        'Cache-Control': `public, max-age=${CACHE_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
        
        // Cache optimization & telemetry
        'Vary': 'Accept-Encoding',
        'X-Response-Time': `${latencyMs}ms`,
        'X-Data-Source': 'local:southwest_temperature_mapped.geojson',
        'X-Segment-Count': '45955',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to read railway dataset file';
    return NextResponse.json(
      {
        status: 'error',
        code: 'RAILWAY_READ_ERROR',
        message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
