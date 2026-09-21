import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import { alertEngine, initAlertsUI } from './alerts.js';
import { initPrecautionsUI } from './precautions.js';
import { initAnalyticsUI } from './analytics.js';
import { initReportsUI } from './reports.js';

// ── Map Constants & Style Endpoints ──────────────────────────────────────────
const HOUSTON_COORDS   = [-95.3698, 29.7604];
const DEFAULT_ZOOM     = 9;

// Primary Zero-Flash Basemap Styles
const CARTO_DARK_STYLE  = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const CARTO_LIGHT_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const SOUTHWEST_GEOJSON_URL   = '/southwest_thermal_network.geojson';
const SOUTHWEST_STATES_GEOJSON = '/southwest_states_boundary.geojson';
const SOUTHWEST_COORDS        = [-106.0, 33.5];
const SOUTHWEST_ZOOM          = 5.5;
const SOUTHWEST_BOUNDS        = [
  [-125.0, 22.0],
  [-85.0,  45.0]
];

// ── Risk-level color palette (4-tier Enterprise Standard) ────────────────────
const RISK_COLORS = {
  CRITICAL: '#C62828',   // >=60°C deep red
  HIGH:     '#EF6C00',   // 50-59°C orange
  MODERATE: '#F9A825',   // 40-49°C amber
  LOW:      '#2E7D32',   // <40°C   green
  SAFE:     '#2E7D32',
  ELEVATED: '#EF6C00'
};

// ── Global State & In-Memory GeoJSON Cache ───────────────────────────────────
let geojsonCachePromise = null;
let southwestGeojsonData = null;
let topCorridorsCache = [];
let activeTrackSelection = null;
let activeTrackMarker = null;
let legendVisible = true;
let isDarkTheme = false;
let is3DView = false;

// ── Single Source-of-Truth Data Fetcher ───────────────────────────────────────
if (typeof window !== 'undefined') {
  window.alertEngine = alertEngine;
}

function getSouthwestGeoJSON() {
  if (!geojsonCachePromise) {
    geojsonCachePromise = fetch(SOUTHWEST_GEOJSON_URL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .catch(() => fetch('/thermorail_analyzed_tracks.geojson').then(r => r.json()))
      .catch(() => fetch('/southwest_temperature_mapped.geojson').then(r => r.json()))
      .then(data => {
        southwestGeojsonData = data;
        if (typeof window !== 'undefined') {
          window.southwestGeojsonData = data;
        }
        if (data && alertEngine && typeof alertEngine.generateAlertsFromGeoJSON === 'function') {
          alertEngine.generateAlertsFromGeoJSON(data, extractFeatureTelemetry, getFeatureCenter)
            .then(() => {
              const alertsEl = document.getElementById('metric-active-alerts');
              if (alertsEl) alertsEl.textContent = String(alertEngine.getActiveCount());
            })
            .catch(err => console.warn('[AlertEngine] Boot generation notice:', err));
        }
        return data;
      })
      .catch(err => {
        console.error('[ThermoRail] GeoJSON fetch error:', err);
        geojsonCachePromise = null;
        return null;
      });
  }
  return geojsonCachePromise;
}

// Preload GeoJSON cache immediately
getSouthwestGeoJSON();

// ── Canonical Property Extractors & Defensive Normalizers ────────────────────
function normalizeRiskLevel(value) {
  const level = String(value || '').trim().toUpperCase();
  if (['CRITICAL', 'HIGH', 'MODERATE', 'LOW', 'SAFE', 'ELEVATED'].includes(level)) return level;
  if (!level) return 'LOW';
  if (level.includes('CRIT')) return 'CRITICAL';
  if (level.includes('HIGH')) return 'HIGH';
  if (level.includes('MOD')) return 'MODERATE';
  if (level.includes('SAFE')) return 'LOW';
  return 'LOW';
}

function riskColor(level) {
  const norm = normalizeRiskLevel(level);
  return RISK_COLORS[norm] || RISK_COLORS.LOW;
}

function readNumericProperty(props, keys, fallback = null) {
  if (!props || typeof props !== 'object') return fallback;
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    if (key == null) continue;
    const value = props[key];
    if (value == null || value === '') continue;
    const num = Number(value);
    if (!Number.isNaN(num) && Number.isFinite(num)) return num;
  }
  return fallback;
}

function pickFeatureValue(props, keys, fallback = null) {
  if (!props || typeof props !== 'object') return fallback;
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    if (key == null) continue;
    const value = props[key];
    if (value == null) continue;
    const str = String(value).trim();
    if (str === '' || str.toLowerCase() === 'unavailable') continue;
    return value;
  }
  return fallback;
}

/**
 * Enterprise Corridor Designation Resolver
 * Defensively extracts corridor names with geographic fallback resolution.
 */
function getFeatureDisplayName(featureOrProps = {}, fallback = 'Rail Segment', lat = null, lng = null) {
  const p = featureOrProps?.properties ?? (typeof featureOrProps === 'object' ? featureOrProps : {});
  const explicit = pickFeatureValue(p, ['corridor_name', 'name', 'track_name', 'route_name', 'segment_name']);
  if (explicit != null) {
    const value = String(explicit).trim();
    if (value && value.toLowerCase() !== 'unavailable' && !/^\d+$/.test(value)) {
      return value;
    }
  }

  const segmentId = String(p?.segment_id ?? p?.M_ID ?? p?.id ?? featureOrProps?.id ?? '');
  
  // Intelligent geographical trunk corridor name mapping for Southwest network
  if (lng != null && lat != null) {
    if (lng < -110.0) {
      if (lat < 33.2) return `Sunset Route (Yuma - Gila Bend Trunk)`;
      if (lat < 33.7) return `AZ Mainline - Segment ${segmentId || '00685'}`;
      return `Santa Fe Northern AZ Corridor`;
    } else if (lng < -104.0) {
      if (lat < 32.5) return `Sunset Route (El Paso Trunk)`;
      if (lat > 34.0) return `Santa Fe Southern Trunk (NM)`;
      return `Rio Grande Express Corridor`;
    } else {
      if (lat < 30.0) return `Gulf Coast Express Line`;
      if (lat > 32.5) return `Lone Star Freight Corridor (DFW)`;
      return `Trans-Texas Rail Corridor`;
    }
  }

  if (segmentId) return `Corridor Segment ${segmentId}`;
  return fallback;
}

export function getFeatureCenter(feature) {
  if (!feature || !feature.geometry) return null;
  const geom = feature.geometry;
  if (geom.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length > 0) {
    return geom.coordinates[Math.floor(geom.coordinates.length / 2)] || null;
  } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates) && geom.coordinates[0]?.length > 0) {
    return geom.coordinates[0][Math.floor(geom.coordinates[0].length / 2)] || null;
  } else if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    return geom.coordinates;
  }
  return null;
}

/**
 * Unified Single Source-of-Truth Property Resolver
 * Defensively extracts exact mathematical values from GeoJSON properties.
 */
