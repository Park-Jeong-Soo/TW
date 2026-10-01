from pathlib import Path
import unittest

from app.integrations.vale_client import vale_status


class ValeIntegrationTests(unittest.TestCase):
    def test_vale_status_is_safe_without_binary(self):
        status = vale_status(Path.cwd())
        self.assertIn("available", status)
        self.assertIn("config_exists", status)


if __name__ == "__main__":
    unittest.main()
