# FortyGuard Integration Guide

## 1. Overview
FortyGuard delivers hyperlocal outdoor temperature and urban heat island (UHI) analytics at street and block levels. ThermoRail leverages FortyGuard's thermal data to evaluate track-surface thermal stress and rail buckling probabilities along critical railway corridors.

## 2. API Specifications & Authentication
- **Base URL:** `https://api.fortyguard.com/v1`
- **Authentication Header:** `X-API-KEY: <FORTYGUARD_API_KEY>` (configured in `.env`)
- **Data Formats:** GeoJSON / JSON thermal raster points

## 3. Key Ingestion Endpoints (Target Integration)
- `GET /v1/thermal/hyperlocal?bbox={minLon,minLat,maxLon,maxLat}&timestamp={iso_timestamp}`
  - Fetches spatial temperature grid cells for the target railway bounding box.
- `GET /v1/thermal/forecast?lat={lat}&lon={lon}&horizon=24h`
  - Fetches 24-hour predictive thermal curves for high-risk track segments.

## 4. Ingestion & Spatial Mapping Architecture
```
[FortyGuard API] 
       │
       ▼ (Periodic Polling / Batch Ingestion)
[Backend Ingestion Pipeline] (scripts/ingest_fortyguard.py)
       │
       ▼ (Spatial Join: KD-Tree / PostGIS / Shapely)
[Railway Network Segments] (data/processed/rail_network.geojson)
       │
       ▼
[Risk Engine: CRT & Buckling Index]
```

## 5. Caching & Rate Limiting Strategy
- In-memory or Redis caching for 15-minute intervals to stay within API tier limits.
- Geo-partitioned queries aligned with active railway network clusters.
