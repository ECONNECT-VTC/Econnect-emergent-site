# Standard library
import hashlib
import logging
import os
import secrets
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import List, Optional, Tuple

# Third-party
import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, EmailStr
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
from starlette.middleware.cors import CORSMiddleware

# Load environment variables before accessing os.environ
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', secrets.token_hex(32))
JWT_ALGORITHM = "HS256"

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
    status: str  # pending, received, assigned, in_progress, completed, cancellation_requested, cancelled
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    commission_override: Optional[float] = None
    cancellation_reason: Optional[str] = None
    driver_cancellation_reason: Optional[str] = None
    cancellation_previous_status: Optional[str] = None
    refund_amount: Optional[float] = None
    refunded_at: Optional[datetime] = None
    created_at: datetime
    assigned_at: Optional[datetime] = None

class AssignBooking(BaseModel):
    driver_id: str

class BookingStatusUpdate(BaseModel):
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

# ==================== FINANCIAL MODELS ====================

DEFAULT_CATEGORY_METADATA = {
    "Berline": {"has_wifi": True, "max_passengers": 3, "max_luggage": 2},
    "Van": {"has_wifi": True, "max_passengers": 7, "max_luggage": 7},
    "Luxe": {"has_wifi": True, "max_passengers": 3, "max_luggage": 3},
    "Green": {"has_wifi": True, "max_passengers": 4, "max_luggage": 3},
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
        "updated_at": datetime.now(timezone.utc)
    }

async def get_commission_settings() -> dict:
    settings = await db.commission_settings.find_one({}, {"_id": 0})
    if settings:
        return settings
    defaults = get_default_commission_settings()
    await db.commission_settings.insert_one(defaults)
    return defaults

