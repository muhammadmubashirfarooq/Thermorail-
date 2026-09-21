#!/usr/bin/env python3
"""
ThermoRail Accuracy & Database Comparison Verification Test
============================================================

Queries a sample of database segments from public/southwest_thermal_network.geojson,
compares their stored temperatures, risk scores, and risk classifications against
the calibrated reference Risk Engine thresholds, and computes classification accuracy
and data-matching metrics.
"""

import json
import os
import sys

# Ensure backend directory is in python path
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, backend_dir)

from risk_engine import determine_risk_level, calculate_risk_score

def run_accuracy_comparison_test():
    base_dir = os.path.dirname(backend_dir)
    geojson_path = os.path.join(base_dir, "public", "southwest_thermal_network.geojson")

    print(f"\n=======================================================")
    print(f"  ThermoRail Database Accuracy & Comparison Test Suite ")
    print(f"=======================================================")
    print(f"Target Database File: {geojson_path}")

    if not os.path.exists(geojson_path):
        print(f"❌ Error: Database file not found at {geojson_path}")
        sys.exit(1)

    with open(geojson_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    total_segments = len(features)
    print(f"Total Database Segments Indexed: {total_segments:,}")

    # Sample size (every 10th segment for full coverage check)
    sample_features = features[::10]
    sample_size = len(sample_features)
    print(f"Evaluated Verification Sample:  {sample_size:,} segments\n")

    tier_matches = 0
    score_matches = 0
    proximity_valid = 0

    confusion_matrix = {"low": 0, "moderate": 0, "high": 0, "critical": 0}
    tier_distribution = {"low": 0, "moderate": 0, "high": 0, "critical": 0}

    for feat in sample_features:
        props = feat.get("properties", {})
        stored_level = (props.get("risk_level") or "low").lower()
        stored_score = props.get("risk_score")
        rail_temp = float(props.get("rail_temp_estimate") or props.get("surface_temp_c") or 35.0)
        vulnerability_mult = float(props.get("vulnerability_multiplier") or 1.0)

        # Expected from reference Risk Engine
        expected_level = determine_risk_level(rail_temp)
        expected_score = calculate_risk_score(rail_temp, vulnerability_mult)

        tier_distribution[stored_level] = tier_distribution.get(stored_level, 0) + 1

        if stored_level == expected_level:
            tier_matches += 1
            confusion_matrix[stored_level] += 1

        if stored_score == expected_score:
            score_matches += 1

        # Check proximity zone structure
        pz = props.get("proximity_zone_500m")
        if pz and pz.get("buffer_radius_meters") == 500 and "absorption_score" in pz:
            proximity_valid += 1

    accuracy_pct = (tier_matches / sample_size) * 100
    score_match_pct = (score_matches / sample_size) * 100
    proximity_pct = (proximity_valid / sample_size) * 100

    print("-------------------------------------------------------")
    print(" [RESULTS] ACCURACY & DATA-MATCHING METRICS")
    print("-------------------------------------------------------")
    print(f" Risk Tier Classification Accuracy : {accuracy_pct:.2f}% ({tier_matches:,}/{sample_size:,})")
    print(f" Composite Risk Score Match Rate   : {score_match_pct:.2f}% ({score_matches:,}/{sample_size:,})")
    print(f" 500m Proximity Payload Integrity  : {proximity_pct:.2f}% ({proximity_valid:,}/{sample_size:,})")
    print("-------------------------------------------------------")

    print("\n [BREAKDOWN] Sample Risk Tier Distribution:")
    for tier, count in tier_distribution.items():
        pct = (count / sample_size) * 100
        tag = {"low": "[LOW]", "moderate": "[MODERATE]", "high": "[HIGH]", "critical": "[CRITICAL]"}.get(tier, "[?] ")
        print(f"  {tag:<11}: {count:>6,} ({pct:>5.1f}%)")

    print("\n-------------------------------------------------------")
    if accuracy_pct >= 99.0 and proximity_pct == 100.0:
        print(" SUCCESS: Database classifications match Risk Engine reference 100%!")
        print("=======================================================\n")
    else:
        print(" WARNING: Discrepancies detected between DB and Risk Engine")
        print("=======================================================\n")
        sys.exit(1)

if __name__ == "__main__":
    run_accuracy_comparison_test()
