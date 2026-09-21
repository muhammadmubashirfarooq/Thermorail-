import os
import time
import numpy as np
import geopandas as gpd
from shapely.geometry import Point

def map_temperatures_to_railways():
    start_time = time.time()
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    input_path = os.path.join(base_dir, "public", "southwest_standardized.geojson")
    output_path = os.path.join(base_dir, "public", "southwest_temperature_mapped.geojson")
    root_output_path = os.path.join(base_dir, "southwest_temperature_mapped.geojson")

    print(f"[1/5] Loading Southwest railway dataset from: {input_path}")
    gdf = gpd.read_file(input_path)
    initial_count = len(gdf)
    print(f"      -> Successfully loaded {initial_count:,} railway segments.")
    print(f"      -> CRS: {gdf.crs}")

    # Bounding box of the railway dataset
    minx, miny, maxx, maxy = gdf.total_bounds
    print(f"[2/5] Railway total bounds: [{minx:.4f}, {miny:.4f}, {maxx:.4f}, {maxy:.4f}]")

    # Generate Simulated FortyGuard Thermal Sensors Grid across the bounding box
    # A dense spatial grid (~80x60 points across the region for high resolution coverage)
    grid_x = np.linspace(minx - 0.1, maxx + 0.1, 80)
    grid_y = np.linspace(miny - 0.1, maxy + 0.1, 60)
    xx, yy = np.meshgrid(grid_x, grid_y)
    flat_x = xx.ravel()
    flat_y = yy.ravel()

    # Deterministic realistic thermal variation between 38.0°C and 66.0°C simulating desert heat
    np.random.seed(42)
    # Base gradient: hotter in southern/western desert areas + spatial wave + random noise
    norm_x = (flat_x - minx) / (maxx - minx)
    norm_y = (flat_y - miny) / (maxy - miny)
    thermal_surface = 48.0 + 8.0 * np.sin(norm_x * np.pi * 2) - 6.0 * norm_y + np.random.uniform(-4.0, 8.0, size=len(flat_x))
    thermal_surface = np.clip(thermal_surface, 38.0, 66.0)
    thermal_surface = np.round(thermal_surface, 1)

    points = [Point(x, y) for x, y in zip(flat_x, flat_y)]
    temp_gdf = gpd.GeoDataFrame({
        'sensor_id': [f"FG_SENSOR_{i+1:04d}" for i in range(len(points))],
        'surface_temp_c': thermal_surface
    }, geometry=points, crs=gdf.crs)

    print(f"      -> Generated {len(temp_gdf):,} simulated FortyGuard thermal sensor grid points.")
    print(f"      -> Simulated Surface Temp Range: {temp_gdf['surface_temp_c'].min()}°C to {temp_gdf['surface_temp_c'].max()}°C (Mean: {temp_gdf['surface_temp_c'].mean():.1f}°C)")

    print("[3/5] Calculating centroids for all railway LineStrings...")
    centroids_gdf = gpd.GeoDataFrame(
        gdf[['segment_id']],
        geometry=gdf.geometry.centroid,
        crs=gdf.crs
    )

    print("[4/5] Executing Nearest-Neighbor Spatial Join (gpd.sjoin_nearest)...")
    join_start = time.time()
    # Execute nearest join
    joined = gpd.sjoin_nearest(centroids_gdf, temp_gdf, how='left')
    
    # In case of equidistant matches, remove duplicates by keeping the first per segment_id
    if joined.index.duplicated().any():
        joined = joined[~joined.index.duplicated(keep='first')]

    join_elapsed = time.time() - join_start
    print(f"      -> Nearest-neighbor spatial join completed in {join_elapsed:.2f} seconds.")

    print("[5/5] Reconstructing dataset and preserving schema with original LineString geometries...")
    # Map matched surface_temp_c onto original GeoDataFrame
    gdf['surface_temp_c'] = joined.loc[gdf.index, 'surface_temp_c'].values

    # Enforce strict schema and ordering
    final_gdf = gdf[['segment_id', 'operator', 'track_class', 'surface_temp_c', 'geometry']].copy()

    # Verification checks
    final_count = len(final_gdf)
    assert initial_count == final_count, f"Segment count mismatch: expected {initial_count}, got {final_count}"
    assert final_gdf['surface_temp_c'].isnull().sum() == 0, "Found null surface_temp_c values!"

    print(f"Saving final dataset ({final_count:,} segments) to:\n  - {output_path}")
    final_gdf.to_file(output_path, driver='GeoJSON')

    print(f"  - {root_output_path}")
    final_gdf.to_file(root_output_path, driver='GeoJSON')

    total_elapsed = time.time() - start_time
    print(f"\n=======================================================")
    print(f"SUCCESS: Task 3.1 completed in {total_elapsed:.2f}s!")
    print(f"Total track segments processed: {final_count:,}")
    print(f"No segments dropped (Initial: {initial_count:,} -> Final: {final_count:,})")
    print(f"Surface Temp summary:\n{final_gdf['surface_temp_c'].describe()}")
    print(f"=======================================================")

if __name__ == "__main__":
    map_temperatures_to_railways()
