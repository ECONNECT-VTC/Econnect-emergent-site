# Standard library
import asyncio
import hashlib
import logging
import os
import re
import secrets
import unicodedata
import uuid
from base64 import b64encode
from datetime import datetime, timedelta, timezone
from html import escape as html_escape
from io import BytesIO
from pathlib import Path
from typing import Any, List, Optional, Tuple
from urllib.parse import urlencode

# Third-party
import bcrypt
import jwt
import stripe
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, EmailStr
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Attachment, Disposition, FileContent, FileName, FileType, Mail
from starlette.middleware.cors import CORSMiddleware

# Load environment variables before accessing os.environ
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logo path for PDF generation — prefer backend/assets/, fallback to frontend/public/photo/
LOGO_PATH = ROOT_DIR / "assets" / "logo.png"
if not LOGO_PATH.exists():
    LOGO_PATH = ROOT_DIR.parent / "frontend" / "public" / "photo" / "logo-cropped.png"
INVOICE_LOGO_PATH = ROOT_DIR / "assets" / "logo-invoice-hd.png"
if not INVOICE_LOGO_PATH.exists():
    INVOICE_LOGO_PATH = LOGO_PATH

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = "HS256"
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")
STRIPE_PUBLISHABLE_KEY = os.environ.get("STRIPE_PUBLISHABLE_KEY")
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

# Create the main app
app = FastAPI(title="Econnect VTC API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== STATUS WORKFLOW ====================

BOOKING_STATUS_FLOW = [
    "DRAFT",
    "QUOTE_SENT",
    "QUOTE_ACCEPTED",
    "ORDER_ISSUED",
    "ASSIGNED",
    "IN_PROGRESS",
    "COMPLETED",
    "INVOICED",
    "PAID",
]

LEGACY_STATUS_MAP = {
    "pending": "DRAFT",
    "received": "QUOTE_ACCEPTED",
    "assigned": "ASSIGNED",
    "in_progress": "IN_PROGRESS",
    "completed": "COMPLETED",
    "invoiced": "INVOICED",
    "paid": "PAID",
    "cancellation_requested": "cancellation_requested",
    "cancelled": "cancelled",
}


def normalize_booking_status(status: Optional[str]) -> Optional[str]:
    if status is None:
        return None
    if status in BOOKING_STATUS_FLOW:
        return status
    return LEGACY_STATUS_MAP.get(str(status).lower(), status)

# ==================== MODELS ====================

class UserBase(BaseModel):
    email: EmailStr
    name: str
    phone: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role: str = "client"  # client, driver, admin

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    phone: Optional[str] = None
    role: str
    created_at: datetime

class DriverCreate(BaseModel):
    email: EmailStr
    name: str
    phone: str
    password: str
    vehicle_model: str
    vehicle_plate: str

class DriverResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    phone: str
    role: str = "driver"
    vehicle_model: str
    vehicle_plate: str
    is_available: bool = True
    created_at: datetime

class BookingBase(BaseModel):
    pickup_address: str
    dropoff_address: str
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    dropoff_lat: Optional[float] = None
    dropoff_lng: Optional[float] = None
    pickup_date: str
    pickup_time: str
    transfer_type: str  # simple, retour, disposition
    vehicle_category_id: Optional[str] = None
    distance_km: Optional[float] = None
    duration_minutes: Optional[float] = None
    estimated_price: Optional[float] = None
    notes: Optional[str] = None
    disposition_hours: Optional[float] = None

class BookingCreate(BookingBase):
    pass

class AdminBookingCreate(BaseModel):
    client_name: str
    client_email: EmailStr
    pickup_address: str
    dropoff_address: str
    pickup_date: str
    pickup_time: str
    transfer_type: str
    client_phone: Optional[str] = None
    notes: Optional[str] = None
    estimated_price: Optional[float] = None
    vehicle_category_id: Optional[str] = None
    disposition_hours: Optional[float] = None
    distance_km: Optional[float] = None
    duration_minutes: Optional[float] = None
    payment_mode: Optional[str] = None  # "immediate" | "deferred" | None (defaults to deferred)
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None

class BookingResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    client_id: Optional[str] = None
    client_name: str
    client_email: str
    client_phone: Optional[str] = None
    pickup_address: str
    dropoff_address: str
    pickup_lat: Optional[float] = None
    pickup_lng: Optional[float] = None
    dropoff_lat: Optional[float] = None
    dropoff_lng: Optional[float] = None
    pickup_date: str
    pickup_time: str
    transfer_type: str
    vehicle_category_id: Optional[str] = None
    vehicle_category_name: Optional[str] = None
    distance_km: Optional[float] = None
    duration_minutes: Optional[float] = None
    estimated_price: Optional[float] = None
    notes: Optional[str] = None
    disposition_hours: Optional[float] = None
    status: str  # DRAFT, QUOTE_SENT, QUOTE_ACCEPTED, ORDER_ISSUED, ASSIGNED, IN_PROGRESS, COMPLETED, INVOICED, PAID, cancellation_requested, cancelled
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    driver_display_name: Optional[str] = None
    commission_override: Optional[float] = None
    fulfilled_by_admin: Optional[bool] = None
    admin_vehicle_plate: Optional[str] = None
    admin_vehicle_model: Optional[str] = None
    admin_vehicle_brand: Optional[str] = None
    cancellation_reason: Optional[str] = None
    driver_cancellation_reason: Optional[str] = None
    cancellation_previous_status: Optional[str] = None
    refund_amount: Optional[float] = None
    refunded_at: Optional[datetime] = None
    stripe_refund_id: Optional[str] = None
    refund_status: Optional[str] = None
    refund_currency: Optional[str] = None
    refund_initiated_by: Optional[str] = None
    payment_status: Optional[str] = None
    payment_method: Optional[str] = None
    payment_completed_at: Optional[datetime] = None
    stripe_checkout_session_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    paid_amount: Optional[float] = None
    paid_currency: Optional[str] = None
    payment_mode: Optional[str] = None
    created_at: datetime
    assigned_at: Optional[datetime] = None

class BookingCheckoutCreate(BookingCreate):
    success_path: Optional[str] = "/fr/booking/confirmation"
    cancel_path: Optional[str] = "/fr/booking/cancel"

class BookingCheckoutResponse(BaseModel):
    booking_id: str
    checkout_url: str
    session_id: str
    publishable_key: Optional[str] = None

class BookingPaymentConfirmationRequest(BaseModel):
    session_id: str

class BookingPaymentConfirmationResponse(BaseModel):
    verified: bool
    payment_status: Optional[str] = None
    booking: BookingResponse

class AssignBooking(BaseModel):
    driver_id: str

class AdminVehicle(BaseModel):
    id: str
    brand: str
    model: str
    plate: str
    color: Optional[str] = None
    capacity: Optional[int] = None
    is_active: bool = True

class AdminVehicleCreate(BaseModel):
    brand: str
    model: str
    plate: str
    color: Optional[str] = None
    capacity: Optional[int] = None

class AdminVehicleUpdate(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    plate: Optional[str] = None
    color: Optional[str] = None
    capacity: Optional[int] = None
    is_active: Optional[bool] = None

class AdminAssignSelfRequest(BaseModel):
    vehicle_id: Optional[str] = None
    driver_display_name: Optional[str] = None

class BookingStatusUpdate(BaseModel):
    status: str

class CourseDocumentResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    course_id: str
    type: str  # quote | order_form | invoice
    url: str
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CourseStatusUpdateResponse(BaseModel):
    message: str
    status: str

class BookingCommissionUpdate(BaseModel):
    commission_override: float

class BookingCancelRequest(BaseModel):
    cancellation_reason: Optional[str] = None

class BookingCancellationDecision(BaseModel):
    approved: bool
    refund_amount: Optional[float] = None

class AdminCancellationRequest(BaseModel):
    cancellation_reason: Optional[str] = None
    refund_amount: Optional[float] = None

class DriverCancellationRequest(BaseModel):
    cancellation_reason: Optional[str] = None

class StatsResponse(BaseModel):
    total_bookings: int
    pending_bookings: int
    assigned_bookings: int
    completed_bookings: int
    total_clients: int
    total_drivers: int
    available_drivers: int

class PasswordResetRequest(BaseModel):
    email: EmailStr

class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str

# ==================== VEHICLE & PRICING MODELS ====================

class VehicleCategory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str  # e.g., "Berline", "Van", "Luxe"
    description: str
    price_per_km: float  # Prix par kilomètre en euros
    min_fare: float  # Tarif minimum
    has_wifi: Optional[bool] = None
    max_passengers: Optional[int] = None
    max_luggage: Optional[int] = None
    image_url: Optional[str] = None
    is_active: bool = True
    order: int = 0  # Pour l'ordre d'affichage

class VehicleCategoryCreate(BaseModel):
    name: str
    description: str
    price_per_km: float
    min_fare: float
    has_wifi: Optional[bool] = None
    max_passengers: Optional[int] = None
    max_luggage: Optional[int] = None
    image_url: Optional[str] = None
    order: int = 0

class VehicleCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_per_km: Optional[float] = None
    min_fare: Optional[float] = None
    has_wifi: Optional[bool] = None
    max_passengers: Optional[int] = None
    max_luggage: Optional[int] = None
    image_url: Optional[str] = None
    is_active: Optional[bool] = None
    order: Optional[int] = None

class PriceEstimate(BaseModel):
    category_id: str
    category_name: str
    distance_km: float
    duration_minutes: float
    base_price: float
    final_price: float
    min_fare: float
    price_per_km: float
    pricing_basis: str = "distance"
    disposition_hours: Optional[float] = None
    rate_label: Optional[str] = None

# ==================== FINANCIAL MODELS ====================

DEFAULT_CATEGORY_METADATA = {
    "Berline": {"has_wifi": True, "max_passengers": 4, "max_luggage": 2},
    "Van": {"has_wifi": False, "max_passengers": 7, "max_luggage": 5},
    "Luxe": {"has_wifi": True, "max_passengers": 4, "max_luggage": 3},
    "Green": {"has_wifi": True, "max_passengers": 4, "max_luggage": 2},
}

LEGACY_CATEGORY_METADATA = {
    "Berline": {"has_wifi": True, "max_passengers": 3, "max_luggage": 2},
    "Van": {"has_wifi": True, "max_passengers": 7, "max_luggage": 7},
    "Luxe": {"has_wifi": True, "max_passengers": 3, "max_luggage": 3},
    "Green": {"has_wifi": True, "max_passengers": 4, "max_luggage": 3},
}

CATEGORY_NAME_ALIASES = {
    "berline": "Berline",
    "confort classique": "Berline",
    "green": "Green",
    "confort premium": "Green",
    "luxe": "Luxe",
    "prestige": "Luxe",
    "van": "Van",
}


def serialize_vehicle_category(category: dict) -> VehicleCategory:
    return VehicleCategory(
        id=category["id"],
        name=category["name"],
        description=category["description"],
        price_per_km=category["price_per_km"],
        min_fare=category["min_fare"],
        has_wifi=category.get("has_wifi"),
        max_passengers=category.get("max_passengers"),
        max_luggage=category.get("max_luggage"),
        image_url=category.get("image_url"),
        is_active=category.get("is_active", True),
        order=category.get("order", 0),
    )


def normalize_category_name(category_name: Optional[str]) -> Optional[str]:
    if not category_name:
        return None
    normalized = unicodedata.normalize("NFKD", category_name).encode("ASCII", "ignore").decode("ASCII")
    normalized = normalized.strip().lower()
    return CATEGORY_NAME_ALIASES.get(normalized, category_name)


def select_disposition_rate(rates: List[dict], requested_hours: float) -> Optional[dict]:
    active_rates = sorted(
        [rate for rate in rates if rate.get("is_active", True)],
        key=lambda rate: rate.get("duration_hours", 0),
    )
    if not active_rates:
        return None

    exact_rate = next(
        (
            rate
            for rate in active_rates
            if abs(float(rate.get("duration_hours", 0)) - requested_hours) < 1e-9
        ),
        None,
    )
    if exact_rate:
        return exact_rate

    next_rate = next(
        (rate for rate in active_rates if float(rate.get("duration_hours", 0)) >= requested_hours),
        None,
    )
    return next_rate or active_rates[-1]


def validate_booking_status_transition(current_status: str, new_status: str) -> None:
    current_status = normalize_booking_status(current_status)
    new_status = normalize_booking_status(new_status)

    if current_status == new_status:
        return

    allowed_transitions = {
        "DRAFT": {"QUOTE_SENT", "cancelled"},
        "QUOTE_SENT": {"QUOTE_ACCEPTED", "DRAFT", "cancelled"},
        "QUOTE_ACCEPTED": {"ORDER_ISSUED", "ASSIGNED", "cancelled"},
        "ORDER_ISSUED": {"ASSIGNED", "cancelled"},
        "ASSIGNED": {"IN_PROGRESS", "QUOTE_ACCEPTED", "cancellation_requested", "cancelled"},
        "IN_PROGRESS": {"COMPLETED", "cancellation_requested"},
        "COMPLETED": {"INVOICED"},
        "INVOICED": {"PAID"},
        "PAID": set(),
        "cancellation_requested": {"cancelled", "ASSIGNED", "QUOTE_ACCEPTED"},
        "cancelled": set(),
    }

    valid_next_statuses = allowed_transitions.get(current_status, set())
    if new_status not in valid_next_statuses:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Transition de statut invalide: {current_status} → {new_status}. "
                f"Valeurs acceptées: {sorted(valid_next_statuses)}"
            ),
        )


def status_at_or_after(status: Optional[str], reference_status: str) -> bool:
    normalized = normalize_booking_status(status)
    if normalized not in BOOKING_STATUS_FLOW:
        return False
    return BOOKING_STATUS_FLOW.index(normalized) >= BOOKING_STATUS_FLOW.index(reference_status)


async def create_course_document(
    booking: dict,
    document_type: str,
    document_status: str,
    created_by: Optional[str] = None,
    *,
    url: Optional[str] = None,
) -> dict:
    if document_type not in {"quote", "order_form", "invoice"}:
        raise HTTPException(status_code=400, detail="Type de document invalide")

    now = datetime.now(timezone.utc)
    booking_id = booking["id"]
    document_url = url or f"/api/courses/{booking_id}/documents/{document_type}"
    existing = await db.course_documents.find_one({"course_id": booking_id, "type": document_type}, {"_id": 0})

    if existing:
        updated_doc = {
            **existing,
            "url": document_url,
            "status": document_status,
            "created_by": created_by or existing.get("created_by"),
            "updated_at": now,
        }
        await db.course_documents.update_one(
            {"id": existing["id"]},
            {"$set": {
                "url": updated_doc["url"],
                "status": updated_doc["status"],
                "created_by": updated_doc["created_by"],
                "updated_at": updated_doc["updated_at"],
            }},
        )
        return updated_doc

    document = {
        "id": str(uuid.uuid4()),
        "course_id": booking_id,
        "type": document_type,
        "url": document_url,
        "status": document_status,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
    }
    await db.course_documents.insert_one(document)
    return document


async def log_booking_status_transition(
    booking_id: str,
    previous_status: Optional[str],
    new_status: Optional[str],
    actor_id: Optional[str],
) -> None:
    prev = normalize_booking_status(previous_status)
    nxt = normalize_booking_status(new_status)
    if prev == nxt:
        return
    await db.booking_status_history.insert_one(
        {
            "id": str(uuid.uuid4()),
            "course_id": booking_id,
            "from_status": prev,
            "to_status": nxt,
            "changed_by": actor_id,
            "changed_at": datetime.now(timezone.utc),
        }
    )

class CommissionSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    commission_rate: float  # ex: 0.10 = 10%
    tva_client_rate: float  # ex: 0.10 = 10%
    tva_commission_rate: float  # ex: 0.20 = 20%
    company_name: str = "Econnect VTC"
    company_address: str = "À compléter"
    company_phone: str = "À compléter"
    company_email: str = "À compléter"
    company_siret: str = "À compléter"
    company_vtc_number: str = "À compléter"
    company_vat_number: str = "À compléter"
    company_iban: str = "À compléter"
    updated_at: datetime

class CommissionSettingsUpdate(BaseModel):
    commission_rate: Optional[float] = None
    tva_client_rate: Optional[float] = None
    tva_commission_rate: Optional[float] = None
    company_name: Optional[str] = None
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    company_siret: Optional[str] = None
    company_vtc_number: Optional[str] = None
    company_vat_number: Optional[str] = None
    company_iban: Optional[str] = None

class FinancialStats(BaseModel):
    total_revenue_ttc: float
    total_revenue_ht: float
    total_tva_client: float
    total_commission_ttc: float
    total_commission_ht: float
    total_tva_commission: float
    total_driver_earnings: float
    commission_rate: float
    completed_bookings_count: int

class DriverEarning(BaseModel):
    model_config = ConfigDict(extra="ignore")
    booking_id: str
    pickup_address: str
    dropoff_address: str
    pickup_date: str
    pickup_time: str
    price_ttc: float
    commission_ttc: float
    driver_earning: float
    status: str
    created_at: datetime

class InvoiceMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    invoice_number: str
    booking_id: str
    client_name: str
    client_email: str
    amount_ttc: float
    amount_ht: float
    tva_amount: float
    tva_rate: float
    type: str  # "invoice" or "order"
    created_at: datetime

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Type de token invalide")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")

async def require_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Accès administrateur requis")
    return user

