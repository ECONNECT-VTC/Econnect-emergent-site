"""
Tests for email verification flow and password strength validation.
"""
import hashlib
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, backend_dir)

import server  # noqa: E402

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

VALID_PASSWORD = "ValidPass!1"
WEAK_PASSWORD = "short"


def _sha256(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _make_user(email: str, role: str = "client", email_verified: bool = False) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": "Test User",
        "phone": None,
        "password_hash": server.hash_password(VALID_PASSWORD),
        "role": role,
        "email_verified": email_verified,
        "created_at": datetime.now(timezone.utc),
    }


# ---------------------------------------------------------------------------
# Password strength tests
# ---------------------------------------------------------------------------

class TestValidatePasswordStrength(unittest.TestCase):
    def test_too_short(self):
        self.assertIsNotNone(server.validate_password_strength("Short!1"))

    def test_exactly_9_chars_fails(self):
        self.assertIsNotNone(server.validate_password_strength("Abcdefg!1"))

    def test_missing_uppercase(self):
        self.assertIsNotNone(server.validate_password_strength("alllower!1a"))

    def test_missing_lowercase(self):
        self.assertIsNotNone(server.validate_password_strength("ALLUPPER!1A"))

    def test_missing_special(self):
        self.assertIsNotNone(server.validate_password_strength("NoSpecial10A"))

    def test_valid_password(self):
        self.assertIsNone(server.validate_password_strength(VALID_PASSWORD))

    def test_valid_password_exactly_10_chars(self):
        self.assertIsNone(server.validate_password_strength("Abcdefgh!1"))

    def test_returns_french_message_on_failure(self):
        msg = server.validate_password_strength("short")
        self.assertIsInstance(msg, str)
        self.assertGreater(len(msg), 0)


# ---------------------------------------------------------------------------
# Registration tests
# ---------------------------------------------------------------------------

class TestRegisterEndpoint(unittest.IsolatedAsyncioTestCase):
    async def test_register_weak_password_rejected(self):
        user_data = server.UserCreate(
            email="test@example.com",
            password="short",
            name="Test",
        )
        from fastapi import HTTPException
        with self.assertRaises(HTTPException) as cm:
            await server.register(user_data)
        self.assertEqual(cm.exception.status_code, 400)

    async def test_register_creates_user_not_verified(self):
        user_data = server.UserCreate(
            email="newuser@example.com",
            password="ValidPass!1",
            name="New User",
        )
        mock_users_coll = MagicMock()
        mock_users_coll.find_one = AsyncMock(return_value=None)
        mock_users_coll.insert_one = AsyncMock()

        mock_tokens_coll = MagicMock()
        mock_tokens_coll.insert_one = AsyncMock()

        with patch.object(server.db, "users", mock_users_coll), \
             patch.object(server.db, "email_verification_tokens", mock_tokens_coll), \
             patch.object(server, "send_notification_email", new=AsyncMock(return_value=True)):
            result = await server.register(user_data)

        self.assertIn("message", result)
        self.assertIn("email", result)
        # Ensure email_verified defaults to False
        inserted_doc = mock_users_coll.insert_one.call_args[0][0]
        self.assertFalse(inserted_doc["email_verified"])
        # Activation token must be stored
        mock_tokens_coll.insert_one.assert_called_once()

    async def test_register_sends_activation_email(self):
        user_data = server.UserCreate(
            email="newuser2@example.com",
            password="ValidPass!1",
            name="New User 2",
        )
        mock_users_coll = MagicMock()
        mock_users_coll.find_one = AsyncMock(return_value=None)
        mock_users_coll.insert_one = AsyncMock()

        mock_tokens_coll = MagicMock()
        mock_tokens_coll.insert_one = AsyncMock()

        mock_send = AsyncMock(return_value=True)
        with patch.object(server.db, "users", mock_users_coll), \
             patch.object(server.db, "email_verification_tokens", mock_tokens_coll), \
             patch.object(server, "send_notification_email", new=mock_send):
            await server.register(user_data)

        mock_send.assert_called_once()
        call_args = mock_send.call_args[0]
        self.assertEqual(call_args[0], "newuser2@example.com")

    async def test_register_duplicate_email_rejected(self):
        user_data = server.UserCreate(
            email="existing@example.com",
            password="ValidPass!1",
            name="Existing",
        )
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value={"id": "abc", "email": "existing@example.com"})

        from fastapi import HTTPException
        with patch.object(server.db, "users", mock_coll), \
             self.assertRaises(HTTPException) as cm:
            await server.register(user_data)
        self.assertEqual(cm.exception.status_code, 400)