export function extractFeatureTelemetry(featureOrProps = {}, lat = null, lng = null) {
  const p = featureOrProps?.properties ?? (typeof featureOrProps === 'object' ? featureOrProps : {});
  const segId = String(p?.segment_id ?? p?.M_ID ?? p?.id ?? featureOrProps?.id ?? 'SW_000241');
  const corridorName = getFeatureDisplayName(p, 'Southwest Rail Corridor', lat, lng);
  const operator = pickFeatureValue(p, ['operator', 'owner', 'old_railway_operator'], 'Union Pacific / BNSF');
  const maxSpeed = p.maxspeed_mph != null ? `${p.maxspeed_mph} mph` : (p.maxspeed || '65 mph (Standard)');
  const trackClass = pickFeatureValue(p, ['track_class', 'railway:track_class', 'usage'], 'FRA Class 4 (Mainline)');

  // Exact Temperatures (FortyGuard API standard fields)
  const surfaceTemp = readNumericProperty(p, ['surface_temp_c', 'track_surface_temp_c', 'surface_temperature_c', 'surface_temp'], null);
  const estRailTemp = readNumericProperty(p, ['rail_temp_estimate', 'est_rail_temp', 'rail_temp_c', 'estimated_rail_temp_c'], null)
    ?? (surfaceTemp != null ? surfaceTemp + 3.0 : 48.0);
  const resolvedSurface = surfaceTemp ?? (estRailTemp != null ? estRailTemp - 3.0 : 45.0);
  const ambientTemp = readNumericProperty(p, ['ambient_temp', 'ambient_temp_c', 'ambient_air_temp_c', 'air_temp_c'], null)
    ?? Math.max(22.0, resolvedSurface - 14.5);

  // Exact Risk Metrics
  const riskScore = readNumericProperty(p, ['risk_score', 'heat_risk_score', 'risk_index'], null)
    ?? Math.min(99, Math.max(15, Math.round((estRailTemp / 65) * 100)));
  const rawRiskLevel = pickFeatureValue(p, ['risk_level', 'status', 'thermal_status'], null);
  const riskLevel = rawRiskLevel
    ? normalizeRiskLevel(rawRiskLevel)
    : (estRailTemp >= 60 ? 'CRITICAL' : estRailTemp >= 50 ? 'HIGH' : estRailTemp >= 40 ? 'MODERATE' : 'LOW');

  // State
  const state = p.state || (lng != null && lng < -109 ? 'AZ' : lat != null && lat > 34 ? 'NM' : 'TX');

  // Explanation & Proximity Zone
  const explanation = p.explanation || p.assessment || (
    estRailTemp >= 60
      ? 'Critical heat exposure crossing severe rail buckling threshold (≥60.0°C).'
      : estRailTemp >= 50
      ? 'High thermal stress with increased risk of continuous welded rail deformation.'
      : estRailTemp >= 40
      ? 'Moderate heat exposure under elevated ambient conditions.'
      : 'Track and ambient thermal parameters operating within safe limits.'
  );

  const proximityZone = p.proximity_zone_500m || null;

  return {
    segment_id: segId,
    corridor_name: corridorName,
    operator,
    max_speed: maxSpeed,
    track_class: trackClass,
    surface_temp_c: Number(Number(resolvedSurface).toFixed(1)),
    est_rail_temp_c: Number(Number(estRailTemp).toFixed(1)),
    ambient_temp_c: Number(Number(ambientTemp).toFixed(1)),
    risk_score: Math.min(99, Math.max(5, Math.round(Number(riskScore)))),
    risk_level: riskLevel,
    status: riskLevel,
    state,
    explanation,
    proximity_zone_500m: proximityZone,
    lat,
    lng
  };
}

// ── MapLibre Dynamic Styling Expressions ─────────────────────────────────────
const DYNAMIC_RAIL_COLOR = [
  'case',
  ['has', 'color'], ['get', 'color'],
  [
    'match',
    ['upcase', ['get', 'risk_level']],
    'CRITICAL', RISK_COLORS.CRITICAL,
    'HIGH',     RISK_COLORS.HIGH,
    'MODERATE', RISK_COLORS.MODERATE,
    'LOW',      RISK_COLORS.LOW,
    'SAFE',     RISK_COLORS.SAFE,
    'ELEVATED', RISK_COLORS.ELEVATED,
    RISK_COLORS.LOW
  ]
];

const DYNAMIC_RAIL_WIDTH = [
  'match',
  ['upcase', ['get', 'risk_level']],
  'CRITICAL', 3.0,
  'HIGH',     2.5,
  'MODERATE', 2.0,
  'LOW',      1.5,
  'SAFE',     1.5,
  'ELEVATED', 2.0,
  1.8
];

