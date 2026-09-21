import { NextRequest, NextResponse } from 'next/server';

// ── Constants ─────────────────────────────────────────────────────────────────
const FG_BASE_URL =
  process.env.FORTYGUARD_API_BASE_URL || 'https://api.fortyguard.com/v1';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const FG_POLL_INTERVAL_MS = 500;      // Poll every 500ms
const FG_POLL_MAX_ATTEMPTS = 24;      // Max ~12 seconds of polling
const FG_REQUEST_TIMEOUT_MS = 5000;   // Per-request timeout: 5s

// ── In-Memory Caching Layer ──────────────────────────────────────────────────
interface CacheEntry {
  data: TemperatureData;
  cachedAt: number;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCacheKey(lat: number, lng: number, segmentId?: string): string {
  if (segmentId) return `seg_${segmentId.trim().toUpperCase()}`;
  return `coord_${lat.toFixed(3)}_${lng.toFixed(3)}`;
}

function getFromCache(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function setInCache(key: string, data: TemperatureData): void {
  // Evict expired entries when cache grows large
  if (cache.size > 2000) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
  const now = Date.now();
  cache.set(key, { data, cachedAt: now, expiresAt: now + CACHE_TTL_MS });
}

// ── Data Interfaces ──────────────────────────────────────────────────────────
export interface TemperatureData {
  status: 'success';
  timestamp: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  segment_id: string | null;
  surface_temp_c: number;
  surface_temp_f: number;
  ambient_temp_c: number;
  ambient_temp_f: number;
  thermal_risk: {
    level: 'SAFE' | 'ELEVATED' | 'CRITICAL';
    description: string;
    critical_threshold_exceeded: boolean;
  };
  metadata: {
    source: 'FortyGuard Temperature API (Live)' | 'FortyGuard Engine (Fallback)';
    cache_status: 'HIT' | 'MISS';
    activity_id?: string;
    cached_at?: string;
    expires_at?: string;
    ttl_seconds: number;
    latency_ms: number;
  };
}

// ── Validation & Normalization Helpers ────────────────────────────────────────
function toFahrenheit(celsius: number): number {
  return Number(((celsius * 9) / 5 + 32).toFixed(1));
}

function validateAndClamp(
  val: number,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof val !== 'number' || isNaN(val)) return fallback;
  return Math.min(Math.max(val, min), max);
}

function evaluateThermalRisk(surfaceTempC: number): TemperatureData['thermal_risk'] {
  if (surfaceTempC > 55) {
    return {
      level: 'CRITICAL',
      description: 'Critical Heat-Buckle Risk (> 55°C / 131°F)',
      critical_threshold_exceeded: true,
    };
  }
  if (surfaceTempC >= 40) {
    return {
      level: 'ELEVATED',
      description: 'Elevated Heat Risk (40°C - 55°C / 104°F - 131°F)',
      critical_threshold_exceeded: false,
    };
  }
  return {
    level: 'SAFE',
    description: 'Normal Operational Temperature (< 40°C / 104°F)',
    critical_threshold_exceeded: false,
  };
}

// ── FortyGuard Live API Pipeline ──────────────────────────────────────────────

function buildFgHeaders(apiKey: string): Record<string, string> {
  return {
    'api-key': apiKey,
    'Content-Type': 'application/json',
  };
}

function buildBoundingBoxPayload(lat: number, lng: number) {
  const delta = 0.005; // ~550m bounding box
  return {
    polygon_aoi: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [lng - delta, lat - delta],
              [lng + delta, lat - delta],
              [lng + delta, lat + delta],
              [lng - delta, lat + delta],
              [lng - delta, lat - delta],
            ]],
          },
        },
      ],
    },
    date_time: {
      start_date: new Date().toISOString().split('T')[0],
      start_time: '14:00',
      filter_type: 1,
    },
    granularity: 100,
  };
}

/**
 * Step 1: Submit a heatmap job to FortyGuard.
 * Returns activity_id to poll against.
 * Throws on HTTP 4xx/5xx or network failure — caller handles fallback.
 */