# ---------------------------------------------------------------------------
# Login tests
# ---------------------------------------------------------------------------

class TestLoginEndpoint(unittest.IsolatedAsyncioTestCase):
    async def test_login_unverified_client_blocked(self):
        user = _make_user("test@example.com", "client", email_verified=False)
        credentials = server.UserLogin(email="test@example.com", password="ValidPass!1")
        mock_response = MagicMock()
        mock_response.set_cookie = MagicMock()

        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=user)

        from fastapi import HTTPException
        with patch.object(server.db, "users", mock_coll), \
             self.assertRaises(HTTPException) as cm:
            await server.login(credentials, mock_response)
        self.assertEqual(cm.exception.status_code, 403)
        self.assertIn("email", cm.exception.detail.lower())

    async def test_login_verified_client_allowed(self):
        user = _make_user("test@example.com", "client", email_verified=True)
        credentials = server.UserLogin(email="test@example.com", password="ValidPass!1")
        mock_response = MagicMock()
        mock_response.set_cookie = MagicMock()

        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=user)

        with patch.object(server.db, "users", mock_coll):
            result = await server.login(credentials, mock_response)
        self.assertEqual(result["email"], "test@example.com")

    async def test_login_admin_not_blocked_by_email_check(self):
        """Admin accounts with email_verified=True can log in normally."""
        user = _make_user("admin@example.com", "admin", email_verified=True)
        credentials = server.UserLogin(email="admin@example.com", password="ValidPass!1")
        mock_response = MagicMock()
        mock_response.set_cookie = MagicMock()

        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=user)

        with patch.object(server.db, "users", mock_coll):
            result = await server.login(credentials, mock_response)
        self.assertEqual(result["email"], "admin@example.com")

    async def test_login_wrong_password_rejected(self):
        user = _make_user("test@example.com", "client", email_verified=True)
        credentials = server.UserLogin(email="test@example.com", password="WrongPass!9")
        mock_response = MagicMock()

        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=user)

        from fastapi import HTTPException
        with patch.object(server.db, "users", mock_coll), \
             self.assertRaises(HTTPException) as cm:
            await server.login(credentials, mock_response)
        self.assertEqual(cm.exception.status_code, 401)

    async def test_login_unknown_email_rejected(self):
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=None)
        credentials = server.UserLogin(email="nobody@example.com", password="ValidPass!1")
        mock_response = MagicMock()

        from fastapi import HTTPException
        with patch.object(server.db, "users", mock_coll), \
             self.assertRaises(HTTPException) as cm:
            await server.login(credentials, mock_response)
        self.assertEqual(cm.exception.status_code, 401)


# ---------------------------------------------------------------------------
# Activation token helpers
# ---------------------------------------------------------------------------