async def require_driver(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Accès chauffeur requis")
    return user

def round_amount(value: float) -> float:
    # Small epsilon helps avoid floating-point artifacts so values like 1.005 round to 1.01.
    return round(value + 1e-9, 2)

def get_default_commission_settings() -> dict:
    return {
        "id": str(uuid.uuid4()),
        "commission_rate": 0.10,
        "tva_client_rate": 0.10,
        "tva_commission_rate": 0.20,
        "company_name": "Econnect VTC",
        "company_address": "À compléter",
        "company_phone": "À compléter",
        "company_email": "À compléter",
        "company_siret": "À compléter",
        "company_vtc_number": "À compléter",
        "company_vat_number": "À compléter",
        "company_iban": "À compléter",
        "updated_at": datetime.now(timezone.utc)
    }

async def get_commission_settings() -> dict:
    settings = await db.commission_settings.find_one({}, {"_id": 0})
    if settings:
        return settings
    defaults = get_default_commission_settings()
    await db.commission_settings.insert_one(defaults)
    return defaults

# Client VAT business rule (easy to adjust if regulation changes)
CLIENT_TVA_RATE_STANDARD_COURSE = 0.10
CLIENT_TVA_RATE_DISPOSITION = 0.20
PAYMENT_METHOD_LABELS = {
    "cb": "Carte bancaire",
    "cash": "Espèces",
    "virement": "Virement bancaire",
}
PAYMENT_STATUS_LABELS = {
    "pending": "À payer",
    "paid": "Payée",
    "failed": "Paiement échoué",
    "refunded": "Remboursée",
    "partially_refunded": "Partiellement remboursée",
    "not_required": "À payer",
}

def is_disposition_transfer(transfer_type: Optional[str]) -> bool:
    """Return True when the transfer type corresponds to a disposition service.

    Input text is normalized (lowercase + accent removal) so variants such as
    "mise à disposition" are matched reliably.
    """
    normalized = ''.join(
        char for char in unicodedata.normalize("NFD", str(transfer_type or "").lower()) if unicodedata.category(char) != "Mn"
    ).strip()
    return "disposition" in normalized

def get_client_tva_rate_for_booking(booking: Optional[dict]) -> float:
    """Resolve client VAT rate from booking type.

    Args:
        booking: Booking payload containing transfer_type.
    Returns:
        20% for disposition, 10% for other client courses.
    """
    if is_disposition_transfer((booking or {}).get("transfer_type")):
        return CLIENT_TVA_RATE_DISPOSITION
    return CLIENT_TVA_RATE_STANDARD_COURSE

def normalize_payment_method_code(value: Any, fallback: Any = None) -> Optional[str]:
    source = str(value or fallback or "").strip().lower()
    normalized = ''.join(
        char for char in unicodedata.normalize("NFD", source) if unicodedata.category(char) != "Mn"
    )
    if any(token in normalized for token in ["cb", "carte", "card", "bleue", "bleu"]):
        return "cb"
    if any(token in normalized for token in ["cash", "espece", "especes"]):
        return "cash"
    if "virement" in normalized:
        return "virement"
    return None

def normalize_payment_status_code(value: Any) -> Optional[str]:
    source = str(value or "").strip().lower()
    normalized = ''.join(
        char for char in unicodedata.normalize("NFD", source) if unicodedata.category(char) != "Mn"
    )
    if normalized in {"paid", "payee", "paye"}:
        return "paid"
    if normalized in {"pending", "due", "a payer", "a_payer", "unpaid"}:
        return "pending"
    if normalized in PAYMENT_STATUS_LABELS:
        return normalized
    return None

def get_payment_method_label(value: Any, fallback: Any = None) -> str:
    code = normalize_payment_method_code(value, fallback=fallback)
    return PAYMENT_METHOD_LABELS.get(code, "N/A")

def get_payment_status_label(value: Any, default: str = "N/A") -> str:
    code = normalize_payment_status_code(value)
    return PAYMENT_STATUS_LABELS.get(code, default)

async def get_document_driver_profile(booking: dict) -> Optional[dict]:
    if bool(booking.get("fulfilled_by_admin")) or not booking.get("driver_id"):
        return None
    return await db.users.find_one({"id": booking.get("driver_id"), "role": "driver"}, {"_id": 0})

async def build_document_issuer_profile(booking: dict, settings: dict, driver: Optional[dict] = None) -> dict:
    """Build issuer details for generated documents.

    Uses main company information for admin-fulfilled bookings, and switches to
    driver/company fields when the booking is assigned to a non-admin driver.
    """
    issuer = {
        "name": settings["company_name"],
        "address": settings["company_address"],
        "email": settings["company_email"],
        "phone": settings.get("company_phone", "À compléter"),
        "siret": settings["company_siret"],
        "vtc_number": settings["company_vtc_number"],
        "vat_number": settings.get("company_vat_number") or settings.get("company_tva_number"),
        "is_driver_issuer": False,
    }

    if bool(booking.get("fulfilled_by_admin")) or not booking.get("driver_id"):
        return issuer

    driver = driver or await get_document_driver_profile(booking)
    if not driver:
        return issuer

    return {
        "name": driver.get("company_name") or driver.get("name") or issuer["name"],
        "address": driver.get("company_address") or driver.get("address") or issuer["address"],
        "email": driver.get("company_email") or driver.get("email") or issuer["email"],
        "phone": driver.get("company_phone") or driver.get("phone") or issuer["phone"],
        "siret": driver.get("company_siret") or issuer["siret"],
        "vtc_number": driver.get("company_vtc_number") or issuer["vtc_number"],
        "vat_number": driver.get("company_vat_number") or driver.get("company_tva_number") or issuer.get("vat_number"),
        "is_driver_issuer": True,
    }

def compute_financial_breakdown(
    price_ttc: float,
    commission_rate: float,
    tva_client_rate: float,
    tva_commission_rate: float,
    commission_override: Optional[float] = None,
    fulfilled_by_admin: bool = False
) -> dict:
    safe_price_ttc = float(price_ttc or 0)
    if fulfilled_by_admin:
        commission_ttc = 0.0
    elif commission_override is not None:
        commission_ttc = float(commission_override)
    else:
        commission_ttc = safe_price_ttc * commission_rate
    driver_earning = safe_price_ttc - commission_ttc

    price_ht = safe_price_ttc / (1 + tva_client_rate) if (1 + tva_client_rate) > 0 else safe_price_ttc
    tva_client = safe_price_ttc - price_ht

    commission_ht = commission_ttc / (1 + tva_commission_rate) if (1 + tva_commission_rate) > 0 else commission_ttc
    tva_commission = commission_ttc - commission_ht

    return {
        "price_ttc": round_amount(safe_price_ttc),
        "price_ht": round_amount(price_ht),
        "tva_client": round_amount(tva_client),
        "commission_ttc": round_amount(commission_ttc),
        "commission_ht": round_amount(commission_ht),
        "tva_commission": round_amount(tva_commission),
        "driver_earning": round_amount(driver_earning),
    }

async def get_next_sequential_number() -> str:
    """Get the next sequential 6-digit invoice number (000001 to 999999)."""
    result = await db.counters.find_one_and_update(
        {"_id": "invoice_seq"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    seq = result["seq"]
    if seq > 999999:
        raise HTTPException(
            status_code=500,
            detail="La limite de numérotation des factures (999999) a été atteinte. Contactez l'administrateur."
        )
    return str(seq).zfill(6)

def generate_financial_pdf(booking: dict, settings: dict, document_type: str, document_number: str) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    # ---- colour palette ----
    GOLD      = (0.0, 0.0, 0.0)
    GOLD_LIGHT = (0.92, 0.92, 0.92)   # light grey for table headers
    DARK      = (0.08, 0.08, 0.08)
    DARK_GREY = (0.12, 0.12, 0.12)
    MID_GREY  = (0.30, 0.30, 0.30)
    LIGHT_BG  = (0.97, 0.97, 0.97)    # light grey panel background
    WHITE     = (1.0,  1.0,  1.0)
    PRIMARY_TEXT = DARK

    def set_fill(rgb):
        c.setFillColorRGB(*rgb)

    def set_stroke(rgb):
        c.setStrokeColorRGB(*rgb)

    if booking.get("estimated_price") is None:
        raise HTTPException(status_code=400, detail="Montant de course indisponible")

    resolved_client_tva_rate = get_client_tva_rate_for_booking(booking)
    breakdown = compute_financial_breakdown(
        booking["estimated_price"],
        settings["commission_rate"],
        resolved_client_tva_rate,
        settings["tva_commission_rate"],
        booking.get("commission_override"),
        bool(booking.get("fulfilled_by_admin"))
    )

    title_map = {
        "invoice": "FACTURE CLIENT",
        "order": "BON DE COMMANDE",
        "driver": "FACTURE CHAUFFEUR",
        "commission": "FACTURE COMMISSION",
        "activity": "RELEVÉ D'ACTIVITÉ",
    }
    title = title_map.get(document_type, "DOCUMENT")
    is_order_document = document_type == "order"
    is_invoice_document = document_type == "invoice"
    is_commission_document = document_type == "commission"
    is_driver_statement = document_type in ("driver", "activity")
    if is_order_document:
        GOLD = (0.83, 0.69, 0.22)
        GOLD_LIGHT = (0.18, 0.15, 0.08)
        DARK_GREY = (0.09, 0.09, 0.09)
        MID_GREY = (0.78, 0.78, 0.78)
        LIGHT_BG = (0.13, 0.13, 0.13)
        PRIMARY_TEXT = (0.95, 0.95, 0.95)
    issuer = booking.get("issuer", {
        "name": settings["company_name"],
        "address": settings["company_address"],
        "email": settings["company_email"],
        "phone": settings.get("company_phone", "À compléter"),
        "siret": settings["company_siret"],
        "vtc_number": settings["company_vtc_number"],
        "vat_number": settings.get("company_vat_number") or settings.get("company_tva_number"),
        "is_driver_issuer": False,
    })

    distance_km = None
    try:
        raw_distance = booking.get("distance_km")
        if raw_distance is not None:
            parsed_distance = float(raw_distance)
            if parsed_distance > 0:
                distance_km = round_amount(parsed_distance)
    except (TypeError, ValueError):
        distance_km = None

    unit_price_ht = None
    try:
        raw_price_per_km = booking.get("price_per_km")
        if raw_price_per_km is not None and float(raw_price_per_km) > 0:
            unit_price_ht = round_amount(float(raw_price_per_km))
        elif distance_km:
            unit_price_ht = round_amount(breakdown["price_ht"] / distance_km)
    except (TypeError, ValueError, ZeroDivisionError):
        unit_price_ht = None

    line_price_ht = breakdown["price_ht"]
    if distance_km and unit_price_ht:
        line_price_ht = round_amount(distance_km * unit_price_ht)
    payment_method = normalize_payment_method_code(booking.get("payment_method"), fallback=booking.get("notes"))
    is_admin_fulfillment = bool(booking.get("fulfilled_by_admin"))
    driver_display_name = (
        booking.get("document_driver_name")
        or booking.get("driver_name")
        or settings["company_name"]
        or "N/A"
    )
    driver_company_name = (
        booking.get("document_driver_company")
        or (settings["company_name"] if is_admin_fulfillment else issuer.get("name"))
        or settings["company_name"]
        or "N/A"
    )
    driver_phone = (
        booking.get("document_driver_phone")
        or (settings.get("company_phone") if is_admin_fulfillment else issuer.get("phone"))
        or "À compléter"
    )
    driver_vtc_number = (
        booking.get("document_driver_vtc_number")
        or (settings.get("company_vtc_number") if is_admin_fulfillment else issuer.get("vtc_number"))
        or "À compléter"
    )
    driver_vehicle_plate = (
        booking.get("document_driver_vehicle_plate")
        or booking.get("admin_vehicle_plate")
        or "À compléter"
    )

    def clean_pdf_value(value, *, allow_zero: bool = False) -> str:
        """Normalize a PDF field value into printable text.

        Args:
            value: Raw value coming from the booking, driver profile, or settings.
            allow_zero: When True, a numeric zero is preserved instead of treated as missing.
        Returns:
            A printable string, using "N/A" for missing or placeholder values and
            formatting datetimes as "dd/mm/YYYY à HH:MM".
        """
        if value is None:
            return "N/A"
        if isinstance(value, datetime):
            dt_value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
            return dt_value.astimezone(timezone.utc).strftime("%d/%m/%Y à %H:%M")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if value == 0 and not allow_zero:
                return "N/A"
            return str(int(value)) if float(value).is_integer() else f"{value}"

        text = str(value).strip()
        normalized = ''.join(
            char for char in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(char) != "Mn"
        )
        if not text or normalized in {"a completer", "n/a", "na", "none", "null"}:
            return "N/A"
        return text

    def format_schedule(date_value: Any, time_value: Any) -> str:
        """Combine separate date/time inputs into a single printable reservation slot.

        Args:
            date_value: Date-like value already stored on the booking.
            time_value: Time-like value already stored on the booking.
        Returns:
            A single string in the form "<date> à <time>", or the non-missing part
            when only one component is available.
        """
        date_text = clean_pdf_value(date_value)
        time_text = clean_pdf_value(time_value)
        if date_text == "N/A":
            return time_text
        if time_text == "N/A":
            return date_text
        return f"{date_text} à {time_text}"

    def format_booking_creation(value: Any) -> str:
        """Format the booking creation timestamp for the order form header.

        Args:
            value: A datetime instance, an ISO-8601 string, or any other raw value.
        Returns:
            A normalized printable timestamp when parsing succeeds, otherwise the
            best-effort cleaned string or "N/A".
        """
        if isinstance(value, datetime):
            return clean_pdf_value(value)
        if value is None:
            return "N/A"

        raw_text = str(value).strip()
        if not raw_text:
            return "N/A"

        try:
            parsed_value = datetime.fromisoformat(raw_text.replace("Z", "+00:00"))
            return clean_pdf_value(parsed_value)
        except ValueError:
            return clean_pdf_value(raw_text)

    normalized_category_name = normalize_category_name(booking.get("vehicle_category_name"))
    category_metadata = (
        DEFAULT_CATEGORY_METADATA.get(normalized_category_name or "")
        or LEGACY_CATEGORY_METADATA.get(normalized_category_name or "")
        or {}
    )
    passenger_count = (
        booking.get("passenger_count")
        or booking.get("number_of_passengers")
        or booking.get("passengers")
        or category_metadata.get("max_passengers")
    )
    luggage_count = (
        booking.get("luggage_count")
        or booking.get("number_of_luggage")
        or booking.get("bag_count")
        or category_metadata.get("max_luggage")
    )
    reservation_datetime = format_booking_creation(booking.get("created_at"))
    pickup_datetime = format_schedule(booking.get("pickup_date"), booking.get("pickup_time"))
    payment_method_label = get_payment_method_label(booking.get("payment_method"), fallback=booking.get("notes"))
    payment_status_label = get_payment_status_label(booking.get("payment_status"), default="À payer")
    options_parts = []
    if clean_pdf_value(luggage_count, allow_zero=True) != "N/A":
        options_parts.append(f"{clean_pdf_value(luggage_count, allow_zero=True)} bagage(s) max")
    notes_value = clean_pdf_value(booking.get("notes"))
    if notes_value != "N/A":
        options_parts.append(notes_value)
    bagages_options = " • ".join(options_parts) if options_parts else "N/A"

    if is_invoice_document:
        INVOICE_GOLD = (0.83, 0.69, 0.22)
        INVOICE_DARK = (0.10, 0.10, 0.10)
        INVOICE_BORDER = (0.82, 0.82, 0.82)
        INVOICE_MUTED = (0.38, 0.38, 0.38)
        INVOICE_LIGHT = (0.96, 0.96, 0.96)
        # Slightly lighter shade for section header backgrounds (reduced opacity)
        INVOICE_HEADER_BG = (0.28, 0.28, 0.28)

        def draw_wrapped_text(x_pos: float, y_pos: float, text: str, max_width: float, line_height: float = 10.5) -> float:
            safe_text = text or "N/A"
            lines = simpleSplit(safe_text, "Helvetica", 9.2, max_width) or [safe_text]
            for index, line in enumerate(lines):
                c.drawString(x_pos, y_pos - (index * line_height), line)
            return len(lines) * line_height

        def draw_party_box(x_pos: float, top_y: float, width_box: float, title_text: str, lines: list[str], height_box: float = 108) -> None:
            bottom_y = top_y - height_box
            set_stroke(INVOICE_BORDER)
            c.setLineWidth(0.9)
            c.rect(x_pos, bottom_y, width_box, height_box, fill=0, stroke=1)
            set_fill(INVOICE_HEADER_BG)
            c.rect(x_pos, top_y - 22, width_box, 22, fill=1, stroke=0)
            set_fill(WHITE)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x_pos + 12, top_y - 15, title_text)
            cursor_y = top_y - 38
            set_fill(DARK)
            for index, line in enumerate(lines):
                c.setFont("Helvetica-Bold" if index == 0 else "Helvetica", 9.2)
                consumed = draw_wrapped_text(x_pos + 12, cursor_y, line, width_box - 24)
                cursor_y -= consumed + 3

        now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")
        due_date = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%d/%m/%Y")
        company_iban = clean_pdf_value(settings.get("company_iban"))
        # Support legacy `company_tva_number` while `company_vat_number` is the canonical VAT key.
        company_vat_number = clean_pdf_value(settings.get("company_vat_number") or settings.get("company_tva_number"))
        service_description = "Mise à disposition VTC" if is_disposition_transfer(booking.get("transfer_type")) else "Courses effectuées"
        invoice_qty = "1"
        client_lines = [
            clean_pdf_value(booking.get("client_name")),
            clean_pdf_value(booking.get("client_email")),
            clean_pdf_value(booking.get("client_phone")),
        ]
        if issuer.get("is_driver_issuer"):
            partner_vat_number = clean_pdf_value(
                booking.get("document_driver_company_vat_number")
                or booking.get("document_driver_company_tva_number")
                or issuer.get("vat_number")
                or issuer.get("company_vat_number")
                or issuer.get("company_tva_number")
            )
            partner_phone_number = clean_pdf_value(
                issuer.get("phone")
                or booking.get("document_driver_phone")
                or booking.get("driver_phone")
            )
            driver_name = clean_pdf_value(
                issuer.get("driver_name")
                or booking.get("driver_name")
            )
            issuer_lines = [
                "Facture émise par ECONNECT VTC pour :",
                clean_pdf_value(issuer.get("name")),
                clean_pdf_value(f"Chauffeur : {driver_name}"),
                clean_pdf_value(f"Numéro de Téléphone : {partner_phone_number}"),
                clean_pdf_value(f"Numéro de TVA : {partner_vat_number}"),
            ]
        else:
            issuer_lines = [
                clean_pdf_value(issuer.get("name")),
                clean_pdf_value(issuer.get("address")),
                clean_pdf_value(issuer.get("email")),
                f"Tél : {clean_pdf_value(issuer.get('phone'))}",
            ]

        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, width, height, fill=1, stroke=0)

        header_top = height - 42
        branding_x = 40
        branding_y = header_top - 70
        branding_w = 220
        branding_h = 68
        set_fill(INVOICE_LIGHT)
        c.roundRect(branding_x, branding_y, branding_w, branding_h, 6, fill=1, stroke=0)
        logo_drawn = False
        try:
            img = ImageReader(str(INVOICE_LOGO_PATH))
            img_w, img_h = img.getSize()
            logo_h = 54
            logo_w = logo_h * img_w / img_h
            c.drawImage(
                img,
                branding_x + ((branding_w - logo_w) / 2),
                branding_y + ((branding_h - logo_h) / 2),
                width=logo_w,
                height=logo_h,
                mask='auto',
                preserveAspectRatio=True,
            )
            logo_drawn = True
        except Exception as exc:
            logger.warning("PDF logo could not be drawn (%s); using text fallback.", exc)

        if not logo_drawn:
            set_fill(INVOICE_DARK)
            c.setFont("Helvetica-Bold", 16)
            c.drawCentredString(branding_x + (branding_w / 2), branding_y + 27, "ECONNECT VTC")

        box_x = width - 212
        box_w = 172
        box_top = header_top
        box_h = 86
        set_stroke(INVOICE_BORDER)
        c.setLineWidth(0.7)
        c.rect(box_x, box_top - box_h, box_w, box_h, fill=0, stroke=1)
        set_fill(INVOICE_DARK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(box_x + 14, box_top - 18, f"FACTURE N° {document_number}")
        set_fill(INVOICE_MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(box_x + 14, box_top - 36, f"Date : {now_str}")
        c.drawString(box_x + 14, box_top - 50, f"Échéance : {due_date}")

        sections_top = box_top - box_h - 22
        box_width = (width - 80 - 16) / 2
        draw_party_box(40, sections_top, box_width, "ÉMETTEUR", issuer_lines)
        draw_party_box(40 + box_width + 16, sections_top, box_width, "CLIENT", client_lines)

        table_top = sections_top - 132
        table_x = 40
        table_w = width - 80
        description_w = 248
        qty_w = 52
        price_ht_w = 84
        tva_w = 64
        total_ttc_w = table_w - description_w - qty_w - price_ht_w - tva_w
        row_h = 72

        set_fill(INVOICE_HEADER_BG)
        c.rect(table_x, table_top - 24, table_w, 24, fill=1, stroke=0)
        headers = [
            ("Description", table_x + 10),
            ("Qté", table_x + description_w + 10),
            ("Prix HT", table_x + description_w + qty_w + 10),
            ("TVA", table_x + description_w + qty_w + price_ht_w + 10),
            ("Total TTC", table_x + description_w + qty_w + price_ht_w + tva_w + 10),
        ]
        set_fill(WHITE)
        c.setFont("Helvetica-Bold", 8.6)
        for header_text, x_pos in headers:
            c.drawString(x_pos, table_top - 16, header_text)

        set_stroke(INVOICE_BORDER)
        c.setLineWidth(0.8)
        c.rect(table_x, table_top - 24 - row_h, table_w, row_h, fill=0, stroke=1)
        column_xs = [
            table_x + description_w,
            table_x + description_w + qty_w,
            table_x + description_w + qty_w + price_ht_w,
            table_x + description_w + qty_w + price_ht_w + tva_w,
        ]
        for x_pos in column_xs:
            c.line(x_pos, table_top - 24, x_pos, table_top - 24 - row_h)

        description_lines = [
            service_description,
            f"Départ : {clean_pdf_value(booking.get('pickup_address'))}",
            f"Arrivée : {clean_pdf_value(booking.get('dropoff_address'))}",
            f"Date : {clean_pdf_value(booking.get('pickup_date'))} à {clean_pdf_value(booking.get('pickup_time'))}",
        ]
        # For mise à disposition, append the number of hours
        _disposition_hours = booking.get('disposition_hours')
        if is_disposition_transfer(booking.get('transfer_type')) and _disposition_hours:
            try:
                _hours_val = float(_disposition_hours)
                if _hours_val > 0:
                    description_lines.append(f"Durée : {_hours_val:g}h")
            except (TypeError, ValueError):
                pass
        text_y = table_top - 38
        set_fill(DARK)
        c.setFont("Helvetica-Bold", 9.2)
        c.drawString(table_x + 10, text_y, description_lines[0])
        set_fill(INVOICE_MUTED)
        c.setFont("Helvetica", 8.7)
        for detail_line in description_lines[1:]:
            text_y -= 11
            c.drawString(table_x + 10, text_y, detail_line)

        set_fill(DARK)
        c.setFont("Helvetica", 9.2)
        c.drawCentredString(table_x + description_w + (qty_w / 2), table_top - 55, invoice_qty)
        c.drawRightString(table_x + description_w + qty_w + price_ht_w - 10, table_top - 55, f"{line_price_ht:.2f} EUR")
        c.drawCentredString(
            table_x + description_w + qty_w + price_ht_w + (tva_w / 2),
            table_top - 55,
            f"{round_amount(resolved_client_tva_rate * 100):.0f}%",
        )
        c.drawRightString(table_x + table_w - 10, table_top - 55, f"{breakdown['price_ttc']:.2f} EUR")

        payment_top = table_top - 24 - row_h - 20
        payment_h = 92
        payment_w = 250
        set_stroke(INVOICE_BORDER)
        c.setLineWidth(0.9)
        c.rect(table_x, payment_top - payment_h, payment_w, payment_h, fill=0, stroke=1)
        set_fill(INVOICE_HEADER_BG)
        c.rect(table_x, payment_top - 22, payment_w, 22, fill=1, stroke=0)
        set_fill(WHITE)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(table_x + 12, payment_top - 15, "INFORMATIONS DE PAIEMENT")
        set_fill(DARK)
        c.setFont("Helvetica", 9)
        c.drawString(table_x + 12, payment_top - 38, f"Mode de paiement : {payment_method_label}")
        status_line = f"Statut : {payment_status_label}"
        status_y = payment_top - 52
        set_fill(INVOICE_GOLD)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(table_x + 12, status_y, status_line)
        # IBAN fully bold (label + value)
        set_fill(DARK)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(table_x + 12, payment_top - 66, f"IBAN : {company_iban}")

        totals_w = 214
        totals_x = table_x + table_w - totals_w
        totals_top = payment_top
        line_gap = 18
        set_stroke(INVOICE_BORDER)
        c.setLineWidth(0.9)
        c.rect(totals_x, totals_top - 58, totals_w, 58, fill=0, stroke=1)
        set_fill(INVOICE_MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(totals_x + 14, totals_top - 16, "Total HT")
        c.drawRightString(totals_x + totals_w - 14, totals_top - 16, f"{breakdown['price_ht']:.2f} EUR")
        c.drawString(totals_x + 14, totals_top - 16 - line_gap, f"Montant TVA ({round_amount(resolved_client_tva_rate * 100):.0f}%)")
        c.drawRightString(totals_x + totals_w - 14, totals_top - 16 - line_gap, f"{breakdown['tva_client']:.2f} EUR")
        set_fill(INVOICE_GOLD)
        c.rect(totals_x, totals_top - 84, totals_w, 22, fill=1, stroke=0)
        set_fill(DARK)
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(totals_x + 14, totals_top - 76, "TOTAL TTC")
        c.drawRightString(totals_x + totals_w - 14, totals_top - 76, f"{breakdown['price_ttc']:.2f} EUR")

        legal_note_1 = "Article L441-10 du Code de commerce : des pénalités de retard sont applicables en cas de paiement tardif"
        legal_note_2 = "Paiement sous 30 jours. Tout retard entraîne des pénalités égales à 3 fois le taux"
        legal_notes_y = payment_top - payment_h - 18
        set_fill(INVOICE_MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(table_x, legal_notes_y, legal_note_1)
        c.drawString(table_x, legal_notes_y - 11, legal_note_2)

        footer_y = 42
        set_stroke(INVOICE_BORDER)
        c.line(40, footer_y + 22, width - 40, footer_y + 22)
        # Footer line 1: company name in bold + identifiers
        _company_name_str = re.sub(r"\beconnect\b", "ECONNECT", clean_pdf_value(settings.get('company_name')), flags=re.IGNORECASE)
        _siret_str = clean_pdf_value(settings.get('company_siret'))
        _vtc_str = clean_pdf_value(settings.get('company_vtc_number'))
        _rest_str = f" - SIRET : {_siret_str} - N° TVA : {company_vat_number}"
        _cn_width = c.stringWidth(_company_name_str, "Helvetica-Bold", 8)
        _rest_width = c.stringWidth(_rest_str, "Helvetica", 8)
        _line_start_x = (width - _cn_width - _rest_width) / 2
        set_fill(DARK)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(_line_start_x, footer_y + 8, _company_name_str)
        set_fill(INVOICE_MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(_line_start_x + _cn_width, footer_y + 8, _rest_str)
        c.drawCentredString(
            width / 2,
            footer_y - 4,
            f"{clean_pdf_value(settings.get('company_address'))} - Tél : {clean_pdf_value(settings.get('company_phone'))} - {clean_pdf_value(settings.get('company_email'))}",
        )
        c.drawCentredString(width / 2, footer_y - 16, f"N° VTC : {_vtc_str}")

        c.showPage()
        c.save()
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

    if is_commission_document:
        INVOICE_GOLD = (0.83, 0.69, 0.22)
        INVOICE_DARK = (0.10, 0.10, 0.10)
        INVOICE_BORDER = (0.82, 0.82, 0.82)
        INVOICE_MUTED = (0.38, 0.38, 0.38)
        INVOICE_LIGHT = (0.96, 0.96, 0.96)
        INVOICE_HEADER_BG = (0.28, 0.28, 0.28)

        def draw_wrapped_text(x_pos: float, y_pos: float, text: str, max_width: float, line_height: float = 10.5) -> float:
            safe_text = text or "N/A"
            lines = simpleSplit(safe_text, "Helvetica", 9.2, max_width) or [safe_text]
            for index, line in enumerate(lines):
                c.drawString(x_pos, y_pos - (index * line_height), line)
            return len(lines) * line_height

        def draw_party_box(x_pos: float, top_y: float, width_box: float, title_text: str, lines: list[str], height_box: float = 124) -> None:
            bottom_y = top_y - height_box
            set_stroke(INVOICE_BORDER)
            c.setLineWidth(0.9)
            c.rect(x_pos, bottom_y, width_box, height_box, fill=0, stroke=1)
            set_fill(INVOICE_HEADER_BG)
            c.rect(x_pos, top_y - 22, width_box, 22, fill=1, stroke=0)
            set_fill(WHITE)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(x_pos + 12, top_y - 15, title_text)
            cursor_y = top_y - 38
            set_fill(INVOICE_DARK)
            for index, line in enumerate(lines):
                c.setFont("Helvetica-Bold" if index == 0 else "Helvetica", 9.2)
                consumed = draw_wrapped_text(x_pos + 12, cursor_y, line, width_box - 24)
                cursor_y -= consumed + 3

        def format_euro(amount: Any) -> str:
            try:
                return f"{round_amount(float(amount or 0)):.2f} €"
            except (TypeError, ValueError):
                return "0.00 €"

        def build_company_lines(*values: str) -> list[str]:
            return [value for value in values if clean_pdf_value(value) != "N/A"]

        now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")
        due_date = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%d/%m/%Y")
        company_vat_number = clean_pdf_value(settings.get("company_vat_number") or settings.get("company_tva_number"))
        operator_name = clean_pdf_value(settings.get("company_name"))
        operator_address = clean_pdf_value(settings.get("company_address"))
        operator_email = clean_pdf_value(settings.get("company_email"))
        operator_phone = clean_pdf_value(settings.get("company_phone"))
        operator_siret = clean_pdf_value(settings.get("company_siret"))
        operator_vtc = clean_pdf_value(settings.get("company_vtc_number"))
        partner_name = clean_pdf_value(booking.get("document_driver_company") or issuer.get("name") or settings.get("company_name"))
        partner_address = clean_pdf_value(booking.get("document_driver_address") or (None if is_admin_fulfillment else issuer.get("address")) or settings.get("company_address"))
        partner_email = clean_pdf_value((None if is_admin_fulfillment else issuer.get("email")) or settings.get("company_email"))
        partner_phone = clean_pdf_value(booking.get("document_driver_phone") or (None if is_admin_fulfillment else issuer.get("phone")) or settings.get("company_phone"))
        partner_siret = clean_pdf_value(booking.get("document_driver_siret") or (None if is_admin_fulfillment else issuer.get("siret")) or settings.get("company_siret"))
        partner_vat_number = clean_pdf_value(
            booking.get("document_driver_company_vat_number")
            or booking.get("document_driver_company_tva_number")
            or (None if is_admin_fulfillment else issuer.get("vat_number"))
            or settings.get("company_vat_number")
            or settings.get("company_tva_number")
        )
        commission_description = (
            "commission mise à disposition"
            if is_disposition_transfer(booking.get("transfer_type"))
            else "Commission sur course"
        )
        operator_lines = build_company_lines(
            operator_name,
            operator_address,
            operator_email,
            f"Tél : {operator_phone}",
            f"SIRET : {operator_siret}",
            f"N° TVA : {company_vat_number}",
        )
        partner_lines = build_company_lines(
            partner_name,
            partner_address,
            partner_email,
            f"Tél : {partner_phone}",
            f"SIRET : {partner_siret}",
            f"N° TVA : {partner_vat_number}",
            f"Chauffeur : {clean_pdf_value(driver_display_name)}",
        )

        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, width, height, fill=1, stroke=0)

        header_top = height - 42
        branding_x = 40
        branding_y = header_top - 70
        branding_w = 220
        branding_h = 68
        set_fill(INVOICE_LIGHT)
        c.roundRect(branding_x, branding_y, branding_w, branding_h, 6, fill=1, stroke=0)
        logo_drawn = False
        try:
            img = ImageReader(str(INVOICE_LOGO_PATH))
            img_w, img_h = img.getSize()
            logo_h = 54
            logo_w = logo_h * img_w / img_h
            c.drawImage(
                img,
                branding_x + ((branding_w - logo_w) / 2),
                branding_y + ((branding_h - logo_h) / 2),
                width=logo_w,
                height=logo_h,
                mask='auto',
                preserveAspectRatio=True,
            )
            logo_drawn = True
        except Exception as exc:
            logger.warning("PDF logo could not be drawn (%s); using text fallback.", exc)

        if not logo_drawn:
            set_fill(INVOICE_DARK)
            c.setFont("Helvetica-Bold", 16)
            c.drawCentredString(branding_x + (branding_w / 2), branding_y + 27, "ECONNECT VTC")

        box_x = width - 212
        box_w = 172
        box_top = header_top
        box_h = 98
        set_stroke(INVOICE_BORDER)
        c.setLineWidth(0.7)
        c.rect(box_x, box_top - box_h, box_w, box_h, fill=0, stroke=1)
        set_fill(INVOICE_DARK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(box_x + 14, box_top - 18, f"FACTURE N° {document_number}")
        set_fill(INVOICE_MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(box_x + 14, box_top - 36, f"Type : Commission")
        c.drawString(box_x + 14, box_top - 50, f"Date : {now_str}")
        c.drawString(box_x + 14, box_top - 64, f"Échéance : {due_date}")

        sections_top = box_top - box_h - 22
        box_width = (width - 80 - 16) / 2
        draw_party_box(40, sections_top, box_width, "SOCIETE EMETTRICE", operator_lines)
        draw_party_box(40 + box_width + 16, sections_top, box_width, "SOCIETE PARTENAIRE", partner_lines)

        table_top = sections_top - 146
        table_x = 40
        table_w = width - 80
        description_w = 250
        qty_w = 42
        price_ht_w = 88
        tva_w = 60
        total_ttc_w = table_w - description_w - qty_w - price_ht_w - tva_w
        row_h = 82

        set_fill(INVOICE_HEADER_BG)
        c.rect(table_x, table_top - 24, table_w, 24, fill=1, stroke=0)
        set_fill(WHITE)
        c.setFont("Helvetica-Bold", 8.6)
        c.drawString(table_x + 10, table_top - 16, "Description")
        c.drawCentredString(table_x + description_w + (qty_w / 2), table_top - 16, "Qté")
        c.drawCentredString(table_x + description_w + qty_w + (price_ht_w / 2), table_top - 16, "Montant HT")
        c.drawCentredString(table_x + description_w + qty_w + price_ht_w + (tva_w / 2), table_top - 16, "TVA")
        c.drawCentredString(table_x + description_w + qty_w + price_ht_w + tva_w + (total_ttc_w / 2), table_top - 16, "Total TTC")

        set_stroke(INVOICE_BORDER)
        c.setLineWidth(0.8)
        c.rect(table_x, table_top - 24 - row_h, table_w, row_h, fill=0, stroke=1)
        column_xs = [
            table_x + description_w,
            table_x + description_w + qty_w,
            table_x + description_w + qty_w + price_ht_w,
            table_x + description_w + qty_w + price_ht_w + tva_w,
        ]
        for x_pos in column_xs:
            c.line(x_pos, table_top - 24, x_pos, table_top - 24 - row_h)

        description_lines = [
            commission_description,
            f"Client : {clean_pdf_value(booking.get('client_name'))}",
            f"Départ : {clean_pdf_value(booking.get('pickup_address'))}",
            f"Arrivée : {clean_pdf_value(booking.get('dropoff_address'))}",
            f"Date : {clean_pdf_value(booking.get('pickup_date'))} à {clean_pdf_value(booking.get('pickup_time'))}",
        ]
        text_y = table_top - 38
        set_fill(INVOICE_DARK)
        c.setFont("Helvetica-Bold", 9.2)
        c.drawString(table_x + 10, text_y, description_lines[0])
        set_fill(INVOICE_MUTED)
        c.setFont("Helvetica", 8.7)
        for detail_line in description_lines[1:]:
            text_y -= 11
            c.drawString(table_x + 10, text_y, detail_line)

        set_fill(INVOICE_DARK)
        c.setFont("Helvetica", 9.2)
        c.drawCentredString(table_x + description_w + (qty_w / 2), table_top - 58, "1")
        c.drawCentredString(
            table_x + description_w + qty_w + (price_ht_w / 2),
            table_top - 58,
            format_euro(breakdown["commission_ht"]),
        )
        c.drawCentredString(
            table_x + description_w + qty_w + price_ht_w + (tva_w / 2),
            table_top - 58,
            f"{round_amount(settings['tva_commission_rate'] * 100):.0f}%",
        )
        c.drawCentredString(
            table_x + description_w + qty_w + price_ht_w + tva_w + (total_ttc_w / 2),
            table_top - 58,
            format_euro(breakdown["commission_ttc"]),
        )

        totals_w = 214
        totals_x = table_x + table_w - totals_w
        totals_top = table_top - 24 - row_h - 18
        line_gap = 18
        set_stroke(INVOICE_BORDER)
        c.setLineWidth(0.9)
        c.rect(totals_x, totals_top - 58, totals_w, 58, fill=0, stroke=1)
        set_fill(INVOICE_MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(totals_x + 14, totals_top - 16, "Commission HT")
        c.drawRightString(totals_x + totals_w - 14, totals_top - 16, format_euro(breakdown["commission_ht"]))
        c.drawString(totals_x + 14, totals_top - 16 - line_gap, f"Montant TVA ({round_amount(settings['tva_commission_rate'] * 100):.0f}%)")
        c.drawRightString(totals_x + totals_w - 14, totals_top - 16 - line_gap, format_euro(breakdown["tva_commission"]))
        set_fill(INVOICE_GOLD)
        c.rect(totals_x, totals_top - 84, totals_w, 22, fill=1, stroke=0)
        set_fill(INVOICE_DARK)
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(totals_x + 14, totals_top - 76, "COMMISSION TTC")
        c.drawRightString(totals_x + totals_w - 14, totals_top - 76, format_euro(breakdown["commission_ttc"]))

        footer_y = 42
        set_stroke(INVOICE_BORDER)
        c.line(40, footer_y + 22, width - 40, footer_y + 22)
        footer_company_name = re.sub(r"\beconnect\b", "ECONNECT", operator_name, flags=re.IGNORECASE)
        footer_rest = f" - SIRET : {operator_siret} - N° TVA : {company_vat_number}"
        company_width = c.stringWidth(footer_company_name, "Helvetica-Bold", 8)
        rest_width = c.stringWidth(footer_rest, "Helvetica", 8)
        line_start_x = (width - company_width - rest_width) / 2
        set_fill(INVOICE_DARK)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(line_start_x, footer_y + 8, footer_company_name)
        set_fill(INVOICE_MUTED)
        c.setFont("Helvetica", 8)
        c.drawString(line_start_x + company_width, footer_y + 8, footer_rest)
        c.drawCentredString(
            width / 2,
            footer_y - 4,
            f"{operator_address} - Tél : {operator_phone} - {operator_email} - N° VTC : {operator_vtc}",
        )

        c.showPage()
        c.save()
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

    if is_order_document:
        ORDER_GOLD = (0.79, 0.64, 0.20)
        ORDER_DARK = (0.18, 0.18, 0.18)
        ORDER_TEXT = (0.20, 0.20, 0.20)
        ORDER_MUTED = (0.34, 0.34, 0.34)
        ORDER_CARD = (0.97, 0.965, 0.945)
        ORDER_BORDER = (0.68, 0.63, 0.50)
        ORDER_CARD_SHADOW = (0.86, 0.83, 0.76)

        def set_order_fill(rgb):
            c.setFillColorRGB(*rgb)

        def set_order_stroke(rgb):
            c.setStrokeColorRGB(*rgb)

        def draw_wrapped_value(x: float, y_pos: float, text: str, max_width: float, line_height: float = 11.5) -> float:
            safe_text = text or "N/A"
            wrapped_lines = simpleSplit(safe_text, "Helvetica", 9, max_width) or [safe_text]
            for idx, line in enumerate(wrapped_lines):
                c.drawString(x, y_pos - (idx * line_height), line)
            return len(wrapped_lines) * line_height

        def measure_card_height(
            rows: list[tuple[str, Any]],
            width: float,
            label_width: float = 118,
            min_height: float = 120
        ) -> float:
            """Return the required card height after accounting for wrapped row values.

            Args:
                rows: Ordered list of ``(label, value)`` tuples rendered inside the card.
                width: Outer card width in PDF points.
                label_width: Reserved width for the left-hand label column.
                min_height: Minimum card height to preserve visual balance.
            Returns:
                The card height in PDF points.
            """
            value_width = width - 28 - label_width
            total_height = 34
            for _, value in rows:
                wrapped_lines = simpleSplit(clean_pdf_value(value), "Helvetica", 9, value_width) or ["N/A"]
                total_height += (len(wrapped_lines) * 11.5) + 7
            return max(total_height, min_height)

        def draw_info_card(
            x: float,
            top_y: float,
            width: float,
            title: str,
            rows: list[tuple[str, Any]],
            card_height: Optional[float] = None,
            label_width: float = 118,
        ) -> float:
            """Render a rounded information card and return its bottom Y coordinate.

            Args:
                x: Left coordinate of the card.
                top_y: Top coordinate of the card in PDF points.
                width: Outer card width in PDF points.
                title: Section title displayed in the card header.
                rows: Ordered list of ``(label, value)`` tuples rendered inside the card.
                card_height: Optional fixed card height. When omitted, height is computed.
            Returns:
                The bottom Y coordinate of the rendered card.
            """
            value_x = x + 18 + label_width
            value_width = width - 28 - label_width
            resolved_height = card_height or measure_card_height(rows, width, label_width=label_width)
            bottom_y = top_y - resolved_height

            set_order_fill(ORDER_CARD_SHADOW)
            c.roundRect(x + 1.8, bottom_y - 1.8, width, resolved_height, 14, fill=1, stroke=0)
            set_order_fill(ORDER_CARD)
            set_order_stroke(ORDER_BORDER)
            c.setLineWidth(1.5)
            c.roundRect(x, bottom_y, width, resolved_height, 14, fill=1, stroke=1)

            set_order_fill(ORDER_GOLD)
            c.setFont("Helvetica-Bold", 10)
            c.drawString(x + 18, top_y - 18, title)

            cursor_y = top_y - 36
            for label, value in rows:
                set_order_fill(ORDER_MUTED)
                c.setFont("Helvetica-Bold", 8.8)
                c.drawString(x + 18, cursor_y, f"{label} :")
                set_order_fill(ORDER_TEXT)
                c.setFont("Helvetica", 9.4)
                display_value = clean_pdf_value(value)
                consumed_height = draw_wrapped_value(value_x, cursor_y, display_value, value_width)
                cursor_y -= consumed_height + 8

            return bottom_y

        c.setFillColorRGB(1, 1, 1)
        c.rect(0, 0, width, height, fill=1, stroke=0)

        header_height = 104
        header_y = height - 36 - header_height
        set_order_fill(ORDER_DARK)
        c.roundRect(28, header_y, width - 56, header_height, 18, fill=1, stroke=0)

        logo_drawn = False
        logo_h = 50
        logo_x = 44
        logo_y = header_y + (header_height - logo_h) / 2
        try:
            img = ImageReader(str(LOGO_PATH))
            img_w, img_h = img.getSize()
            logo_w = logo_h * img_w / img_h
            c.drawImage(
                img,
                logo_x,
                logo_y,
                width=logo_w,
                height=logo_h,
                mask='auto',
                preserveAspectRatio=True
            )
            logo_drawn = True
        except Exception as exc:
            logger.warning("PDF logo could not be drawn (%s); using text fallback.", exc)

        if not logo_drawn:
            set_order_fill(ORDER_GOLD)
            c.setFont("Helvetica-Bold", 20)
            c.drawString(logo_x, header_y + 62, "ECONNECT VTC")
            c.setFont("Helvetica", 8.5)
            c.drawString(logo_x, header_y + 48, "Service de transport privé premium")

        set_order_fill(ORDER_GOLD)
        c.setFont("Helvetica-Bold", 18)
        c.drawString(320, header_y + 65, title)
        c.setFont("Helvetica", 9.5)
        c.drawString(320, header_y + 47, f"Référence : {document_number}")
        c.drawString(320, header_y + 31, f"Réservation créée : {reservation_datetime}")

        current_y = header_y - 18
        left_x = 36
        gap_x = 16
        card_width = (width - 72 - gap_x) / 2

        driver_rows = [
            ("Nom du chauffeur", driver_display_name),
            ("Dénomination sociale", driver_company_name),
            ("Adresse complète", booking.get("document_driver_address") or issuer.get("address")),
            ("Téléphone", driver_phone),
            ("SIREN / SIRET", booking.get("document_driver_siret") or issuer.get("siret")),
            ("REVTC", driver_vtc_number),
        ]
        client_rows = [
            ("Nom du client", booking.get("client_name")),
            ("Téléphone", booking.get("client_phone")),
        ]
        top_cards_height = max(
            measure_card_height(driver_rows, card_width, min_height=166),
            measure_card_height(client_rows, card_width, min_height=166),
        )
        left_bottom = draw_info_card(left_x, current_y, card_width, "IDENTITÉ CHAUFFEUR / SOCIÉTÉ", driver_rows, card_height=top_cards_height)
        right_bottom = draw_info_card(left_x + card_width + gap_x, current_y, card_width, "INFORMATIONS CLIENT", client_rows, card_height=top_cards_height)

        current_y = min(left_bottom, right_bottom) - 16
        trip_rows = [
            ("Date et heure de réservation", reservation_datetime),
            ("Date et heure de prise en charge", pickup_datetime),
            ("Lieu de prise en charge", booking.get("pickup_address")),
            ("Destination", booking.get("dropoff_address")),
        ]
        trip_bottom = draw_info_card(
            36,
            current_y,
            width - 72,
            "DÉTAILS DE LA COURSE",
            trip_rows,
            card_height=measure_card_height(trip_rows, width - 72, label_width=164, min_height=155),
            label_width=164,
        )

        current_y = trip_bottom - 16
        complementary_rows = [
            ("Nombre de passagers", passenger_count),
            ("Prix total TTC", f"{breakdown['price_ttc']:.2f} EUR"),
            ("Mode de paiement", payment_method_label),
            ("Bagages / options", bagages_options),
        ]
        complementary_bottom = draw_info_card(
            36,
            current_y,
            width - 72,
            "INFORMATIONS COMPLÉMENTAIRES",
            complementary_rows,
            card_height=measure_card_height(complementary_rows, width - 72, label_width=152, min_height=122),
            label_width=152,
        )

        total_box_top = complementary_bottom - 18
        total_box_height = 44
        set_order_fill(ORDER_DARK)
        set_order_stroke(ORDER_DARK)
        c.roundRect(36, total_box_top - total_box_height, width - 72, total_box_height, 14, fill=1, stroke=0)
        set_order_fill((1, 1, 1))
        c.setFont("Helvetica-Bold", 11)
        c.drawString(54, total_box_top - 18, "TOTAL TTC")
        set_order_fill(ORDER_GOLD)
        c.setFont("Helvetica-Bold", 16)
        c.drawString(width - 176, total_box_top - 20, f"{breakdown['price_ttc']:.2f} EUR")

        footer_y = 28
        set_order_stroke(ORDER_BORDER)
        c.setLineWidth(0.8)
        c.line(36, footer_y + 18, width - 36, footer_y + 18)
        set_order_fill(ORDER_MUTED)
        c.setFont("Helvetica", 7.6)
        c.drawString(
            36,
            footer_y,
            "Réservation préalable conforme à l’article R3120-2 du Code des transports et à l’Arrêté du 6 août 2025."
        )

        c.showPage()
        c.save()
        pdf_bytes = buffer.getvalue()
        buffer.close()
        return pdf_bytes

    # ================================================================
    # HEADER BAND  (top 90 pt — white background with logo + title)
    # ================================================================
    header_top = height - 20
    header_bot = height - 105

    if is_order_document:
        set_fill((0.04, 0.04, 0.04))
        c.rect(0, 0, width, height, fill=1, stroke=0)

    # Header background
    set_fill(LIGHT_BG if is_order_document else WHITE)
    c.rect(0, header_bot, width, header_top - header_bot, fill=1, stroke=0)

    # --- Logo (left side, height ~55 pt) ---
    logo_drawn = False
    logo_h = 55
    logo_x = 36
    logo_y = header_bot + (header_top - header_bot - logo_h) / 2
    try:
        img = ImageReader(str(LOGO_PATH))
        img_w, img_h = img.getSize()
        logo_w = logo_h * img_w / img_h
        c.drawImage(
            img,
            logo_x,
            logo_y,
            width=logo_w,
            height=logo_h,
            mask='auto',
            preserveAspectRatio=True
        )
        logo_drawn = True
    except Exception as exc:
        logger.warning("PDF logo could not be drawn (%s); using text fallback.", exc)

    if not logo_drawn:
        set_fill(GOLD)
        c.setFont("Helvetica-Bold", 20)
        c.drawString(logo_x, logo_y + 28, "ECONNECT VTC")
        set_fill(MID_GREY)
        c.setFont("Helvetica", 9)
        c.drawString(logo_x, logo_y + 14, "Service de Transport Privé Premium")

    # --- Document title (right side) ---
    set_fill(GOLD)
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(width - 36, header_bot + 54, title)
    set_fill(MID_GREY)
    c.setFont("Helvetica", 10)
    c.drawRightString(width - 36, header_bot + 36, f"N° {document_number}")

    # Gold separator line under header
    set_stroke(GOLD)
    c.setLineWidth(2)
    c.line(36, header_bot, width - 36, header_bot)

    y = header_bot - 18

    # ================================================================
    # META BAR  (date / échéance / siret)
    # ================================================================
    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    due_date = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%d/%m/%Y")

    # Subtle panel
    set_fill(LIGHT_BG)
    c.rect(36, y - 6, width - 72, 18, fill=1, stroke=0)
    set_fill(MID_GREY)
    c.setFont("Helvetica", 8)
    c.drawString(42, y + 3, f"Date : {now_str}   |   Échéance : {due_date}   |   SIRET : {issuer['siret']}")
    y -= 22

    # ================================================================
    # PARTIES  (émetteur / destinataire) — two-column panel
    # ================================================================
    col_w = (width - 72 - 8) / 2   # each column width
    col1_x = 36
    col2_x = 36 + col_w + 8

    # Panel background for both columns
    panel_h = 68
    set_fill(LIGHT_BG)
    c.rect(col1_x, y - panel_h + 12, col_w, panel_h, fill=1, stroke=0)
    c.rect(col2_x, y - panel_h + 12, col_w, panel_h, fill=1, stroke=0)

    # Column labels
    set_fill(GOLD)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(col1_x + 4, y + 6, "ÉMETTEUR")
    right_column_label = "CHAUFFEUR / SOCIÉTÉ" if is_order_document else ("CHAUFFEUR" if is_driver_statement else "DESTINATAIRE")
    c.drawString(col2_x + 4, y + 6, right_column_label)
    y -= 4

    set_fill(PRIMARY_TEXT)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(col1_x + 4, y, issuer["name"])
    if is_order_document:
        c.drawString(col2_x + 4, y, driver_display_name)
    elif is_driver_statement:
        c.drawString(col2_x + 4, y, driver_display_name)
    else:
        c.drawString(col2_x + 4, y, booking.get("client_name", "N/A"))
    y -= 12

    set_fill(MID_GREY)
    c.setFont("Helvetica", 8)
    c.drawString(col1_x + 4, y, issuer["address"])
    if is_order_document:
        c.drawString(col2_x + 4, y, driver_company_name)
    elif is_driver_statement:
        c.drawString(col2_x + 4, y, "Administrateur" if is_admin_fulfillment else driver_company_name)
    else:
        c.drawString(col2_x + 4, y, booking.get("client_email", "N/A"))
    y -= 11

    c.drawString(col1_x + 4, y, issuer["email"])
    y -= 11
    c.drawString(col1_x + 4, y, f"Tél : {issuer['phone']}")
    if is_order_document:
        c.drawString(col2_x + 4, y, f"Tél : {driver_phone}")
    elif not is_driver_statement and booking.get("client_phone"):
        c.drawString(col2_x + 4, y, f"Tél : {booking.get('client_phone')}")
    y -= 18

    if is_order_document:
        detail_h = 48
        set_fill(LIGHT_BG)
        c.rect(36, y - detail_h + 10, width - 72, detail_h, fill=1, stroke=0)
        set_fill(GOLD)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(40, y + 2, "CHAUFFEUR ASSIGNÉ")
        set_fill(MID_GREY)
        c.setFont("Helvetica", 8)
        c.drawString(40, y - 8, f"Nom : {driver_display_name}")
        c.drawString(40, y - 18, f"Tél : {driver_phone}")
        c.drawString(300, y - 8, f"N° VTC : {driver_vtc_number}")
        c.drawString(300, y - 18, f"Plaque d'immatriculation : {driver_vehicle_plate}")
        y -= detail_h + 6

    # Gold divider
    set_stroke(GOLD)
    c.setLineWidth(0.8)
    c.line(36, y, width - 36, y)
    y -= 16

    # ================================================================
    # TRIP DETAILS
    # ================================================================
    set_fill(GOLD)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(36, y, "DÉTAILS DU TRAJET")
    y -= 12

    set_fill(MID_GREY)
    c.setFont("Helvetica", 9)
    pickup_label = "Prise en charge" if is_order_document else "Départ"
    dropoff_label = "Adresse de destination" if is_order_document else "Arrivée"
    c.drawString(36, y, f"{pickup_label} : {booking.get('pickup_address', 'N/A')}")
    y -= 12
    c.drawString(36, y, f"{dropoff_label} : {booking.get('dropoff_address', 'N/A')}")
    y -= 12
    c.drawString(36, y, f"Date : {booking.get('pickup_date', 'N/A')} à {booking.get('pickup_time', 'N/A')}")
    if is_order_document:
        y -= 12
        c.drawString(36, y, f"Service : {'Mise à disposition' if is_disposition_transfer(booking.get('transfer_type')) else 'Course'}")
    y -= 16

    # Gold divider
    set_stroke(GOLD)
    c.setLineWidth(0.8)
    c.line(36, y, width - 36, y)
    y -= 14

    # ================================================================
    # TABLE
    # ================================================================
    table_row_h = 13

    def draw_table_header_band(cols_text: list, xs: list, band_h: int = 18):
        """Draw a gold-band table header row. Modifies the nonlocal `y` in-place."""
        nonlocal y
        set_fill(GOLD_LIGHT)
        c.rect(36, y - band_h + 12, width - 72, band_h, fill=1, stroke=0)
        set_stroke(GOLD)
        c.setLineWidth(0.5)
        c.rect(36, y - band_h + 12, width - 72, band_h, fill=0, stroke=1)
        set_fill(PRIMARY_TEXT)
        c.setFont("Helvetica-Bold", 8)
        for text, x in zip(cols_text, xs):
            if x < 0:   # negative x means right-aligned at |x|
                c.drawRightString(-x, y + 2, text)
            else:
                c.drawString(x, y + 2, text)
        y -= band_h

    if is_invoice_document:
        x_desc, x_km, x_rate, x_ht = 40, 365, 455, width - 36
        draw_table_header_band(
            ["DÉSIGNATION", "KM", "TARIF/KM HT", "PRIX HT"],
            [x_desc, -x_km, -x_rate, -x_ht]
        )
        y -= 3

        set_fill(MID_GREY)
        c.setFont("Helvetica", 9)
        c.drawString(x_desc, y, f"Départ : {booking.get('pickup_address', 'N/A')}")
        c.drawRightString(x_km, y, "-")
        c.drawRightString(x_rate, y, "-")
        c.drawRightString(x_ht, y, "-")
        y -= table_row_h

        c.drawString(x_desc, y, f"Arrivée : {booking.get('dropoff_address', 'N/A')}")
        c.drawRightString(x_km, y, f"{distance_km:.2f}" if distance_km else "-")
        c.drawRightString(x_rate, y, f"{unit_price_ht:.2f} EUR" if unit_price_ht else "-")
        c.drawRightString(x_ht, y, f"{line_price_ht:.2f} EUR")
        y -= table_row_h

        set_stroke(GOLD)
        c.setLineWidth(0.5)
        c.line(36, y, width - 36, y)
        y -= 12

        # Payment method row
        set_fill(PRIMARY_TEXT)
        c.setFont("Helvetica", 9)
        c.drawString(36, y, "Mode de paiement :")
        c.drawString(138, y, f"{'[X]' if payment_method == 'cb' else '[ ]'} CB")
        c.drawString(216, y, f"{'[X]' if payment_method == 'cash' else '[ ]'} Espèces")
        c.drawString(316, y, f"{'[X]' if payment_method == 'virement' else '[ ]'} Virement bancaire")
        y -= 14

        # Sub-totals
        set_fill(MID_GREY)
        c.setFont("Helvetica", 9)
        c.drawString(36, y, "Montant HT")
        c.drawRightString(width - 36, y, f"{breakdown['price_ht']:.2f} EUR")
        y -= table_row_h
        c.drawString(36, y, f"Montant TVA ({round_amount(resolved_client_tva_rate * 100):.0f}%)")
        c.drawRightString(width - 36, y, f"{breakdown['tva_client']:.2f} EUR")
        y -= table_row_h
        total_label = "TOTAL TTC"
        total_value = breakdown['price_ttc']

    elif is_order_document:
        set_fill(MID_GREY)
        c.setFont("Helvetica", 9)
        c.drawString(36, y, "Récapitulatif de la réservation")
        y -= 12

        set_fill(PRIMARY_TEXT)
        c.drawString(36, y, "Mode de paiement :")
        c.drawString(138, y, f"{'[X]' if payment_method == 'cb' else '[ ]'} CB")
        c.drawString(216, y, f"{'[X]' if payment_method == 'cash' else '[ ]'} Espèces")
        c.drawString(316, y, f"{'[X]' if payment_method == 'virement' else '[ ]'} Virement bancaire")
        y -= 14

        set_fill(MID_GREY)
        c.drawString(36, y, "Montant HT")
        c.drawRightString(width - 36, y, f"{breakdown['price_ht']:.2f} EUR")
        y -= table_row_h
        c.drawString(36, y, f"Montant TVA ({round_amount(resolved_client_tva_rate * 100):.0f}%)")
        c.drawRightString(width - 36, y, f"{breakdown['tva_client']:.2f} EUR")
        y -= table_row_h
        total_label = "TOTAL TTC"
        total_value = breakdown["price_ttc"]

    else:
        # Driver / commission / activity
        draw_table_header_band(["DESCRIPTION", "MONTANT"], [40, -(width - 36)])
        y -= 3
        set_fill(PRIMARY_TEXT)
        c.setFont("Helvetica", 9)

    if is_driver_statement:
        if document_type == "activity":
            x_date, x_service, x_ref, x_amount = 40, 220, 410, width - 36
            # Sub-header for activity columns
            set_fill(LIGHT_BG)
            c.rect(36, y - table_row_h + 4, width - 72, table_row_h + 2, fill=1, stroke=0)
            set_fill(PRIMARY_TEXT)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(x_date, y, "DATE")
            c.drawString(x_service, y, "SERVICE")
            c.drawString(x_ref, y, "RÉF.")
            c.drawRightString(x_amount, y, "MONTANT HT")
            y -= table_row_h + 2

            set_fill(MID_GREY)
            c.setFont("Helvetica", 9)
            c.drawString(x_date, y, f"{booking.get('pickup_date', 'N/A')} {booking.get('pickup_time', '')}")
            c.drawString(x_service, y, booking.get('transfer_type', 'VTC'))
            c.drawString(x_ref, y, document_number)
            c.drawRightString(x_amount, y, f"{breakdown['driver_earning']:.2f} €")
            y -= table_row_h

            set_stroke(GOLD)
            c.setLineWidth(0.5)
            c.line(36, y, width - 36, y)
            y -= 12

            c.setFont("Helvetica", 9)
            c.drawString(36, y, "Récapitulatif : Montant course client TTC")
            c.drawRightString(width - 36, y, f"{breakdown['price_ttc']:.2f} €")
            y -= table_row_h
            c.drawString(36, y, "Commission prélevée TTC")
            c.drawRightString(width - 36, y, f"- {breakdown['commission_ttc']:.2f} €")
            y -= 16
        else:
            description = "Rémunération trajet"
            set_fill(PRIMARY_TEXT)
            c.setFont("Helvetica", 9)
            c.drawString(36, y, f"{description} - {booking.get('transfer_type', 'VTC')}")
            c.drawRightString(width - 36, y, f"{breakdown['driver_earning']:.2f} EUR HT")
            y -= table_row_h

            set_fill(MID_GREY)
            c.drawString(36, y, "Montant course client TTC")
            c.drawRightString(width - 36, y, f"{breakdown['price_ttc']:.2f} EUR")
            y -= table_row_h
            c.drawString(36, y, f"Commission prélevée TTC ({round_amount(settings['commission_rate'] * 100):.0f}%)")
            c.drawRightString(width - 36, y, f"- {breakdown['commission_ttc']:.2f} EUR")
            y -= 16

        total_label = "TOTAL ACTIVITÉ TTC" if document_type == "activity" else "MONTANT À VERSER (HT)"
        total_value = breakdown['driver_earning']

    elif document_type == "commission":
        # Commission-specific two-column info block
        set_fill(LIGHT_BG)
        c.rect(36, y - 46, width - 72, 46, fill=1, stroke=0)

        set_fill(GOLD)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(40, y - 4, "Fournisseur")
        c.drawString(300, y - 4, "Destinataire")
        set_fill(MID_GREY)
        c.setFont("Helvetica", 8)
        c.drawString(40, y - 16, f"{issuer['name']}")
        c.drawString(300, y - 16, f"{booking.get('client_name', 'N/A')}")
        c.drawString(40, y - 27, issuer['email'])
        c.drawString(300, y - 27, booking.get('client_email', 'N/A'))
        y -= 46 + 8

        set_fill(PRIMARY_TEXT)
        c.setFont("Helvetica", 9)
        c.drawString(36, y, f"Commission de gestion - {booking.get('transfer_type', 'VTC')}")
        c.drawRightString(width - 36, y, f"{breakdown['commission_ht']:.2f} EUR")
        y -= table_row_h

        set_fill(MID_GREY)
        c.drawString(36, y, "Commission HT")
        c.drawRightString(width - 36, y, f"{breakdown['commission_ht']:.2f} EUR")
        y -= table_row_h
        c.drawString(36, y, f"TVA commission ({round_amount(settings['tva_commission_rate'] * 100):.0f}%)")
        c.drawRightString(width - 36, y, f"{breakdown['tva_commission']:.2f} EUR")
        y -= 16

        total_label = "TOTAL COMMISSION TTC"
        total_value = breakdown['commission_ttc']

    # ================================================================
    # TOTAL BOX  — gold fill, prominent amount
    # ================================================================
    legal_lines = []
    if is_order_document:
        legal_lines = [
            "Justification de réservation préalable : Article R3120-2 du code des transports - Arrêté du 6 août 2025."
        ]
    elif document_type != "activity":
        legal_lines = [
            "Conditions : Paiement sous 30 jours. Tout retard entraîne des pénalités de 3 fois le taux d'intérêt légal.",
        ]

    footer_top_y = 60
    show_legal_box = bool(legal_lines) and not is_order_document
    legal_box_y = footer_top_y + 12 if show_legal_box else None
    legal_box_h = 24 + (len(legal_lines) * 11) if show_legal_box else 0
    min_total_start_y = (legal_box_y + legal_box_h + 26) if show_legal_box else (footer_top_y + 44)
    y = max(y - 6, min_total_start_y)

    box_h = 30
    set_fill(DARK_GREY)
    set_stroke(DARK_GREY)
    c.setLineWidth(1.5)
    c.rect(36, y - box_h + 10, width - 72, box_h, fill=1, stroke=1)
    set_fill(WHITE)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(44, y - 4, total_label)
    c.drawRightString(width - 44, y - 4, f"{total_value:.2f} €")
    y -= box_h + 16

    # ================================================================
    # FOOTER  — anchored issuer section + dedicated legal notice block
    # ================================================================
    if show_legal_box:
        set_fill(LIGHT_BG)
        set_stroke(DARK_GREY)
        c.setLineWidth(0.8)
        c.roundRect(36, legal_box_y, width - 72, legal_box_h, 10, fill=1, stroke=1)

        set_fill(GOLD)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(48, legal_box_y + legal_box_h - 14, "Justification réglementaire" if is_order_document else "Mentions légales")

        set_fill(MID_GREY)
        c.setFont("Helvetica", 7.4)
        legal_text_y = legal_box_y + legal_box_h - 26
        for line in legal_lines:
            c.drawString(48, legal_text_y, line)
            legal_text_y -= 10

    set_stroke(GOLD)
    c.setLineWidth(1)
    c.line(36, footer_top_y, width - 36, footer_top_y)

    set_fill(MID_GREY)
    c.setFont("Helvetica", 7.6)
    c.drawCentredString(width / 2, footer_top_y - 11, issuer["name"])
    c.setFont("Helvetica-Oblique", 7.1)
    c.drawCentredString(width / 2, footer_top_y - 21, "Service de transport privé premium")

    c.setFont("Helvetica", 7.1)
    c.drawCentredString(
        width / 2,
        footer_top_y - 33,
        f"{issuer['address']}  |  Tél : {issuer['phone']}"
    )
    c.drawCentredString(
        width / 2,
        footer_top_y - 43,
        f"{issuer['email']}  |  SIRET : {issuer['siret']}"
    )
    if is_order_document and legal_lines:
        c.setFont("Helvetica", 7.2)
        c.drawString(36, 8, legal_lines[0])

    c.showPage()
    c.save()
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

async def generate_and_store_document(booking: dict, settings: dict, document_type: str) -> Tuple[bytes, dict]:
    enriched_booking = {**booking}
    driver_profile = await get_document_driver_profile(booking)
    enriched_booking["issuer"] = await build_document_issuer_profile(booking, settings, driver=driver_profile)
    enriched_booking["document_driver_name"] = (
        booking.get("driver_name")
        or (driver_profile or {}).get("name")
        or settings["company_name"]
    )
    enriched_booking["document_driver_company"] = (
        (driver_profile or {}).get("company_name")
        or (driver_profile or {}).get("name")
        or settings["company_name"]
    )
    enriched_booking["document_driver_phone"] = (
        (driver_profile or {}).get("company_phone")
        or (driver_profile or {}).get("phone")
        or settings.get("company_phone")
        or "À compléter"
    )
    enriched_booking["document_driver_address"] = (
        (driver_profile or {}).get("company_address")
        or (driver_profile or {}).get("address")
        or settings.get("company_address")
        or "À compléter"
    )
    enriched_booking["document_driver_siret"] = (
        (driver_profile or {}).get("company_siret")
        or settings.get("company_siret")
        or "À compléter"
    )
    enriched_booking["document_driver_vtc_number"] = (
        (driver_profile or {}).get("company_vtc_number")
        or settings.get("company_vtc_number")
        or "À compléter"
    )
    enriched_booking["document_driver_vehicle_plate"] = (
        (driver_profile or {}).get("vehicle_plate")
        or booking.get("admin_vehicle_plate")
        or "À compléter"
    )
    resolved_client_tva_rate = get_client_tva_rate_for_booking(booking)

    existing_document = await db.invoices.find_one(
        {"booking_id": booking["id"], "type": document_type},
        {"_id": 0}
    )

    if existing_document:
        existing_pdf = generate_financial_pdf(
            enriched_booking,
            settings,
            document_type,
            existing_document["invoice_number"]
        )
        return existing_pdf, existing_document

    document_number = await get_next_sequential_number()
    pdf_bytes = generate_financial_pdf(enriched_booking, settings, document_type, document_number)
    breakdown = compute_financial_breakdown(
        booking["estimated_price"],
        settings["commission_rate"],
        resolved_client_tva_rate,
        settings["tva_commission_rate"],
        booking.get("commission_override"),
        bool(booking.get("fulfilled_by_admin"))
    )

    if document_type in ("driver", "activity"):
        amount_ttc = breakdown["driver_earning"]
        amount_ht = breakdown["driver_earning"]
        tva_amount = 0.0
        tva_rate = 0.0
    elif document_type == "commission":
        amount_ttc = breakdown["commission_ttc"]
        amount_ht = breakdown["commission_ht"]
        tva_amount = breakdown["tva_commission"]
        tva_rate = settings["tva_commission_rate"]
    else:
        amount_ttc = breakdown["price_ttc"]
        amount_ht = breakdown["price_ht"]
        tva_amount = breakdown["tva_client"]
        tva_rate = resolved_client_tva_rate

    metadata = {
        "id": str(uuid.uuid4()),
        "invoice_number": document_number,
        "booking_id": booking["id"],
        "client_name": booking.get("client_name", "N/A"),
        "client_email": booking.get("client_email", "N/A"),
        "amount_ttc": amount_ttc,
        "amount_ht": amount_ht,
        "tva_amount": tva_amount,
        "tva_rate": tva_rate,
        "type": document_type,
        "driver_id": booking.get("driver_id"),
        "driver_name": booking.get("driver_name"),
        "created_at": datetime.now(timezone.utc)
    }
    await db.invoices.insert_one(metadata)
    return pdf_bytes, metadata

# ==================== EMAIL SERVICE ====================

def get_logo_url() -> str:
    """Return the absolute public URL for the Econnect VTC logo."""
    return f"{FRONTEND_URL.rstrip('/')}/photo/logo.png"


def _ensure_stripe_configured():
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Configuration Stripe absente")


def _safe_frontend_url(path: Optional[str], fallback: str, extra_params: Optional[List[Tuple[str, str]]] = None) -> str:
    target_path = (path or fallback).strip()
    if not target_path.startswith("/"):
        target_path = fallback
    params = urlencode([(k, v) for k, v in (extra_params or []) if v is not None])
    params = params.replace("%7BCHECKOUT_SESSION_ID%7D", "{CHECKOUT_SESSION_ID}")
    if params:
        delimiter = "&" if "?" in target_path else "?"
        target_path = f"{target_path}{delimiter}{params}"
    return f"{FRONTEND_URL}{target_path}"


def _stripe_value(obj, key: str, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _normalized_stripe_value(obj, key: str) -> str:
    return str(_stripe_value(obj, key) or "").lower()


def _resolve_refund_payment_status(booking: dict, refund_amount: Optional[float]) -> Optional[str]:
    if refund_amount is None:
        return None
    paid_amount = booking.get("paid_amount")
    if paid_amount is None:
        paid_amount = booking.get("estimated_price")
    if paid_amount is None:
        return "refunded"
    if round_amount(refund_amount) < round_amount(float(paid_amount)):
        return "partially_refunded"
    return "refunded"


async def _refund_booking_payment(booking: dict, amount: Optional[float], initiated_by: str) -> dict:
    existing_refund_id = booking.get("stripe_refund_id")
    existing_payment_status = booking.get("payment_status")
    if existing_refund_id or existing_payment_status in {"refunded", "partially_refunded"}:
        return {
            "stripe_refund_id": existing_refund_id,
            "refund_amount": booking.get("refund_amount"),
            "refund_currency": booking.get("refund_currency") or booking.get("paid_currency"),
            "refund_status": booking.get("refund_status") or "succeeded",
            "refunded_at": booking.get("refunded_at"),
            "refund_initiated_by": booking.get("refund_initiated_by"),
        }

    if booking.get("payment_status") != "paid" or not booking.get("stripe_payment_intent_id"):
        return {
            "stripe_refund_id": None,
            "refund_amount": None,
            "refund_currency": None,
            "refund_status": "none",
            "refunded_at": None,
            "refund_initiated_by": None,
        }

    paid_amount = booking.get("paid_amount")
    if paid_amount is None:
        paid_amount = booking.get("estimated_price")
    if paid_amount is None:
        raise HTTPException(status_code=400, detail="Montant payé introuvable pour cette réservation")
    paid_amount = round_amount(float(paid_amount))

    partial_refund = amount is not None
    if partial_refund:
        requested_amount = round_amount(float(amount))
        if requested_amount <= 0 or requested_amount > paid_amount:
            raise HTTPException(status_code=400, detail=f"Montant de remboursement invalide. Il doit être > 0 et <= {paid_amount:.2f}")
        refund_amount = requested_amount
    else:
        refund_amount = paid_amount

    _ensure_stripe_configured()

    refund_payload = {"payment_intent": booking["stripe_payment_intent_id"]}
    if partial_refund:
        refund_payload["amount"] = int(round(refund_amount * 100))

    try:
        stripe_refund = stripe.Refund.create(**refund_payload)
    except stripe.error.StripeError as exc:
        raise HTTPException(status_code=502, detail=f"Échec du remboursement Stripe: {str(exc)}")

    refunded_at = datetime.now(timezone.utc)
    refund_created_at = _stripe_value(stripe_refund, "created")
    if refund_created_at:
        refunded_at = datetime.fromtimestamp(float(refund_created_at), tz=timezone.utc)

    refund_amount_value = _stripe_amount_to_float(_stripe_value(stripe_refund, "amount"))
    if refund_amount_value is None:
        refund_amount_value = refund_amount
    refund_currency = (_stripe_value(stripe_refund, "currency") or booking.get("paid_currency") or "EUR").upper()

    return {
        "stripe_refund_id": _stripe_value(stripe_refund, "id"),
        "refund_amount": round_amount(float(refund_amount_value)),
        "refund_currency": refund_currency,
        "refund_status": _normalized_stripe_value(stripe_refund, "status") or "pending",
        "refunded_at": refunded_at,
        "refund_initiated_by": initiated_by,
    }


def build_email_html(
    title: str,
    body_html: str,
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
) -> str:
    """
    Build a responsive HTML email with a branded header (logo), body, optional CTA
    button, and a footer.  All styles are inline for maximum email-client compatibility.
    Layout is table-based so it renders correctly in Outlook.
    """
    logo_url = get_logo_url()
    current_year = datetime.now(timezone.utc).year

    cta_block = ""
    if cta_label and cta_url:
        cta_block = f"""
        <tr>
          <td align="center" style="padding: 24px 0 8px 0;">
            <a href="{cta_url}"
               style="display: inline-block; background-color: #D4AF37; color: #0A0A0A;
                      font-family: Arial, sans-serif; font-size: 15px; font-weight: bold;
                      text-decoration: none; padding: 14px 32px; border-radius: 8px;">
              {cta_label}
            </a>
          </td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0A0A0A; font-family: Arial, sans-serif;">

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color: #0A0A0A; padding: 32px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width: 600px; width: 100%; background-color: #141414;
                      border-radius: 12px; border: 1px solid #2A2A2A; overflow: hidden;">

          <!-- Header with logo -->
          <tr>
            <td align="center"
                style="background-color: #0A0A0A; padding: 28px 32px;
                       border-bottom: 1px solid #D4AF37;">
              <img src="{logo_url}" alt="Econnect VTC"
                   width="160" height="auto"
                   style="display: block; max-width: 160px; height: auto;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px 8px 40px; color: #FAFAFA;">

              <!-- Title -->
              <h1 style="margin: 0 0 24px 0; font-size: 22px; font-weight: bold;
                         color: #D4AF37; border-bottom: 1px solid #2A2A2A;
                         padding-bottom: 16px;">
                {title}
              </h1>

              <!-- Dynamic body -->
              <div style="color: #FAFAFA; font-size: 15px; line-height: 1.6;">
                {body_html}
              </div>

            </td>
          </tr>

          <!-- CTA -->
          {f'''<tr><td style="padding: 0 40px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              {cta_block}
            </table>
          </td></tr>''' if cta_block else ""}

          <!-- Spacer -->
          <tr><td style="height: 32px;"></td></tr>

          <!-- Footer -->
          <tr>
            <td align="center"
                style="background-color: #0A0A0A; padding: 20px 32px;
                       border-top: 1px solid #2A2A2A;">
              <p style="margin: 0 0 4px 0; color: #D4AF37; font-size: 13px;
                        font-weight: bold; letter-spacing: 1px;">
                ECONNECT VTC
              </p>
              <p style="margin: 0 0 4px 0; color: #A1A1AA; font-size: 12px;">
                Service de transport privé premium
              </p>
              <p style="margin: 0; color: #A1A1AA; font-size: 11px;">
                &copy; {current_year} Econnect VTC. Tous droits réservés.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
  <!-- /Outer wrapper -->

</body>
</html>"""


async def send_notification_email(
    to_email: str,
    subject: str,
    html_content: str,
    attachment_bytes: Optional[bytes] = None,
    attachment_filename: Optional[str] = None,
):
    """Send email notification via SendGrid"""
    sendgrid_key = os.environ.get('SENDGRID_API_KEY')
    sender_email = os.environ.get('SENDER_EMAIL', 'noreply@econnect-vtc.com')

    if not sendgrid_key:
        logger.warning("SendGrid API key not configured, skipping email")
        return False

    try:
        message = Mail(
            from_email=sender_email,
            to_emails=to_email,
            subject=subject,
            html_content=html_content
        )
        if attachment_bytes:
            filename = attachment_filename or "document.pdf"
            encoded_file = b64encode(attachment_bytes).decode()
            message.attachment = Attachment(
                FileContent(encoded_file),
                FileName(filename),
                FileType("application/pdf"),
                Disposition("attachment"),
            )
        sg = SendGridAPIClient(sendgrid_key)
        response = sg.send(message)
        return response.status_code == 202
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False


async def send_booking_notification_to_driver(driver: dict, booking: dict, client: dict, order_download_url: Optional[str] = None):
    """Send notification to driver when a booking is assigned"""
    subject = f"🚗 Nouvelle course assignée - {booking['pickup_date']} à {booking['pickup_time']}"

    notes_row = (
        f"<tr><td style='padding: 6px 0; color: #A1A1AA; font-size: 13px;'>Notes</td>"
        f"<td style='padding: 6px 0; color: #FAFAFA;'>{booking.get('notes', '')}</td></tr>"
        if booking.get('notes') else ""
    )

    body_html = f"""
<h2 style="margin: 0 0 12px 0; font-size: 16px; color: #FAFAFA;">Détails du client</h2>
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="font-size: 14px; margin-bottom: 24px;">
  <tr>
    <td style="padding: 6px 0; color: #A1A1AA; width: 40%;">Nom</td>
    <td style="padding: 6px 0; color: #FAFAFA;">{client.get('name', 'N/A')}</td>
  </tr>
  <tr>
    <td style="padding: 6px 0; color: #A1A1AA;">Téléphone</td>
    <td style="padding: 6px 0; color: #FAFAFA;">{client.get('phone', 'N/A')}</td>
  </tr>
  <tr>
    <td style="padding: 6px 0; color: #A1A1AA;">Email</td>
    <td style="padding: 6px 0; color: #FAFAFA;">{client.get('email', 'N/A')}</td>
  </tr>
</table>

<h2 style="margin: 0 0 12px 0; font-size: 16px; color: #FAFAFA;">Détails de la course</h2>
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="font-size: 14px; margin-bottom: 16px;">
  <tr>
    <td style="padding: 6px 0; color: #A1A1AA; width: 40%;">&#128197; Date</td>
    <td style="padding: 6px 0; color: #FAFAFA;">{booking['pickup_date']}</td>
  </tr>
  <tr>
    <td style="padding: 6px 0; color: #A1A1AA;">&#9200; Heure</td>
    <td style="padding: 6px 0; color: #FAFAFA;">{booking['pickup_time']}</td>
  </tr>
  <tr>
    <td style="padding: 6px 0; color: #A1A1AA;">&#128205; Départ</td>
    <td style="padding: 6px 0; color: #FAFAFA;">{booking['pickup_address']}</td>
  </tr>
  <tr>
    <td style="padding: 6px 0; color: #A1A1AA;">&#127937; Arrivée</td>
    <td style="padding: 6px 0; color: #FAFAFA;">{booking['dropoff_address']}</td>
  </tr>
  <tr>
    <td style="padding: 6px 0; color: #A1A1AA;">Type</td>
    <td style="padding: 6px 0; color: #FAFAFA;">{booking['transfer_type']}</td>
  </tr>
  {notes_row}
</table>

{'<p style="color: #A1A1AA; font-size: 13px; margin: 0;">Connectez-vous à votre espace chauffeur pour confirmer.</p>' if not order_download_url else ""}
"""

    cta_label = "Télécharger le bon de commande" if order_download_url else None

    html_content = build_email_html(
        title="Nouvelle course assignée",
        body_html=body_html,
        cta_label=cta_label,
        cta_url=order_download_url,
    )
    await send_notification_email(driver['email'], subject, html_content)


async def send_booking_confirmation_to_client(booking: dict):
    paid_amount = booking.get("paid_amount") if booking.get("paid_amount") is not None else booking.get("estimated_price")
    amount_label = f"{float(paid_amount):.2f} €" if paid_amount is not None else "Montant indisponible"
    currency = (booking.get("paid_currency") or "EUR").upper()
    subject = f"✅ Confirmation de réservation #{booking.get('id', '')[:8].upper()} - Econnect VTC"

    body_html = f"""
<p style="margin: 0 0 12px 0;">Votre paiement a bien été confirmé. Merci pour votre réservation.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size: 14px; margin-bottom: 16px;">
  <tr><td style="padding: 6px 0; color: #A1A1AA; width: 40%;">Numéro</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('id')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Date</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('pickup_date')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Heure</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('pickup_time')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Départ</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('pickup_address')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Arrivée</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('dropoff_address')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Montant payé</td><td style="padding: 6px 0; color: #FAFAFA;">{amount_label} ({currency})</td></tr>
</table>
"""

    html_content = build_email_html(
        title="Réservation confirmée",
        body_html=body_html,
        cta_label="Voir mes réservations",
        cta_url=f"{FRONTEND_URL}/fr/client/bookings"
    )
    await send_notification_email(booking["client_email"], subject, html_content)


async def send_invoice_to_client(booking: dict):
    booking_id = booking.get("id")
    client_email = booking.get("client_email")
    if not booking_id or not client_email:
        return False

    if booking.get("invoice_email_sent_at"):
        return False

    try:
        existing_flag = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "invoice_email_sent_at": 1})
        if existing_flag and existing_flag.get("invoice_email_sent_at"):
            return False

        settings = await get_commission_settings()
        pdf_bytes, _ = await generate_and_store_document(booking, settings, "invoice")

        amount_raw = booking.get("paid_amount") if booking.get("paid_amount") is not None else booking.get("estimated_price")
        try:
            amount_ttc = round_amount(float(amount_raw)) if amount_raw is not None else 0.0
        except (TypeError, ValueError):
            amount_ttc = 0.0

        safe_booking_id = html_escape(str(booking.get("id", "")))
        safe_pickup_date = html_escape(str(booking.get("pickup_date", "")))
        safe_pickup_time = html_escape(str(booking.get("pickup_time", "")))
        safe_pickup_address = html_escape(str(booking.get("pickup_address", "")))
        safe_dropoff_address = html_escape(str(booking.get("dropoff_address", "")))

        body_html = f"""
<p style="margin: 0 0 12px 0;">Votre course est terminée. Veuillez trouver votre facture en pièce jointe.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size: 14px; margin-bottom: 16px;">
  <tr><td style="padding: 6px 0; color: #A1A1AA; width: 40%;">Numéro</td><td style="padding: 6px 0; color: #FAFAFA;">{safe_booking_id}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Date</td><td style="padding: 6px 0; color: #FAFAFA;">{safe_pickup_date}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Heure</td><td style="padding: 6px 0; color: #FAFAFA;">{safe_pickup_time}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Départ</td><td style="padding: 6px 0; color: #FAFAFA;">{safe_pickup_address}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Arrivée</td><td style="padding: 6px 0; color: #FAFAFA;">{safe_dropoff_address}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Montant TTC</td><td style="padding: 6px 0; color: #FAFAFA;">{amount_ttc:.2f} €</td></tr>
</table>
"""

        html_content = build_email_html(
            title="Votre facture Econnect VTC",
            body_html=body_html,
            cta_label="Voir mes réservations",
            cta_url=f"{FRONTEND_URL}/fr/client/bookings",
        )

        sent = await send_notification_email(
            client_email,
            f"📄 Votre facture Econnect VTC #{str(booking_id)[:8].upper()}",
            html_content,
            attachment_bytes=pdf_bytes,
            attachment_filename=f"facture-{str(booking_id)[:8].upper()}.pdf",
        )
        if sent:
            await db.bookings.update_one(
                {"id": booking_id, "invoice_email_sent_at": {"$exists": False}},
                {"$set": {"invoice_email_sent_at": datetime.now(timezone.utc)}},
            )
        return sent
    except Exception as exc:
        logger.error(f"Failed to send invoice email for booking {booking_id}: {exc}")
        return False


async def send_refund_confirmation_to_client(booking: dict, refund_trace: dict):
    if not booking.get("client_email"):
        return

    booking_reference = str(booking.get("id") or "").strip()[:8].upper() or "INCONNU"
    refund_amount = refund_trace.get("refund_amount")
    refund_currency = (refund_trace.get("refund_currency") or booking.get("paid_currency") or "EUR").upper()
    amount_label = f"{float(refund_amount):.2f} {refund_currency}" if refund_amount is not None else "Montant indisponible"
    subject = f"💸 Remboursement effectué - Réservation #{booking_reference} - Econnect VTC"
    stripe_refund_row = ""
    if refund_trace.get("stripe_refund_id"):
        stripe_refund_row = (
            "<tr><td style='padding: 6px 0; color: #A1A1AA;'>Référence Stripe</td>"
            f"<td style='padding: 6px 0; color: #FAFAFA;'>{refund_trace.get('stripe_refund_id')}</td></tr>"
        )

    body_html = f"""
<p style="margin: 0 0 12px 0;">Votre réservation a été annulée et votre remboursement Stripe a bien été déclenché.</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size: 14px; margin-bottom: 16px;">
  <tr><td style="padding: 6px 0; color: #A1A1AA; width: 40%;">Numéro</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('id')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Date</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('pickup_date')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Heure</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('pickup_time')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Départ</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('pickup_address')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Arrivée</td><td style="padding: 6px 0; color: #FAFAFA;">{booking.get('dropoff_address')}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Montant remboursé</td><td style="padding: 6px 0; color: #FAFAFA;">{amount_label}</td></tr>
  <tr><td style="padding: 6px 0; color: #A1A1AA;">Statut</td><td style="padding: 6px 0; color: #FAFAFA;">{refund_trace.get('refund_status') or 'pending'}</td></tr>
  {stripe_refund_row}
</table>
"""

    html_content = build_email_html(
        title="Remboursement effectué",
        body_html=body_html,
        cta_label="Voir mes réservations",
        cta_url=f"{FRONTEND_URL}/fr/client/bookings"
    )
    await send_notification_email(booking["client_email"], subject, html_content)

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate, response: Response):
    # Check if email exists
    existing = await db.users.find_one({"email": user_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email.lower(),
        "name": user_data.name,
        "phone": user_data.phone,
        "password_hash": hash_password(user_data.password),
        "role": "client",  # Default role for registration
        "created_at": datetime.now(timezone.utc)
    }

    await db.users.insert_one(user_doc)

    access_token = create_access_token(user_id, user_doc["email"], user_doc["role"])
    refresh_token = create_refresh_token(user_id)

    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

    return {
        "id": user_id,
        "email": user_doc["email"],
        "name": user_doc["name"],
        "phone": user_doc["phone"],
        "role": user_doc["role"]
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin, response: Response):
    user = await db.users.find_one({"email": credentials.email.lower()})
    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    if not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    access_token = create_access_token(user["id"], user["email"], user["role"])
    refresh_token = create_refresh_token(user["id"])

    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")

    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "phone": user.get("phone"),
        "role": user["role"]
    }

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Déconnecté avec succès"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

@api_router.post("/auth/forgot-password")
async def forgot_password(data: PasswordResetRequest):
    """Request a password reset. Always returns success to avoid email enumeration."""
    user = await db.users.find_one({"email": data.email.lower()})
    if user:
        # Invalidate existing unused tokens for this user
        await db.password_reset_tokens.update_many(
            {"user_id": user["id"], "used": False},
            {"$set": {"used": True}}
        )

        raw_token = secrets.token_urlsafe(32)
        # Store a SHA-256 hash as a fast lookup key (sufficient for high-entropy random tokens)
        token_lookup_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        token_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await db.password_reset_tokens.insert_one({
            "id": token_id,
            "user_id": user["id"],
            "token_hash": token_lookup_hash,
            "expires_at": now + timedelta(hours=24),
            "used": False,
            "created_at": now
        })

        frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
        reset_link = f"{frontend_url}/reset-password?token={raw_token}"

        reset_body = """
<p style="margin: 0 0 16px 0;">Bonjour,</p>
<p style="margin: 0 0 16px 0;">Vous avez demandé la réinitialisation de votre mot de passe Econnect VTC.</p>
<p style="margin: 0 0 24px 0;">Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :</p>
<p style="margin: 24px 0 8px 0; color: #A1A1AA; font-size: 13px;">
  Ce lien est valide pendant <strong style="color: #FAFAFA;">24 heures</strong>.
</p>
<p style="margin: 0; color: #A1A1AA; font-size: 13px;">
  Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
</p>
"""
        html_content = build_email_html(
            title="Réinitialisation de votre mot de passe",
            body_html=reset_body,
            cta_label="Réinitialiser mon mot de passe",
            cta_url=reset_link,
        )
        await send_notification_email(user["email"], "Réinitialisation de votre mot de passe - Econnect VTC", html_content)
        logger.info(f"Password reset token generated for user {user['id']}")

    return {"message": "Si cet email existe, un lien de réinitialisation a été envoyé."}

def _hash_reset_token(token: str) -> str:
    """Return the SHA-256 hex digest of a raw reset token for indexed lookup."""
    return hashlib.sha256(token.encode()).hexdigest()

async def _find_reset_token_record(token: str) -> Optional[dict]:
    """Return the unexpired, unused token document for *token*, or None."""
    lookup_hash = _hash_reset_token(token)
    record = await db.password_reset_tokens.find_one(
        {"token_hash": lookup_hash, "used": False}
    )
    if record is None:
        return None
    expires_at = record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= expires_at:
        return None
    return record

@api_router.get("/auth/verify-reset-token/{token}")
async def verify_reset_token(token: str):
    """Check whether a password-reset token is still valid (does not consume it)."""
    record = await _find_reset_token_record(token)
    if record is None:
        raise HTTPException(status_code=400, detail="Token invalide ou expiré")
    return {"valid": True}

@api_router.post("/auth/reset-password")
async def reset_password(data: PasswordResetConfirm):
    """Reset the user password using a valid token."""
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Le mot de passe doit contenir au moins 8 caractères")

    record = await _find_reset_token_record(data.token)
    if record is None:
        raise HTTPException(status_code=400, detail="Token invalide ou expiré")

    new_hash = hash_password(data.new_password)
    await db.users.update_one(
        {"id": record["user_id"]},
        {"$set": {"password_hash": new_hash}}
    )
    await db.password_reset_tokens.update_one(
        {"id": record["id"]},
        {"$set": {"used": True}}
    )
    logger.info(f"Password reset successful for user {record['user_id']}")
    return {"message": "Mot de passe réinitialisé avec succès"}

# ==================== CLIENT ROUTES ====================

def _build_client_booking_doc(user: dict, booking: BookingCreate, vehicle_category_name: Optional[str]) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "client_id": user["id"],
        "client_name": user["name"],
        "client_email": user["email"],
        "client_phone": user.get("phone"),
        "pickup_address": booking.pickup_address,
        "dropoff_address": booking.dropoff_address,
        "pickup_lat": booking.pickup_lat,
        "pickup_lng": booking.pickup_lng,
        "dropoff_lat": booking.dropoff_lat,
        "dropoff_lng": booking.dropoff_lng,
        "pickup_date": booking.pickup_date,
        "pickup_time": booking.pickup_time,
        "transfer_type": booking.transfer_type,
        "vehicle_category_id": booking.vehicle_category_id,
        "vehicle_category_name": vehicle_category_name,
        "distance_km": booking.distance_km,
        "duration_minutes": booking.duration_minutes,
        "estimated_price": booking.estimated_price,
        "notes": booking.notes,
        "disposition_hours": booking.disposition_hours,
        "status": "DRAFT",
        "payment_status": "pending",
        "payment_completed_at": None,
        "stripe_checkout_session_id": None,
        "stripe_payment_intent_id": None,
        "paid_amount": None,
        "paid_currency": None,
        "driver_id": None,
        "driver_name": None,
        "driver_display_name": None,
        "commission_override": None,
        "fulfilled_by_admin": None,
        "cancellation_reason": None,
        "driver_cancellation_reason": None,
        "cancellation_previous_status": None,
        "refund_amount": None,
        "refunded_at": None,
        "stripe_refund_id": None,
        "refund_status": None,
        "refund_currency": None,
        "refund_initiated_by": None,
        "created_at": datetime.now(timezone.utc),
        "assigned_at": None
    }


async def resolve_vehicle_category_name(category_ref: Optional[str]) -> Optional[str]:
    if category_ref is None:
        return None

    normalized_ref = str(category_ref).strip()
    if not normalized_ref:
        return None

    category = await db.vehicle_categories.find_one({"id": normalized_ref})
    if category and category.get("name"):
        return category["name"]

    category = await db.vehicle_categories.find_one({"name": normalized_ref})
    if category and category.get("name"):
        return category["name"]

    category = await db.vehicle_categories.find_one(
        {"name": {"$regex": f"^{re.escape(normalized_ref)}$", "$options": "i"}}
    )
    if category and category.get("name"):
        return category["name"]

    return normalized_ref


@api_router.post("/bookings", response_model=BookingResponse)
async def create_booking(booking: BookingCreate, request: Request):
    user = await get_current_user(request)

    vehicle_category_name = await resolve_vehicle_category_name(booking.vehicle_category_id)

    booking_doc = _build_client_booking_doc(user, booking, vehicle_category_name)

    await db.bookings.insert_one(booking_doc)
    booking_doc.pop("_id", None)
    return BookingResponse(**booking_doc)


@api_router.post("/bookings/checkout", response_model=BookingCheckoutResponse)
async def create_booking_checkout(booking: BookingCheckoutCreate, request: Request):
    _ensure_stripe_configured()
    user = await get_current_user(request)

    estimated_price = booking.estimated_price
    if estimated_price is None or not isinstance(estimated_price, (int, float)) or float(estimated_price) <= 0:
        raise HTTPException(status_code=400, detail="Le montant estimé est requis pour le paiement")

    vehicle_category_name = await resolve_vehicle_category_name(booking.vehicle_category_id)

    booking_doc = _build_client_booking_doc(user, booking, vehicle_category_name)
    await db.bookings.insert_one(booking_doc)

    unit_amount = int(round(float(estimated_price) * 100))
    success_url = _safe_frontend_url(
        booking.success_path,
        "/fr/booking/confirmation",
        [("booking_id", booking_doc["id"]), ("session_id", "{CHECKOUT_SESSION_ID}")]
    )
    cancel_url = _safe_frontend_url(
        booking.cancel_path,
        "/fr/booking/cancel",
        [("booking_id", booking_doc["id"])]
    )

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            payment_method_types=["card"],
            line_items=[{
                "quantity": 1,
                "price_data": {
                    "currency": "eur",
                    "unit_amount": unit_amount,
                    "product_data": {
                        "name": f"Réservation VTC #{booking_doc['id'][:8].upper()}",
                        "description": f"{booking_doc['pickup_address']} → {booking_doc['dropoff_address']}"
                    },
                }
            }],
            customer_email=user["email"],
            metadata={
                "booking_id": booking_doc["id"],
                "client_id": user["id"]
            },
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except Exception as exc:
        await db.bookings.update_one(
            {"id": booking_doc["id"]},
            {"$set": {"payment_status": "failed"}}
        )
        raise HTTPException(status_code=502, detail=f"Impossible de créer la session Stripe: {exc}")

    await db.bookings.update_one(
        {"id": booking_doc["id"]},
        {"$set": {"stripe_checkout_session_id": _stripe_value(session, "id")}}
    )

    return BookingCheckoutResponse(
        booking_id=booking_doc["id"],
        checkout_url=_stripe_value(session, "url"),
        session_id=_stripe_value(session, "id"),
        publishable_key=STRIPE_PUBLISHABLE_KEY
    )

@api_router.get("/bookings/my", response_model=List[BookingResponse])
async def get_my_bookings(request: Request):
    user = await get_current_user(request)
    bookings = await db.bookings.find({"client_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [BookingResponse(**b) for b in bookings]

@api_router.get("/bookings/{booking_id}", response_model=BookingResponse)
async def get_booking_detail_client(booking_id: str, request: Request):
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("client_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé à cette réservation")
    return BookingResponse(**booking)


def _is_paid_checkout_session(session: dict) -> bool:
    payment_status = _normalized_stripe_value(session, "payment_status")
    session_status = _normalized_stripe_value(session, "status")
    return payment_status == "paid" or session_status == "complete"


def _stripe_amount_to_float(amount) -> Optional[float]:
    if isinstance(amount, (int, float)):
        return round(float(amount) / 100, 2)
    return None


async def _mark_booking_paid(session: dict) -> Tuple[Optional[dict], bool]:
    metadata = _stripe_value(session, "metadata") or {}
    booking_id = _stripe_value(metadata, "booking_id")
    if not booking_id:
        return None, False

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        return None, False

    if booking.get("payment_status") == "paid" or not _is_paid_checkout_session(session):
        return booking, False

    paid_amount = _stripe_amount_to_float(_stripe_value(session, "amount_total"))
    update_result = await db.bookings.update_one(
        {"id": booking_id, "payment_status": {"$ne": "paid"}},
        {"$set": {
            "payment_status": "paid",
            "status": "QUOTE_ACCEPTED",
            "payment_completed_at": datetime.now(timezone.utc),
            "stripe_checkout_session_id": _stripe_value(session, "id"),
            "stripe_payment_intent_id": _stripe_value(session, "payment_intent"),
            "paid_amount": paid_amount,
            "paid_currency": (_stripe_value(session, "currency") or "eur").upper(),
        }}
    )
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if update_result.modified_count == 0:
        return booking, False

    if booking and booking.get("client_email"):
        await send_booking_confirmation_to_client(booking)
    return booking, True


@api_router.post("/bookings/{booking_id}/confirm-payment", response_model=BookingPaymentConfirmationResponse)
async def confirm_booking_payment(
    booking_id: str,
    payload: BookingPaymentConfirmationRequest,
    request: Request
):
    _ensure_stripe_configured()
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("client_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé à cette réservation")

    try:
        session = stripe.checkout.Session.retrieve(payload.session_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Impossible de vérifier le paiement Stripe: {exc}")

    session_booking_id = _stripe_value(_stripe_value(session, "metadata") or {}, "booking_id")
    if session_booking_id != booking_id:
        raise HTTPException(status_code=400, detail="La session Stripe ne correspond pas à cette réservation")

    stored_session_id = booking.get("stripe_checkout_session_id")
    if not stored_session_id:
        raise HTTPException(status_code=409, detail="Session de paiement introuvable pour cette réservation")
    if stored_session_id != _stripe_value(session, "id"):
        raise HTTPException(status_code=400, detail="La session Stripe ne correspond pas à cette réservation")

    updated_booking, _ = await _mark_booking_paid(session)
    resolved_booking = updated_booking or await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not resolved_booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    return BookingPaymentConfirmationResponse(
        verified=resolved_booking.get("payment_status") == "paid",
        payment_status=resolved_booking.get("payment_status") or _stripe_value(session, "payment_status"),
        booking=BookingResponse(**resolved_booking)
    )


async def _handle_checkout_session_completed(session: dict):
    await _mark_booking_paid(session)


@api_router.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    _ensure_stripe_configured()
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook Stripe non configuré")

    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, signature, STRIPE_WEBHOOK_SECRET)
    except ValueError:
        raise HTTPException(status_code=400, detail="Payload webhook invalide")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Signature webhook Stripe invalide")

    if _stripe_value(event, "type") == "checkout.session.completed":
        data = _stripe_value(event, "data") or {}
        await _handle_checkout_session_completed(_stripe_value(data, "object", {}))

    return {"received": True}

@api_router.post("/bookings/{booking_id}/cancel-request")
async def request_booking_cancellation(booking_id: str, payload: BookingCancelRequest, request: Request):
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("client_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé à cette réservation")

    if normalize_booking_status(booking.get("status")) not in ["DRAFT", "ASSIGNED"]:
        raise HTTPException(status_code=400, detail="Cette réservation ne peut pas être annulée")

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "status": "cancellation_requested",
            "cancellation_reason": payload.cancellation_reason,
            "cancellation_previous_status": booking.get("status")
        }}
    )
    return {"message": "Demande d'annulation envoyée"}

@api_router.put("/bookings/{booking_id}")
async def update_booking(booking_id: str, payload: dict, request: Request):
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("client_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")
    if normalize_booking_status(booking.get("status")) not in ("DRAFT", "QUOTE_SENT", "QUOTE_ACCEPTED"):
        raise HTTPException(status_code=400, detail="Impossible de modifier cette réservation")
    allowed_fields = ["pickup_address", "dropoff_address", "pickup_date", "pickup_time", "notes", "transfer_type"]
    update_data = {k: v for k, v in payload.items() if k in allowed_fields}
    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})
    return await db.bookings.find_one({"id": booking_id}, {"_id": 0})


async def _get_course_for_user(course_id: str, request: Request) -> Tuple[dict, dict]:
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": course_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Course non trouvée")

    role = user.get("role")
    if role == "admin":
        return user, booking
    if role == "driver" and booking.get("driver_id") == user.get("id"):
        return user, booking
    if role == "client" and booking.get("client_id") == user.get("id"):
        return user, booking

    raise HTTPException(status_code=403, detail="Accès refusé à cette course")


@api_router.patch("/courses/{course_id}/status", response_model=CourseStatusUpdateResponse)
async def update_course_status(course_id: str, payload: BookingStatusUpdate, request: Request):
    user, booking = await _get_course_for_user(course_id, request)
    previous_status = normalize_booking_status(booking.get("status"))
    next_status = normalize_booking_status(payload.status)

    role = user.get("role")
    if role != "admin":
        can_client_accept_quote = (
            role == "client"
            and next_status == "QUOTE_ACCEPTED"
            and previous_status == "QUOTE_SENT"
            and booking.get("client_id") == user.get("id")
        )
        if not can_client_accept_quote:
            raise HTTPException(status_code=403, detail="Seul l'administrateur peut effectuer cette transition")

    validate_booking_status_transition(previous_status, next_status)
    await db.bookings.update_one({"id": course_id}, {"$set": {"status": next_status}})
    await log_booking_status_transition(course_id, previous_status, next_status, user.get("id"))

    if next_status == "COMPLETED" and previous_status != "COMPLETED":
        updated_booking = await db.bookings.find_one({"id": course_id}, {"_id": 0})
        if updated_booking:
            await send_invoice_to_client(updated_booking)

    return CourseStatusUpdateResponse(message="Statut mis à jour", status=next_status)


@api_router.post("/courses/{course_id}/quote", response_model=CourseDocumentResponse)
async def create_course_quote(course_id: str, request: Request):
    admin = await require_admin(request)
    booking = await db.bookings.find_one({"id": course_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Course non trouvée")

    current_status = normalize_booking_status(booking.get("status"))
    if current_status not in {"DRAFT", "QUOTE_SENT"}:
        raise HTTPException(status_code=400, detail="Le devis ne peut être généré que tant qu'il n'est pas accepté")

    document = await create_course_document(
        booking,
        "quote",
        "sent",
        created_by=admin.get("id"),
        url=f"/api/courses/{course_id}/quote",
    )
    await db.bookings.update_one({"id": course_id}, {"$set": {"status": "QUOTE_SENT"}})
    await log_booking_status_transition(course_id, current_status, "QUOTE_SENT", admin.get("id"))
    return CourseDocumentResponse(**document)


@api_router.post("/courses/{course_id}/order-form", response_model=CourseDocumentResponse)
async def create_course_order_form(course_id: str, request: Request):
    admin = await require_admin(request)
    booking = await db.bookings.find_one({"id": course_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Course non trouvée")

    current_status = normalize_booking_status(booking.get("status"))
    if not status_at_or_after(current_status, "QUOTE_ACCEPTED"):
        raise HTTPException(status_code=400, detail="Le bon de commande nécessite un devis accepté")

    settings = await get_commission_settings()
    await generate_and_store_document(booking, settings, "order")
    document = await create_course_document(
        booking,
        "order_form",
        "issued",
        created_by=admin.get("id"),
        url=f"/api/driver/bookings/{course_id}/order-pdf",
    )

    if current_status == "QUOTE_ACCEPTED":
        await db.bookings.update_one({"id": course_id}, {"$set": {"status": "ORDER_ISSUED"}})
        await log_booking_status_transition(course_id, current_status, "ORDER_ISSUED", admin.get("id"))
    return CourseDocumentResponse(**document)


@api_router.post("/courses/{course_id}/invoice", response_model=CourseDocumentResponse)
async def create_course_invoice(course_id: str, request: Request):
    admin = await require_admin(request)
    booking = await db.bookings.find_one({"id": course_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Course non trouvée")

    current_status = normalize_booking_status(booking.get("status"))
    if not status_at_or_after(current_status, "COMPLETED"):
        raise HTTPException(status_code=400, detail="La facture ne peut être générée qu'après une course terminée")

    settings = await get_commission_settings()
    await generate_and_store_document(booking, settings, "invoice")
    document = await create_course_document(
        booking,
        "invoice",
        "issued",
        created_by=admin.get("id"),
        url=f"/api/client/invoices/{course_id}/pdf",
    )

    if current_status == "COMPLETED":
        await db.bookings.update_one({"id": course_id}, {"$set": {"status": "INVOICED"}})
        await log_booking_status_transition(course_id, current_status, "INVOICED", admin.get("id"))
    return CourseDocumentResponse(**document)


@api_router.get("/courses/{course_id}/documents", response_model=List[CourseDocumentResponse])
async def get_course_documents(course_id: str, request: Request):
    await _get_course_for_user(course_id, request)
    documents = await db.course_documents.find({"course_id": course_id}, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return [CourseDocumentResponse(**doc) for doc in documents]

@api_router.get("/bookings/{booking_id}/comments")
async def get_booking_comments(booking_id: str, request: Request):
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")
    role = user.get("role")
    if role == "client" and booking.get("client_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if role == "driver" and booking.get("driver_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    comments = await db.booking_comments.find({"booking_id": booking_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return comments

@api_router.post("/bookings/{booking_id}/comments")
async def add_booking_comment(booking_id: str, payload: dict, request: Request):
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")
    role = user.get("role")
    if role == "client" and booking.get("client_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    if role == "driver" and booking.get("driver_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    comment_text = payload.get("comment", "").strip()
    if not comment_text:
        raise HTTPException(status_code=400, detail="Empty comment")
    comment = {
        "id": str(uuid.uuid4()),
        "booking_id": booking_id,
        "author_id": user["id"],
        "author_name": user.get("name", "Unknown"),
        "author_role": role,
        "comment": comment_text,
        "created_at": datetime.utcnow().isoformat()
    }
    await db.booking_comments.insert_one(comment)
    comment.pop("_id", None)
    return comment

# ==================== DRIVER ROUTES ====================

@api_router.get("/driver/bookings", response_model=List[BookingResponse])
async def get_driver_bookings(request: Request):
    user = await require_driver(request)
    bookings = await db.bookings.find(
        {"driver_id": user["id"], "status": {"$in": ["ASSIGNED", "IN_PROGRESS", "COMPLETED", "INVOICED", "PAID"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return [BookingResponse(**b) for b in bookings]

@api_router.get("/driver/bookings/{booking_id}", response_model=BookingResponse)
async def get_driver_booking_detail(booking_id: str, request: Request):
    driver = await require_driver(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé à cette réservation")
    return BookingResponse(**booking)

@api_router.get("/driver/bookings/{booking_id}/order-pdf")
async def download_driver_order_pdf(booking_id: str, request: Request):
    driver = await require_driver(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé à ce bon de commande")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "order")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=bon-de-commande-{booking_id}.pdf"}
    )

@api_router.put("/driver/bookings/{booking_id}/status")
async def update_booking_status_driver(booking_id: str, status_update: BookingStatusUpdate, request: Request):
    user = await require_driver(request)

    booking = await db.bookings.find_one({"id": booking_id, "driver_id": user["id"]})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    previous_status = booking.get("status")
    next_status = normalize_booking_status(status_update.status)
    validate_booking_status_transition(previous_status, next_status)

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": next_status}}
    )
    await log_booking_status_transition(booking_id, previous_status, next_status, user.get("id"))

    if next_status == "COMPLETED" and normalize_booking_status(previous_status) != "COMPLETED":
        updated_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if updated_booking:
            await send_invoice_to_client(updated_booking)

    return {"message": "Statut mis à jour", "status": next_status}

@api_router.put("/driver/availability")
async def update_driver_availability(request: Request, is_available: bool = True):
    user = await require_driver(request) 
    await db.users.update_one({"id": user["id"]}, {"$set": {"is_available": is_available}})
    return {"message": "Disponibilité mise à jour", "is_available": is_available}

@api_router.put("/driver/bookings/{booking_id}/cancel")
async def cancel_booking_driver(booking_id: str, payload: DriverCancellationRequest, request: Request):
    driver = await require_driver(request)

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    if booking.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé à cette réservation")

    if normalize_booking_status(booking.get("status")) != "ASSIGNED":
        raise HTTPException(status_code=400, detail="Vous ne pouvez annuler que les courses assignées non démarrées")

    update_data = {
        "status": booking.get("pre_assignment_status") if booking.get("pre_assignment_status") in {"QUOTE_ACCEPTED", "ORDER_ISSUED"} else "QUOTE_ACCEPTED",
        "driver_id": None,
        "driver_name": None,
        "driver_display_name": None,
        "pre_assignment_status": None,
        "assigned_at": None,
        "driver_cancellation_reason": payload.cancellation_reason,
        "cancellation_previous_status": booking.get("status")
    }

    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})

    return {"message": "Vous vous êtes retiré de cette course. Elle sera réassignée.", "status": "QUOTE_ACCEPTED"}

# ==================== ADMIN ROUTES ====================

@api_router.get("/admin/stats", response_model=StatsResponse)
async def get_admin_stats(request: Request):
    await require_admin(request)

    total_bookings = await db.bookings.count_documents({})
    pending_bookings = await db.bookings.count_documents({
        "status": "DRAFT",
        "$or": [
            {"payment_status": {"$exists": False}},
            {"payment_status": {"$ne": "pending"}},
        ]
    })
    assigned_bookings = await db.bookings.count_documents({"status": "ASSIGNED"})
    completed_bookings = await db.bookings.count_documents({"status": "COMPLETED"})
    total_clients = await db.users.count_documents({"role": "client"})
    total_drivers = await db.users.count_documents({"role": "driver"})
    available_drivers = await db.users.count_documents({"role": "driver", "is_available": True})

    return StatsResponse(
        total_bookings=total_bookings,
        pending_bookings=pending_bookings,
        assigned_bookings=assigned_bookings,
        completed_bookings=completed_bookings,
        total_clients=total_clients,
        total_drivers=total_drivers,
        available_drivers=available_drivers
    )

@api_router.get("/admin/bookings", response_model=List[BookingResponse])
async def get_all_bookings(request: Request, status: Optional[str] = None, include_unpaid_pending: bool = False):
    await require_admin(request)

    query = {}
    normalized_status = normalize_booking_status(status) if status else None
    if normalized_status:
        query["status"] = normalized_status
    if not include_unpaid_pending:
        # Admin operational view: only courses in operational workflow (devis validé et après).
        if normalized_status in {"DRAFT", "QUOTE_SENT"}:
            query["status"] = "__none__"
        elif not normalized_status:
            query["status"] = {"$nin": ["DRAFT", "QUOTE_SENT"]}

    bookings = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    for booking in bookings:
        booking["payment_method"] = normalize_payment_method_code(booking.get("payment_method"), fallback=booking.get("notes"))
        booking["payment_status"] = normalize_payment_status_code(booking.get("payment_status")) or "pending"
    return [BookingResponse(**b) for b in bookings]

@api_router.get("/admin/bookings/{booking_id}", response_model=BookingResponse)
async def get_admin_booking_detail(booking_id: str, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    booking["payment_method"] = normalize_payment_method_code(booking.get("payment_method"), fallback=booking.get("notes"))
    booking["payment_status"] = normalize_payment_status_code(booking.get("payment_status")) or "pending"
    return BookingResponse(**booking)

@api_router.post("/admin/bookings/{booking_id}/assign-self")
async def admin_assign_self(booking_id: str, request: Request, body: AdminAssignSelfRequest = None):
    """Admin assigns themselves to a booking and marks it as fulfilled_by_admin (no commission)."""
    admin = await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if normalize_booking_status(booking.get("status")) not in ["QUOTE_ACCEPTED", "ORDER_ISSUED"]:
        raise HTTPException(status_code=400, detail="L'auto-affectation admin est possible uniquement après validation du devis")

    assigned_at = datetime.now(timezone.utc)
    driver_display_name_input = body.driver_display_name if body else ""
    driver_display_name = (
        driver_display_name_input.strip()
        if isinstance(driver_display_name_input, str) and driver_display_name_input.strip()
        else admin["name"]
    )
    update_fields = {
        "driver_id": admin["id"],
        "driver_name": admin["name"],
        "driver_display_name": driver_display_name,
        "status": "ASSIGNED",
        "pre_assignment_status": normalize_booking_status(booking.get("status")),
        "assigned_at": assigned_at,
        "fulfilled_by_admin": True,
        "commission_override": 0.0,
    }

    if body is not None and body.vehicle_id:
        vehicle = await db.admin_vehicles.find_one({"id": body.vehicle_id})
        if vehicle:
            update_fields["admin_vehicle_plate"] = vehicle["plate"]
            update_fields["admin_vehicle_model"] = vehicle["model"]
            update_fields["admin_vehicle_brand"] = vehicle["brand"]

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": update_fields}
    )
    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return BookingResponse(**updated)


@api_router.put("/admin/bookings/{booking_id}/status")
async def update_booking_status_admin(booking_id: str, status_update: BookingStatusUpdate, request: Request):
    admin = await require_admin(request)

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    if booking.get("driver_id") != admin["id"] or booking.get("fulfilled_by_admin") is not True:
        raise HTTPException(
            status_code=403,
            detail="Seul l'admin affecté à cette course peut la démarrer ou la clôturer",
        )

    previous_status = booking.get("status")
    next_status = normalize_booking_status(status_update.status)
    validate_booking_status_transition(previous_status, next_status)

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": next_status}}
    )
    await log_booking_status_transition(booking_id, previous_status, next_status, admin.get("id"))

    if next_status == "COMPLETED" and normalize_booking_status(previous_status) != "COMPLETED":
        updated_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if updated_booking:
            await send_invoice_to_client(updated_booking)

    return {"message": "Statut mis à jour", "status": next_status}

async def _send_admin_booking_notification(booking: dict, is_guest: bool, payment_mode: str) -> None:
    """Send booking notification or guest invitation when admin creates a booking."""
    try:
        client_email = booking.get("client_email")
        client_name = booking.get("client_name", "Client")
        if not client_email:
            return

        price_label = f"{float(booking['estimated_price']):.2f} €" if booking.get("estimated_price") is not None else "À définir"
        distance_label = f"{float(booking['distance_km']):.1f} km" if booking.get("distance_km") is not None else "-"

        trip_rows = f"""
  <tr><td style="padding:6px 0;color:#A1A1AA;">Date</td><td style="padding:6px 0;color:#FAFAFA;">{html_escape(str(booking.get('pickup_date', '')))} à {html_escape(str(booking.get('pickup_time', '')))}</td></tr>
  <tr><td style="padding:6px 0;color:#A1A1AA;">Départ</td><td style="padding:6px 0;color:#FAFAFA;">{html_escape(str(booking.get('pickup_address', '')))}</td></tr>
  <tr><td style="padding:6px 0;color:#A1A1AA;">Arrivée</td><td style="padding:6px 0;color:#FAFAFA;">{html_escape(str(booking.get('dropoff_address', '')))}</td></tr>
  <tr><td style="padding:6px 0;color:#A1A1AA;">Distance</td><td style="padding:6px 0;color:#FAFAFA;">{html_escape(distance_label)}</td></tr>
  <tr><td style="padding:6px 0;color:#A1A1AA;">Prix estimé</td><td style="padding:6px 0;color:#D4AF37;">{html_escape(price_label)}</td></tr>
"""

        if is_guest:
            subject = "Invitation Econnect VTC - Course réservée en votre nom"
            register_url = f"{FRONTEND_URL}/fr/register"
            body_html = f"""
<p style="margin:0 0 12px 0;">Bonjour <strong>{html_escape(client_name)}</strong>,</p>
<p style="margin:0 0 12px 0;">Une course a été réservée en votre nom par notre équipe :</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;margin-bottom:16px;">
{trip_rows}
</table>
<p style="margin:0 0 12px 0;">Pour consulter et valider cette course, créez votre compte Econnect VTC en cliquant sur le bouton ci-dessous.</p>
<p style="margin:0 0 12px 0;font-size:13px;color:#A1A1AA;">
  Après inscription, connectez-vous avec l'adresse email <strong>{html_escape(client_email)}</strong> pour retrouver votre course.
</p>
"""
            html_content = build_email_html(
                title="Course réservée - Créez votre compte",
                body_html=body_html,
                cta_label="Créer mon compte Econnect VTC",
                cta_url=register_url,
            )
            await send_notification_email(client_email, subject, html_content)
        else:
            pickup_date = html_escape(str(booking.get('pickup_date', '')))
            pickup_time = html_escape(str(booking.get('pickup_time', '')))
            subject = f"Nouvelle course créée - {pickup_date} à {pickup_time}"
            payment_note = (
                '<p style="margin:0 0 12px 0;color:#D4AF37;">Le règlement sera demandé ultérieurement par votre conseiller.</p>'
                if payment_mode == "deferred"
                else '<p style="margin:0 0 12px 0;">Votre conseiller vous contactera pour le règlement.</p>'
            )
            body_html = f"""
<p style="margin:0 0 12px 0;">Bonjour <strong>{html_escape(client_name)}</strong>,</p>
<p style="margin:0 0 12px 0;">Une course a été créée pour vous :</p>
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:14px;margin-bottom:16px;">
{trip_rows}
</table>
{payment_note}
"""
            html_content = build_email_html(
                title="Nouvelle course créée",
                body_html=body_html,
                cta_label="Voir mes réservations",
                cta_url=f"{FRONTEND_URL}/fr/client/bookings",
            )
            await send_notification_email(client_email, subject, html_content)
    except Exception as exc:
        logger.error("_send_admin_booking_notification failed: %s", exc)


@api_router.post("/admin/bookings", response_model=BookingResponse)
async def create_admin_booking(booking: AdminBookingCreate, request: Request):
    await require_admin(request)

    # Look up client by email to link client_id
    existing_client = await db.users.find_one({"email": booking.client_email, "role": "client"})
    client_id = existing_client["id"] if existing_client else None
    is_guest = client_id is None

    vehicle_category_name = None
    if booking.vehicle_category_id:
        category = await db.vehicle_categories.find_one({"id": booking.vehicle_category_id})
        if category:
            vehicle_category_name = category["name"]

    payment_mode = booking.payment_mode or "deferred"
    payment_method = normalize_payment_method_code(booking.payment_method)
    payment_status = normalize_payment_status_code(booking.payment_status) or "pending"
    payment_completed_at = datetime.now(timezone.utc) if payment_status == "paid" else None

    booking_doc = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "client_name": booking.client_name,
        "client_email": booking.client_email,
        "client_phone": booking.client_phone,
        "pickup_address": booking.pickup_address,
        "dropoff_address": booking.dropoff_address,
        "pickup_lat": None,
        "pickup_lng": None,
        "dropoff_lat": None,
        "dropoff_lng": None,
        "pickup_date": booking.pickup_date,
        "pickup_time": booking.pickup_time,
        "transfer_type": booking.transfer_type,
        "vehicle_category_id": booking.vehicle_category_id,
        "vehicle_category_name": vehicle_category_name,
        "distance_km": booking.distance_km,
        "duration_minutes": booking.duration_minutes,
        "estimated_price": booking.estimated_price,
        "notes": booking.notes,
        "disposition_hours": booking.disposition_hours,
        "status": "QUOTE_ACCEPTED",
        "payment_status": payment_status,
        "payment_method": payment_method,
        "payment_mode": payment_mode,
        "payment_completed_at": payment_completed_at,
        "stripe_checkout_session_id": None,
        "stripe_payment_intent_id": None,
        "paid_amount": booking.estimated_price if payment_status == "paid" else None,
        "paid_currency": "eur" if payment_status == "paid" else None,
        "driver_id": None,
        "driver_name": None,
        "driver_display_name": None,
        "commission_override": None,
        "fulfilled_by_admin": None,
        "cancellation_reason": None,
        "driver_cancellation_reason": None,
        "cancellation_previous_status": None,
        "refund_amount": None,
        "refunded_at": None,
        "stripe_refund_id": None,
        "refund_status": None,
        "refund_currency": None,
        "refund_initiated_by": None,
        "created_at": datetime.now(timezone.utc),
        "assigned_at": None
    }

    await db.bookings.insert_one(booking_doc)
    booking_doc.pop("_id", None)

    # Send notification email to client
    asyncio.create_task(
        _send_admin_booking_notification(booking_doc, is_guest=is_guest, payment_mode=payment_mode)
    )

    return BookingResponse(**booking_doc)

@api_router.put("/admin/bookings/{booking_id}/assign")
async def assign_booking_to_driver(booking_id: str, assign_data: AssignBooking, request: Request):
    await require_admin(request)

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if normalize_booking_status(booking.get("status")) not in {"QUOTE_ACCEPTED", "ORDER_ISSUED"}:
        raise HTTPException(status_code=400, detail="La course doit être validée (devis accepté) avant assignation")

    driver = await db.users.find_one({"id": assign_data.driver_id, "role": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Chauffeur non trouvé")

    assigned_at = datetime.now(timezone.utc)
    updated_booking = {
        **booking,
        "driver_id": driver["id"],
        "driver_name": driver["name"],
        "driver_display_name": driver["name"],
        "pre_assignment_status": normalize_booking_status(booking.get("status")),
        "status": "ASSIGNED",
        "assigned_at": assigned_at
    }
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "driver_id": driver["id"],
            "driver_name": driver["name"],
            "driver_display_name": driver["name"],
            "pre_assignment_status": normalize_booking_status(booking.get("status")),
            "status": "ASSIGNED",
            "assigned_at": assigned_at
        }}
    )
    settings = await get_commission_settings()
    await generate_and_store_document(updated_booking, settings, "order")

    # Get client info
    client = await db.users.find_one({"id": booking["client_id"]})
    order_download_url = f"{str(request.base_url).rstrip('/')}/api/driver/bookings/{booking_id}/order-pdf"

    # Send email notification to driver
    await send_booking_notification_to_driver(driver, updated_booking, client or {}, order_download_url)

    return {"message": "Course assignée avec succès", "driver_name": driver["name"]}

@api_router.put("/admin/bookings/{booking_id}/receive")
async def receive_booking(booking_id: str, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if normalize_booking_status(booking.get("status")) != "DRAFT":
        raise HTTPException(status_code=400, detail="Seules les courses en brouillon peuvent être réceptionnées")

    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "QUOTE_ACCEPTED"}})
    return {"message": "Course validée", "status": "QUOTE_ACCEPTED"}

@api_router.put("/admin/bookings/{booking_id}/commission")
async def update_booking_commission(booking_id: str, payload: BookingCommissionUpdate, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"commission_override": payload.commission_override}}
    )
    return {"message": "Commission ajustée", "commission_override": payload.commission_override}

@api_router.put("/admin/bookings/{booking_id}/cancellation")
async def handle_booking_cancellation(booking_id: str, payload: BookingCancellationDecision, request: Request):
    admin = await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if normalize_booking_status(booking.get("status")) != "cancellation_requested":
        raise HTTPException(status_code=400, detail="Cette réservation n'a pas de demande d'annulation en attente")

    if payload.approved:
        refund_trace = await _refund_booking_payment(
            booking=booking,
            amount=payload.refund_amount,
            initiated_by="admin_decision"
        )
        resolved_payment_status = booking.get("payment_status")
        if refund_trace.get("refund_status") == "succeeded":
            resolved_payment_status = _resolve_refund_payment_status(booking, refund_trace.get("refund_amount")) or booking.get("payment_status")
        await db.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "status": "cancelled",
                "refund_amount": refund_trace.get("refund_amount"),
                "refunded_at": refund_trace.get("refunded_at"),
                "stripe_refund_id": refund_trace.get("stripe_refund_id"),
                "refund_status": refund_trace.get("refund_status"),
                "refund_currency": refund_trace.get("refund_currency"),
                "refund_initiated_by": refund_trace.get("refund_initiated_by"),
                "payment_status": resolved_payment_status,
            }}
        )
        if refund_trace.get("refund_status") == "succeeded":
            try:
                await send_refund_confirmation_to_client(booking, refund_trace)
            except Exception as exc:
                logger.error(f"Failed to send refund email for booking {booking_id}: {exc}")
        return {"message": "Annulation approuvée", "status": "cancelled", "refund": refund_trace, "processed_by": admin.get("id")}

    fallback_status = normalize_booking_status(booking.get("cancellation_previous_status"))
    if fallback_status not in ["DRAFT", "QUOTE_ACCEPTED", "ORDER_ISSUED", "ASSIGNED"]:
        fallback_status = "ASSIGNED" if booking.get("driver_id") else "QUOTE_ACCEPTED"

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "status": fallback_status,
            "refund_amount": None,
            "refunded_at": None,
            "stripe_refund_id": None,
            "refund_status": None,
            "refund_currency": None,
            "refund_initiated_by": None
        }}
    )
    return {"message": "Annulation refusée", "status": fallback_status}