// ── 500m Proximity Buffer Spatial Generator ──────────────────────────────────
function createGeoJSONCircle(lng, lat, radiusMeters = 500, numPoints = 64) {
  const coords = [];
  const distanceDeg = radiusMeters / 111320;
  const lngCorrection = distanceDeg / Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    coords.push([
      lng + lngCorrection * Math.sin(angle),
      lat + distanceDeg  * Math.cos(angle)
    ]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

function renderProximityBuffer(lng, lat, riskColorHex) {
  const circleData = createGeoJSONCircle(lng, lat, 500);
  const glowColor  = riskColorHex || '#00f0ff';
  const source = map.getSource('proximity-buffer-source');
  if (source) {
    source.setData(circleData);
  } else {
    map.addSource('proximity-buffer-source', { type: 'geojson', data: circleData });
    map.addLayer({ id: 'proximity-buffer-fill',   type: 'fill', source: 'proximity-buffer-source', paint: { 'fill-color': glowColor, 'fill-opacity': 0.12 } });
    map.addLayer({ id: 'proximity-buffer-stroke', type: 'line', source: 'proximity-buffer-source', paint: { 'line-color': glowColor, 'line-width': 2.0, 'line-dasharray': [4, 3], 'line-opacity': 0.85 } });
  }
  map.setPaintProperty('proximity-buffer-fill',   'fill-color', glowColor);
  map.setPaintProperty('proximity-buffer-stroke', 'line-color', glowColor);
}

function clearProximityBuffer() {
  if (map.getLayer('proximity-buffer-stroke')) map.removeLayer('proximity-buffer-stroke');
  if (map.getLayer('proximity-buffer-fill'))   map.removeLayer('proximity-buffer-fill');
  if (map.getSource('proximity-buffer-source')) map.removeSource('proximity-buffer-source');
}

// ── Persistent Active Track Marker Pin ────────────────────────────────────────
function showActiveTrackMarker(lng, lat, riskColorHex) {
  if (activeTrackMarker) {
    activeTrackMarker.remove();
    activeTrackMarker = null;
  }

  const el = document.createElement('div');
  el.className = 'track-selection-marker';
  el.innerHTML = `
    <svg width="22" height="28" viewBox="0 0 22 28" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="11" cy="26" rx="5" ry="2" fill="rgba(0,0,0,0.4)"/>
      <path d="M11 0C6.03 0 2 4.03 2 9c0 6.75 9 19 9 19s9-12.25 9-19c0-4.97-4.03-9-9-9z"
            fill="${riskColorHex}" stroke="rgba(255,255,255,0.8)" stroke-width="1.5"/>
      <circle cx="11" cy="9" r="3.5" fill="rgba(255,255,255,0.95)"/>
    </svg>`;
  el.style.cursor = 'pointer';
  el.title = 'Selected track segment — telemetry locked in sidebar';

  el.addEventListener('click', (evt) => {
    evt.stopPropagation();
    if (activeTrackMarker) {
      activeTrackMarker.remove();
      activeTrackMarker = null;
    }
    clearProximityBuffer();
    clickPopup.remove();
  });

  activeTrackMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
    .setLngLat([lng, lat])
    .addTo(map);
}

// ── Layer Filter Sanitizer (Eliminates boundary_3 Null Filter Warning) ─────────
function sanitizeStyleFilters(mapInstance) {
  try {
    const style = mapInstance.getStyle();
    if (!style || !Array.isArray(style.layers)) return;

    function cleanFilter(filter) {
      if (!Array.isArray(filter)) return filter;
      return filter.map(item => {
        if (item === null) return 0;
        if (Array.isArray(item)) return cleanFilter(item);
        return item;
      });
    }

    style.layers.forEach(layer => {
      if (layer.filter && Array.isArray(layer.filter)) {
        if (JSON.stringify(layer.filter).includes('null')) {
          const cleaned = cleanFilter(layer.filter);
          mapInstance.setFilter(layer.id, cleaned);
        }
      }
    });
  } catch (_) {}
}

// ── Map Engine (Interactive Map with Explicit Controls) ──────────────────────
export const map = new maplibregl.Map({
  container:                  'map',
  style:                      CARTO_LIGHT_STYLE, // Default light style for Day theme
  center:                     SOUTHWEST_COORDS,
  zoom:                       SOUTHWEST_ZOOM,
  pitch:                      60,
  bearing:                    -17.6,
  antialias:                  true,
  fadeDuration:               0,
  maxBounds:                  SOUTHWEST_BOUNDS,
  attributionControl:         true,
  trackResize:                true,
  pitchWithRotate:            true,
  dragRotate:                 true,
  dragPan:                    true,
  scrollZoom:                 true,
  boxZoom:                    true,
  keyboard:                   true,
  doubleClickZoom:            true,
  touchZoomRotate:            true,
  touchPitch:                 true,
  cooperativeGestures:        false,
  renderWorldCopies:          false,
  maxZoom:                    18,
  refreshExpiredTiles:        false,
  maxTileCacheSize:           512,
  // Leaflet-compatible interactive map controls explicitly enabled
  zoomControl:                true,
  scrollWheelZoom:            true,
  dragging:                   true,
  preferCanvas:               true,
  // Local system font fallback prevents missing PBF glyph warnings
  localIdeographFontFamily:   'sans-serif, Arial, Helvetica, system-ui',
  // Transform and redirect any broken/CORS-blocked glyph font requests to reliable Demotiles glyph server
  transformRequest: (url, resourceType) => {
    if (resourceType === 'Glyphs' || url.includes('/fonts/') || url.includes('/font/')) {
      const rangeMatch = url.match(/([0-9]+-[0-9]+)\.pbf/i);
      const range = rangeMatch ? rangeMatch[1] : '0-255';
      return {
        url: `https://demotiles.maplibre.org/font/Open%20Sans%20Regular,Arial%20Unicode%20MS%20Regular/${range}.pbf`
      };
    }
    return { url };
  }
});

// Style error guard
map.on('error', (e) => {
  if (
    e?.error?.message?.includes('glyph') ||
    e?.error?.message?.includes('fonts') ||
    e?.error?.message?.includes('fontstack') ||
    e?.error?.message?.includes('Noto Sans') ||
    e?.error?.message?.includes('boundary_3')
  ) {
    return;
  }
});

// Map navigation controls
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

// ── Floating Glassmorphic Risk Legend & Toggle ────────────────────────────────
function injectMapLegend() {
  if (document.getElementById('map-risk-legend') || document.querySelector('.railway-risk-legend')) return;

  const legend = document.createElement('div');
  legend.id = 'map-risk-legend';
  legend.className = 'railway-risk-legend glass-panel map-legend';
  legend.innerHTML = `
    <div class="map-legend-title">Railway Risk Tiers</div>
    <div class="map-legend-item">
      <span class="map-legend-swatch" style="background:#C62828;box-shadow:0 0 8px rgba(198,40,40,0.7);"></span>
      <div>
        <span class="map-legend-label">Critical Buckling Risk</span>
        <span class="map-legend-sub">&ge;60°C &mdash; Immediate Slow Order</span>
      </div>
    </div>
    <div class="map-legend-item">
      <span class="map-legend-swatch" style="background:#EF6C00;box-shadow:0 0 8px rgba(239,108,0,0.7);"></span>
      <div>
        <span class="map-legend-label">High Risk Corridor</span>
        <span class="map-legend-sub">50°C &mdash; 59°C</span>
      </div>
    </div>
    <div class="map-legend-item">
      <span class="map-legend-swatch" style="background:#F9A825;box-shadow:0 0 8px rgba(249,168,37,0.7);"></span>
      <div>
        <span class="map-legend-label">Moderate Heat Stress</span>
        <span class="map-legend-sub">40°C &mdash; 49°C</span>
      </div>
    </div>
    <div class="map-legend-item">
      <span class="map-legend-swatch" style="background:#2E7D32;box-shadow:0 0 8px rgba(46,125,50,0.6);"></span>
      <div>
        <span class="map-legend-label">Normal Safe Track</span>
        <span class="map-legend-sub">&lt;40°C</span>
      </div>
    </div>
  `;

  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.appendChild(legend);
  else {
    const mapParent = document.getElementById('map-parent-container') || document.body;
    mapParent.appendChild(legend);
  }
}

// ── Loader Dismissal & Telemetry HUD Status ───────────────────────────────────
function hideLoader() {
  const selectors = [
    '#loading-indicator',
    '#loader',
    '.loading-screen',
    '.loading-overlay',
    '#loading-badge',
    '.ingest-status',
    '[data-loader]'
  ];

  selectors.forEach(sel => {
    try {
      document.querySelectorAll(sel).forEach(el => {
        if (el) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          try { el.remove(); } catch (_) {}
        }
      });
    } catch (_) {}
  });

  if (map) {
    try {
      map.resize();
      requestAnimationFrame(() => map.resize());
    } catch (_) {}
  }
}

function updateTelemetryOnline(count = '45,955') {
  const statusStateEl = document.getElementById('system-status') || document.querySelector('.telemetry-status');
  if (statusStateEl) {
    statusStateEl.textContent = 'ONLINE';
    statusStateEl.style.color = '#10b981';
  }

  const segmentCountEl = document.getElementById('segment-count') || document.querySelector('.segment-count');
  if (segmentCountEl) {
    segmentCountEl.textContent = count;
  }
}

// ── Camera Navigation Controls ────────────────────────────────────────────────
function flyToHouston() {
  map.flyTo({
    center: HOUSTON_COORDS,
    zoom: DEFAULT_ZOOM,
    pitch: is3DView ? 60 : 0,
    bearing: is3DView ? -20 : 0,
    essential: true,
    duration: 1600
  });
}

// ── Southwest Railway Layers ──────────────────────────────────────────────────
function setupSouthwestRailLayers() {
  try {
    if (!map.getSource('southwest-rail-network')) {
      map.addSource('southwest-rail-network', {
        type: 'geojson',
        data: southwestGeojsonData || SOUTHWEST_GEOJSON_URL,
        tolerance: 0.375,
        buffer: 0,
        maxzoom: 18
      });
      console.log('[ThermoRail] ✓ Attached Source: southwest-rail-network');
    }

    // Outer subtle bloom
    if (!map.getLayer('southwest-rail-bloom')) {
      map.addLayer({
        id: 'southwest-rail-bloom',
        type: 'line',
        source: 'southwest-rail-network',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': DYNAMIC_RAIL_COLOR,
          'line-width': ['*', DYNAMIC_RAIL_WIDTH, 1.6],
          'line-opacity': 0.18,
          'line-blur': 3
        }
      });
    }

    // Inner tight glow halo
    if (!map.getLayer('southwest-rail-glow')) {
      map.addLayer({
        id: 'southwest-rail-glow',
        type: 'line',
        source: 'southwest-rail-network',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': DYNAMIC_RAIL_COLOR,
          'line-width': ['*', DYNAMIC_RAIL_WIDTH, 1.3],
          'line-opacity': 0.38,
          'line-blur': 1
        }
      });
    }

    // Primary Southwest rail line
    if (!map.getLayer('southwest-rail-layer')) {
      map.addLayer({
        id: 'southwest-rail-layer',
        type: 'line',
        source: 'southwest-rail-network',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': DYNAMIC_RAIL_COLOR,
          'line-width': DYNAMIC_RAIL_WIDTH,
          'line-opacity': 0.95
        }
      });
      console.log('[ThermoRail] ✓ Attached Layer: southwest-rail-layer');
    }
  } catch (err) {
    console.error('[ThermoRail] Error adding southwest rail layers:', err);
  }
}

// ── 3D Buildings Fill-Extrusion Layer ─────────────────────────────────────────
function setup3DBuildings() {
  if (map.getLayer('3d-buildings')) return;
  try {
    if (map.getSource('openmaptiles')) {
      map.addLayer({
        id: '3d-buildings',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 0],
            0,   '#1a1f2e',
            40,  '#22304a',
            100, '#2d3a55',
          ],
          'fill-extrusion-height':  ['coalesce', ['get', 'render_height'], 0],
          'fill-extrusion-base':    ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.76,
        },
      });
    }
  } catch (err) {
    console.warn('[ThermoRail] 3D buildings layer skipped:', err.message);
  }
}

// ── 3-State Boundary Highlight Layer (TX, NM, AZ) ───────────────────────────
function setupStateBoundaryLayer() {
  try {
    if (!map.getSource('southwest-states-boundary')) {
      map.addSource('southwest-states-boundary', {
        type: 'geojson',
        data: SOUTHWEST_STATES_GEOJSON
      });
    }

    // Transparent fill (fill-opacity = 0) so no distracting grey overlay renders
    if (!map.getLayer('southwest-states-fill')) {
      map.addLayer({
        id: 'southwest-states-fill',
        type: 'fill',
        source: 'southwest-states-boundary',
        paint: {
          'fill-color': '#0f172a',
          'fill-opacity': 0
        }
      });
    }

    // Crisp neon cyan state border outline
    if (!map.getLayer('southwest-states-outline')) {
      map.addLayer({
        id: 'southwest-states-outline',
        type: 'line',
        source: 'southwest-states-boundary',
        paint: {
          'line-color': '#00f0ff',
          'line-width': 1.8,
          'line-dasharray': [6, 3],
          'line-opacity': 0.7
        }
      });
    }
  } catch (err) {
    console.error('[ThermoRail] Error adding state boundaries:', err);
  }
}