class TestVerificationTokenHelpers(unittest.IsolatedAsyncioTestCase):
    def test_hash_verification_token_is_sha256(self):
        raw = "test-token-value"
        expected = hashlib.sha256(raw.encode()).hexdigest()
        self.assertEqual(server._hash_verification_token(raw), expected)

    async def test_find_valid_token_returns_record(self):
        raw = "valid-raw-token"
        record = {
            "id": "rec1",
            "user_id": "user1",
            "token_hash": _sha256(raw),
            "used": False,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=24),
        }
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=record)

        with patch.object(server.db, "email_verification_tokens", mock_coll):
            result = await server._find_verification_token_record(raw)
        self.assertIsNotNone(result)
        self.assertEqual(result["id"], "rec1")

    async def test_find_expired_token_returns_none(self):
        raw = "expired-token"
        record = {
            "id": "rec2",
            "user_id": "user1",
            "token_hash": _sha256(raw),
            "used": False,
            "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1),
        }
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=record)

        with patch.object(server.db, "email_verification_tokens", mock_coll):
            result = await server._find_verification_token_record(raw)
        self.assertIsNone(result)

    async def test_find_missing_token_returns_none(self):
        mock_coll = MagicMock()
        mock_coll.find_one = AsyncMock(return_value=None)

        with patch.object(server.db, "email_verification_tokens", mock_coll):
            result = await server._find_verification_token_record("nonexistent")
        self.assertIsNone(result)


# ---------------------------------------------------------------------------
# Activate email endpoint
# ---------------------------------------------------------------------------

class TestActivateEmailEndpoint(unittest.IsolatedAsyncioTestCase):
    async def test_activate_valid_token_marks_verified(self):
        raw = "valid-activation-token"
        record = {
            "id": "rec1",
            "user_id": "user1",
            "token_hash": _sha256(raw),
            "used": False,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=24),
        }
        user = _make_user("test@example.com", "client", email_verified=False)
        user["id"] = "user1"

        mock_tokens = MagicMock()
        mock_tokens.find_one = AsyncMock(return_value=record)
        mock_tokens.update_one = AsyncMock()

        mock_users = MagicMock()
        mock_users.find_one = AsyncMock(return_value=user)
        mock_users.update_one = AsyncMock()

        mock_response = MagicMock()
        mock_response.set_cookie = MagicMock()

        with patch.object(server.db, "email_verification_tokens", mock_tokens), \
             patch.object(server.db, "users", mock_users):
            result = await server.activate_email(token=raw, response=mock_response)

        self.assertEqual(result["email"], "test@example.com")
        # email_verified should have been set to True
        mock_users.update_one.assert_called_once()
        update_args = mock_users.update_one.call_args[0]
        self.assertTrue(update_args[1]["$set"]["email_verified"])
        # token should be marked as used
        mock_tokens.update_one.assert_called_once()
        token_update = mock_tokens.update_one.call_args[0]
        self.assertTrue(token_update[1]["$set"]["used"])

    async def test_activate_token_sets_auth_cookies(self):
        raw = "cookie-test-token"
        record = {
            "id": "rec2",
            "user_id": "user2",
            "token_hash": _sha256(raw),
            "used": False,
            "expires_at": datetime.now(timezone.utc) + timedelta(hours=24),
        }
        user = _make_user("cookie@example.com", "client", email_verified=False)
        user["id"] = "user2"

        mock_tokens = MagicMock()
        mock_tokens.find_one = AsyncMock(return_value=record)
        mock_tokens.update_one = AsyncMock()

        mock_users = MagicMock()
        mock_users.find_one = AsyncMock(return_value=user)
        mock_users.update_one = AsyncMock()

        mock_response = MagicMock()
        mock_response.set_cookie = MagicMock()

        with patch.object(server.db, "email_verification_tokens", mock_tokens), \
             patch.object(server.db, "users", mock_users):
            await server.activate_email(token=raw, response=mock_response)

        # Two cookies should be set: access_token and refresh_token
        self.assertEqual(mock_response.set_cookie.call_count, 2)

    async def test_activate_invalid_token_raises_400(self):
        mock_tokens = MagicMock()
        mock_tokens.find_one = AsyncMock(return_value=None)
        mock_response = MagicMock()

        from fastapi import HTTPException
        with patch.object(server.db, "email_verification_tokens", mock_tokens), \
             self.assertRaises(HTTPException) as cm:
            await server.activate_email(token="bad-token", response=mock_response)
        self.assertEqual(cm.exception.status_code, 400)

    async def test_activate_expired_token_raises_400(self):
        raw = "expired-act-token"
        record = {
            "id": "rec3",
            "user_id": "user1",
            "token_hash": _sha256(raw),
            "used": False,
            "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1),
        }
        mock_tokens = MagicMock()
        mock_tokens.find_one = AsyncMock(return_value=record)
        mock_response = MagicMock()

        from fastapi import HTTPException
        with patch.object(server.db, "email_verification_tokens", mock_tokens), \
             self.assertRaises(HTTPException) as cm:
            await server.activate_email(token=raw, response=mock_response)
        self.assertEqual(cm.exception.status_code, 400)