@api_router.put("/admin/bookings/{booking_id}/cancel")
async def cancel_booking_admin(booking_id: str, payload: AdminCancellationRequest, request: Request):
    admin = await require_admin(request)

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    if normalize_booking_status(booking.get("status")) not in ["DRAFT", "QUOTE_SENT", "QUOTE_ACCEPTED", "ORDER_ISSUED", "ASSIGNED"]:
        raise HTTPException(status_code=400, detail="Cette réservation ne peut pas être annulée")

    refund_trace = await _refund_booking_payment(
        booking=booking,
        amount=payload.refund_amount,
        initiated_by=f"admin:{admin.get('id')}" if admin.get("id") else "admin"
    )
    resolved_payment_status = booking.get("payment_status")
    if refund_trace.get("refund_status") == "succeeded":
        resolved_payment_status = _resolve_refund_payment_status(booking, refund_trace.get("refund_amount")) or booking.get("payment_status")

    update_data = {
        "status": "cancelled",
        "cancellation_reason": payload.cancellation_reason,
        "driver_id": None,
        "driver_name": None,
        "driver_display_name": None,
        "assigned_at": None,
        "cancellation_previous_status": booking.get("status"),
        "refund_amount": refund_trace.get("refund_amount"),
        "refunded_at": refund_trace.get("refunded_at"),
        "stripe_refund_id": refund_trace.get("stripe_refund_id"),
        "refund_status": refund_trace.get("refund_status"),
        "refund_currency": refund_trace.get("refund_currency"),
        "refund_initiated_by": refund_trace.get("refund_initiated_by"),
        "payment_status": resolved_payment_status
    }

    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})

    if refund_trace.get("refund_status") == "succeeded":
        try:
            await send_refund_confirmation_to_client(booking, refund_trace)
        except Exception as exc:
            logger.error(f"Failed to send refund email for booking {booking_id}: {exc}")

    return {"message": "Course annulée par l'administration", "status": "cancelled", "refund": refund_trace}

