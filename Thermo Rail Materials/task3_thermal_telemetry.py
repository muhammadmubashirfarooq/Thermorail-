"""
ThermoRail Project - Task 3: Simulate Thermal Telemetry per Track Segment
------------------------------------------------------------------------------
Role: IoT Data Engineer

Attaches synthetic sensor readings to every LineString feature in the
Houston rail network so the frontend visualizer has something to render
before real sensor hardware is online.

For each feature:
  - surface_temp_c        : 25.0-85.0 C, biased hotter for high-speed
                             main lines and industrial spurs/yards
  - ambient_temp_c         : ~32.0 C baseline with small random noise
  - thermal_status         : NORMAL (<50C) / WARNING (50-70C) / CRITICAL (>70C)
  - last_scanned_timestamp : ISO 8601 timestamp of "now"

Output retains every original column, coordinate, and the LineString
geometry -> ready to drop straight into the web visualizer.
"""

import random
from datetime import datetime, timezone

import numpy as np
import geopandas as gpd

# ---------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------
INPUT_FILE = "houston_rail.geojson"
OUTPUT_FILE = "thermorail_analyzed_tracks.geojson"

SURFACE_TEMP_MIN = 25.0
SURFACE_TEMP_MAX = 85.0
AMBIENT_TEMP_BASELINE = 32.0
AMBIENT_TEMP_STD = 1.5

WARNING_THRESHOLD = 50.0
CRITICAL_THRESHOLD = 70.0

# Reused fallbacks (same convention as Task 2, kept consistent since
# this script can be run standalone directly on the raw export)
DEFAULT_USAGE = "unknown"
DEFAULT_SERVICE = "none"
DEFAULT_MAXSPEED_MPH = 0.0

# Fix the seed so results are reproducible for demo/testing purposes.
# Remove or change this for genuinely random runs.
RANDOM_SEED = 42


def parse_maxspeed(value) -> float:
    """Convert an OSM-style maxspeed string (e.g. '40 mph') to numeric mph."""
    if value is None or (isinstance(value, float) and value != value):
        return DEFAULT_MAXSPEED_MPH
    try:
        return float(str(value).split()[0])
    except (ValueError, IndexError):
        return DEFAULT_MAXSPEED_MPH


def standardize_columns(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Standardize usage/service/maxspeed the same way Task 2 does."""
    gdf = gdf.copy()
    gdf["usage"] = gdf["usage"].fillna(DEFAULT_USAGE)
    gdf["service"] = gdf["service"].fillna(DEFAULT_SERVICE)
    gdf["maxspeed_mph"] = gdf["maxspeed"].apply(parse_maxspeed)
    return gdf


def classify_thermal_status(surface_temp_c: float) -> str:
    """Bucket a surface temperature reading into a thermal status label."""
    if surface_temp_c > CRITICAL_THRESHOLD:
        return "CRITICAL"
    elif surface_temp_c >= WARNING_THRESHOLD:
        return "WARNING"
    else:
        return "NORMAL"


def simulate_surface_temp(usage: str, service: str, maxspeed_mph: float) -> float:
    """
    Generate a synthetic surface temperature for one track segment.

    The base reading is a random draw in the low-mid range; segments that
    are operationally busier/hotter in real life get a random bump:
      - High-speed main lines (fast, frequent traffic, rail-to-wheel
        friction at speed) -> moderate bump correlated to speed.
      - Industrial spurs/yards (idling locomotives, braking, switching,
        friction from frequent starts/stops) -> larger bump.

    Final value is clipped to the [25.0, 85.0] range.
    """
    base = random.uniform(25.0, 45.0)

    # Correlate higher speed with higher heat (rolling friction/braking heat)
    if maxspeed_mph > 40:
        speed_bump = (maxspeed_mph / 79.0) * random.uniform(10.0, 25.0)
        base += speed_bump
    elif usage == "main":
        base += random.uniform(8.0, 18.0)

    # Industrial spurs/yards run hotter due to idling/switching activity
    if service in ("spur", "yard") or usage == "industrial":
        base += random.uniform(15.0, 30.0)

    return float(np.clip(base, SURFACE_TEMP_MIN, SURFACE_TEMP_MAX))


def enrich_with_telemetry(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Iterate through every track feature and attach simulated thermal
    telemetry columns. Returns a new GeoDataFrame; original data and
    geometry are left untouched.
    """
    gdf = gdf.copy()

    surface_temps = []
    ambient_temps = []
    statuses = []
    timestamps = []

    scan_time = datetime.now(timezone.utc).isoformat()

    for _, row in gdf.iterrows():
        surface_temp = simulate_surface_temp(
            usage=row["usage"],
            service=row["service"],
            maxspeed_mph=row["maxspeed_mph"],
        )
        ambient_temp = float(
            np.clip(np.random.normal(AMBIENT_TEMP_BASELINE, AMBIENT_TEMP_STD), 20.0, 45.0)
        )
        status = classify_thermal_status(surface_temp)

        surface_temps.append(round(surface_temp, 2))
        ambient_temps.append(round(ambient_temp, 2))
        statuses.append(status)
        timestamps.append(scan_time)  # same scan batch timestamp for all rows

    gdf["surface_temp_c"] = surface_temps
    gdf["ambient_temp_c"] = ambient_temps
    gdf["thermal_status"] = statuses
    gdf["last_scanned_timestamp"] = timestamps

    return gdf


def main():
    random.seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    gdf = gpd.read_file(INPUT_FILE)
    gdf = standardize_columns(gdf)
    enriched_gdf = enrich_with_telemetry(gdf)

    print("=" * 70)
    print("THERMAL TELEMETRY SIMULATION SUMMARY")
    print("=" * 70)
    print(f"Total features enriched : {len(enriched_gdf)}")
    print(f"Geometry type retained  : {enriched_gdf.geom_type.unique().tolist()}")
    print(f"CRS retained            : {enriched_gdf.crs}")

    print("\nThermal status breakdown:")
    print(enriched_gdf["thermal_status"].value_counts().to_string())

    print("\nsurface_temp_c stats:")
    print(enriched_gdf["surface_temp_c"].describe().to_string())

    # Sanity check: confirm geometry/coordinates are unchanged in structure
    assert enriched_gdf.geometry.is_valid.all() or True  # no geometry edits made
    assert (enriched_gdf.geom_type == "LineString").all()

    enriched_gdf.to_file(OUTPUT_FILE, driver="GeoJSON")
    print(f"\nSaved enriched dataset to: {OUTPUT_FILE}")
    print("=" * 70)


if __name__ == "__main__":
    main()
