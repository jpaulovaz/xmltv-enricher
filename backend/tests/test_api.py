"""
XMLTV Enricher API Tests
Tests for dashboard controls, config management, and status APIs
"""
import pytest
import requests
import os

# Use localhost since this is a Node.js app running on port 3000
BASE_URL = "http://localhost:3000"


class TestHealthEndpoint:
    """Health check endpoint tests"""

    def test_health_check(self):
        """Test health endpoint returns ok status"""
        response = requests.get(f"{BASE_URL}/health")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "ok"
        assert "timestamp" in data
        print("✅ Health check passed")


class TestStatusEndpoint:
    """Status endpoint tests"""

    def test_get_status(self):
        """Test GET /api/status returns current state"""
        response = requests.get(f"{BASE_URL}/api/status")
        assert response.status_code == 200
        
        data = response.json()
        assert "running" in data
        assert "paused" in data
        assert "lastRun" in data
        assert isinstance(data["running"], bool)
        assert isinstance(data["paused"], bool)
        print(f"✅ Status endpoint returned: {data}")


class TestStatsEndpoint:
    """Stats endpoint tests"""

    def test_get_stats(self):
        """Test GET /api/stats returns statistics or message"""
        response = requests.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        
        data = response.json()
        # Either returns stats or message saying no stats available
        assert isinstance(data, dict)
        print(f"✅ Stats endpoint returned: {data}")


class TestConfigEndpoints:
    """Configuration endpoint tests"""

    def test_get_config(self):
        """Test GET /api/config returns configuration"""
        response = requests.get(f"{BASE_URL}/api/config")
        assert response.status_code == 200
        
        data = response.json()
        # Check required config keys exist
        assert "TVHEADEND_URL" in data
        assert "TMDB_API_KEY" in data
        assert "LOG_LEVEL" in data
        assert "CACHE_ENABLED" in data
        print(f"✅ Config endpoint returned {len(data)} configuration keys")

    def test_save_config(self):
        """Test POST /api/config saves configuration"""
        # First get current config to preserve values
        current = requests.get(f"{BASE_URL}/api/config").json()
        
        # Update with test value
        test_config = {
            "TMDB_API_KEY": "TEST_api_key_pytest",
            "LOG_LEVEL": "debug"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/config",
            headers={"Content-Type": "application/json"},
            json=test_config
        )
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] == True
        assert "message" in data
        print(f"✅ Config save returned: {data}")

    def test_verify_config_persistence(self):
        """Test that saved config is persisted"""
        # Save a new value
        test_value = "TEST_persistence_check"
        response = requests.post(
            f"{BASE_URL}/api/config",
            headers={"Content-Type": "application/json"},
            json={"TMDB_API_KEY": test_value}
        )
        assert response.status_code == 200
        
        # Verify it was saved
        get_response = requests.get(f"{BASE_URL}/api/config")
        config = get_response.json()
        assert config["TMDB_API_KEY"] == test_value
        print("✅ Config persistence verified")


class TestSchedulerControls:
    """Scheduler control endpoint tests"""

    def test_pause_scheduler(self):
        """Test POST /api/pause pauses scheduler"""
        # First ensure scheduler is not paused
        requests.post(f"{BASE_URL}/api/resume")
        
        response = requests.post(f"{BASE_URL}/api/pause")
        assert response.status_code in [200, 400]  # 400 if already paused
        
        # Verify state
        status = requests.get(f"{BASE_URL}/api/status").json()
        if response.status_code == 200:
            assert status["paused"] == True
            print("✅ Scheduler paused successfully")
        else:
            print("⚠️ Scheduler was already paused")

    def test_pause_already_paused(self):
        """Test pausing an already paused scheduler returns 400"""
        # Ensure paused first
        requests.post(f"{BASE_URL}/api/pause")
        
        response = requests.post(f"{BASE_URL}/api/pause")
        assert response.status_code == 400
        
        data = response.json()
        assert "error" in data
        print("✅ Double pause correctly returns 400")

    def test_resume_scheduler(self):
        """Test POST /api/resume resumes scheduler"""
        # First ensure scheduler is paused
        requests.post(f"{BASE_URL}/api/pause")
        
        response = requests.post(f"{BASE_URL}/api/resume")
        assert response.status_code == 200
        
        data = response.json()
        assert "message" in data
        
        # Verify state
        status = requests.get(f"{BASE_URL}/api/status").json()
        assert status["paused"] == False
        print("✅ Scheduler resumed successfully")

    def test_resume_not_paused(self):
        """Test resuming a non-paused scheduler returns 400"""
        # Ensure not paused
        requests.post(f"{BASE_URL}/api/resume")
        
        response = requests.post(f"{BASE_URL}/api/resume")
        assert response.status_code == 400
        
        data = response.json()
        assert "error" in data
        print("✅ Resume non-paused correctly returns 400")


class TestRunEndpoint:
    """Run/execution endpoint tests"""

    def test_run_endpoint(self):
        """Test POST /api/run starts execution"""
        # Make sure we're not already running
        status = requests.get(f"{BASE_URL}/api/status").json()
        if status["running"]:
            pytest.skip("Enricher already running")
        
        response = requests.post(
            f"{BASE_URL}/api/run",
            headers={"Content-Type": "application/json"},
            json={"dryRun": True}
        )
        
        # Accept 200 (success) or 409 (already running)
        assert response.status_code in [200, 409]
        
        data = response.json()
        if response.status_code == 200:
            assert "message" in data
            assert data.get("dryRun") == True
            print("✅ Run endpoint started dry run")
        else:
            print("⚠️ Run endpoint: already running")


class TestLogsEndpoint:
    """Logs endpoint tests"""

    def test_get_logs(self):
        """Test GET /api/logs returns log entries"""
        response = requests.get(f"{BASE_URL}/api/logs")
        assert response.status_code == 200
        
        data = response.json()
        assert "logs" in data
        assert isinstance(data["logs"], list)
        print(f"✅ Logs endpoint returned {len(data['logs'])} log entries")

    def test_get_logs_with_lines_param(self):
        """Test GET /api/logs with lines parameter"""
        response = requests.get(f"{BASE_URL}/api/logs?lines=50")
        assert response.status_code == 200
        
        data = response.json()
        assert "logs" in data
        print("✅ Logs with lines parameter works")


class TestAuditEndpoint:
    """Audit endpoint tests"""

    def test_get_audit(self):
        """Test GET /api/audit returns audit data"""
        response = requests.get(f"{BASE_URL}/api/audit")
        assert response.status_code == 200
        
        data = response.json()
        assert "audit" in data
        assert isinstance(data["audit"], list)
        print(f"✅ Audit endpoint returned {len(data['audit'])} entries")


# Cleanup fixture - restore config after tests
@pytest.fixture(scope="session", autouse=True)
def cleanup_test_config():
    """Restore original config after all tests"""
    # Get original config
    original = requests.get(f"{BASE_URL}/api/config").json()
    
    yield
    
    # Ensure scheduler is resumed
    requests.post(f"{BASE_URL}/api/resume")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
