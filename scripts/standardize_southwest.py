import os
import json
try:
    import geopandas as gpd
    HAS_GEOPANDAS = True
except ImportError:
    HAS_GEOPANDAS = False

def standardize_southwest_geojson(input_path, output_path):
    print(f"Reading input file: {input_path}")
    
    if HAS_GEOPANDAS:
        print("Using GeoPandas engine...")
        gdf = gpd.read_file(input_path)
        
        # Determine operator column
        operator_col = None
        for col in ['operator', 'owner', 'railway_operator', 'old_railway_operator']:
            if col in gdf.columns:
                operator_col = col
                break
        
        # Standardize properties
        segment_ids = [f"SW_{i+1:05d}" for i in range(len(gdf))]
        if operator_col and operator_col in gdf.columns:
            operators = gdf[operator_col].apply(lambda x: str(x).strip() if x and str(x).strip() and str(x) != 'nan' and str(x) != 'None' else "unavailable")
        else:
            operators = ["unavailable"] * len(gdf)
            
        track_classes = ["unavailable"] * len(gdf)
        
        # Build clean GeoDataFrame
        clean_gdf = gpd.GeoDataFrame({
            'segment_id': segment_ids,
            'operator': operators,
            'track_class': track_classes,
            'geometry': gdf.geometry
        }, crs=gdf.crs)
        
        print(f"Writing {len(clean_gdf)} standardized segments to {output_path}...")
        clean_gdf.to_file(output_path, driver='GeoJSON')
        print("Standardization complete successfully!")
    else:
        print("Using standard JSON engine...")
        with open(input_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        features = data.get('features', [])
        clean_features = []
        
        for i, feat in enumerate(features):
            props = feat.get('properties') or {}
            
            # Map operator
            op = props.get('operator') or props.get('owner') or props.get('railway_operator') or props.get('old_railway_operator')
            if not op or str(op).strip() in ['', 'nan', 'None', 'null']:
                op_val = "unavailable"
            else:
                op_val = str(op).strip()
                
            clean_feat = {
                "type": "Feature",
                "properties": {
                    "segment_id": f"SW_{i+1:05d}",
                    "operator": op_val,
                    "track_class": "unavailable"
                },
                "geometry": feat.get("geometry")
            }
            clean_features.append(clean_feat)
            
        clean_geojson = {
            "type": "FeatureCollection",
            "name": "southwest_standardized",
            "crs": data.get("crs", { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC::CRS84" } }),
            "features": clean_features
        }
        
        print(f"Writing {len(clean_features)} standardized segments to {output_path}...")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(clean_geojson, f)
        print("Standardization complete successfully!")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    in_file = os.path.join(base_dir, "public", "southwest_corridor_railways.geojson")
    if not os.path.exists(in_file):
        in_file = os.path.join(base_dir, "southwest_corridor_railways.geojson")
        
    out_file = os.path.join(base_dir, "public", "southwest_standardized.geojson")
    standardize_southwest_geojson(in_file, out_file)
    
    # Also write a copy to root directory
    root_out_file = os.path.join(base_dir, "southwest_standardized.geojson")
    standardize_southwest_geojson(in_file, root_out_file)