@api_router.put("/admin/bookings/{booking_id}/status")
async def update_booking_status_admin(booking_id: str, status_update: BookingStatusUpdate, request: Request):
    admin = await require_admin(request)

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    previous_status = booking.get("status")
    next_status = normalize_booking_status(status_update.status)
    validate_booking_status_transition(previous_status, next_status)

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": next_status}}
    )
    await log_booking_status_transition(booking_id, previous_status, next_status, admin.get("id"))

    if next_status == "COMPLETED" and normalize_booking_status(previous_status) != "COMPLETED":
        updated_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if updated_booking:
            await send_invoice_to_client(updated_booking)

    return {"message": "Statut mis à jour", "status": next_status}

@api_router.put("/admin/bookings/{booking_id}")
async def admin_update_booking(booking_id: str, payload: dict, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    allowed_fields = [
        "pickup_address",
        "dropoff_address",
        "pickup_date",
        "pickup_time",
        "notes",
        "transfer_type",
        "estimated_price",
        "vehicle_category_id",
        "payment_method",
        "payment_status",
    ]
    update_data = {k: v for k, v in payload.items() if k in allowed_fields}
    if "payment_method" in update_data:
        update_data["payment_method"] = normalize_payment_method_code(update_data.get("payment_method"))
    if "payment_status" in update_data:
        normalized_payment_status = normalize_payment_status_code(update_data.get("payment_status")) or "pending"
        update_data["payment_status"] = normalized_payment_status
        resolved_estimated_price = update_data.get("estimated_price", booking.get("estimated_price"))
        update_data["payment_completed_at"] = datetime.now(timezone.utc) if normalized_payment_status == "paid" else None
        update_data["paid_amount"] = resolved_estimated_price if normalized_payment_status == "paid" else None
        update_data["paid_currency"] = "eur" if normalized_payment_status == "paid" else None
    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})
    return await db.bookings.find_one({"id": booking_id}, {"_id": 0})