def compute_financial_breakdown(
    price_ttc: float,
    commission_rate: float,
    tva_client_rate: float,
    tva_commission_rate: float,
    commission_override: Optional[float] = None
) -> dict:
    safe_price_ttc = float(price_ttc or 0)
    commission_ttc = float(commission_override) if commission_override is not None else (safe_price_ttc * commission_rate)
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

    if booking.get("estimated_price") is None:
        raise HTTPException(status_code=400, detail="Montant de course indisponible")

    breakdown = compute_financial_breakdown(
        booking["estimated_price"],
        settings["commission_rate"],
        settings["tva_client_rate"],
        settings["tva_commission_rate"],
        booking.get("commission_override")
    )

    title_map = {
        "invoice": "FACTURE CLIENT",
        "order": "BON DE COMMANDE",
        "driver": "FACTURE CHAUFFEUR",
        "commission": "FACTURE COMMISSION",
        "activity": "RELEVÉ D'ACTIVITÉ",
    }
    title = title_map.get(document_type, "DOCUMENT")
    is_client_invoice = document_type in ("invoice", "order")
    is_driver_statement = document_type in ("driver", "activity")

    def detect_payment_method_label() -> str:
        raw_method = str(booking.get("payment_method") or "").strip().lower()
        raw_notes = str(booking.get("notes") or "").strip().lower()
        source = raw_method or raw_notes
        normalized = ''.join(
            char for char in unicodedata.normalize("NFD", source) if unicodedata.category(char) != "Mn"
        )
        if any(token in normalized for token in ["cb", "carte", "card", "bleue", "bleu"]):
            return "cb"
        if any(token in normalized for token in ["cash", "espece", "especes"]):
            return "cash"
        if "virement" in normalized:
            return "virement"
        return "unknown"

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
    payment_method = detect_payment_method_label()

    y = height - 40
    c.setFillColorRGB(0.83, 0.69, 0.22)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(40, y, "ECONNECT VTC")
    c.setFont("Helvetica", 9)
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.drawString(40, y - 18, "Service de Transport Privé Premium")

    c.setFillColorRGB(0.83, 0.69, 0.22)
    c.setFont("Helvetica-Bold", 14)
    c.drawRightString(width - 40, y, title)
    c.setFont("Helvetica", 11)
    c.drawRightString(width - 40, y - 18, f"N° {document_number}")

    # Gold separator line
    c.setStrokeColorRGB(0.83, 0.69, 0.22)
    c.setLineWidth(1.5)
    c.line(40, height - 110, width - 40, height - 110)

    y = height - 135
    now_str = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    due_date = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%d/%m/%Y")

    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.setFont("Helvetica", 9)
    c.drawString(40, y, f"Date : {now_str}   |   Échéance : {due_date}   |   SIRET : {settings['company_siret']}")
    y -= 25

    # Parties section
    c.setFillColorRGB(0.83, 0.69, 0.22)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "ÉMETTEUR")
    c.drawString(300, y, "DESTINATAIRE" if not is_driver_statement else "CHAUFFEUR")
    y -= 14

    c.setFillColorRGB(0.1, 0.1, 0.1)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, settings["company_name"])
    if is_driver_statement:
        c.drawString(300, y, booking.get("driver_name", "N/A"))
    else:
        c.drawString(300, y, booking.get("client_name", "N/A"))
    y -= 13

    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.setFont("Helvetica", 9)
    c.drawString(40, y, settings["company_address"])
    if is_driver_statement:
        c.drawString(300, y, "Chauffeur VTC Partenaire")
    else:
        c.drawString(300, y, booking.get("client_email", "N/A"))
    y -= 13

    c.drawString(40, y, settings["company_email"])
    y -= 13
    c.drawString(40, y, f"N° VTC : {settings['company_vtc_number']}")
    y -= 25

    # Separator
    c.setStrokeColorRGB(0.83, 0.69, 0.22)
    c.setLineWidth(0.5)
    c.line(40, y, width - 40, y)
    y -= 20

    # Trip details
    c.setFillColorRGB(0.83, 0.69, 0.22)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "DÉTAILS DU TRAJET")
    y -= 14

    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.setFont("Helvetica", 9)
    c.drawString(40, y, f"Départ : {booking.get('pickup_address', 'N/A')}")
    y -= 13
    c.drawString(40, y, f"Arrivée : {booking.get('dropoff_address', 'N/A')}")
    y -= 13
    c.drawString(40, y, f"Date : {booking.get('pickup_date', 'N/A')} à {booking.get('pickup_time', 'N/A')}")
    y -= 25

    # Separator
    c.setStrokeColorRGB(0.83, 0.69, 0.22)
    c.line(40, y, width - 40, y)
    y -= 20

    # Table header
    c.setFillColorRGB(0.83, 0.69, 0.22)
    c.setFont("Helvetica-Bold", 9)
    if is_client_invoice:
        x_desc, x_km, x_rate, x_ht = 40, 365, 455, width - 40
        c.drawString(x_desc, y, "DÉSIGNATION")
        c.drawRightString(x_km, y, "NOMBRE DE KM")
        c.drawRightString(x_rate, y, "TARIF AU KM HT")
        c.drawRightString(x_ht, y, "PRIX HT")
        y -= 10
        c.setStrokeColorRGB(0.83, 0.69, 0.22)
        c.setLineWidth(1)
        c.line(40, y, width - 40, y)
        y -= 15

        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont("Helvetica", 9)
        c.drawString(x_desc, y, f"Adresse de départ : {booking.get('pickup_address', 'N/A')}")
        c.drawRightString(x_km, y, "-")
        c.drawRightString(x_rate, y, "-")
        c.drawRightString(x_ht, y, "-")
        y -= 15
        c.drawString(x_desc, y, f"Adresse d'arrivée : {booking.get('dropoff_address', 'N/A')}")
        c.drawRightString(x_km, y, f"{distance_km:.2f}" if distance_km else "-")
        c.drawRightString(x_rate, y, f"{unit_price_ht:.2f} EUR" if unit_price_ht else "-")
        c.drawRightString(x_ht, y, f"{line_price_ht:.2f} EUR")
        y -= 15
        c.setStrokeColorRGB(0.83, 0.69, 0.22)
        c.setLineWidth(0.5)
        c.line(40, y, width - 40, y)
        y -= 15

        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont("Helvetica", 9)
        c.drawString(40, y, "Mode de paiement :")
        c.drawString(140, y, f"{'[X]' if payment_method == 'cb' else '[ ]'} CB")
        c.drawString(220, y, f"{'[X]' if payment_method == 'cash' else '[ ]'} Espèces")
        c.drawString(325, y, f"{'[X]' if payment_method == 'virement' else '[ ]'} Virement bancaire")
        y -= 18
        c.drawString(40, y, "Montant HT")
        c.drawRightString(width - 40, y, f"{breakdown['price_ht']:.2f} EUR")
        y -= 13
        c.drawString(40, y, f"Montant TVA ({round_amount(settings['tva_client_rate'] * 100):.0f}%)")
        c.drawRightString(width - 40, y, f"{breakdown['tva_client']:.2f} EUR")
        y -= 13
        total_label = "TOTAL TTC"
        total_value = breakdown['price_ttc']
    else:
        c.drawString(40, y, "DESCRIPTION")
        c.drawRightString(width - 40, y, "MONTANT")
        y -= 10
        c.setStrokeColorRGB(0.83, 0.69, 0.22)
        c.setLineWidth(1)
        c.line(40, y, width - 40, y)
        y -= 15
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont("Helvetica", 10)

    if is_driver_statement:
        description = "Relevé d'activité" if document_type == "activity" else "Rémunération trajet"
        c.drawString(40, y, f"{description} - {booking.get('transfer_type', 'VTC')}")
        c.drawRightString(width - 40, y, f"{breakdown['driver_earning']:.2f} EUR HT")
        y -= 20
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.setFont("Helvetica", 9)
        c.drawString(40, y, "Montant course client TTC")
        c.drawRightString(width - 40, y, f"{breakdown['price_ttc']:.2f} EUR")
        y -= 13
        c.drawString(40, y, f"Commission prélevée TTC ({round_amount(settings['commission_rate'] * 100):.0f}%)")
        c.drawRightString(width - 40, y, f"- {breakdown['commission_ttc']:.2f} EUR")
        y -= 20
        total_label = "TOTAL ACTIVITÉ (HT)" if document_type == "activity" else "MONTANT À VERSER (HT)"
        total_value = breakdown['driver_earning']
    elif document_type == "commission":
        c.drawString(40, y, f"Commission de gestion - {booking.get('transfer_type', 'VTC')}")
        c.drawRightString(width - 40, y, f"{breakdown['commission_ht']:.2f} EUR")
        y -= 20
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.setFont("Helvetica", 9)
        c.drawString(40, y, "Commission HT")
        c.drawRightString(width - 40, y, f"{breakdown['commission_ht']:.2f} EUR")
        y -= 13
        c.drawString(40, y, f"TVA commission ({round_amount(settings['tva_commission_rate'] * 100):.0f}%)")
        c.drawRightString(width - 40, y, f"{breakdown['tva_commission']:.2f} EUR")
        y -= 20
        total_label = "TOTAL COMMISSION TTC"
        total_value = breakdown['commission_ttc']

    # Total box
    y -= 5
    c.setStrokeColorRGB(0.83, 0.69, 0.22)
    c.setLineWidth(1)
    c.rect(40, y - 10, width - 80, 28, fill=0, stroke=1)
    c.setFillColorRGB(0.83, 0.69, 0.22)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(50, y + 5, total_label)
    c.drawRightString(width - 50, y + 5, f"{total_value:.2f} EUR")

    y -= 40

    # Payment conditions
    c.setStrokeColorRGB(0.83, 0.69, 0.22)
    c.setLineWidth(0.5)
    c.line(40, y, width - 40, y)
    y -= 15
    c.setFillColorRGB(0.3, 0.3, 0.3)
    c.setFont("Helvetica", 8)
    c.drawString(40, y, "Conditions : Paiement sous 30 jours. Tout retard entraîne des pénalités de 3 fois le taux d'intérêt légal.")
    y -= 12
    c.drawString(40, y, f"TVA non récupérable par le preneur. {settings['company_name']} - {settings['company_address']}")

    c.showPage()
    c.save()
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes

