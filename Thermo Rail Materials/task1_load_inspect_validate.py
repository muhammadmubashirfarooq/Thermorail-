"""
ThermoRail Project - Task 1: Load, Inspect, and Validate GeoJSON
------------------------------------------------------------------
This script loads a local OpenStreetMap GeoJSON export of the Houston
rail network, prints a structural/content summary, checks for missing
or invalid geometries, and produces a quick-look plot of the track
alignment.

Author: ThermoRail GIS Pipeline
"""

import sys
import geopandas as gpd
import matplotlib.pyplot as plt

# ---------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------
INPUT_FILE = "houston_rail.geojson"
PLOT_OUTPUT = "houston_rail_network.png"


def load_geojson(filepath: str) -> gpd.GeoDataFrame:
    """
    Load a GeoJSON file into a GeoDataFrame with graceful error handling.

    Parameters
    ----------
    filepath : str
        Path to the local .geojson file.

    Returns
    -------
    gpd.GeoDataFrame
        The loaded rail network data.
    """
    try:
        gdf = gpd.read_file(filepath)
    except FileNotFoundError:
        print(f"ERROR: File not found -> '{filepath}'. "
              f"Check the path and try again.")
        sys.exit(1)
    except Exception as e:
        # Catches malformed JSON, unsupported driver errors, etc.
        print(f"ERROR: Failed to load '{filepath}'. Reason: {e}")
        sys.exit(1)

    if gdf.empty:
        print("WARNING: The GeoDataFrame loaded successfully but contains "
              "no features.")

    return gdf


def summarize(gdf: gpd.GeoDataFrame) -> None:
    """
    Print a structural and content summary of the GeoDataFrame:
    feature count, columns, CRS, unique categorical values, and
    a null-geometry check.
    """
    print("=" * 70)
    print("SUMMARY: Houston Rail Network GeoDataFrame")
    print("=" * 70)

    # --- Basic structure ---
    print(f"\nTotal feature count : {len(gdf)}")
    print(f"Column names        : {list(gdf.columns)}")
    print(f"Coordinate Ref Sys  : {gdf.crs}")

    # --- Geometry type breakdown (sanity check on data shape) ---
    print("\nGeometry type counts:")
    print(gdf.geom_type.value_counts().to_string())

    # --- Unique operators ---
    if "operator" in gdf.columns:
        operators = gdf["operator"].dropna().unique()
        print(f"\nUnique operators ({len(operators)}):")
        for op in sorted(operators):
            print(f"  - {op}")
    else:
        print("\n'operator' column not present in this dataset.")

    # --- Unique usage values ---
    if "usage" in gdf.columns:
        usage_vals = gdf["usage"].dropna().unique()
        print(f"\nUnique 'usage' values ({len(usage_vals)}):")
        print(f"  {sorted(usage_vals)}")
    else:
        print("\n'usage' column not present in this dataset.")

    # --- Unique service values ---
    if "service" in gdf.columns:
        service_vals = gdf["service"].dropna().unique()
        print(f"\nUnique 'service' values ({len(service_vals)}):")
        print(f"  {sorted(service_vals)}")
    else:
        print("\n'service' column not present in this dataset.")

    # --- Missing / null geometry check ---
    null_geom_count = gdf.geometry.isna().sum()
    empty_geom_count = gdf.geometry.is_empty.sum()
    invalid_geom_count = (~gdf.geometry.is_valid).sum()

    print("\nGeometry validation:")
    print(f"  Null geometries    : {null_geom_count}")
    print(f"  Empty geometries   : {empty_geom_count}")
    print(f"  Invalid geometries : {invalid_geom_count}")

    if null_geom_count == 0 and empty_geom_count == 0:
        print("  -> No missing geometries detected.")
    else:
        print("  -> WARNING: some features have missing/empty geometry "
              "and should be reviewed before further processing.")

    print("=" * 70)


def plot_network(gdf: gpd.GeoDataFrame, output_path: str) -> None:
    """
    Generate and save a clean plot of the rail line geometries to
    visually confirm track alignment.
    """
    # Drop rows with missing/empty geometry so they don't break plotting
    plot_gdf = gdf[~gdf.geometry.isna() & ~gdf.geometry.is_empty]

    fig, ax = plt.subplots(figsize=(12, 12))
    plot_gdf.plot(ax=ax, linewidth=0.6, color="#c0392b")

    ax.set_title("Houston Rail Network (OSM Export)", fontsize=14, weight="bold")
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    ax.set_aspect("equal")
    ax.grid(True, linestyle="--", alpha=0.3)

    plt.tight_layout()
    plt.savefig(output_path, dpi=200)
    plt.close(fig)
    print(f"\nPlot saved to: {output_path}")


def main():
    gdf = load_geojson(INPUT_FILE)
    summarize(gdf)
    plot_network(gdf, PLOT_OUTPUT)


if __name__ == "__main__":
    main()
