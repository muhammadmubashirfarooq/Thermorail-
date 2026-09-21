#!/usr/bin/env python3
"""
Test Suite for Track Intelligence API Endpoint (GET /api/track/<segment_id>)
==========================================================================
"""

import sys
import os
import unittest
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app import app, SEGMENT_INDEX, TOTAL_SEGMENTS


class TestTrackAPIEndpoint(unittest.TestCase):

    def setUp(self):
        self.client = app.test_client()
        self.client.testing = True

    def test_health_check(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data["status"], "healthy")
        self.assertGreater(data["indexed_segments"], 0)

    def test_get_valid_track_segment(self):
        # Pick the first segment ID from indexed dataset
        first_seg_id = list(SEGMENT_INDEX.keys())[0]
        response = self.client.get(f"/api/track/{first_seg_id}")
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertEqual(payload["status"], "success")
        self.assertIn("data", payload)
        
        data = payload["data"]
        self.assertIn("segment_id", data)
        self.assertIn("risk_score", data)
        self.assertIn("risk_level", data)
        self.assertIn("primary_factor", data)
        self.assertIn("explanation", data)
        self.assertIn("surface_temp_c", data)
        self.assertIn("rail_temp_estimate", data)
        self.assertIn("rnt_c", data)
        self.assertIn("delta_t", data)
        self.assertIn("vulnerability_multiplier", data)
        self.assertIn("proximity_zone_500m", data)

        pz = data["proximity_zone_500m"]
        self.assertEqual(pz["buffer_radius_meters"], 500)
        self.assertIn("environmental_heat_modifier", pz)
        self.assertIn("surrounding_factors", pz)
        self.assertIn("absorption_score", pz)

        print(f"\n[PASS] GET /api/track/{first_seg_id}:")
        print(f"  Risk Level:          {data['risk_level']}")
        print(f"  Risk Score:          {data['risk_score']}")
        print(f"  Rail Temp Estimate:  {data['rail_temp_estimate']}\u00b0C")
        print(f"  Absorption Score:    {pz['absorption_score']}/100")
        safe_factors = pz['surrounding_factors'][:80].encode('ascii', errors='replace').decode('ascii')
        print(f"  Proximity Factors:   {safe_factors}")
        safe_explanation = data['explanation'][:80].encode('ascii', errors='replace').decode('ascii')
        print(f"  Explanation:         {safe_explanation}...")

    def test_get_invalid_track_segment(self):
        invalid_id = "NON_EXISTENT_SEGMENT_99999"
        response = self.client.get(f"/api/track/{invalid_id}")
        self.assertEqual(response.status_code, 404)

        payload = response.get_json()
        self.assertEqual(payload["status"], "error")
        self.assertEqual(payload["code"], "SEGMENT_NOT_FOUND")
        print(f"\n[PASS] GET /api/track/{invalid_id} returned 404 expected error.")


if __name__ == "__main__":
    unittest.main()