async def generate_and_store_document(booking: dict, settings: dict, document_type: str) -> Tuple[bytes, dict]:
    existing_document = await db.invoices.find_one(
        {"booking_id": booking["id"], "type": document_type},
        {"_id": 0}
    )

    if existing_document:
        existing_pdf = generate_financial_pdf(
            booking,
            settings,
            document_type,
            existing_document["invoice_number"]
        )
        return existing_pdf, existing_document

    document_number = await get_next_sequential_number()
    pdf_bytes = generate_financial_pdf(booking, settings, document_type, document_number)
    breakdown = compute_financial_breakdown(
        booking["estimated_price"],
        settings["commission_rate"],
        settings["tva_client_rate"],
        settings["tva_commission_rate"],
        booking.get("commission_override")
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
        tva_rate = settings["tva_client_rate"]

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

async def send_notification_email(to_email: str, subject: str, html_content: str):
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
        sg = SendGridAPIClient(sendgrid_key)
        response = sg.send(message)
        return response.status_code == 202
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        return False

async def send_booking_notification_to_driver(driver: dict, booking: dict, client: dict, order_download_url: Optional[str] = None):
    """Send notification to driver when a booking is assigned"""
    subject = f"🚗 Nouvelle course assignée - {booking['pickup_date']} à {booking['pickup_time']}"
    html_content = f"""
<html>
<body style="font-family: Arial, sans-serif; background-color: #0A0A0A; color: #FAFAFA; padding: 20px;">
<div style="max-width: 600px; margin: 0 auto; background: #141414; border-radius: 12px; padding: 30px; border: 1px solid #D4AF37;">
<h1 style="color: #D4AF37; margin-bottom: 20px;">Nouvelle Course Assignée</h1>

<h2 style="color: #FAFAFA;">Détails du client</h2>
<p><strong>Nom:</strong> {client.get('name', 'N/A')}</p>
<p><strong>Téléphone:</strong> {client.get('phone', 'N/A')}</p>
<p><strong>Email:</strong> {client.get('email', 'N/A')}</p>

<h2 style="color: #FAFAFA; margin-top: 20px;">Détails de la course</h2>
<p><strong>📅 Date:</strong> {booking['pickup_date']}</p>
<p><strong>⏰ Heure:</strong> {booking['pickup_time']}</p>
<p><strong>📍 Départ:</strong> {booking['pickup_address']}</p>
<p><strong>🏁 Arrivée:</strong> {booking['dropoff_address']}</p>
<p><strong>Type:</strong> {booking['transfer_type']}</p>
{f"<p><strong>Notes:</strong> {booking.get('notes', '')}</p>" if booking.get('notes') else ""}

<div style="margin-top: 30px; padding: 20px; background: #D4AF37; border-radius: 8px; text-align: center;">
<p style="color: #0A0A0A; font-weight: bold; margin: 0;">Connectez-vous à votre espace chauffeur pour confirmer</p>
{f"<p style='margin-top: 10px;'><a href='{order_download_url}' style='color: #0A0A0A; font-weight: bold;'>Télécharger le bon de commande</a></p>" if order_download_url else ""}
</div>
</div>
</body>
</html>
"""
    await send_notification_email(driver['email'], subject, html_content)

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
        html_content = f"""
<html>
<body style="font-family: Arial, sans-serif; background-color: #0A0A0A; color: #FAFAFA; padding: 20px;">
<div style="max-width: 600px; margin: 0 auto; background: #141414; border-radius: 12px; padding: 30px; border: 1px solid #D4AF37;">
<h1 style="color: #D4AF37; margin-bottom: 20px;">Réinitialisation de votre mot de passe</h1>
<p>Bonjour,</p>
<p>Vous avez demandé la réinitialisation de votre mot de passe Econnect VTC.</p>
<p>Cliquez sur le lien ci-dessous pour créer un nouveau mot de passe :</p>
<div style="text-align: center; margin: 30px 0;">
<a href="{reset_link}" style="background-color: #D4AF37; color: #0A0A0A; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Réinitialiser mon mot de passe</a>
</div>
<p style="color: #A1A1AA; font-size: 14px;">Ce lien est valide pendant 24 heures.</p>
<p style="color: #A1A1AA; font-size: 14px;">Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
</div>
</body>
</html>
"""
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

@api_router.post("/bookings", response_model=BookingResponse)
async def create_booking(booking: BookingCreate, request: Request):
    user = await get_current_user(request)

    # Get vehicle category name if provided
    vehicle_category_name = None
    if booking.vehicle_category_id:
        category = await db.vehicle_categories.find_one({"id": booking.vehicle_category_id})
        if category:
            vehicle_category_name = category["name"]

    booking_id = str(uuid.uuid4())
    booking_doc = {
        "id": booking_id,
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
        "status": "pending",
        "driver_id": None,
        "driver_name": None,
        "commission_override": None,
        "cancellation_reason": None,
        "driver_cancellation_reason": None,
        "cancellation_previous_status": None,
        "refund_amount": None,
        "refunded_at": None,
        "created_at": datetime.now(timezone.utc),
        "assigned_at": None
    }

    await db.bookings.insert_one(booking_doc)
    booking_doc.pop("_id", None)
    return BookingResponse(**booking_doc)

@api_router.get("/bookings/my", response_model=List[BookingResponse])
async def get_my_bookings(request: Request):
    user = await get_current_user(request)
    bookings = await db.bookings.find({"client_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [BookingResponse(**b) for b in bookings]

@api_router.put("/bookings/{booking_id}")
async def update_booking(booking_id: str, payload: dict, request: Request):
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("client_id") != user.get("id"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    if booking.get("status") not in ("pending", "received"):
        raise HTTPException(status_code=400, detail="Impossible de modifier une course en cours ou terminée")

    allowed_fields = ["pickup_address", "dropoff_address", "pickup_date", "pickup_time", "notes", "transfer_type"]
    update_data = {k: v for k, v in payload.items() if k in allowed_fields}
    if "transfer_type" in update_data and update_data["transfer_type"] not in ("standard", "business", "van"):
        raise HTTPException(status_code=400, detail="Type de transfert invalide")
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ valide à modifier")

    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})
    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return updated

@api_router.post("/bookings/{booking_id}/cancel-request")
async def request_booking_cancellation(booking_id: str, payload: BookingCancelRequest, request: Request):
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("client_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Accès refusé à cette réservation")

    if booking.get("status") not in ["pending", "assigned"]:
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

@api_router.post("/bookings/{booking_id}/comments")
async def add_booking_comment(booking_id: str, payload: dict, request: Request):
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    role = user.get("role")
    if role == "client" and booking.get("client_id") != user.get("id"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    if role == "driver" and booking.get("driver_id") != user.get("id"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    if role not in ("admin", "client", "driver"):
        raise HTTPException(status_code=403, detail="Accès refusé")

    comment_text = payload.get("comment", "").strip()
    if not comment_text:
        raise HTTPException(status_code=400, detail="Commentaire vide")

    comment = {
        "id": str(uuid.uuid4()),
        "booking_id": booking_id,
        "author_id": user["id"],
        "author_name": user.get("name", "Inconnu"),
        "author_role": role,
        "comment": comment_text,
        "created_at": datetime.utcnow().isoformat()
    }
    await db.booking_comments.insert_one(comment)
    comment.pop("_id", None)
    return comment

@api_router.get("/bookings/{booking_id}/comments")
async def get_booking_comments(booking_id: str, request: Request):
    user = await get_current_user(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    role = user.get("role")
    if role == "client" and booking.get("client_id") != user.get("id"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    if role == "driver" and booking.get("driver_id") != user.get("id"):
        raise HTTPException(status_code=403, detail="Accès refusé")
    if role not in ("admin", "client", "driver"):
        raise HTTPException(status_code=403, detail="Accès refusé")

    comments = await db.booking_comments.find({"booking_id": booking_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    return comments

# ==================== DRIVER ROUTES ====================

@api_router.get("/driver/bookings", response_model=List[BookingResponse])
async def get_driver_bookings(request: Request):
    user = await require_driver(request)
    bookings = await db.bookings.find(
        {"driver_id": user["id"], "status": {"$in": ["assigned", "in_progress", "completed"]}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return [BookingResponse(**b) for b in bookings]

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

    valid_statuses = ["in_progress", "completed"]
    if status_update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs acceptées: {valid_statuses}")

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": status_update.status}}
    )

    return {"message": "Statut mis à jour", "status": status_update.status}

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

    if booking.get("status") != "assigned":
        raise HTTPException(status_code=400, detail="Vous ne pouvez annuler que les courses assignées non démarrées")

    update_data = {
        "status": "received",
        "driver_id": None,
        "driver_name": None,
        "assigned_at": None,
        "driver_cancellation_reason": payload.cancellation_reason,
        "cancellation_previous_status": booking.get("status")
    }

    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})

    return {"message": "Vous vous êtes retiré de cette course. Elle sera réassignée.", "status": "received"}

# ==================== ADMIN ROUTES ====================

@api_router.get("/admin/stats", response_model=StatsResponse)
async def get_admin_stats(request: Request):
    await require_admin(request)

    total_bookings = await db.bookings.count_documents({})
    pending_bookings = await db.bookings.count_documents({"status": "pending"})
    assigned_bookings = await db.bookings.count_documents({"status": "assigned"})
    completed_bookings = await db.bookings.count_documents({"status": "completed"})
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
async def get_all_bookings(request: Request, status: Optional[str] = None):
    await require_admin(request)

    query = {}
    if status:
        query["status"] = status

    bookings = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [BookingResponse(**b) for b in bookings]

@api_router.post("/admin/bookings", response_model=BookingResponse)
async def create_admin_booking(booking: AdminBookingCreate, request: Request):
    await require_admin(request)

    vehicle_category_name = None
    if booking.vehicle_category_id:
        category = await db.vehicle_categories.find_one({"id": booking.vehicle_category_id})
        if category:
            vehicle_category_name = category["name"]

    booking_doc = {
        "id": str(uuid.uuid4()),
        "client_id": None,
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
        "distance_km": None,
        "duration_minutes": None,
        "estimated_price": booking.estimated_price,
        "notes": booking.notes,
        "status": "received",
        "driver_id": None,
        "driver_name": None,
        "commission_override": None,
        "cancellation_reason": None,
        "driver_cancellation_reason": None,
        "cancellation_previous_status": None,
        "refund_amount": None,
        "refunded_at": None,
        "created_at": datetime.now(timezone.utc),
        "assigned_at": None
    }

    await db.bookings.insert_one(booking_doc)
    booking_doc.pop("_id", None)
    return BookingResponse(**booking_doc)

@api_router.put("/admin/bookings/{booking_id}")
async def update_booking_admin(booking_id: str, payload: dict, request: Request):
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    allowed_fields = ["pickup_address", "dropoff_address", "pickup_date", "pickup_time", "notes", "estimated_price", "vehicle_category_id"]
    update_data = {k: v for k, v in payload.items() if k in allowed_fields}
    if "estimated_price" in update_data and update_data["estimated_price"] is not None:
        try:
            estimated_price = float(update_data["estimated_price"])
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="Prix estimé invalide") from exc
        if estimated_price < 0:
            raise HTTPException(status_code=400, detail="Le prix estimé doit être positif")
        update_data["estimated_price"] = estimated_price
    if "vehicle_category_id" in update_data and update_data["vehicle_category_id"]:
        category = await db.vehicle_categories.find_one({"id": update_data["vehicle_category_id"]}, {"_id": 0})
        if not category:
            raise HTTPException(status_code=404, detail="Catégorie de véhicule non trouvée")
        update_data["vehicle_category_name"] = category.get("name")
    if "vehicle_category_id" in update_data and not update_data["vehicle_category_id"]:
        update_data["vehicle_category_name"] = None

    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ valide à modifier")

    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})
    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return updated

@api_router.put("/admin/bookings/{booking_id}/assign")
async def assign_booking_to_driver(booking_id: str, assign_data: AssignBooking, request: Request):
    await require_admin(request)

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("status") != "received":
        raise HTTPException(status_code=400, detail="La course doit être réceptionnée avant assignation")

    driver = await db.users.find_one({"id": assign_data.driver_id, "role": "driver"})
    if not driver:
        raise HTTPException(status_code=404, detail="Chauffeur non trouvé")

    assigned_at = datetime.now(timezone.utc)
    updated_booking = {
        **booking,
        "driver_id": driver["id"],
        "driver_name": driver["name"],
        "status": "assigned",
        "assigned_at": assigned_at
    }
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "driver_id": driver["id"],
            "driver_name": driver["name"],
            "status": "assigned",
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
    if booking.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Seules les courses en attente peuvent être réceptionnées")

    await db.bookings.update_one({"id": booking_id}, {"$set": {"status": "received"}})
    return {"message": "Course réceptionnée", "status": "received"}

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
    await require_admin(request)
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")
    if booking.get("status") != "cancellation_requested":
        raise HTTPException(status_code=400, detail="Cette réservation n'a pas de demande d'annulation en attente")

    if payload.approved:
        await db.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "status": "cancelled",
                "refund_amount": payload.refund_amount,
                "refunded_at": datetime.now(timezone.utc)
            }}
        )
        return {"message": "Annulation approuvée", "status": "cancelled"}

    fallback_status = booking.get("cancellation_previous_status")
    if fallback_status not in ["pending", "assigned"]:
        fallback_status = "assigned" if booking.get("driver_id") else "pending"

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "status": fallback_status,
            "refund_amount": None,
            "refunded_at": None
        }}
    )
    return {"message": "Annulation refusée", "status": fallback_status}