@api_router.get("/admin/disposition-rates")
async def get_disposition_rates(request: Request):
    await require_admin(request)
    return await db.disposition_rates.find({}, {"_id": 0}).sort([("vehicle_category_name", 1), ("duration_hours", 1)]).to_list(1000)

@api_router.post("/admin/disposition-rates")
async def create_disposition_rate(payload: dict, request: Request):
    await require_admin(request)
    rate = {
        "id": str(uuid.uuid4()),
        "vehicle_category_name": payload.get("vehicle_category_name"),
        "duration_hours": float(payload.get("duration_hours", 1)),
        "price": float(payload.get("price", 0)),
        "is_active": payload.get("is_active", True)
    }
    await db.disposition_rates.insert_one(rate)
    rate.pop("_id", None)
    return rate

@api_router.put("/admin/disposition-rates/{rate_id}")
async def update_disposition_rate(rate_id: str, payload: dict, request: Request):
    await require_admin(request)
    allowed_fields = ["vehicle_category_name", "duration_hours", "price", "is_active"]
    update_data = {k: v for k, v in payload.items() if k in allowed_fields}
    await db.disposition_rates.update_one({"id": rate_id}, {"$set": update_data})
    return await db.disposition_rates.find_one({"id": rate_id}, {"_id": 0})

