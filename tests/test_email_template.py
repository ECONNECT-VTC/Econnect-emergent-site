"""Unit tests for the build_email_html email template helper."""
import os
import sys
import unittest
import unittest.mock
# ---------------------------------------------------------------------------
# Set required environment variables BEFORE importing server.py so that the
# module-level os.environ lookups do not raise KeyError.
# ---------------------------------------------------------------------------
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")

# ---------------------------------------------------------------------------
# Make the backend package importable without the heavy third-party deps that
# are not available in CI.  We stub out the modules that server.py imports at
# module-level so that we can import only the helpers we want to test.
# ---------------------------------------------------------------------------
for mod_name in [
    "bcrypt",
    "jwt",
    "dotenv",
    "fastapi",
    "motor",
    "motor.motor_asyncio",
    "pydantic",
    "reportlab",
    "reportlab.lib",
    "reportlab.lib.pagesizes",
    "reportlab.pdfgen",
    "reportlab.pdfgen.canvas",
    "sendgrid",
    "sendgrid.helpers",
    "sendgrid.helpers.mail",
    "starlette",
    "starlette.middleware",
    "starlette.middleware.cors",
]:
    if mod_name not in sys.modules:
        import types
        sys.modules[mod_name] = types.ModuleType(mod_name)

# Provide minimal shims so server.py can be imported
import types

# pydantic
pydantic_mod = sys.modules["pydantic"]
pydantic_mod.BaseModel = object  # type: ignore
pydantic_mod.ConfigDict = lambda **kw: None  # type: ignore
pydantic_mod.EmailStr = str  # type: ignore

# fastapi
fastapi_mod = sys.modules["fastapi"]

class _DummyHTTPException(Exception):
    def __init__(self, status_code=400, detail=""):
        self.status_code = status_code
        self.detail = detail

class _CallableStub:
    """A stub that accepts any call/attribute access and returns itself."""
    def __init__(self, *a, **kw): pass
    def __call__(self, *a, **kw): return self
    def __getattr__(self, name): return self
    def include_router(self, *a, **kw): pass
    # Decorator support: @router.get("/path")
    def get(self, *a, **kw): return lambda f: f
    def post(self, *a, **kw): return lambda f: f
    def put(self, *a, **kw): return lambda f: f
    def delete(self, *a, **kw): return lambda f: f
    def patch(self, *a, **kw): return lambda f: f
    def on_event(self, *a, **kw): return lambda f: f
    def add_middleware(self, *a, **kw): pass

fastapi_mod.HTTPException = _DummyHTTPException  # type: ignore
for attr in ("APIRouter", "FastAPI", "Request", "Response"):
    setattr(fastapi_mod, attr, _CallableStub)

# dotenv
dotenv_mod = sys.modules["dotenv"]
dotenv_mod.load_dotenv = lambda *a, **kw: None  # type: ignore

# motor
class _MockMotorClient:
    def __init__(self, *a, **kw):
        pass
    def __getitem__(self, name):
        return object()

motor_async = sys.modules.setdefault("motor.motor_asyncio", types.ModuleType("motor.motor_asyncio"))
motor_async.AsyncIOMotorClient = _MockMotorClient  # type: ignore

# reportlab shims
rl_pagesizes = sys.modules.setdefault("reportlab.lib.pagesizes", types.ModuleType("reportlab.lib.pagesizes"))
rl_pagesizes.A4 = (595.27, 841.89)  # type: ignore
rl_canvas = sys.modules.setdefault("reportlab.pdfgen.canvas", types.ModuleType("reportlab.pdfgen.canvas"))
rl_canvas.Canvas = object  # type: ignore

# sendgrid
sg_mod = sys.modules["sendgrid"]
sg_mod.SendGridAPIClient = object  # type: ignore
sg_mail = sys.modules.setdefault("sendgrid.helpers.mail", types.ModuleType("sendgrid.helpers.mail"))
sg_mail.Mail = object  # type: ignore

# starlette cors
st_cors = sys.modules.setdefault("starlette.middleware.cors", types.ModuleType("starlette.middleware.cors"))
st_cors.CORSMiddleware = object  # type: ignore

# bcrypt
bcrypt_mod = sys.modules["bcrypt"]
bcrypt_mod.hashpw = lambda pw, salt: pw  # type: ignore
bcrypt_mod.gensalt = lambda: b"salt"  # type: ignore
bcrypt_mod.checkpw = lambda pw, hashed: pw == hashed  # type: ignore