@api_router.put("/admin/bookings/{booking_id}/cancel")
async def cancel_booking_admin(booking_id: str, payload: AdminCancellationRequest, request: Request):
    await require_admin(request)

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    if booking.get("status") not in ["pending", "received", "assigned"]:
        raise HTTPException(status_code=400, detail="Cette réservation ne peut pas être annulée")

    update_data = {
        "status": "cancelled",
        "cancellation_reason": payload.cancellation_reason,
        "driver_id": None,
        "driver_name": None,
        "assigned_at": None,
        "cancellation_previous_status": booking.get("status")
    }

    await db.bookings.update_one({"id": booking_id}, {"$set": update_data})

    return {"message": "Course annulée par l'administration", "status": "cancelled"}

@api_router.put("/admin/bookings/{booking_id}/status")
async def update_booking_status_admin(booking_id: str, status_update: BookingStatusUpdate, request: Request):
    await require_admin(request)

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Réservation non trouvée")

    valid_statuses = ["pending", "received", "assigned", "in_progress", "completed", "cancellation_requested", "cancelled"]
    if status_update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs acceptées: {valid_statuses}")

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": status_update.status}}
    )

    return {"message": "Statut mis à jour", "status": status_update.status}

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

@api_router.get("/admin/disposition-rates")
async def get_disposition_rates(request: Request):
    await require_admin(request)
    rates = await db.disposition_rates.find({}, {"_id": 0}).sort([("vehicle_category_name", 1), ("duration_hours", 1)]).to_list(1000)
    return rates

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
    allowed_fields = {"vehicle_category_name", "duration_hours", "price", "is_active"}
    update_data = {k: v for k, v in payload.items() if k in allowed_fields}
    if "duration_hours" in update_data:
        update_data["duration_hours"] = float(update_data["duration_hours"])
    if "price" in update_data:
        update_data["price"] = float(update_data["price"])
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucun champ valide à modifier")
    await db.disposition_rates.update_one({"id": rate_id}, {"$set": update_data})
    rate = await db.disposition_rates.find_one({"id": rate_id}, {"_id": 0})
    return rate