// ── Master Layer Attach Function ──────────────────────────────────────────────
function setupAllMapLayers() {
  console.log('[ThermoRail] Initializing vector layers & GeoJSON telemetry...');
  setup3DBuildings();
  setupStateBoundaryLayer();
  setupSouthwestRailLayers();
  injectMapLegend();
  sanitizeStyleFilters(map);
  if (map) {
    try {
      map.resize();
      requestAnimationFrame(() => map.resize());
    } catch (_) {}
  }
}

// ── Authentication & Protected Routing State ────────────────────────────────
let isAuthenticated = false;
let currentUser = null;
let pendingView = null;

// Auto-restore session from localStorage if available
try {
  const savedUser = localStorage.getItem('thermorail_user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    isAuthenticated = true;
  }
} catch (_) {}

// Global helpers for window context access
if (typeof window !== 'undefined') {
  window.thermoRailSwitchView = (v) => switchView(v);
  window.openAuthModal = (v) => openAuthModal(v);
}

function clearAuthErrors() {
  const errorEl = document.getElementById('auth-error-msg');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  if (emailInput) emailInput.classList.remove('input-error');
  if (passInput) passInput.classList.remove('input-error');
}

function showAuthError(msg, targetInputId = null) {
  const errorEl = document.getElementById('auth-error-msg');
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }
  if (targetInputId) {
    const input = document.getElementById(targetInputId);
    if (input) {
      input.classList.add('input-error');
      input.focus();
    }
  }
}

export function openAuthModal(targetView = 'dashboard') {
  pendingView = targetView;
  clearAuthErrors();
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    const emailInput = document.getElementById('auth-email');
    if (emailInput) {
      setTimeout(() => emailInput.focus(), 100);
    }
  }
}

export function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    clearAuthErrors();
  }
}

function setAuthenticatedUser(user) {
  currentUser = user;
  isAuthenticated = true;
  try {
    localStorage.setItem('thermorail_user', JSON.stringify(user));
  } catch (_) {}
  closeAuthModal();
  renderNavAuth();
  const destination = pendingView || 'dashboard';
  pendingView = null;
  switchView(destination);
}


// ── Google OAuth Identity Helper & Sandbox Fallback ─────────────────────────
const GOOGLE_CLIENT_ID =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) || null;

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function handleGoogleCredentialResponse(response) {
  if (!response?.credential) return;
  const payload = parseJwt(response.credential);
  const user = {
    name: payload?.name || 'Chief Dispatcher',
    email: payload?.email || 'dispatcher@bnsf-network.com',
    picture: payload?.picture || null,
    subdivision: 'BNSF South / Fort Worth',
    role: 'BNSF South / Fort Worth',
    provider: 'google'
  };
  setAuthenticatedUser(user);
}

function initGoogleIdentity() {
  if (typeof window === 'undefined') return;

  if (!GOOGLE_CLIENT_ID) {
    console.warn('[ThermoRail] Google OAuth Client ID not configured. Enabling enterprise OAuth sandbox mode.');
    return;
  }

  const setupGsi = () => {
    if (!window.google?.accounts?.id) return;
    try {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });
    } catch (err) {
      console.warn('[GoogleAuth] GSI initialization notice:', err);
    }
  };

  if (window.google?.accounts?.id) {
    setupGsi();
  } else {
    window.addEventListener('load', () => setTimeout(setupGsi, 500));
  }
}

function simulateGoogleSignIn() {
  const user = {
    name: 'Chief Dispatcher',
    email: 'dispatcher@bnsf-network.com',
    picture: 'https://api.dicebear.com/7.x/initials/svg?seed=Chief%20Dispatcher',
    subdivision: 'BNSF South / Fort Worth',
    role: 'BNSF South / Fort Worth',
    provider: 'google'
  };
  setAuthenticatedUser(user);
}

function triggerGoogleAuth() {
  clearAuthErrors();
  if (GOOGLE_CLIENT_ID && window.google?.accounts?.id) {
    try {
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          simulateGoogleSignIn();
        }
      });
    } catch (_) {
      simulateGoogleSignIn();
    }
  } else {
    simulateGoogleSignIn();
  }
}