# jwt
jwt_mod = sys.modules["jwt"]
jwt_mod.encode = lambda *a, **kw: "token"  # type: ignore
jwt_mod.decode = lambda *a, **kw: {}  # type: ignore
jwt_mod.ExpiredSignatureError = Exception  # type: ignore
jwt_mod.InvalidTokenError = Exception  # type: ignore

# ---------------------------------------------------------------------------
# Now import the two helpers we want to test directly from server.py
# ---------------------------------------------------------------------------
backend_dir = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, backend_dir)

from server import build_email_html, get_logo_url  # noqa: E402


class TestGetLogoUrl(unittest.TestCase):
    def test_default_fallback(self):
        with unittest.mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("FRONTEND_URL", None)
            url = get_logo_url()
        self.assertIn("/photo/logo.png", url)
        self.assertTrue(url.startswith("http"))

    def test_uses_frontend_url_env(self):
        with unittest.mock.patch.dict(os.environ, {"FRONTEND_URL": "https://example.com"}):
            url = get_logo_url()
        self.assertEqual(url, "https://example.com/photo/logo.png")

    def test_strips_trailing_slash(self):
        with unittest.mock.patch.dict(os.environ, {"FRONTEND_URL": "https://example.com/"}):
            url = get_logo_url()
        self.assertEqual(url, "https://example.com/photo/logo.png")


class TestBuildEmailHtml(unittest.TestCase):
    def test_contains_img_tag(self):
        html = build_email_html("Test title", "<p>Body</p>")
        self.assertIn("<img", html)

    def test_contains_logo_url(self):
        with unittest.mock.patch.dict(os.environ, {"FRONTEND_URL": "https://mysite.com"}):
            html = build_email_html("Test", "<p>Body</p>")
        self.assertIn("https://mysite.com/photo/logo.png", html)

    def test_img_has_alt(self):
        html = build_email_html("Test", "<p>Body</p>")
        self.assertIn('alt="Econnect VTC"', html)

    def test_title_present_in_html(self):
        html = build_email_html("Titre de test unique", "<p>Corps</p>")
        self.assertIn("Titre de test unique", html)

    def test_body_html_present(self):
        html = build_email_html("T", "<p>Contenu unique du corps</p>")
        self.assertIn("Contenu unique du corps", html)

    def test_cta_button_when_provided(self):
        html = build_email_html(
            "T",
            "<p>Body</p>",
            cta_label="Cliquez ici",
            cta_url="https://example.com/action",
        )
        self.assertIn("Cliquez ici", html)
        self.assertIn("https://example.com/action", html)

    def test_no_cta_button_when_omitted(self):
        html = build_email_html("T", "<p>Body</p>")
        # Without a CTA the output should not contain any href pointing to an action
        self.assertNotIn("cta_url", html)

    def test_no_cta_button_when_only_label_provided(self):
        html = build_email_html("T", "<p>Body</p>", cta_label="Label only")
        # cta_url is None → no button should be rendered
        self.assertNotIn("Label only", html)

    def test_no_cta_button_when_only_url_provided(self):
        cta_url = "https://unique-cta-test-url.example.com/action"
        html = build_email_html("T", "<p>Body</p>", cta_url=cta_url)
        # cta_label is None → no anchor tag linking to the CTA URL should appear
        self.assertNotIn(f'href="{cta_url}"', html)

    def test_footer_contains_brand_name(self):
        html = build_email_html("T", "<p>Body</p>")
        self.assertIn("ECONNECT VTC", html)

    def test_footer_contains_year(self):
        from datetime import datetime, timezone
        year = str(datetime.now(timezone.utc).year)
        html = build_email_html("T", "<p>Body</p>")
        self.assertIn(year, html)

    def test_returns_string(self):
        result = build_email_html("T", "<p>B</p>")
        self.assertIsInstance(result, str)

    def test_dark_background_color(self):
        html = build_email_html("T", "<p>B</p>")
        self.assertIn("#0A0A0A", html)

    def test_gold_accent_color(self):
        html = build_email_html("T", "<p>B</p>")
        self.assertIn("#D4AF37", html)


if __name__ == "__main__":
    unittest.main()
