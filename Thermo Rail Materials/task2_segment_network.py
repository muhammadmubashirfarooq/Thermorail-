"""
ThermoRail Project - Task 2: Segment the Rail Network for Thermal Monitoring
------------------------------------------------------------------------------
Role: Data Engineer

Splits the Houston rail network into two operationally meaningful subsets
so each can later be monitored with different thermal thresholds:

  1. High-Speed Main Lines  -> maxspeed > 40 mph  OR usage == 'main'
  2. Industrial Spurs/Yards -> service in {'spur', 'yard'} OR usage == 'industrial'

Missing usage/speed values are standardized with explicit fallbacks so
downstream filtering never silently drops rows because of NaNs.
"""

import geopandas as gpd

# ---------------------------------------------------------------------
# Configuration / fallback defaults
# ---------------------------------------------------------------------
INPUT_FILE = "houston_rail.geojson"
HIGH_SPEED_OUTPUT = "high_speed_lines.geojson"
INDUSTRIAL_OUTPUT = "industrial_spurs.geojson"

# Standardization fallbacks applied when a feature has no OSM tag value.
# These are intentionally conservative (won't push an "unknown" segment
# into the high-speed bucket).
DEFAULT_USAGE = "unknown"
DEFAULT_SERVICE = "none"
DEFAULT_MAXSPEED_MPH = 0.0  # treat unspecified speed as "not high-speed"


def parse_maxspeed(value) -> float:
    """
    Convert an OSM-style maxspeed string (e.g. '40 mph') into a numeric
    mph float. Returns the default fallback if missing or unparsable.
    """
    if value is None or (isinstance(value, float) and value != value):  # NaN check
        return DEFAULT_MAXSPEED_MPH
    try:
        # Strings look like "40 mph" -> take the first numeric token
        numeric_part = str(value).split()[0]
        return float(numeric_part)
    except (ValueError, IndexError):
        return DEFAULT_MAXSPEED_MPH


def standardize_columns(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    Standardize missing/null values in the columns used for segmentation:
      - usage    -> DEFAULT_USAGE
      - service  -> DEFAULT_SERVICE
      - maxspeed -> parsed numeric mph column 'maxspeed_mph', with
                    DEFAULT_MAXSPEED_MPH used for missing/unparsable values
    """
    gdf = gdf.copy()

    gdf["usage"] = gdf["usage"].fillna(DEFAULT_USAGE)
    gdf["service"] = gdf["service"].fillna(DEFAULT_SERVICE)
    gdf["maxspeed_mph"] = gdf["maxspeed"].apply(parse_maxspeed)

    return gdf


def segment_network(gdf: gpd.GeoDataFrame):
    """
    Split the standardized GeoDataFrame into high-speed main lines and
    industrial spurs/yards subsets.

    Returns
    -------
    (high_speed_gdf, industrial_gdf)
    """
    high_speed_mask = (gdf["maxspeed_mph"] > 40) | (gdf["usage"] == "main")
    industrial_mask = (
        gdf["service"].isin(["spur", "yard"]) | (gdf["usage"] == "industrial")
    )

    high_speed_gdf = gdf[high_speed_mask].copy()
    industrial_gdf = gdf[industrial_mask].copy()

    return high_speed_gdf, industrial_gdf


def print_subset_summary(name: str, subset: gpd.GeoDataFrame) -> None:
    """Print feature count and quick summary stats for a subset."""
    print(f"\n--- {name} ---")
    print(f"Feature count : {len(subset)}")

    if len(subset) == 0:
        print("(no features matched this filter)")
        return

    print("Usage breakdown:")
    print(subset["usage"].value_counts().to_string())

    print("\nService breakdown:")
    print(subset["service"].value_counts().to_string())

    print("\nmaxspeed_mph stats:")
    print(subset["maxspeed_mph"].describe().to_string())


def main():
    gdf = gpd.read_file(INPUT_FILE)
    gdf = standardize_columns(gdf)

    high_speed_gdf, industrial_gdf = segment_network(gdf)

    print("=" * 70)
    print("SEGMENTATION SUMMARY")
    print("=" * 70)
    print_subset_summary("High-Speed Main Lines", high_speed_gdf)
    print_subset_summary("Industrial Spurs & Yards", industrial_gdf)

    overlap = len(set(high_speed_gdf.index) & set(industrial_gdf.index))
    print(f"\nOverlap between the two subsets: {overlap} feature(s) "
          f"(segments matching both filters)")

    # --- Export ---
    high_speed_gdf.to_file(HIGH_SPEED_OUTPUT, driver="GeoJSON")
    industrial_gdf.to_file(INDUSTRIAL_OUTPUT, driver="GeoJSON")

    print(f"\nSaved: {HIGH_SPEED_OUTPUT} ({len(high_speed_gdf)} features)")
    print(f"Saved: {INDUSTRIAL_OUTPUT} ({len(industrial_gdf)} features)")
    print("=" * 70)


if __name__ == "__main__":
    main()
