#!/usr/bin/env python3
"""
ThermoRail Standalone Risk Engine Module (Task 4.2 Re-export Shim)
Imports and exposes evaluate_segment_risk from backend.risk_engine.
"""

import sys
import os

# Add root directory to python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.risk_engine import (
    evaluate_segment_risk,
    calculate_solar_offset,
    calculate_risk_score,
    determine_risk_level,
    determine_primary_factor,
)

if __name__ == "__main__":
    from backend.risk_engine import evaluate_segment_risk
    print("Testing scripts/risk_engine.py shim...")
    sample = evaluate_segment_risk({"segment_id": "SHIM_001", "orientation": "NORTH_SOUTH"}, temperature=55.0)
    print(sample)
    print("Shim OK!")