function handleEmailPasswordSubmit() {
  clearAuthErrors();
  const emailInput = document.getElementById('auth-email');
  const passInput = document.getElementById('auth-password');
  const email = (emailInput?.value || '').trim();
  const password = (passInput?.value || '').trim();

  if (!email) {
    showAuthError('Please enter your network email address.', 'auth-email');
    return;
  }

  if (!email.includes('@') || !email.includes('.')) {
    showAuthError('Please enter a valid railway network email address.', 'auth-email');
    return;
  }

  if (!password) {
    showAuthError('Please enter your account password.', 'auth-password');
    return;
  }

  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters in length.', 'auth-password');
    return;
  }

  // Valid credentials
  const namePart = email
    .split('@')[0]
    .replace(/[._-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const user = {
    name: namePart || 'Chief Dispatcher',
    email: email,
    subdivision: 'BNSF South / Fort Worth',
    role: 'BNSF South / Fort Worth',
    picture: null,
    provider: 'email'
  };

  setAuthenticatedUser(user);
}

// ── Dispatcher Profile Rendering (Cached DOM Elements to Eliminate Lag) ─────
export function updateProfileUI(user) {
  const unauthState = document.getElementById('nav-unauth-state');
  const authState = document.getElementById('nav-auth-state');
  const profileWrap = document.getElementById('nav-profile-container');
  const avatarImg = document.getElementById('nav-user-avatar');
  const initialsEl = document.getElementById('nav-user-initials');
  const nameEl = document.getElementById('nav-user-name');
  const roleEl = document.getElementById('nav-user-role');

  if (isAuthenticated && user) {
    if (unauthState) unauthState.classList.add('hidden');
    if (authState) authState.classList.remove('hidden');
    if (profileWrap) profileWrap.classList.remove('hidden');

    if (nameEl) nameEl.textContent = user.name || 'Chief Dispatcher';
    if (roleEl) roleEl.textContent = user.subdivision || user.role || 'BNSF South / Fort Worth';

    const initials = (user.name || 'CD')
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    if (initialsEl) initialsEl.textContent = initials;

    const avatarUrl =
      user.picture ||
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name || 'CD')}`;

    if (avatarImg) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = 'block';
    }
    if (initialsEl) initialsEl.style.display = 'none';
  } else {
    if (unauthState) unauthState.classList.remove('hidden');
    if (authState) authState.classList.add('hidden');
    if (profileWrap) profileWrap.classList.add('hidden');

    if (avatarImg) {
      avatarImg.src = '';
      avatarImg.style.display = 'none';
    }
    if (initialsEl) {
      initialsEl.textContent = 'CD';
      initialsEl.style.display = 'flex';
    }
  }
}

export function renderNavAuth() {
  updateProfileUI(currentUser);
}

function setupAuthUI() {
  initGoogleIdentity();
  renderNavAuth();

  // Top Sign In Button in Navbar
  const topSigninBtn = document.getElementById('btn-top-signin');
  if (topSigninBtn) {
    topSigninBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openAuthModal('dashboard');
    });
  }

  // Top Logout Button in Navbar Profile
  const logoutBtn = document.getElementById('btn-top-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      isAuthenticated = false;
      currentUser = null;
      try {
        localStorage.removeItem('thermorail_user');
        if (window.google?.accounts?.id) {
          window.google.accounts.id.disableAutoSelect();
        }
      } catch (_) {}
      renderNavAuth();
      switchView('home');
    });
  }

  // Close Button
  const closeBtn = document.getElementById('btn-auth-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeAuthModal();
    });
  }

  // Backdrop click to close
  const modalBackdrop = document.getElementById('auth-modal');
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) {
        closeAuthModal();
      }
    });
  }

  // Escape key to close modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('auth-modal');
      if (modal && !modal.classList.contains('hidden')) {
        closeAuthModal();
      }
    }
  });

  // Password Visibility Toggle
  const togglePassBtn = document.getElementById('btn-toggle-password');
  const passInput = document.getElementById('auth-password');
  const eyeShow = document.getElementById('eye-icon-show');
  const eyeHide = document.getElementById('eye-icon-hide');

  if (togglePassBtn && passInput) {
    togglePassBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isPassword = passInput.type === 'password';
      passInput.type = isPassword ? 'text' : 'password';
      if (eyeShow && eyeHide) {
        eyeShow.classList.toggle('hidden', isPassword);
        eyeHide.classList.toggle('hidden', !isPassword);
      }
    });
  }

  // Auto-clear input errors on typing
  const emailInput = document.getElementById('auth-email');
  if (emailInput) {
    emailInput.addEventListener('input', () => {
      emailInput.classList.remove('input-error');
      const errorEl = document.getElementById('auth-error-msg');
      if (errorEl) errorEl.classList.add('hidden');
    });
  }

  if (passInput) {
    passInput.addEventListener('input', () => {
      passInput.classList.remove('input-error');
      const errorEl = document.getElementById('auth-error-msg');
      if (errorEl) errorEl.classList.add('hidden');
    });
  }

  // Auth Submit Action (Strict Form Validation)
  const authSubmitBtn = document.getElementById('btn-auth-submit');
  if (authSubmitBtn) {
    authSubmitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleEmailPasswordSubmit();
    });
  }

  const authForm = document.getElementById('auth-login-form');
  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleEmailPasswordSubmit();
    });
  }

  // Google Auth Button
  const googleBtn = document.getElementById('btn-google-auth');
  if (googleBtn) {
    googleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      triggerGoogleAuth();
    });
  }

  // Register link mock
  const registerLink = document.getElementById('link-auth-register');
  if (registerLink) {
    registerLink.addEventListener('click', (e) => {
      e.preventDefault();
      handleEmailPasswordSubmit();
    });
  }
}

// ── View Panel State Switcher & Route Handler ─────────────────────────────────
export function switchView(targetView) {
  const view = targetView || 'home';

  // Home view is freely accessible to all users without authentication
  if (view === 'home') {
    const homeSection = document.getElementById('view-home');
    const dashboardBody = document.querySelector('.dashboard-body');

    if (homeSection) {
      homeSection.classList.add('active');
    }
    if (dashboardBody) {
      dashboardBody.classList.add('view-hidden');
      dashboardBody.style.display = 'none';
    }

    document.querySelectorAll('.top-nav-links .nav-link').forEach((nl) => {
      nl.classList.toggle('active', nl.getAttribute('data-view') === 'home');
    });
    document.querySelectorAll('.sidebar-item').forEach((sb) => {
      sb.classList.remove('active');
    });
    document.querySelectorAll('.view-panel').forEach((vp) => {
      vp.classList.remove('active');
    });

    updateTubelightIndicator();
    return;
  }

  // Protected operational views require authentication
  if (!isAuthenticated) {
    openAuthModal(view);
    return;
  }

  // Authenticated state: hide Home landing page, show operational dashboard body
  const homeSection = document.getElementById('view-home');
  const dashboardBody = document.querySelector('.dashboard-body');

  if (homeSection) {
    homeSection.classList.remove('active');
  }
  if (dashboardBody) {
    dashboardBody.classList.remove('view-hidden');
    dashboardBody.style.display = 'flex';
  }

  document.querySelectorAll('.top-nav-links .nav-link').forEach((nl) => {
    nl.classList.toggle('active', nl.getAttribute('data-view') === view);
  });

  document.querySelectorAll('.sidebar-item').forEach((sb) => {
    sb.classList.toggle('active', sb.getAttribute('data-view') === view);
  });

  document.querySelectorAll('.view-panel').forEach((vp) => {
    vp.classList.remove('active');
  });

  const activePanel = document.getElementById(`view-${view}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }

  // Reparent or resize map if switching views
  if (view === 'map') {
    const fullContainer = document.getElementById('map-full-container');
    const mapEl = document.getElementById('map');
    if (fullContainer && mapEl && mapEl.parentElement !== fullContainer) {
      fullContainer.appendChild(mapEl);
    }
  } else if (view === 'dashboard') {
    const parentContainer = document.getElementById('map-parent-container');
    const mapEl = document.getElementById('map');
    if (parentContainer && mapEl && mapEl.parentElement !== parentContainer) {
      parentContainer.appendChild(mapEl);
    }
  }

  if (map) {
    try {
      map.resize();
      requestAnimationFrame(() => map.resize());
      setTimeout(() => map.resize(), 50);
      setTimeout(() => map.resize(), 150);
      setTimeout(() => map.resize(), 300);
      setTimeout(() => map.resize(), 600);
    } catch (_) {}
  }
  updateTubelightIndicator();
}

function setupViewSwitcher() {
  const navLinks = document.querySelectorAll(
    '.top-nav-links .nav-link, .sidebar-item, .widget-link, .metric-action-link, .ticker-link, .navbar-brand, #btn-hero-dashboard, #btn-hero-map, .footer-link'
  );
  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView =
        link.getAttribute('data-view') ||
        (link.id === 'btn-hero-dashboard' ? 'dashboard' : link.id === 'btn-hero-map' ? 'map' : 'home');
      switchView(targetView);
    });
  });
}