@api_router.delete("/admin/disposition-rates/{rate_id}")
async def delete_disposition_rate(rate_id: str, request: Request):
    await require_admin(request)
    await db.disposition_rates.delete_one({"id": rate_id})
    return {"message": "Deleted"}

@api_router.get("/disposition-rates")
async def get_public_disposition_rates():
    return await db.disposition_rates.find({"is_active": True}, {"_id": 0}).sort([("vehicle_category_name", 1), ("duration_hours", 1)]).to_list(1000)

@api_router.get("/admin/drivers", response_model=List[DriverResponse])
async def get_all_drivers(request: Request):
    await require_admin(request)

    drivers = await db.users.find({"role": "driver"}, {"_id": 0, "password_hash": 0}).to_list(100)
    return [DriverResponse(**d) for d in drivers]

@api_router.post("/admin/drivers", response_model=DriverResponse)
async def create_driver(driver_data: DriverCreate, request: Request):
    await require_admin(request)

    # Check if email exists
    existing = await db.users.find_one({"email": driver_data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email déjà utilisé")

    driver_id = str(uuid.uuid4())
    driver_doc = {
        "id": driver_id,
        "email": driver_data.email.lower(),
        "name": driver_data.name,
        "phone": driver_data.phone,
        "password_hash": hash_password(driver_data.password),
        "role": "driver",
        "vehicle_model": driver_data.vehicle_model,
        "vehicle_plate": driver_data.vehicle_plate,
        "is_available": True,
        "created_at": datetime.now(timezone.utc)
    }

    await db.users.insert_one(driver_doc)
    driver_doc.pop("_id", None)
    driver_doc.pop("password_hash", None)

    return DriverResponse(**driver_doc)

@api_router.delete("/admin/drivers/{driver_id}")
async def delete_driver(driver_id: str, request: Request):
    await require_admin(request)

    result = await db.users.delete_one({"id": driver_id, "role": "driver"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chauffeur non trouvé")

    return {"message": "Chauffeur supprimé"}

@api_router.get("/admin/clients", response_model=List[UserResponse])
async def get_all_clients(request: Request):
    await require_admin(request)

    clients = await db.users.find({"role": "client"}, {"_id": 0, "password_hash": 0}).to_list(100)
    return [UserResponse(**c) for c in clients]

# ==================== VEHICLE CATEGORIES ROUTES ====================

@api_router.get("/vehicle-categories", response_model=List[VehicleCategory])
async def get_vehicle_categories():
    """Get all active vehicle categories (public endpoint)"""
    categories = await db.vehicle_categories.find({"is_active": True}, {"_id": 0}).sort("order", 1).to_list(100)
    serialized_categories = [serialize_vehicle_category(c) for c in categories]
    logger.debug(
        "Public vehicle categories response metadata: %s",
        [
            {
                "name": category.name,
                "has_wifi": category.has_wifi,
                "max_passengers": category.max_passengers,
                "max_luggage": category.max_luggage,
            }
            for category in serialized_categories
        ],
    )
    return serialized_categories

@api_router.get("/admin/vehicle-categories", response_model=List[VehicleCategory])
async def get_all_vehicle_categories(request: Request):
    """Get all vehicle categories including inactive (admin only)"""
    await require_admin(request)
    categories = await db.vehicle_categories.find({}, {"_id": 0}).sort("order", 1).to_list(100)
    return [serialize_vehicle_category(c) for c in categories]

@api_router.post("/admin/vehicle-categories", response_model=VehicleCategory)
async def create_vehicle_category(category: VehicleCategoryCreate, request: Request):
    await require_admin(request)

    category_id = str(uuid.uuid4())
    category_doc = {
        "id": category_id,
        "name": category.name,
        "description": category.description,
        "price_per_km": category.price_per_km,
        "min_fare": category.min_fare,
        "has_wifi": category.has_wifi,
        "max_passengers": category.max_passengers,
        "max_luggage": category.max_luggage,
        "image_url": category.image_url,
        "is_active": True,
        "order": category.order
    }

    await db.vehicle_categories.insert_one(category_doc)
    category_doc.pop("_id", None)
    return VehicleCategory(**category_doc)

@api_router.put("/admin/vehicle-categories/{category_id}", response_model=VehicleCategory)
async def update_vehicle_category(category_id: str, category: VehicleCategoryUpdate, request: Request):
    await require_admin(request)

    existing = await db.vehicle_categories.find_one({"id": category_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")

    update_data = {k: v for k, v in category.model_dump().items() if v is not None}
    if update_data:
        await db.vehicle_categories.update_one({"id": category_id}, {"$set": update_data})

    updated = await db.vehicle_categories.find_one({"id": category_id}, {"_id": 0})
    return VehicleCategory(**updated)

@api_router.delete("/admin/vehicle-categories/{category_id}")
async def delete_vehicle_category(category_id: str, request: Request):
    await require_admin(request)

    result = await db.vehicle_categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Catégorie non trouvée")

    return {"message": "Catégorie supprimée"}

# ==================== ADMIN FLEET ROUTES ====================

@api_router.get("/admin/fleet", response_model=List[AdminVehicle])
async def list_admin_fleet(request: Request):
    """List all admin-owned vehicles."""
    await require_admin(request)
    vehicles = await db.admin_vehicles.find({}, {"_id": 0}).to_list(200)
    return [AdminVehicle(**v) for v in vehicles]

@api_router.post("/admin/fleet", response_model=AdminVehicle)
async def create_admin_vehicle(vehicle: AdminVehicleCreate, request: Request):
    """Add a vehicle to the admin fleet."""
    await require_admin(request)
    vehicle_id = str(uuid.uuid4())
    vehicle_doc = {
        "id": vehicle_id,
        "brand": vehicle.brand,
        "model": vehicle.model,
        "plate": vehicle.plate,
        "color": vehicle.color,
        "capacity": vehicle.capacity,
        "is_active": True,
    }
    await db.admin_vehicles.insert_one(vehicle_doc)
    vehicle_doc.pop("_id", None)
    return AdminVehicle(**vehicle_doc)

@api_router.put("/admin/fleet/{vehicle_id}", response_model=AdminVehicle)
async def update_admin_vehicle(vehicle_id: str, vehicle: AdminVehicleUpdate, request: Request):
    """Update an admin fleet vehicle."""
    await require_admin(request)
    existing = await db.admin_vehicles.find_one({"id": vehicle_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    update_data = {k: v for k, v in vehicle.model_dump().items() if v is not None}
    if update_data:
        await db.admin_vehicles.update_one({"id": vehicle_id}, {"$set": update_data})
    updated = await db.admin_vehicles.find_one({"id": vehicle_id}, {"_id": 0})
    return AdminVehicle(**updated)

@api_router.delete("/admin/fleet/{vehicle_id}")
async def delete_admin_vehicle(vehicle_id: str, request: Request):
    """Remove a vehicle from the admin fleet."""
    await require_admin(request)
    result = await db.admin_vehicles.delete_one({"id": vehicle_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Véhicule non trouvé")
    return {"message": "Véhicule supprimé"}

# ==================== PRICE ESTIMATION ROUTE ====================

@api_router.post("/estimate-price", response_model=List[PriceEstimate])
async def estimate_price(
    distance_km: float = 0,
    duration_minutes: float = 0,
    transfer_type: str = "simple",
    disposition_hours: Optional[float] = None,
):
    """
    Calculate price estimates for all vehicle categories.
    Standard transfers are based on distance; disposition transfers use hourly rates.
    """
    categories = await db.vehicle_categories.find({"is_active": True}, {"_id": 0}).sort("order", 1).to_list(100)
    multiplier = 2 if transfer_type == "retour" else 1

    if transfer_type == "disposition":
        if disposition_hours is None or disposition_hours <= 0:
            raise HTTPException(status_code=400, detail="Le nombre d'heures de mise à disposition doit être positif")

        rates = await db.disposition_rates.find({"is_active": True}, {"_id": 0}).to_list(1000)
        rates_by_category = {}
        for rate in rates:
            normalized_rate_category = normalize_category_name(rate.get("vehicle_category_name"))
            if not normalized_rate_category:
                continue
            rates_by_category.setdefault(normalized_rate_category, []).append(rate)

        estimates = []
        for cat in categories:
            normalized_category_name = normalize_category_name(cat["name"]) or cat["name"]
            selected_rate = select_disposition_rate(rates_by_category.get(normalized_category_name, []), disposition_hours)
            if not selected_rate:
                continue

            hourly_amount = float(selected_rate["price"])
            total_amount = hourly_amount * float(disposition_hours)
            final_price = round(total_amount * multiplier, 2)
            estimates.append(PriceEstimate(
                category_id=cat["id"],
                category_name=cat["name"],
                distance_km=0,
                duration_minutes=round(disposition_hours * 60, 0),
                base_price=final_price,
                final_price=final_price,
                min_fare=final_price,
                price_per_km=cat["price_per_km"],
                pricing_basis="hourly",
                disposition_hours=round(disposition_hours, 2),
                rate_label=f"{hourly_amount:.2f}€/h × {round(disposition_hours, 2)}h" + (" · aller-retour" if transfer_type == "retour" else ""),
            ))

        return estimates

    if distance_km <= 0:
        raise HTTPException(status_code=400, detail="La distance doit être positive")

    estimates = []
    for cat in categories:
        base_price = distance_km * cat["price_per_km"]
        final_price = max(base_price, cat["min_fare"])
        total_base_price = base_price * multiplier
        total_final_price = final_price * multiplier
        total_min_fare = cat["min_fare"] * multiplier

        estimates.append(PriceEstimate(
            category_id=cat["id"],
            category_name=cat["name"],
            distance_km=round(distance_km, 2),
            duration_minutes=round(duration_minutes, 0),
            base_price=round(total_base_price, 2),
            final_price=round(total_final_price, 2),
            min_fare=round(total_min_fare, 2),
            price_per_km=cat["price_per_km"],
            pricing_basis="distance",
            disposition_hours=None,
            rate_label=f"{cat['price_per_km']:.2f}€/km" + (" · aller-retour" if transfer_type == "retour" else ""),
        ))

    return estimates

# ==================== FINANCIAL ROUTES ====================

@api_router.get("/admin/financial/stats", response_model=FinancialStats)
async def get_financial_stats(request: Request, driver_id: Optional[str] = None):
    await require_admin(request)
    settings = await get_commission_settings()

    query = {"status": "COMPLETED", "estimated_price": {"$ne": None}}
    if driver_id:
        query["driver_id"] = driver_id

    completed_bookings = await db.bookings.find(
        query,
        {"_id": 0}
    ).to_list(10000)

    totals = {
        "total_revenue_ttc": 0.0,
        "total_revenue_ht": 0.0,
        "total_tva_client": 0.0,
        "total_commission_ttc": 0.0,
        "total_commission_ht": 0.0,
        "total_tva_commission": 0.0,
        "total_driver_earnings": 0.0
    }

    for booking in completed_bookings:
        resolved_client_tva_rate = get_client_tva_rate_for_booking(booking)
        breakdown = compute_financial_breakdown(
            booking["estimated_price"],
            settings["commission_rate"],
            resolved_client_tva_rate,
            settings["tva_commission_rate"],
            booking.get("commission_override"),
            bool(booking.get("fulfilled_by_admin"))
        )
        totals["total_revenue_ttc"] += breakdown["price_ttc"]
        totals["total_revenue_ht"] += breakdown["price_ht"]
        totals["total_tva_client"] += breakdown["tva_client"]
        totals["total_commission_ttc"] += breakdown["commission_ttc"]
        totals["total_commission_ht"] += breakdown["commission_ht"]
        totals["total_tva_commission"] += breakdown["tva_commission"]
        totals["total_driver_earnings"] += breakdown["driver_earning"]

    return FinancialStats(
        total_revenue_ttc=round_amount(totals["total_revenue_ttc"]),
        total_revenue_ht=round_amount(totals["total_revenue_ht"]),
        total_tva_client=round_amount(totals["total_tva_client"]),
        total_commission_ttc=round_amount(totals["total_commission_ttc"]),
        total_commission_ht=round_amount(totals["total_commission_ht"]),
        total_tva_commission=round_amount(totals["total_tva_commission"]),
        total_driver_earnings=round_amount(totals["total_driver_earnings"]),
        commission_rate=settings["commission_rate"],
        completed_bookings_count=len(completed_bookings)
    )

@api_router.get("/admin/financial/commissions", response_model=CommissionSettings)
async def get_financial_commissions(request: Request):
    await require_admin(request)
    settings = await get_commission_settings()
    return CommissionSettings(**settings)

@api_router.put("/admin/financial/commissions", response_model=CommissionSettings)
async def update_financial_commissions(payload: CommissionSettingsUpdate, request: Request):
    await require_admin(request)
    settings = await get_commission_settings()

    update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc)
        await db.commission_settings.update_one({"id": settings["id"]}, {"$set": update_data})

    updated = await db.commission_settings.find_one({"id": settings["id"]}, {"_id": 0})
    return CommissionSettings(**updated)

@api_router.get("/admin/financial/invoices", response_model=List[InvoiceMetadata])
async def get_financial_invoices(request: Request, driver_id: Optional[str] = None):
    await require_admin(request)
    query = {}
    if driver_id:
        booking_ids = await db.bookings.distinct("id", {"driver_id": driver_id})
        query["booking_id"] = {"$in": booking_ids}
    invoices = await db.invoices.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [InvoiceMetadata(**invoice) for invoice in invoices]

@api_router.get("/admin/financial/completed-bookings")
async def get_completed_bookings_financial(request: Request):
    """Returns all completed bookings with full financial breakdown and invoice numbers."""
    await require_admin(request)
    settings = await get_commission_settings()

    bookings = await db.bookings.find(
        {"status": "COMPLETED", "estimated_price": {"$ne": None}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    result = []
    for b in bookings:
        resolved_client_tva_rate = get_client_tva_rate_for_booking(b)
        breakdown = compute_financial_breakdown(
            b["estimated_price"],
            settings["commission_rate"],
            resolved_client_tva_rate,
            settings["tva_commission_rate"],
            b.get("commission_override"),
            bool(b.get("fulfilled_by_admin"))
        )
        client_inv = await db.invoices.find_one({"booking_id": b["id"], "type": "invoice"}, {"_id": 0})
        driver_inv = await db.invoices.find_one({"booking_id": b["id"], "type": "driver"}, {"_id": 0})
        commission_inv = await db.invoices.find_one({"booking_id": b["id"], "type": "commission"}, {"_id": 0})

        result.append({
            "id": b["id"],
            "client_name": b.get("client_name", "N/A"),
            "client_email": b.get("client_email", "N/A"),
            "driver_name": b.get("driver_name"),
            "driver_id": b.get("driver_id"),
            "fulfilled_by_admin": b.get("fulfilled_by_admin"),
            "pickup_address": b.get("pickup_address", ""),
            "dropoff_address": b.get("dropoff_address", ""),
            "pickup_date": b.get("pickup_date", ""),
            "pickup_time": b.get("pickup_time", ""),
            "transfer_type": b.get("transfer_type", ""),
            "distance_km": b.get("distance_km"),
            "price_per_km": b.get("price_per_km"),
            "payment_method": b.get("payment_method"),
            "notes": b.get("notes"),
            "created_at": b.get("created_at", datetime.now(timezone.utc)),
            "price_ttc": breakdown["price_ttc"],
            "price_ht": breakdown["price_ht"],
            "tva_client": breakdown["tva_client"],
            "commission_ttc": breakdown["commission_ttc"],
            "commission_ht": breakdown["commission_ht"],
            "tva_commission": breakdown["tva_commission"],
            "driver_earning": breakdown["driver_earning"],
            "tva_client_rate": resolved_client_tva_rate,
            "tva_commission_rate": settings["tva_commission_rate"],
            "commission_rate": settings["commission_rate"],
            "client_invoice_number": client_inv["invoice_number"] if client_inv else None,
            "driver_invoice_number": driver_inv["invoice_number"] if driver_inv else None,
            "commission_invoice_number": commission_inv["invoice_number"] if commission_inv else None,
        })
    return result

@api_router.get("/driver/earnings", response_model=List[DriverEarning])
async def get_driver_earnings(request: Request):
    driver = await require_driver(request)
    settings = await get_commission_settings()

    bookings = await db.bookings.find(
        {"driver_id": driver["id"], "status": "COMPLETED", "estimated_price": {"$ne": None}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    earnings = []
    for booking in bookings:
        resolved_client_tva_rate = get_client_tva_rate_for_booking(booking)
        breakdown = compute_financial_breakdown(
            booking["estimated_price"],
            settings["commission_rate"],
            resolved_client_tva_rate,
            settings["tva_commission_rate"],
            booking.get("commission_override"),
            bool(booking.get("fulfilled_by_admin"))
        )
        earnings.append(DriverEarning(
            booking_id=booking["id"],
            pickup_address=booking.get("pickup_address", ""),
            dropoff_address=booking.get("dropoff_address", ""),
            pickup_date=booking.get("pickup_date", ""),
            pickup_time=booking.get("pickup_time", ""),
            price_ttc=breakdown["price_ttc"],
            commission_ttc=breakdown["commission_ttc"],
            driver_earning=breakdown["driver_earning"],
            status=booking.get("status", ""),
            created_at=booking.get("created_at", datetime.now(timezone.utc))
        ))

    return earnings

@api_router.get("/admin/invoices/{booking_id}/pdf")
async def download_admin_invoice_pdf(booking_id: str, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "invoice")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture-client-{booking_id}.pdf"}
    )

@api_router.get("/admin/invoices/{booking_id}/driver-pdf")
async def download_admin_driver_invoice_pdf(booking_id: str, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "driver")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture-chauffeur-{booking_id}.pdf"}
    )

@api_router.get("/admin/invoices/{booking_id}/commission-pdf")
async def download_admin_commission_pdf(booking_id: str, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "commission")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture-commission-{booking_id}.pdf"}
    )

@api_router.get("/admin/invoices/{booking_id}/activity-pdf")
async def download_admin_activity_pdf(booking_id: str, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "activity")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=releve-activite-{booking_id}.pdf"}
    )

@api_router.get("/admin/orders/{booking_id}/pdf")
async def download_admin_order_pdf(booking_id: str, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "order")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=bon-de-commande-{booking_id}.pdf"}
    )

@api_router.get("/driver/invoices")
async def get_driver_invoices(request: Request):
    """Returns the driver's completed bookings with financial breakdown and invoice numbers."""
    driver = await require_driver(request)
    settings = await get_commission_settings()

    bookings = await db.bookings.find(
        {"driver_id": driver["id"], "status": "COMPLETED", "estimated_price": {"$ne": None}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    result = []
    for b in bookings:
        resolved_client_tva_rate = get_client_tva_rate_for_booking(b)
        breakdown = compute_financial_breakdown(
            b["estimated_price"],
            settings["commission_rate"],
            resolved_client_tva_rate,
            settings["tva_commission_rate"],
            b.get("commission_override"),
            bool(b.get("fulfilled_by_admin"))
        )
        driver_inv = await db.invoices.find_one({"booking_id": b["id"], "type": "driver"}, {"_id": 0})

        result.append({
            "booking_id": b["id"],
            "client_name": b.get("client_name", "N/A"),
            "pickup_address": b.get("pickup_address", ""),
            "dropoff_address": b.get("dropoff_address", ""),
            "pickup_date": b.get("pickup_date", ""),
            "pickup_time": b.get("pickup_time", ""),
            "transfer_type": b.get("transfer_type", ""),
            "created_at": b.get("created_at", datetime.now(timezone.utc)),
            "price_ttc": breakdown["price_ttc"],
            "commission_ttc": breakdown["commission_ttc"],
            "driver_earning": breakdown["driver_earning"],
            "invoice_number": driver_inv["invoice_number"] if driver_inv else None,
        })
    return result

@api_router.get("/driver/invoices/{booking_id}/pdf")
async def download_driver_invoice_pdf(booking_id: str, request: Request):
    driver = await require_driver(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé à cette facture")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "driver")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture-chauffeur-{booking_id}.pdf"}
    )

@api_router.get("/driver/invoices/{booking_id}/order-pdf")
async def download_driver_order_pdf(booking_id: str, request: Request):
    driver = await require_driver(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "order")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=bon-commande-{booking_id}.pdf"}
    )

@api_router.get("/driver/invoices/{booking_id}/commission-pdf")
async def download_driver_commission_pdf(booking_id: str, request: Request):
    driver = await require_driver(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "commission")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture-commission-{booking_id}.pdf"}
    )

@api_router.get("/driver/invoices/{booking_id}/activity-pdf")
async def download_driver_activity_pdf(booking_id: str, request: Request):
    driver = await require_driver(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("driver_id") != driver["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "activity")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=releve-activite-{booking_id}.pdf"}
    )

@api_router.get("/client/invoices/{booking_id}/pdf")
async def download_client_invoice_pdf(booking_id: str, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Accès client requis")

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("client_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé à cette facture")

    settings = await get_commission_settings()
    pdf_bytes, _ = await generate_and_store_document(booking, settings, "invoice")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture-{booking_id}.pdf"}
    )

# ==================== ROOT ROUTE ====================

@api_router.get("/")
async def root():
    return {"message": "Econnect VTC API", "version": "1.0.0"}

# Include router and setup
app.include_router(api_router)

# CORS Configuration
frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== STARTUP EVENTS ====================

@app.on_event("startup")
async def startup_event():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.bookings.create_index("id", unique=True)
    await db.bookings.create_index("client_id")
    await db.bookings.create_index("driver_id")
    await db.bookings.create_index("status")
    await db.vehicle_categories.create_index("id", unique=True)
    await db.commission_settings.create_index("id", unique=True)
    await db.invoices.create_index("id", unique=True)
    await db.invoices.create_index("booking_id")
    await db.invoices.create_index([("booking_id", 1), ("type", 1)], unique=True)
    await db.course_documents.create_index("id", unique=True)
    await db.course_documents.create_index("course_id")
    await db.course_documents.create_index([("course_id", 1), ("type", 1)], unique=True)
    await db.booking_status_history.create_index("id", unique=True)
    await db.booking_status_history.create_index("course_id")

    # Seed admin user
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@econnect-vtc.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")

    existing_admin = await db.users.find_one({"email": admin_email})
    if not existing_admin:
        admin_doc = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Administrateur",
            "phone": None,
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "created_at": datetime.now(timezone.utc)
        }
        await db.users.insert_one(admin_doc)
        logger.info(f"Admin user created: {admin_email}")
    elif not verify_password(admin_password, existing_admin["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info("Admin password updated")

    # Seed default vehicle categories if none exist
    existing_categories = await db.vehicle_categories.count_documents({})
    if existing_categories == 0:
        default_categories = [
            {
                "id": str(uuid.uuid4()),
                "name": "Berline",
                "description": "Confort et elegance pour vos trajets quotidiens. Mercedes Classe E, BMW Serie 5.",
                "price_per_km": 2.50,
                "min_fare": 25.00,
                "has_wifi": True,
                "max_passengers": 4,
                "max_luggage": 2,
                "image_url": "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400",
                "is_active": True,
                "order": 1
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Van",
                "description": "Ideal pour les groupes jusqu'a 7 personnes. Mercedes Classe V, Volkswagen Caravelle.",
                "price_per_km": 3.00,
                "min_fare": 35.00,
                "has_wifi": False,
                "max_passengers": 7,
                "max_luggage": 5,
                "image_url": "https://images.unsplash.com/photo-1559416523-140ddc3d238c?w=400",
                "is_active": True,
                "order": 2
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Luxe",
                "description": "Experience premium avec vehicules haut de gamme. Mercedes Classe S, BMW Serie 7.",
                "price_per_km": 4.00,
                "min_fare": 50.00,
                "has_wifi": True,
                "max_passengers": 4,
                "max_luggage": 3,
                "image_url": "https://images.unsplash.com/photo-1563720360172-67b8f3dce741?w=400",
                "is_active": True,
                "order": 3
            },
            {
                "id": str(uuid.uuid4()),
                "name": "Green",
                "description": "Vehicules electriques et hybrides pour un transport eco-responsable. Tesla Model S, Mercedes EQS.",
                "price_per_km": 2.80,
                "min_fare": 30.00,
                "has_wifi": True,
                "max_passengers": 4,
                "max_luggage": 2,
                "image_url": "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400",
                "is_active": True,
                "order": 4
            }
        ]
        await db.vehicle_categories.insert_many(default_categories)
        logger.info("Default vehicle categories created")
    else:
        categories = await db.vehicle_categories.find(
            {},
            {
                "_id": 0,
                "id": 1,
                "name": 1,
                "has_wifi": 1,
                "max_passengers": 1,
                "max_luggage": 1,
            },
        ).to_list(100)
        updated_categories = 0
        for category in categories:
            category_name = category.get("name") or ""
            expected_metadata = DEFAULT_CATEGORY_METADATA.get(category_name)
            legacy_metadata = LEGACY_CATEGORY_METADATA.get(category_name, {})
            if not expected_metadata:
                continue

            fields_to_update = {}
            for field_name, expected_value in expected_metadata.items():
                current_value = category.get(field_name)
                legacy_value = legacy_metadata.get(field_name)
                should_update = current_value is None or current_value == legacy_value
                if should_update and current_value != expected_value:
                    fields_to_update[field_name] = expected_value

            if fields_to_update:
                await db.vehicle_categories.update_one({"id": category["id"]}, {"$set": fields_to_update})
                updated_categories += 1

        if updated_categories:
            logger.info("Backfilled vehicle category metadata for %s categories", updated_categories)

    existing_settings = await db.commission_settings.count_documents({})
    if existing_settings == 0:
        await db.commission_settings.insert_one({
            "id": str(uuid.uuid4()),
            "commission_rate": 0.10,
            "tva_client_rate": 0.10,
            "tva_commission_rate": 0.20,
            "company_name": "Econnect VTC",
            "company_address": "À compléter",
            "company_phone": "À compléter",
            "company_email": "À compléter",
            "company_siret": "À compléter",
            "company_vtc_number": "À compléter",
            "updated_at": datetime.now(timezone.utc)
        })
        logger.info("Default commission settings created")

    # Write test credentials
    credentials_path = Path("./test_credentials.md")
    credentials_path.parent.mkdir(parents=True, exist_ok=True)
    credentials_path.write_text(f"""# Test Credentials

## Admin Account
- **Email**: {admin_email}
- **Password**: {admin_password}
- **Role**: admin

## Auth Endpoints
- POST /api/auth/register - Register new client
- POST /api/auth/login - Login
- POST /api/auth/logout - Logout
- GET /api/auth/me - Get current user

## Password Reset Flow
- POST /api/auth/forgot-password - Request password reset
- GET /api/auth/verify-reset-token/{{token}} - Verify token validity
- POST /api/auth/reset-password - Reset password with token

## Admin Endpoints
- GET /api/admin/stats - Dashboard stats
- GET /api/admin/bookings - All bookings
- PUT /api/admin/bookings/{{id}}/assign - Assign to driver
- GET /api/admin/drivers - All drivers
- POST /api/admin/drivers - Create driver
- DELETE /api/admin/drivers/{{id}} - Delete driver
- GET /api/admin/clients - All clients
- GET /api/admin/vehicle-categories - All vehicle categories
- POST /api/admin/vehicle-categories - Create category
- PUT /api/admin/vehicle-categories/{{id}} - Update category
- DELETE /api/admin/vehicle-categories/{{id}} - Delete category

## Public Endpoints
- GET /api/vehicle-categories - Active vehicle categories
- POST /api/estimate-price?distance_km=X - Estimate prices

## Driver Endpoints
- GET /api/driver/bookings - Driver's bookings
- PUT /api/driver/bookings/{{id}}/status - Update status
- PUT /api/driver/availability - Set availability

## Client Endpoints
- POST /api/bookings - Create booking
- GET /api/bookings/my - My bookings

## Default Vehicle Categories
- Berline: 2.50€/km, min 25€
- Van: 3.00€/km, min 35€
- Luxe: 4.00€/km, min 50€
- Green: 2.80€/km, min 30€
""")
    logger.info("Test credentials written to ./test_credentials.md")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
