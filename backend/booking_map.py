import asyncio
import hashlib
import json
import logging
import math
import os
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING)


class BookingCoordinates(BaseModel):
    pickup_lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    pickup_lng: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    dropoff_lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    dropoff_lng: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    distance_km: float | None = Field(default=None, ge=0, le=5000, allow_inf_nan=False)
    duration_minutes: float | None = Field(default=None, ge=0, le=10080, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_pairs(self):
        for lat, lng in [(self.pickup_lat, self.pickup_lng), (self.dropoff_lat, self.dropoff_lng)]:
            if (lat is None) != (lng is None):
                raise ValueError("La latitude et la longitude doivent être renseignées ensemble")
        return self


class MapPosition(BaseModel):
    model_config = {"extra": "forbid"}
    lat: float = Field(ge=-90, le=90, allow_inf_nan=False)
    lng: float = Field(ge=-180, le=180, allow_inf_nan=False)


class MapRouteRequest(BaseModel):
    model_config = {"extra": "forbid"}
    pickup: MapPosition
    dropoff: MapPosition


class MapSearchRequest(BaseModel):
    model_config = {"extra": "forbid"}
    q: str = Field(min_length=3, max_length=200)


def upstream_url(variable, default):
    value = os.getenv(variable, default).rstrip("/")
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise RuntimeError(f"{variable} doit être une URL HTTPS fixe sans identifiants ni paramètres")
    return value


class MapService:
    def __init__(self):
        self.geocoder = upstream_url("MAP_GEOCODER_URL", "https://photon.komoot.io")
        self.router = upstream_url("MAP_ROUTING_URL", "https://router.project-osrm.org")
        self.slots = asyncio.Semaphore(4)
        self.cache = OrderedDict()

    async def request(self, path, params, routing=False):
        url = (self.router if routing else self.geocoder) + path
        key = hashlib.sha256(json.dumps([url, params], sort_keys=True).encode()).hexdigest()
        cached = self.cache.get(key)
        if cached and cached[0] > time.monotonic():
            self.cache.move_to_end(key)
            return cached[1]
        try:
            await asyncio.wait_for(self.slots.acquire(), timeout=0.2)
        except asyncio.TimeoutError:
            raise HTTPException(429, "Service cartographique occupé. Réessayez.", headers={"Retry-After": "2"})
        try:
            data = await asyncio.wait_for(self.fetch(url, params), timeout=12)
            self.cache[key] = (time.monotonic() + 60, data)
            self.cache.move_to_end(key)
            while len(self.cache) > 128:
                self.cache.popitem(last=False)
            return data
        except (httpx.HTTPError, asyncio.TimeoutError):
            logger.warning("Map provider request failed")
            raise HTTPException(503, "Service cartographique indisponible. Réessayez.")
        finally:
            self.slots.release()

    async def fetch(self, url, params):
        headers = {
            "User-Agent": "EconnectVTC/1.0 (+https://econnect-vtc.com)",
            "Accept": "application/json",
        } if url.startswith(self.geocoder + "/") else {}
        async with httpx.AsyncClient(timeout=httpx.Timeout(10, connect=3), follow_redirects=False, trust_env=False) as client:
            async with client.stream("GET", url, params=params, headers=headers) as response:
                if response.status_code != 200:
                    logger.warning("Map provider failed with status %s", response.status_code)
                    raise HTTPException(503, "Service cartographique indisponible. Réessayez.")
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > 512_000:
                        raise HTTPException(502, "Réponse cartographique trop volumineuse.")
                try:
                    data = json.loads(content)
                except (ValueError, UnicodeDecodeError):
                    raise HTTPException(502, "Réponse cartographique invalide.")
                if not isinstance(data, dict):
                    raise HTTPException(502, "Réponse cartographique invalide.")
                return data


async def enforce_map_limits(db, identity, account_id, secret, now=None, include_public=True):
    now = now or datetime.now(timezone.utc)
    timestamp = int(now.timestamp())
    # Global budgets are consumed first so rotating identities cannot create unbounded counters.
    limits = []
    if include_public:
        limits = [("global-day", "all", 86400, 10000), ("global-minute", "all", 60, 300)]
        limits += [("ip-minute", identity, 60, 30), ("ip-day", identity, 86400, 1000)]
    if account_id:
        limits += [("account-minute", account_id, 60, 30), ("account-day", account_id, 86400, 1000)]
    for scope, value, window, limit in limits:
        bucket = timestamp // window
        digest = "all" if value == "all" else hashlib.sha256(f"{secret}:{scope}:{value}".encode()).hexdigest()
        try:
            counter = await db.map_request_limits.find_one_and_update(
                {"_id": f"{scope}:{digest}:{bucket}"},
                {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now + timedelta(days=2)}},
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
        except PyMongoError:
            logger.error("Map request limiter unavailable")
            raise HTTPException(503, "Protection cartographique indisponible. Réessayez.")
        if counter["count"] > limit:
            retry = window - timestamp % window
            raise HTTPException(429, "Trop de requêtes. Réessayez plus tard.", headers={"Retry-After": str(retry)})


def validate_route_response(data):
    if not isinstance(data, dict):
        raise HTTPException(502, "Réponse cartographique invalide.")
    route = data.get("routes", [None])[0] if isinstance(data.get("routes"), list) and data["routes"] else None
    if data.get("code") != "Ok" or not isinstance(route, dict):
        raise HTTPException(422, "Aucun itinéraire routier disponible.")
    for name in ("distance", "duration"):
        value = route.get(name)
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise HTTPException(502, "Réponse cartographique invalide.")
    if route["distance"] > 5_000_000 or route["duration"] > 604800:
        raise HTTPException(422, "Trajet trop long pour une réservation.")
    return data
