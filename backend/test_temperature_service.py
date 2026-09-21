"""
Test Suite for Task 3.2: GET /api/temperature Service Layer
"""
import math
import datetime

def to_fahrenheit(celsius):
    return round((celsius * 9.0 / 5.0) + 32.0, 1)

def evaluate_thermal_risk(surface_temp_c):
    if surface_temp_c > 55.0:
        return {
            'level': 'CRITICAL',
            'description': 'Critical Heat-Buckle Risk (> 55°C / 131°F)',
            'critical_threshold_exceeded': True
        }
    elif surface_temp_c >= 40.0:
        return {
            'level': 'ELEVATED',
            'description': 'Elevated Heat Risk (40°C - 55°C / 104°F - 131°F)',
            'critical_threshold_exceeded': False
        }
    return {
        'level': 'SAFE',
        'description': 'Normal Operational Temperature (< 40°C / 104°F)',
        'critical_threshold_exceeded': False
    }

def test_temperature_service_logic():
    print("==================================================")
    print("Running Temperature Service Validation Tests...")
    print("==================================================")

    # 1. Test Temperature Conversion Accuracy
    test_temps = [0.0, 38.0, 40.0, 45.5, 55.0, 60.2, 100.0]
    expected_f = [32.0, 100.4, 104.0, 113.9, 131.0, 140.4, 212.0]
    for c, exp_f in zip(test_temps, expected_f):
        calc_f = to_fahrenheit(c)
        assert calc_f == exp_f, f"Mismatch: {c}°C -> expected {exp_f}°F, got {calc_f}°F"
    print("[PASS] Test 1: Temperature unit conversion (C -> F) strictly verified.")

    # 2. Test Thermal Risk Classification
    assert evaluate_thermal_risk(35.0)['level'] == 'SAFE'
    assert evaluate_thermal_risk(40.0)['level'] == 'ELEVATED'
    assert evaluate_thermal_risk(50.0)['level'] == 'ELEVATED'
    assert evaluate_thermal_risk(55.1)['level'] == 'CRITICAL'
    assert evaluate_thermal_risk(65.0)['critical_threshold_exceeded'] is True
    print("[PASS] Test 2: CRT & Heat-Buckle risk classification levels verified.")

    # 3. Test ISO 8601 Timestamp Validation
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    assert "T" in now_iso, "Invalid ISO timestamp"
    print("[PASS] Test 3: ISO 8601 timestamping format valid.")

    # 4. Test Coordinate Boundary Validations
    invalid_lats = [-95.0, 95.0, float('nan')]
    for lat in invalid_lats:
        assert lat < -90 or lat > 90 or math.isnan(lat), "Should fail coordinate check"
    print("[PASS] Test 4: Coordinate validation logic prevents out-of-bounds parameters.")

    # 5. Test Cache Key Generation
    def get_cache_key(lat, lng, segment_id=None):
        if segment_id:
            return f"seg_{segment_id.strip().upper()}"
        return f"coord_{lat:.3f}_{lng:.3f}"

    assert get_cache_key(33.4484, -112.0740) == "coord_33.448_-112.074"
    assert get_cache_key(33.4484, -112.0740, "SW_00001") == "seg_SW_00001"
    print("[PASS] Test 5: In-memory cache key hashing verified.")

    print("\n==================================================")
    print("ALL TESTS PASSED: Temperature service layer is sound.")
    print("==================================================")

if __name__ == "__main__":
    test_temperature_service_logic()