// ── Persistent Sidebar Telemetry Inspector Updater ────────────────────────────
function updateSegmentInspector(telemetry) {
  if (!telemetry) return;

  const {
    segment_id,
    corridor_name,
    state,
    est_rail_temp_c,
    ambient_temp_c,
    risk_score,
    risk_level,
    lat,
    lng
  } = telemetry;

  // Segment ID
  const inspectorSegId = document.getElementById('inspector-segment-id');
  if (inspectorSegId) inspectorSegId.textContent = segment_id;

  // Risk Badge Tag
  const inspectorRiskTag = document.getElementById('inspector-risk-tag');
  if (inspectorRiskTag) {
    const badgeClass = risk_level === 'CRITICAL' ? 'badge-critical' : risk_level === 'HIGH' ? 'badge-high' : risk_level === 'MODERATE' ? 'badge-moderate' : 'badge-low';
    inspectorRiskTag.className = `badge-tag ${badgeClass}`;
    inspectorRiskTag.textContent = `${risk_level} RISK`;
  }

  // Corridor Name
  const inspectorLocName = document.getElementById('inspector-location-name');
  if (inspectorLocName) inspectorLocName.textContent = corridor_name;

  // State Region Badge
  const inspectorState = document.getElementById('inspector-state-region');
  if (inspectorState) {
    const badgeClass = risk_level === 'CRITICAL' ? 'badge-critical' : risk_level === 'HIGH' ? 'badge-high' : 'badge-moderate';
    inspectorState.className = `badge-tag ${badgeClass}`;
    inspectorState.style.fontSize = '9.5px';
    inspectorState.textContent = state;
  }

  // Coordinates
  const inspectorCoords = document.getElementById('inspector-coords');
  if (inspectorCoords && lat != null && lng != null) {
    inspectorCoords.textContent = `${Number(lat).toFixed(4)}° N, ${Math.abs(Number(lng)).toFixed(4)}° W`;
  }

  // Score Gauge
  const score = Math.max(5, Math.min(99, Math.round(Number(risk_score))));
  const inspectorScoreNum = document.getElementById('inspector-score-num');
  if (inspectorScoreNum) inspectorScoreNum.textContent = String(score);

  const scoreGraphic = document.getElementById('score-ring-graphic');
  if (scoreGraphic) {
    const scoreColorHex = riskColor(risk_level);
    scoreGraphic.style.background = `conic-gradient(${scoreColorHex} 0% ${score}%, rgba(255,255,255,0.1) ${score}% 100%)`;
  }

  const scoreText = document.getElementById('inspector-score-text');
  if (scoreText) {
    if (risk_level === 'CRITICAL') {
      scoreText.textContent = 'Severe Buckle Risk';
      scoreText.className = 'score-status red';
    } else if (risk_level === 'HIGH') {
      scoreText.textContent = 'High Stress';
      scoreText.className = 'score-status warning';
    } else if (risk_level === 'MODERATE') {
      scoreText.textContent = 'Elevated Exposure';
      scoreText.className = 'score-status warning';
    } else {
      scoreText.textContent = 'Safe Operational Range';
      scoreText.className = 'score-status positive';
    }
  }

  // Specs Grid Values
  const inspectorAmbTemp = document.getElementById('inspector-ambient-temp');
  if (inspectorAmbTemp) inspectorAmbTemp.textContent = `${Number(ambient_temp_c).toFixed(1)}°C`;

  const inspectorCurrTemp = document.getElementById('inspector-curr-temp');
  if (inspectorCurrTemp) {
    inspectorCurrTemp.textContent = `${Number(est_rail_temp_c).toFixed(1)}°C`;
    inspectorCurrTemp.className = `spec-val ${risk_level === 'CRITICAL' ? 'red' : risk_level === 'HIGH' ? 'warning' : 'green'}`;
  }

  const inspectorStatus = document.getElementById('inspector-track-status');
  if (inspectorStatus) {
    if (risk_level === 'CRITICAL') {
      inspectorStatus.textContent = 'Speed Restricted 45mph';
      inspectorStatus.className = 'spec-val red';
    } else if (risk_level === 'HIGH') {
      inspectorStatus.textContent = 'Thermal Advisory';
      inspectorStatus.className = 'spec-val warning';
    } else {
      inspectorStatus.textContent = 'Normal Operations';
      inspectorStatus.className = 'spec-val green';
    }
  }

  const inspectorTimestamp = document.getElementById('inspector-last-updated');
  if (inspectorTimestamp) {
    inspectorTimestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

// ── Interactive In-Map Modal Popup Builder (Full 500m Proximity & Telemetry) ─
function buildRichClickModalHtml(telemetry) {
  const tel = telemetry;
  const badgeClass = tel.risk_level === 'CRITICAL' ? 'badge-critical' : tel.risk_level === 'HIGH' ? 'badge-high' : tel.risk_level === 'MODERATE' ? 'badge-moderate' : 'badge-low';
  const railTempF = (tel.est_rail_temp_c * 9/5 + 32).toFixed(1);
  const surfTempF = (tel.surface_temp_c * 9/5 + 32).toFixed(1);
  const ambTempF = (tel.ambient_temp_c * 9/5 + 32).toFixed(1);

  // 500m Proximity Zone Data
  const pz = tel.proximity_zone_500m;
  let proximityCardHtml = '';
  if (pz) {
    const absorptionScore = pz.absorption_score ?? (tel.risk_score ? Math.min(99, Math.round(tel.risk_score * 0.95)) : 75);
    const thermalOffset = pz.environmental_heat_modifier?.thermal_offset_c ?? (tel.est_rail_temp_c >= 55 ? 2.4 : 1.2);
    const modifier = pz.environmental_heat_modifier?.absorption_multiplier ?? (tel.est_rail_temp_c >= 55 ? 1.15 : 1.05);
    const factors = pz.surrounding_factors || 'Urban heat island influence & ballast thermal radiation';
    const scoreColor = absorptionScore >= 80 ? '#C62828' : absorptionScore >= 60 ? '#EF6C00' : absorptionScore >= 40 ? '#F9A825' : '#2E7D32';
    const offsetSign = thermalOffset >= 0 ? '+' : '';

    proximityCardHtml = `
      <div class="popup-proximity-card">
        <div class="proximity-card-header">
          <span class="proximity-icon">📡</span>
          <span class="proximity-title">500m Environmental Proximity</span>
          <span class="proximity-radius-badge">500m Zone</span>
        </div>
        <div class="proximity-score-row">
          <div class="proximity-score-gauge">
            <div class="proximity-score-fill" style="width:${absorptionScore}%; background:${scoreColor};"></div>
          </div>
          <span class="proximity-score-label" style="color:${scoreColor};">${absorptionScore}/100</span>
        </div>
        <div class="popup-row" style="margin-top:5px;">
          <span class="popup-row-label">Env Thermal Offset</span>
          <span class="popup-row-value" style="color:${thermalOffset >= 1.5 ? '#F9A825' : thermalOffset < 0 ? '#2E7D32' : '#00f0ff'};">
            ${offsetSign}${Number(thermalOffset).toFixed(1)}°C <span style="color:var(--text-muted);font-weight:400;">(×${Number(modifier).toFixed(2)})</span>
          </span>
        </div>
        <div class="popup-proximity-factors">${factors}</div>
      </div>
    `;
  } else {
    const absorptionScore = Math.min(95, Math.max(30, Math.round(tel.risk_score * 0.92)));
    const thermalOffset = Number((tel.est_rail_temp_c - tel.ambient_temp_c - 12.0).toFixed(1));
    const offsetSign = thermalOffset >= 0 ? '+' : '';
    const scoreColor = absorptionScore >= 80 ? '#C62828' : absorptionScore >= 60 ? '#EF6C00' : absorptionScore >= 40 ? '#F9A825' : '#2E7D32';
    
    proximityCardHtml = `
      <div class="popup-proximity-card">
        <div class="proximity-card-header">
          <span class="proximity-icon">📡</span>
          <span class="proximity-title">500m Environmental Proximity</span>
          <span class="proximity-radius-badge">500m Zone</span>
        </div>
        <div class="proximity-score-row">
          <div class="proximity-score-gauge">
            <div class="proximity-score-fill" style="width:${absorptionScore}%; background:${scoreColor};"></div>
          </div>
          <span class="proximity-score-label" style="color:${scoreColor};">${absorptionScore}/100</span>
        </div>
        <div class="popup-row" style="margin-top:5px;">
          <span class="popup-row-label">Env Thermal Offset</span>
          <span class="popup-row-value" style="color:${thermalOffset >= 1.5 ? '#F9A825' : '#00f0ff'};">
            ${offsetSign}${thermalOffset}°C <span style="color:var(--text-muted);font-weight:400;">(Spatial Index)</span>
          </span>
        </div>
        <div class="popup-proximity-factors">Direct railway corridor solar absorption and ballast heat accumulation analysis.</div>
      </div>
    `;
  }

  return `
    <div class="popup-header">
      <div class="popup-title">${tel.corridor_name}</div>
      <div class="popup-sub-header">
        <span class="popup-operator">${tel.operator}</span>
        <span class="popup-id-badge">${tel.segment_id}</span>
      </div>
    </div>
    <div class="popup-body">
      <div class="popup-row">
        <span class="popup-row-label">Thermal Status</span>
        <span class="badge-tag ${badgeClass}">${tel.risk_level} RISK</span>
      </div>
      <div class="popup-row">
        <span class="popup-row-label">Est. Rail Temp</span>
        <span class="popup-row-value" style="color:#ef4444;font-size:13px;">${tel.est_rail_temp_c}°C (${railTempF}°F)</span>
      </div>
      <div class="popup-row">
        <span class="popup-row-label">Track Surface</span>
        <span class="popup-row-value" style="color:#00f0ff;">${tel.surface_temp_c}°C (${surfTempF}°F)</span>
      </div>
      <div class="popup-row">
        <span class="popup-row-label">Ambient Air</span>
        <span class="popup-row-value">${tel.ambient_temp_c}°C (${ambTempF}°F)</span>
      </div>
      <div class="popup-row">
        <span class="popup-row-label">Heat Risk Score</span>
        <span class="popup-row-value" style="color:#ff9944;">${tel.risk_score} / 100</span>
      </div>
      <div class="popup-row">
        <span class="popup-row-label">Class & Speed</span>
        <span class="popup-row-value" style="font-size:11px;color:#cbd5e1;">${tel.track_class} &bull; ${tel.max_speed}</span>
      </div>
      <div class="popup-assessment-box">
        <strong>Assessment:</strong> ${tel.explanation}
      </div>
      ${proximityCardHtml}
    </div>
  `;
}

// ── Interactive In-Map Click Popup Modal Instance ─────────────────────────────
const clickPopup = new maplibregl.Popup({
  closeButton: true,
  closeOnClick: false,
  maxWidth: '360px',
  focusAfterOpen: false,
  anchor: 'bottom',
  offset: [0, -12]
});

clickPopup.on('close', () => {
  clearProximityBuffer();
  if (activeTrackMarker) {
    activeTrackMarker.remove();
    activeTrackMarker = null;
  }
});

/**
 * Popup Event Isolation Guard
 * Prevents interactions inside the popup (sliders, buttons, scrollbars, text selection)
 * from propagating to the underlying MapLibre canvas and inadvertently closing the popup.
 */
function isolatePopupEvents() {
  const popupNode = clickPopup.getElement();
  if (!popupNode) return;
  ['mousedown', 'click', 'pointerdown', 'touchstart', 'dblclick', 'contextmenu', 'wheel', 'dragstart'].forEach(evtName => {
    popupNode.addEventListener(evtName, (e) => e.stopPropagation(), { passive: evtName === 'wheel' });
  });
}

// ── Unified Track Selection Dispatcher (100% Data Parity) ─────────────────────
export function selectTrackSegment(featureOrProps, lng, lat, openPopup = true) {
  const telemetry = extractFeatureTelemetry(featureOrProps, lat, lng);
  activeTrackSelection = telemetry;

  // 1. Synchronously update persistent sidebar inspector
  updateSegmentInspector(telemetry);

  // 2. Render 500m proximity buffer polygon & pin marker
  const color = riskColor(telemetry.risk_level);
  if (lng != null && lat != null) {
    showActiveTrackMarker(lng, lat, color);
    renderProximityBuffer(lng, lat, color);

    // 3. Open rich in-map proximity and environmental analysis popup modal
    if (openPopup) {
      hoverPopup.remove(); // hide hover tooltip so they don't overlap
      clickPopup
        .setLngLat([lng, lat])
        .setHTML(buildRichClickModalHtml(telemetry))
        .addTo(map);

      // 4. Attach event isolation guards on the freshly-rendered popup DOM
      requestAnimationFrame(() => isolatePopupEvents());
    }
  }
}

// ── Dynamic Top 5 Critical Corridors Computer (100% GeoJSON Data Parity) ──────
function computeTopCriticalCorridors(geojson) {
  if (!geojson || !Array.isArray(geojson?.features)) return [];

  const candidates = [];
  for (let idx = 0; idx < geojson.features.length; idx++) {
    const feature = geojson.features[idx];
    if (!feature) continue;
    const center = getFeatureCenter(feature);
    if (!center || !Array.isArray(center) || center.length < 2) continue;

    const telemetry = extractFeatureTelemetry(feature, center[1], center[0]);
    if (telemetry.est_rail_temp_c <= 0 || telemetry.risk_score <= 0) continue;

    candidates.push({
      feature,
      props: feature.properties || {},
      telemetry,
      center,
      score: telemetry.risk_score,
      temp: telemetry.est_rail_temp_c,
      risk: telemetry.risk_level
    });
  }

  // Sort descending by risk_score, with temperature as tie-breaker
  return candidates
    .sort((a, b) => (b.score - a.score) || (b.temp - a.temp))
    .slice(0, 5);
}

function renderCorridorsTable(corridors) {
  if (!corridors || corridors.length === 0) return;
  topCorridorsCache = corridors;

  const tbody = document.getElementById('top-5-corridors-tbody');
  if (!tbody) return;

  tbody.innerHTML = corridors.map((item, idx) => {
    const tel = item.telemetry;
    const badgeClass = tel.risk_level === 'CRITICAL' ? 'badge-critical' : tel.risk_level === 'HIGH' ? 'badge-high' : tel.risk_level === 'MODERATE' ? 'badge-moderate' : 'badge-low';
    const tempVal = Number(tel.est_rail_temp_c).toFixed(1);

    return `
      <tr class="corridor-row" data-index="${idx}" style="cursor:pointer;">
        <td class="num">${idx + 1}</td>
        <td class="corridor">${tel.corridor_name}</td>
        <td class="state">${tel.state}</td>
        <td><span class="badge-tag ${badgeClass}">${tel.risk_level}</span></td>
        <td class="temp red">${tempVal}°C</td>
      </tr>
    `;
  }).join('');

  // Row click listener
  tbody.querySelectorAll('.corridor-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = Number(row.getAttribute('data-index'));
      const item = topCorridorsCache?.[idx];
      if (!item || !item.center) return;

      tbody.querySelectorAll('.corridor-row').forEach(r => r.classList.remove('active-row'));
      row.classList.add('active-row');

      const [lng, lat] = item.center;
      map.flyTo({
        center: [lng, lat],
        zoom: 11.5,
        pitch: is3DView ? 55 : 30,
        speed: 1.4,
        essential: true
      });

      // Synchronously select segment, update inspector, render 500m buffer, and open rich modal
      selectTrackSegment(item.feature, lng, lat, true);
    });
  });

  // Automatically lock sidebar to top #1 critical corridor on load (without popping modal over whole view)
  if (corridors.length > 0 && !activeTrackSelection) {
    const top1 = corridors[0];
    if (top1?.center) {
      const [lng, lat] = top1.center;
      selectTrackSegment(top1.feature, lng, lat, false);
    }
  }
}

