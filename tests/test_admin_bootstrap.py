"""
Tests for admin bootstrap security hardening.

These tests inspect the server.py source code using AST / text analysis to
verify that:
- No default/weak admin credentials (e.g. "admin123") are hard-coded.
- ADMIN_EMAIL and ADMIN_PASSWORD env var lookups have no dangerous fallback.
- The auto-reset-on-mismatch pattern has been removed.
- The test_credentials.md write has been removed.
"""
import ast
import os
import re
import unittest

SERVER_PY = os.path.join(os.path.dirname(__file__), "..", "backend", "server.py")


def _source():
    with open(SERVER_PY, "r", encoding="utf-8") as f:
        return f.read()


class TestAdminBootstrapSourceCode(unittest.TestCase):
    """Static analysis of the admin bootstrap section in server.py."""

    def setUp(self):
        self.source = _source()

    # ------------------------------------------------------------------
    # No weak default password
    # ------------------------------------------------------------------

    def test_no_hardcoded_admin123_default(self):
        """'admin123' must not appear as a fallback default for ADMIN_PASSWORD."""
        # Match os.environ.get("ADMIN_PASSWORD", "admin123") or similar
        pattern = r'get\s*\(\s*["\']ADMIN_PASSWORD["\'].*admin123'
        self.assertIsNone(
            re.search(pattern, self.source),
            "Hard-coded weak default 'admin123' found as ADMIN_PASSWORD fallback",
        )

    def test_no_hardcoded_admin123_anywhere(self):
        """The literal string 'admin123' must not appear anywhere in the file."""
        self.assertNotIn(
            "admin123",
            self.source,
            "Weak default password 'admin123' still present in server.py",
        )

    def test_no_default_admin_email_fallback(self):
        """os.environ.get('ADMIN_EMAIL', ...) must not have a non-empty default."""
        # Accept only get("ADMIN_EMAIL", "") or get("ADMIN_EMAIL") but not
        # get("ADMIN_EMAIL", "admin@...") with a real email as fallback.
        pattern = r'get\s*\(\s*["\']ADMIN_EMAIL["\'\s]*,\s*["\'][^"\']+["\']'
        matches = re.findall(pattern, self.source)
        for m in matches:
            # Allow empty string default: get("ADMIN_EMAIL", "")
            self.assertIn('""', m.replace("'", '"'),
                          f"Non-empty default found for ADMIN_EMAIL: {m}")

    def test_no_default_admin_password_fallback(self):
        """os.environ.get('ADMIN_PASSWORD', ...) must not have a non-empty default."""
        pattern = r'get\s*\(\s*["\']ADMIN_PASSWORD["\'\s]*,\s*["\'][^"\']+["\']'
        matches = re.findall(pattern, self.source)
        for m in matches:
            self.assertIn('""', m.replace("'", '"'),
                          f"Non-empty default found for ADMIN_PASSWORD: {m}")

    # ------------------------------------------------------------------
    # No silent password reset on startup
    # ------------------------------------------------------------------

    def test_no_auto_password_reset_on_startup(self):
        """The bootstrap must not silently overwrite an existing admin password."""
        # The harmful old pattern was:
        #   await db.users.update_one({"email": admin_email},
        #       {"$set": {"password_hash": hash_password(admin_password)}})
        # We check that db.users.update_one is NOT called inside startup_event.
        tree = ast.parse(self.source)
        for node in ast.walk(tree):
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "startup_event":
                func_src = ast.unparse(node)
                self.assertNotIn(
                    "users.update_one",
                    func_src,
                    "startup_event calls db.users.update_one "
                    "(may be silently resetting the admin password)",
                )

    # ------------------------------------------------------------------
    # No test_credentials.md write
    # ------------------------------------------------------------------

    def test_no_test_credentials_write(self):
        """server.py must not write test_credentials.md at startup."""
        self.assertNotIn(
            "test_credentials.md",
            self.source,
            "test_credentials.md is still written at startup",
        )

    # ------------------------------------------------------------------
    # Admin bootstrap skipped when env vars absent
    # ------------------------------------------------------------------

    def test_env_var_guard_present(self):
        """Bootstrap must be gated on both ADMIN_EMAIL and ADMIN_PASSWORD being set."""
        tree = ast.parse(self.source)
        found_guard = False
        for func_node in ast.walk(tree):
            if not (isinstance(func_node, ast.AsyncFunctionDef) and
                    func_node.name == "startup_event"):
                continue
            # Walk the function body looking for:
            #   if admin_email and admin_password:  (or reverse order)
            for node in ast.walk(func_node):
                if not isinstance(node, ast.If):
                    continue
                test = node.test
                if not (isinstance(test, ast.BoolOp) and isinstance(test.op, ast.And)):
                    continue
                names = {
                    n.id
                    for n in ast.walk(test)
                    if isinstance(n, ast.Name)
                }
                if {"admin_email", "admin_password"}.issubset(names):
                    found_guard = True
                    break
            break
        self.assertTrue(
            found_guard,
            "No 'if admin_email and admin_password' guard found in startup_event",
        )


if __name__ == "__main__":
    unittest.main()