@api_router.delete("/admin/disposition-rates/{rate_id}")
async def delete_disposition_rate(rate_id: str, request: Request):
    await require_admin(request)
    await db.disposition_rates.delete_one({"id": rate_id})
    return {"message": "Supprimé"}

@api_router.get("/disposition-rates")
async def get_public_disposition_rates():
    rates = await db.disposition_rates.find({"is_active": True}, {"_id": 0}).sort([("vehicle_category_name", 1), ("duration_hours", 1)]).to_list(1000)
    return rates

# ==================== PRICE ESTIMATION ROUTE ====================

@api_router.post("/estimate-price", response_model=List[PriceEstimate])
async def estimate_price(distance_km: float, duration_minutes: float = 0):
    """
    Calculate price estimates for all vehicle categories based on distance.
    Returns price for each category with minimum fare applied.
    """
    if distance_km <= 0:
        raise HTTPException(status_code=400, detail="La distance doit être positive")

    categories = await db.vehicle_categories.find({"is_active": True}, {"_id": 0}).sort("order", 1).to_list(100)

    estimates = []
    for cat in categories:
        base_price = distance_km * cat["price_per_km"]
        final_price = max(base_price, cat["min_fare"])

        estimates.append(PriceEstimate(
            category_id=cat["id"],
            category_name=cat["name"],
            distance_km=round(distance_km, 2),
            duration_minutes=round(duration_minutes, 0),
            base_price=round(base_price, 2),
            final_price=round(final_price, 2),
            min_fare=cat["min_fare"],
            price_per_km=cat["price_per_km"]
        ))

    return estimates