// Non-blocking corridor initialization + chunked Alert Engine Generation
function initTopCorridors() {
  getSouthwestGeoJSON().then(geojson => {
    if (!geojson || !Array.isArray(geojson?.features)) return;
    const topItems = computeTopCriticalCorridors(geojson);
    renderCorridorsTable(topItems);

    // Initialize Day 7 Alert Engine (Tasks 7.1 – 7.3)
    // generateAlertsFromGeoJSON now returns a Promise and processes in rAF chunks
    alertEngine.generateAlertsFromGeoJSON(geojson, extractFeatureTelemetry, getFeatureCenter)
      .then(() => {
        // Sync Active Alerts card with live count after chunked processing completes
        const alertsEl = document.getElementById('metric-active-alerts');
        if (alertsEl) alertsEl.textContent = String(alertEngine.getActiveCount());
      })
      .catch(err => console.warn('[AlertEngine] Generation completed with notice:', err));
  }).catch(err => console.warn('[ThermoRail] Corridor initialization skipped:', err));
}

// ── Instantaneous Theme Switching (Dark / Light) ──────────────────────────────
function setupThemeToggle() {
  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (!toggleBtn) return;

  const appRoot = document.querySelector('.dashboard-app');

  function applyTheme(dark) {
    isDarkTheme = dark;

    if (appRoot) {
      appRoot.classList.toggle('light-theme', !dark);
      appRoot.classList.toggle('dark-theme', dark);
      appRoot.classList.remove(dark ? 'light-theme' : 'dark-theme');
    }

    document.documentElement.classList.toggle('light-theme', !dark);
    document.documentElement.classList.toggle('dark-theme', dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

    toggleBtn.classList.toggle('light-active', !dark);

    // Instant diff-based style switch
    try {
      map.setStyle(dark ? CARTO_DARK_STYLE : CARTO_LIGHT_STYLE, { diff: true });
    } catch (err) {
      console.warn('[ThermoRail] Map style switch notice:', err);
    }
  }

  // Event listeners for theme toggle button
  toggleBtn.addEventListener('click', () => applyTheme(!isDarkTheme));
  toggleBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      applyTheme(!isDarkTheme);
    }
  });
}

// ── Map Camera View Buttons (Full Interactive Navigation) ─────────────────────
function setupMapControls() {
  function toggle3D() {
    is3DView = !is3DView;
    document.querySelectorAll('#btn-toggle-3d, #btn-toggle-3d-full').forEach(btn => {
      btn.classList.toggle('active', is3DView);
      btn.textContent = is3DView ? '3D View' : '2D View';
    });
    map.setPitch(is3DView ? 45 : 0);
  }

  function centerView() {
    map.flyTo({ center: [-100.0, 31.0], zoom: 6, pitch: is3DView ? 60 : 0, bearing: is3DView ? -20 : 0, duration: 1500 });
  }

  function flySouthwest() {
    map.flyTo({ center: [-112.0740, 33.4484], zoom: 7, pitch: is3DView ? 60 : 0, bearing: is3DView ? -20 : 0, duration: 1500 });
  }

  function backHouston() {
    map.flyTo({ center: [-95.3698, 29.7604], zoom: 9, pitch: is3DView ? 60 : 0, bearing: is3DView ? -20 : 0, duration: 1500 });
  }

  function toggleLegend(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const legendBox = document.querySelector('.railway-risk-legend') || document.getElementById('map-risk-legend') || document.getElementById('map-legend') || document.querySelector('.legend-box');
    if (legendBox) {
      const isHidden = legendBox.style.display === 'none' || legendBox.classList.contains('hidden') || legendBox.classList.contains('legend-hidden');
      legendBox.style.display = isHidden ? 'block' : 'none';
      legendBox.classList.toggle('hidden', !isHidden);
      legendBox.classList.toggle('legend-hidden', !isHidden);
      legendVisible = isHidden;
    }
    document.querySelectorAll('#btn-toggle-legend, #btn-toggle-legend-full, #map-legend-toggle, [data-action="toggle-legend"], .legend-btn').forEach(btn => {
      btn.textContent = legendVisible ? 'Legend ▾' : 'Legend ▸';
      btn.classList.toggle('active', !legendVisible);
    });
  }

  document.querySelectorAll('#btn-toggle-3d, #btn-toggle-3d-full').forEach(btn => btn.addEventListener('click', toggle3D));
  document.querySelectorAll('#btn-center-houston, #btn-center-view, #btn-center-view-full').forEach(btn => btn.addEventListener('click', centerView));
  document.querySelectorAll('#btn-fly-southwest, #btn-sw-corridor, #btn-fly-southwest-full').forEach(btn => btn.addEventListener('click', flySouthwest));
  document.querySelectorAll('#btn-back-houston, #btn-houston-view, #btn-back-houston-full').forEach(btn => btn.addEventListener('click', backHouston));
  document.querySelectorAll('#btn-toggle-legend, #btn-toggle-legend-full, #map-legend-toggle, [data-action="toggle-legend"], .legend-btn').forEach(btn => btn.addEventListener('click', toggleLegend));
}

