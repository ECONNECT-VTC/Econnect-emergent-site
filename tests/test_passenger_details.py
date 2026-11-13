import os
import sys
import unittest
from pathlib import Path

from pydantic import ValidationError

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import server


BOOKING = {
    "pickup_address": "Paris", "dropoff_address": "Roissy",
    "pickup_date": "15/11/2026", "pickup_time": "12:00",
    "transfer_type": "simple",
}


class TestPassengerDetails(unittest.TestCase):
    def test_new_and_legacy_requests(self):
        for model, extra in (
            (server.BookingCreate, {}),
            (server.AdminBookingCreate, {"client_name": "Client", "client_email": "client@example.com"}),
        ):
            legacy = model(**BOOKING, **extra, passenger_count=2, baby_seat_count=1)
            self.assertIsNone(legacy.adult_count)
            new = model(**BOOKING, **extra, passenger_count=4, adult_count=2,
                        child_count=1, infant_count=1, baby_seat_count=1, booster_seat_count=1)
            self.assertEqual((new.child_count, new.infant_count, new.booster_seat_count), (1, 1, 1))
            for fields in (
                {"passenger_count": 3, "adult_count": 2, "child_count": 1, "infant_count": 1},
                {"passenger_count": 2, "adult_count": 1},
                {"passenger_count": 2, "adult_count": 1, "child_count": 0, "infant_count": 1, "booster_seat_count": 1},
                {"passenger_count": 2, "adult_count": 1, "child_count": 0, "infant_count": 1, "baby_seat_count": 2},
                {"passenger_count": 2, "booster_seat_count": 1},
            ):
                with self.subTest(model=model.__name__, fields=fields), self.assertRaises(ValidationError):
                    model(**BOOKING, **extra, **fields)

    def test_checkout_document_preserves_details(self):
        booking = server.BookingCreate(**BOOKING, passenger_count=4, adult_count=2,
                                       child_count=1, infant_count=1, baby_seat_count=1, booster_seat_count=1)
        document = server._build_client_booking_doc(
            {"id": "client", "name": "Client", "email": "client@example.com"}, booking, None,
        )
        self.assertEqual([document[key] for key in ("adult_count", "child_count", "infant_count", "booster_seat_count")], [2, 1, 1, 1])
        response = server.BookingResponse(**document)
        self.assertEqual(response.booster_seat_count, 1)


if __name__ == "__main__":
    unittest.main()