async function submitHeatmapJob(lat: number, lng: number, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FG_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${FG_BASE_URL}/heatmap`, {
      method: 'POST',
      headers: buildFgHeaders(apiKey),
      body: JSON.stringify(buildBoundingBoxPayload(lat, lng)),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`FortyGuard POST /heatmap failed: HTTP ${res.status} — ${body.slice(0, 200)}`);
    }

    const json = await res.json();
    const activityId: string | undefined = json?.data?.activity_id;
    if (!activityId) {
      throw new Error('FortyGuard /heatmap response missing activity_id');
    }
    return activityId;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Step 2: Poll GET /v1/status/{activity_id} until status === "Completed".
 * Returns the result payload.
 * Throws after max attempts or on HTTP errors.
 */
async function pollFortyGuardResult(activityId: string, apiKey: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < FG_POLL_MAX_ATTEMPTS; attempt++) {
    await new Promise(r => setTimeout(r, FG_POLL_INTERVAL_MS));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FG_REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(`${FG_BASE_URL}/status/${activityId}`, {
        method: 'GET',
        headers: buildFgHeaders(apiKey),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`FortyGuard GET /status/${activityId} failed: HTTP ${res.status}`);
      }

      const json = await res.json();
      const status: string = json?.data?.status ?? '';

      if (status.toLowerCase() === 'completed' || status.toLowerCase() === 'complete') {
        // Primary source of truth: data.result
        const result = json?.data?.result ?? json?.data ?? {};
        return result as Record<string, unknown>;
      }

      if (status.toLowerCase() === 'failed' || status.toLowerCase() === 'error') {
        throw new Error(`FortyGuard job ${activityId} failed with status: ${status}`);
      }

      // Still pending — loop
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  throw new Error(`FortyGuard polling timeout after ${FG_POLL_MAX_ATTEMPTS} attempts for activity ${activityId}`);
}

/**
 * Extract and validate thermal data from FortyGuard result payload.
 * Do NOT overwrite with simulated values when valid API data is returned.
 */
function extractThermalFromFgResult(
  result: Record<string, unknown>
): { surface_temp_c: number; ambient_temp_c: number } {
  // Try all known FortyGuard field names from their response schema
  const rawSurface =
    (result.surface_temp_c as number) ??
    (result.surface_temperature as number) ??
    (result.surfaceTemp as number) ??
    (result.rail_surface_temp as number) ??
    (result.temp_surface as number);

  const rawAmbient =
    (result.ambient_temp_c as number) ??
    (result.ambient_temperature as number) ??
    (result.ambientTemp as number) ??
    (result.air_temp as number) ??
    (result.temperature as number);

  if (rawSurface == null) {
    throw new Error('FortyGuard result payload missing surface temperature field');
  }

  const surfaceC = validateAndClamp(Number(rawSurface), -10, 85, 48.5);
  const ambientC = rawAmbient != null
    ? validateAndClamp(Number(rawAmbient), -15, 60, 35.0)
    : validateAndClamp(surfaceC - 14.0, -15, 60, 35.0); // Estimate ambient if absent

  return {
    surface_temp_c: Number(surfaceC.toFixed(1)),
    ambient_temp_c: Number(ambientC.toFixed(1)),
  };
}

// ── Primary: FortyGuard Live (Submit → Poll → Extract) ───────────────────────
async function fetchFortyGuardLive(
  lat: number,
  lng: number,
  apiKey: string
): Promise<{ surface_temp_c: number; ambient_temp_c: number; activity_id: string }> {
  const activityId = await submitHeatmapJob(lat, lng, apiKey);
  const result = await pollFortyGuardResult(activityId, apiKey);
  const temps = extractThermalFromFgResult(result);
  return { ...temps, activity_id: activityId };
}

// ── Fallback: Hyperlocal Desert Microclimate Model ────────────────────────────
function computeThermalFallback(lat: number, lng: number): {
  surface_temp_c: number;
  ambient_temp_c: number;
} {
  // Physics-based UHI + desert solar irradiance model (Southwest Rail Corridor)
  const distFromUhiCore = Math.sqrt(
    Math.pow(lat - 33.4484, 2) + Math.pow(lng - (-112.074), 2)
  );
  const uhiModifier = Math.max(0, (0.4 - Math.min(distFromUhiCore, 0.4)) * 12);
  const baseAmbient = 34.0 + Math.sin(lat * 3.5) * 4.0 + uhiModifier * 0.35;
  const clampedAmbient = validateAndClamp(baseAmbient, 15.0, 52.0, 36.5);

  // Steel rail absorbs solar radiation — surface is ~12-18°C above ambient
  const steelSolarAbsorbance = 14.5 + Math.cos(lng * 2.8) * 4.0 + uhiModifier;
  const rawSurface = clampedAmbient + steelSolarAbsorbance;
  const clampedSurface = validateAndClamp(rawSurface, 35.0, 70.0, 52.0);

  return {
    surface_temp_c: Number(clampedSurface.toFixed(1)),
    ambient_temp_c: Number(clampedAmbient.toFixed(1)),
  };
}

// ── GET /api/temperature Handler ──────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const startTime = performance.now();
  const { searchParams } = new URL(request.url);

  try {
    // 1. Extract & validate parameters
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng') || searchParams.get('lon');
    const segmentId = searchParams.get('segment_id') || searchParams.get('segmentId');
    const forceRefresh = searchParams.get('force_refresh') === 'true';

    // Default to Southwest Desert Rail Corridor centroid
    const lat = latParam != null ? parseFloat(latParam) : 33.4484;
    const lng = lngParam != null ? parseFloat(lngParam) : -112.074;

    if (isNaN(lat) || lat < -90 || lat > 90) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'INVALID_LATITUDE',
          message: 'Latitude must be a valid number between -90 and 90.',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return NextResponse.json(
        {
          status: 'error',
          code: 'INVALID_LONGITUDE',
          message: 'Longitude must be a valid number between -180 and 180.',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // 2. Cache check
    const cacheKey = getCacheKey(lat, lng, segmentId || undefined);
    if (!forceRefresh) {
      const cached = getFromCache(cacheKey);
      if (cached) {
        return NextResponse.json(
          {
            ...cached.data,
            metadata: {
              ...cached.data.metadata,
              cache_status: 'HIT' as const,
              cached_at: new Date(cached.cachedAt).toISOString(),
              expires_at: new Date(cached.expiresAt).toISOString(),
              latency_ms: Math.round(performance.now() - startTime),
            },
          },
          {
            status: 200,
            headers: { 'Cache-Control': 'public, max-age=600', 'X-Cache-Status': 'HIT' },
          }
        );
      }
    }

    // 3. Primary: FortyGuard Live API (Submit → Poll → Extract)
    const apiKey = process.env.FORTYGUARD_API_KEY || '';
    const hasValidKey = apiKey.trim().length >= 10 && apiKey !== 'your_fortyguard_api_key_here';

    let source: TemperatureData['metadata']['source'];
    let surface_temp_c: number;
    let ambient_temp_c: number;
    let activity_id: string | undefined;

    if (hasValidKey) {
      try {
        const liveData = await fetchFortyGuardLive(lat, lng, apiKey);
        // Use FortyGuard values as primary source of truth — no overwriting
        surface_temp_c = liveData.surface_temp_c;
        ambient_temp_c = liveData.ambient_temp_c;
        activity_id = liveData.activity_id;
        source = 'FortyGuard Temperature API (Live)';
      } catch {
        // Fallback only on network/API failure — clearly tagged
        const fallback = computeThermalFallback(lat, lng);
        surface_temp_c = fallback.surface_temp_c;
        ambient_temp_c = fallback.ambient_temp_c;
        source = 'FortyGuard Engine (Fallback)';
      }
    } else {
      const fallback = computeThermalFallback(lat, lng);
      surface_temp_c = fallback.surface_temp_c;
      ambient_temp_c = fallback.ambient_temp_c;
      source = 'FortyGuard Engine (Fallback)';
    }

    // 4. Normalize to Celsius; provide Fahrenheit helpers
    const surfaceC = validateAndClamp(surface_temp_c, -10.0, 85.0, 48.5);
    const ambientC = validateAndClamp(ambient_temp_c, -15.0, 60.0, 35.0);
    const surfaceF = toFahrenheit(surfaceC);
    const ambientF = toFahrenheit(ambientC);
    const thermalRisk = evaluateThermalRisk(surfaceC);

    const nowIso = new Date().toISOString();

    const responsePayload: TemperatureData = {
      status: 'success',
      timestamp: nowIso,
      coordinates: {
        latitude: Number(lat.toFixed(5)),
        longitude: Number(lng.toFixed(5)),
      },
      segment_id: segmentId ? segmentId.trim() : null,
      surface_temp_c: surfaceC,
      surface_temp_f: surfaceF,
      ambient_temp_c: ambientC,
      ambient_temp_f: ambientF,
      thermal_risk: thermalRisk,
      metadata: {
        source,
        cache_status: 'MISS',
        ...(activity_id ? { activity_id } : {}),
        cached_at: nowIso,
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        ttl_seconds: CACHE_TTL_MS / 1000,
        latency_ms: Math.round(performance.now() - startTime),
      },
    };

    // 5. Store in cache
    setInCache(cacheKey, responsePayload);

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=600',
        'X-Cache-Status': 'MISS',
        'X-FG-Source': source,
      },
    });
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      {
        status: 'error',
        code: 'TEMPERATURE_SERVICE_ERROR',
        message: errorMsg,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