# ==================== FINANCIAL ROUTES ====================

@api_router.get("/admin/financial/stats", response_model=FinancialStats)
async def get_financial_stats(request: Request, driver_id: Optional[str] = None):
    await require_admin(request)
    settings = await get_commission_settings()

    query = {"status": "completed", "estimated_price": {"$ne": None}}
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
        breakdown = compute_financial_breakdown(
            booking["estimated_price"],
            settings["commission_rate"],
            settings["tva_client_rate"],
            settings["tva_commission_rate"],
            booking.get("commission_override")
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
        {"status": "completed", "estimated_price": {"$ne": None}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    result = []
    for b in bookings:
        breakdown = compute_financial_breakdown(
            b["estimated_price"],
            settings["commission_rate"],
            settings["tva_client_rate"],
            settings["tva_commission_rate"],
            b.get("commission_override")
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
            "tva_client_rate": settings["tva_client_rate"],
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
        {"driver_id": driver["id"], "status": "completed", "estimated_price": {"$ne": None}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    earnings = []
    for booking in bookings:
        breakdown = compute_financial_breakdown(
            booking["estimated_price"],
            settings["commission_rate"],
            settings["tva_client_rate"],
            settings["tva_commission_rate"],
            booking.get("commission_override")
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
        {"driver_id": driver["id"], "status": "completed", "estimated_price": {"$ne": None}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    result = []
    for b in bookings:
        breakdown = compute_financial_breakdown(
            b["estimated_price"],
            settings["commission_rate"],
            settings["tva_client_rate"],
            settings["tva_commission_rate"],
            b.get("commission_override")
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
                "max_passengers": 3,
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
                "has_wifi": True,
                "max_passengers": 7,
                "max_luggage": 7,
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
                "max_passengers": 3,
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
                "max_luggage": 3,
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
            if not expected_metadata:
                continue

            missing_fields = {}
            for field_name, expected_value in expected_metadata.items():
                if field_name not in category or category.get(field_name) is None:
                    missing_fields[field_name] = expected_value

            if missing_fields:
                await db.vehicle_categories.update_one({"id": category["id"]}, {"$set": missing_fields})
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