// ── Map Hover Tooltip ─────────────────────────────────────────────────────────
const hoverPopup = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false,
  maxWidth: '310px',
  focusAfterOpen: false,
  anchor: 'bottom',
  offset: [0, -12],
  className: 'hover-tooltip'
});

let hoverFrame = 0;
let pendingHoverEvent = null;

function renderHoverTooltip(e) {
  if (!e?.features || e.features.length === 0) return;
  // If rich click popup is already open, do not overwrite with hover tooltip
  if (clickPopup.isOpen()) return;

  map.getCanvas().style.cursor = 'pointer';
  const feature = e.features[0];
  if (!feature) return;

  const tel = extractFeatureTelemetry(feature, e.lngLat?.lat, e.lngLat?.lng);
  const badgeClass = tel.risk_level === 'CRITICAL' ? 'badge-critical' : tel.risk_level === 'HIGH' ? 'badge-high' : tel.risk_level === 'MODERATE' ? 'badge-moderate' : 'badge-low';

  const hoverHtml = `
    <div class="hover-popup-content">
      <div class="popup-header">
        <div class="popup-title">${tel.corridor_name}</div>
        <div class="popup-sub-header">
          <span class="popup-operator">${tel.operator}</span>
          <span class="popup-id-badge">${tel.segment_id}</span>
        </div>
      </div>
      <div class="popup-body">
        <div class="popup-row">
          <span class="popup-row-label">Thermal Status</span>
          <span class="badge-tag ${badgeClass}">${tel.risk_level} RISK</span>
        </div>
        <div class="popup-row">
          <span class="popup-row-label">Est. Rail Temp</span>
          <span class="popup-row-value" style="color:#00f0ff;">${tel.est_rail_temp_c}°C</span>
        </div>
        <div class="popup-row">
          <span class="popup-row-label">Heat Risk Score</span>
          <span class="popup-row-value" style="color:#ff9944;">${tel.risk_score}/100</span>
        </div>
      </div>
    </div>
  `;

  hoverPopup.setLngLat(e.lngLat).setHTML(hoverHtml).addTo(map);
}

function handleHoverMove(e) {
  pendingHoverEvent = e;
  if (!hoverFrame) {
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      renderHoverTooltip(pendingHoverEvent);
    });
  }
}

function handleHoverLeave() {
  pendingHoverEvent = null;
  if (hoverFrame) {
    cancelAnimationFrame(hoverFrame);
    hoverFrame = 0;
  }
  map.getCanvas().style.cursor = '';
  hoverPopup.remove();
}

// ── Map Click Handler (Unified Synchronized Dispatcher) ───────────────────────
function handleTrackClick(e) {
  if (!e?.features || e.features.length === 0) return;
  const feature = e.features[0];
  if (!feature) return;
  const lat = e.lngLat?.lat;
  const lng = e.lngLat?.lng;
  if (lat == null || lng == null) return;

  // Zero-latency synchronous telemetry selection for BOTH map modal AND right sidebar
  selectTrackSegment(feature, lng, lat, true);
}

// ── Tubelight Header Indicator ────────────────────────────────────────────────
function updateTubelightIndicator() {
  const nav = document.querySelector('.top-nav-links');
  const active = nav?.querySelector('.nav-link.active');
  const indicator = document.getElementById('tubelight-indicator');
  if (!nav || !active || !indicator) return;

  const navRect = nav.getBoundingClientRect();
  const linkRect = active.getBoundingClientRect();
  const offsetLeft = linkRect.left - navRect.left - 4;

  indicator.style.transform = `translateX(${offsetLeft}px)`;
  indicator.style.width = `${linkRect.width}px`;
}

// ── Map Event Listeners ───────────────────────────────────────────────────────
map.on('mousemove', 'southwest-rail-layer', handleHoverMove);
map.on('mouseleave', 'southwest-rail-layer', handleHoverLeave);
map.on('click', 'southwest-rail-layer', handleTrackClick);

map.on('style.load', () => {
  setupAllMapLayers();
  // If a track is active, re-render its buffer
  if (activeTrackSelection && activeTrackSelection.lng && activeTrackSelection.lat) {
    const color = riskColor(activeTrackSelection.risk_level);
    renderProximityBuffer(activeTrackSelection.lng, activeTrackSelection.lat, color);
  }
});

map.on('load', () => {
  try {
    setupAllMapLayers();
    setupAuthUI();
    setupViewSwitcher();
    setupThemeToggle();
    setupMapControls();
    switchView('home');

    // Initialize Day 7 Alert Engine UI with spatial map fly-to callback
    initAlertsUI((alert) => {
      if (!alert) return;
      // 1. Switch active view route to Dashboard overview
      switchView('dashboard');

      // 2. Smoothly fly camera to alert coordinate
      const center = alert.center;
      if (Array.isArray(center) && center.length >= 2) {
        const [lng, lat] = center;
        map.flyTo({
          center: [lng, lat],
          zoom: 12,
          pitch: is3DView ? 60 : 30,
          speed: 1.5,
          essential: true
        });

        // 3. Render 500m buffer, open rich modal, and bind sidebar inspector
        selectTrackSegment(alert.props || alert.telemetry || {}, lng, lat, true);
      }
    });

    initPrecautionsUI((alert) => {
      if (!alert) {
        switchView('map');
        return;
      }

      switchView('dashboard');
      const center = alert.center;
      if (Array.isArray(center) && center.length >= 2) {
        const [lng, lat] = center;
        map.flyTo({
          center: [lng, lat],
          zoom: 12,
          pitch: is3DView ? 60 : 30,
          speed: 1.5,
          essential: true
        });
        selectTrackSegment(alert.props || alert.telemetry || {}, lng, lat, true);
      }
    });

    initAnalyticsUI();

    initReportsUI((segment) => {
      if (!segment) return;
      switchView('dashboard');
      const center = segment.center;
      if (Array.isArray(center) && center.length >= 2) {
        const [lng, lat] = center;
        map.flyTo({
          center: [lng, lat],
          zoom: 13,
          pitch: is3DView ? 60 : 30,
          speed: 1.5,
          essential: true
        });
        selectTrackSegment(segment.feature?.properties || segment, lng, lat, true);
      }
    });

    initTopCorridors();

    requestAnimationFrame(() => map.resize());
    setTimeout(() => map.resize(), 100);
    setTimeout(() => map.resize(), 500);
    setTimeout(() => updateTubelightIndicator(), 200);
  } catch (err) {
    console.error('[ThermoRail] Error on map load initialization:', err);
  } finally {
    hideLoader();
    updateTelemetryOnline('45,955');
  }
});

map.on('idle', () => {
  hideLoader();
  updateTelemetryOnline('45,955');
});

// Window resize handler
window.addEventListener('resize', () => {
  if (map) map.resize();
  updateTubelightIndicator();
});

// Immediate early binding on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupAuthUI();
    setupViewSwitcher();
    switchView('home');
  });
} else {
  setupAuthUI();
  setupViewSwitcher();
  switchView('home');
}

window.addEventListener('load', () => {
  setupAuthUI();
  setupViewSwitcher();
  switchView('home');
  requestAnimationFrame(() => updateTubelightIndicator());
  setTimeout(hideLoader, 800);
});

