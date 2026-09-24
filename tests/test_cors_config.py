import os
import sys
import unittest
from unittest.mock import patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, backend_dir)

import server  # noqa: E402


class TestCorsOrigins(unittest.TestCase):
    def test_get_cors_origins_merges_env_and_defaults_without_duplicates(self):
        with patch.dict(os.environ, {"CORS_ORIGINS": "https://app.example.com/, https://www.app.example.com"}, clear=False), \
             patch.object(server, "FRONTEND_URL", "https://app.example.com/fr"):
            origins = server.get_cors_origins()

        self.assertIn("https://app.example.com", origins)
        self.assertIn("https://www.app.example.com", origins)
        self.assertIn("https://econnect-emergent-site.hostingersite.com", origins)
        self.assertEqual(origins.count("https://app.example.com"), 1)


if __name__ == "__main__":
    unittest.main()