# ---------------------------------------------------------------------------
# Resend activation
# ---------------------------------------------------------------------------

class TestResendActivationEndpoint(unittest.IsolatedAsyncioTestCase):
    async def test_resend_nonexistent_email_returns_generic(self):
        mock_users = MagicMock()
        mock_users.find_one = AsyncMock(return_value=None)

        with patch.object(server.db, "users", mock_users):
            result = await server.resend_activation(
                server.ResendActivationRequest(email="nobody@example.com")
            )
        self.assertIn("message", result)

    async def test_resend_already_verified_returns_generic(self):
        user = _make_user("verified@example.com", "client", email_verified=True)
        mock_users = MagicMock()
        mock_users.find_one = AsyncMock(return_value=user)

        with patch.object(server.db, "users", mock_users):
            result = await server.resend_activation(
                server.ResendActivationRequest(email="verified@example.com")
            )
        self.assertIn("message", result)

    async def test_resend_within_cooldown_skips_sending(self):
        user = _make_user("cool@example.com", "client", email_verified=False)
        recent_token = {
            "id": "tok1",
            "user_id": user["id"],
            "token_hash": "abc",
            "used": False,
            "created_at": datetime.now(timezone.utc) - timedelta(minutes=1),
        }
        mock_users = MagicMock()
        mock_users.find_one = AsyncMock(return_value=user)

        mock_tokens = MagicMock()
        mock_tokens.find_one = AsyncMock(return_value=recent_token)

        mock_send = AsyncMock()
        with patch.object(server.db, "users", mock_users), \
             patch.object(server.db, "email_verification_tokens", mock_tokens), \
             patch.object(server, "_create_and_send_activation_token", new=mock_send):
            result = await server.resend_activation(
                server.ResendActivationRequest(email="cool@example.com")
            )
        mock_send.assert_not_called()
        self.assertIn("message", result)

    async def test_resend_outside_cooldown_sends_new_email(self):
        user = _make_user("resend@example.com", "client", email_verified=False)

        mock_users = MagicMock()
        mock_users.find_one = AsyncMock(return_value=user)

        mock_tokens = MagicMock()
        mock_tokens.find_one = AsyncMock(return_value=None)
        mock_tokens.update_many = AsyncMock()

        mock_send = AsyncMock()
        with patch.object(server.db, "users", mock_users), \
             patch.object(server.db, "email_verification_tokens", mock_tokens), \
             patch.object(server, "_create_and_send_activation_token", new=mock_send):
            await server.resend_activation(
                server.ResendActivationRequest(email="resend@example.com")
            )
        mock_send.assert_called_once_with(user["id"], user["email"], user.get("name", ""))

    async def test_resend_invalidates_existing_tokens_before_sending(self):
        user = _make_user("newlink@example.com", "client", email_verified=False)

        mock_users = MagicMock()
        mock_users.find_one = AsyncMock(return_value=user)

        mock_tokens = MagicMock()
        mock_tokens.find_one = AsyncMock(return_value=None)
        mock_tokens.update_many = AsyncMock()

        with patch.object(server.db, "users", mock_users), \
             patch.object(server.db, "email_verification_tokens", mock_tokens), \
             patch.object(server, "_create_and_send_activation_token", new=AsyncMock()):
            await server.resend_activation(
                server.ResendActivationRequest(email="newlink@example.com")
            )
        mock_tokens.update_many.assert_called_once()
        update_args = mock_tokens.update_many.call_args[0]
        self.assertEqual(update_args[1]["$set"]["used"], True)


if __name__ == "__main__":
    unittest.main()
