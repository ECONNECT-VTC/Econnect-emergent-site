import asyncio
import os
import unittest
from base64 import b64decode
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from tests.test_invoice_email import _make_brevo_sdk, email_service, server


class TestDriverEmails(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.booking = {
            "id": "abcdef123456",
            "driver_id": "driver-1",
            "client_id": None,
            "client_email": "guest@example.com",
            "client_name": "<Client & Test>",
            "pickup_date": "2026-10-12",
            "pickup_time": "09:30",
            "pickup_address": "<Paris>",
            "dropoff_address": "CDG",
            "estimated_price": 80.0,
            "status": "COMPLETED",
            "transfer_type": "simple",
        }
        self.driver = {
            "id": "driver-1",
            "name": "Chauffeur",
            "email": "driver@example.com",
            "phone": "0601020304",
            "vehicle_model": "Tesla Model Y",
            "vehicle_plate": "AA-123-BB",
        }
        self.bookings = SimpleNamespace(
            find_one=AsyncMock(return_value={}),
            update_one=AsyncMock(return_value=SimpleNamespace(modified_count=1)),
        )
        self.users = SimpleNamespace(find_one=AsyncMock(return_value=self.driver))
        self.settings = {"commission_rate": 0.1, "tva_commission_rate": 0.2}
        self.payloads = []
        patches = (
            patch.object(server, "db", SimpleNamespace(bookings=self.bookings, users=self.users)),
            patch.object(server, "get_commission_settings", AsyncMock(return_value=self.settings)),
            patch.object(server, "generate_and_store_document", AsyncMock(return_value=(b"%PDF-test", {}))),
            patch.dict(os.environ, {
                "BREVO_API_KEY": "brevo-test-key",
                "BREVO_TEMPLATE_DRIVER_ASSIGNED_CLIENT": "4001",
                "BREVO_TEMPLATE_DRIVER_DOCUMENTS": "4002",
            }),
            patch.object(email_service, "sib_api_v3_sdk", _make_brevo_sdk(self.payloads)),
            patch.object(email_service.asyncio, "to_thread", side_effect=lambda fn: fn()),
        )
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    async def test_guest_receives_assignment_params_without_account_lookup(self):
        self.assertTrue(await server.send_driver_assigned_to_client(self.booking, self.driver))
        payload = self.payloads[0]
        self.assertEqual(payload["to"], [{"email": "guest@example.com"}])
        self.assertEqual(payload["subject"], "🚗 Votre chauffeur est assigné – course #ABCDEF12")
        self.assertEqual(payload["template_id"], 4001)
        self.assertEqual(payload["params"], {
            "CLIENT_NAME": "<Client & Test>",
            "BOOKING_ID": "abcdef123456",
            "PICKUP_DATE": "2026-10-12",
            "PICKUP_TIME": "09:30",
            "PICKUP_ADDRESS": "<Paris>",
            "DROPOFF_ADDRESS": "CDG",
            "DRIVER_NAME": "Chauffeur",
            "DRIVER_PHONE": "0601020304",
            "VEHICLE_MODEL": "Tesla Model Y",
            "VEHICLE_PLATE": "AA-123-BB",
            "BOOKING_URL": f"{server.FRONTEND_URL}/fr/client/bookings",
        })
        self.users.find_one.assert_not_awaited()
        self.assertEqual(
            self.bookings.update_one.await_args_list[-2].args[1],
            {"$set": {"client_driver_notified_driver_id": "driver-1"}},
        )

    async def test_normal_assignment_hook_preserves_driver_email(self):
        self.booking["status"] = "QUOTE_ACCEPTED"
        self.bookings.find_one.return_value = self.booking
        with patch.object(server, "require_admin", AsyncMock()):
            await server.assign_booking_to_driver(
                self.booking["id"], server.AssignBooking(driver_id="driver-1"),
                SimpleNamespace(base_url="https://example.com/"),
            )
        self.assertEqual(len(self.payloads), 2)
        self.assertEqual(self.payloads[0]["params"]["DRIVER_NAME"], self.driver["name"])
        self.assertEqual(self.payloads[0]["params"]["DRIVER_PHONE"], self.driver["phone"])
        self.assertEqual(self.payloads[1]["to"], [{"email": self.driver["email"]}])

    async def test_assignment_fallback_escapes_values_and_uses_unknown_placeholders(self):
        with patch.dict(os.environ, {"BREVO_TEMPLATE_DRIVER_ASSIGNED_CLIENT": ""}):
            await server.send_driver_assigned_to_client(self.booking, {"name": "<Chauffeur>"})
        html = self.payloads[0]["html_content"]
        self.assertIn("&lt;Client &amp; Test&gt;", html)
        self.assertIn("&lt;Chauffeur&gt;", html)
        self.assertIn("&lt;Paris&gt;", html)
        self.assertIn("<td>-</td>", html)
        self.assertIn("Voir mes réservations", html)

    async def test_admin_self_assignment_uses_updated_fleet_and_contact_without_role_labels(self):
        admin = {"id": "staff-1", "name": "Oumar Administrateur", "phone": "0600000000",
                 "email": "staff@example.com"}
        vehicle = {"id": "fleet-1", "brand": "Mercedes", "model": "Classe E", "plate": "BB-456-CC"}
        for template in ("4001", ""):
            with self.subTest(template=template):
                booking = {**self.booking, "status": "QUOTE_ACCEPTED"}
                self.bookings.find_one.side_effect = lambda *_args, **_kwargs: dict(booking)

                async def update_booking(_query, update):
                    booking.update(update.get("$set", {}))
                    for key in update.get("$unset", {}):
                        booking.pop(key, None)
                    return SimpleNamespace(modified_count=1)

                self.bookings.update_one.side_effect = update_booking
                with patch.object(server, "require_admin", AsyncMock(return_value=admin)), patch.object(
                    server.db, "admin_vehicles", SimpleNamespace(find_one=AsyncMock(return_value=vehicle)),
                    create=True,
                ), patch.object(server, "BookingResponse", side_effect=lambda **kwargs: kwargs), patch.dict(
                    os.environ, {"BREVO_TEMPLATE_DRIVER_ASSIGNED_CLIENT": template}
                ):
                    await server.admin_assign_self(
                        booking["id"], object(),
                        server.AdminAssignSelfRequest(vehicle_id="fleet-1", driver_display_name="Oumar"),
                    )
                payload = self.payloads[-1]
                if template:
                    self.assertEqual(payload["params"]["DRIVER_NAME"], "Oumar")
                    self.assertEqual(payload["params"]["DRIVER_PHONE"], admin["phone"])
                    self.assertEqual(payload["params"]["VEHICLE_MODEL"], "Mercedes Classe E")
                    self.assertEqual(payload["params"]["VEHICLE_PLATE"], vehicle["plate"])
                else:
                    self.assertIn("Mercedes Classe E", payload["html_content"])
                    self.assertIn(admin["phone"], payload["html_content"])
                visible = payload["subject"] + payload.get("html_content", "") + str(payload.get("params", {}))
                self.assertNotIn("admin", visible.lower())
                self.assertNotIn("administrat", visible.lower())

    async def test_admin_name_fallback_removes_internal_labels_and_missing_phone_is_dash(self):
        booking = {**self.booking, "fulfilled_by_admin": True}
        with patch.object(server, "send_notification_email", AsyncMock(return_value=True)) as send:
            await server.send_driver_assigned_to_client(booking, {"name": "Oumar Administrateur"})
        params = send.await_args.kwargs["template_params"]
        self.assertEqual(params["DRIVER_NAME"], "Oumar")
        self.assertEqual(params["DRIVER_PHONE"], "-")
        visible = str(send.await_args.args[1:]) + str(params)
        self.assertNotIn("admin", visible.lower())

    async def test_assignment_dedup_and_reassignment(self):
        self.booking["client_driver_notified_driver_id"] = "driver-1"
        self.assertFalse(await server.send_driver_assigned_to_client(self.booking, self.driver))
        self.booking.pop("client_driver_notified_driver_id")
        self.bookings.find_one.return_value = {"client_driver_notified_driver_id": "driver-1"}
        self.assertFalse(await server.send_driver_assigned_to_client(self.booking, self.driver))
        self.booking["driver_id"] = "driver-2"
        self.assertTrue(await server.send_driver_assigned_to_client(self.booking, {**self.driver, "id": "driver-2"}))
        self.assertEqual(len(self.payloads), 1)

    async def test_assignment_skips_missing_email(self):
        self.booking.pop("client_email")
        self.assertFalse(await server.send_driver_assigned_to_client(self.booking, self.driver))
        self.assertFalse(self.payloads)

    async def test_documents_payload_contains_only_three_pdfs_and_net_earning(self):
        self.assertTrue(await server.send_driver_documents(self.booking))
        payload = self.payloads[0]
        self.assertEqual(payload["to"], [{"email": "driver@example.com"}])
        self.assertEqual(payload["subject"], "📎 Vos documents – course #ABCDEF12")
        self.assertEqual(payload["template_id"], 4002)
        self.assertEqual(payload["params"], {
            "DRIVER_NAME": "Chauffeur", "BOOKING_ID": "abcdef123456",
            "PICKUP_DATE": "2026-10-12", "PICKUP_TIME": "09:30",
            "PICKUP_ADDRESS": "<Paris>", "DROPOFF_ADDRESS": "CDG",
            "AMOUNT": "72.00 €", "DASHBOARD_URL": f"{server.FRONTEND_URL}/fr/driver",
        })
        self.assertEqual([item["name"] for item in payload["attachment"]], [
            "facture-chauffeur-ABCDEF12.pdf", "facture-commission-ABCDEF12.pdf",
            "releve-activite-ABCDEF12.pdf",
        ])
        for item in payload["attachment"]:
            self.assertEqual(b64decode(item["content"]), b"%PDF-test")
        self.assertEqual(
            [call.args[2] for call in server.generate_and_store_document.await_args_list],
            ["driver", "commission", "activity"],
        )
        self.users.find_one.assert_awaited_once_with(
            {"id": "driver-1", "role": server.build_driver_role_query()}
        )
        self.assertIn("driver_documents_email_sent_at", self.bookings.update_one.await_args_list[-2].args[1]["$set"])

    async def test_documents_amount_respects_existing_commission_override(self):
        self.booking["commission_override"] = 5.0
        await server.send_driver_documents(self.booking)
        self.assertEqual(self.payloads[0]["params"]["AMOUNT"], "75.00 €")

    async def test_documents_html_fallback_lists_documents_and_escapes_values(self):
        self.driver["name"] = "<Chauffeur>"
        with patch.dict(os.environ, {"BREVO_TEMPLATE_DRIVER_DOCUMENTS": ""}):
            await server.send_driver_documents(self.booking)
        html = self.payloads[0]["html_content"]
        for label in ("Facture chauffeur", "Facture de commission", "Relevé d'activité"):
            self.assertIn(label, html)
        self.assertNotIn("Bon de commande", html)
        self.assertIn("&lt;Paris&gt;", html)
        self.assertIn("&lt;Chauffeur&gt;", html)
        self.assertEqual(len(self.payloads[0]["attachment"]), 3)

    async def test_documents_skip_admin_and_dedup_in_memory_or_database(self):
        for flag in ("fulfilled_by_admin", "driver_documents_email_sent_at"):
            with self.subTest(flag=flag):
                self.assertFalse(await server.send_driver_documents({**self.booking, flag: True}))
        self.bookings.find_one.return_value = {"driver_documents_email_sent_at": "sent"}
        self.assertFalse(await server.send_driver_documents(self.booking))
        self.assertFalse(self.payloads)
        server.generate_and_store_document.assert_not_awaited()

    async def test_documents_skip_missing_driver_or_email(self):
        for driver in (None, {"id": "driver-1", "role": "driver"}):
            self.users.find_one.return_value = driver
            self.assertFalse(await server.send_driver_documents(self.booking))
        self.assertFalse(self.payloads)

    async def test_failures_do_not_raise_or_set_dedup_flags(self):
        for result in (False, RuntimeError("transport unavailable")):
            mock = AsyncMock(return_value=result) if result is False else AsyncMock(side_effect=result)
            with patch.object(server, "send_notification_email", mock):
                self.assertFalse(await server.send_driver_assigned_to_client(self.booking, self.driver))
                self.assertFalse(await server.send_driver_documents(self.booking))
        delivery_flags = {"client_driver_notified_driver_id", "driver_documents_email_sent_at"}
        for call in self.bookings.update_one.await_args_list:
            self.assertFalse(delivery_flags.intersection(call.args[1].get("$set", {})))
        self.assertIn("$unset", self.bookings.update_one.await_args.args[1])

    async def test_document_generation_failure_does_not_send_partial_attachments(self):
        server.generate_and_store_document.side_effect = [(b"%PDF-test", {}), RuntimeError("PDF failed")]
        self.assertFalse(await server.send_driver_documents(self.booking))
        self.assertFalse(self.payloads)
        self.assertIn("$unset", self.bookings.update_one.await_args.args[1])

    async def test_atomic_claim_prevents_concurrent_duplicate_emails(self):
        for notifier in (
            lambda: server.send_driver_assigned_to_client(self.booking, self.driver),
            lambda: server.send_driver_documents(self.booking),
        ):
            with self.subTest(notifier=notifier):
                state = {}

                async def update_booking(query, update):
                    values = update.get("$set", {})
                    pending = next((key for key in values if key.endswith("_pending")), None)
                    if pending:
                        flag = pending.removesuffix("_pending")
                        condition = query[flag]
                        already_sent = (
                            flag in state if "$exists" in condition
                            else state.get(flag) == condition["$ne"]
                        )
                        if pending in state or already_sent:
                            return SimpleNamespace(modified_count=0)
                    state.update(values)
                    for key in update.get("$unset", {}):
                        state.pop(key, None)
                    return SimpleNamespace(modified_count=1)

                self.bookings.update_one.side_effect = update_booking
                started, finish = asyncio.Event(), asyncio.Event()

                async def send_email(*_args, **_kwargs):
                    started.set()
                    await finish.wait()
                    return True

                with patch.object(server, "send_notification_email", AsyncMock(side_effect=send_email)) as send:
                    first = asyncio.create_task(notifier())
                    try:
                        await asyncio.wait_for(started.wait(), timeout=2)
                        self.assertFalse(await notifier())
                    finally:
                        finish.set()
                        self.assertTrue(await first)
                    self.assertFalse(await notifier())
                    send.assert_awaited_once()
                self.assertFalse(any(key.endswith("_pending") for key in state))

    async def test_claim_can_recover_abandoned_delivery_and_release_failed_send(self):
        with patch.object(server, "send_notification_email", AsyncMock(return_value=False)):
            self.assertFalse(await server.send_driver_documents(self.booking))
        query, update = self.bookings.update_one.await_args_list[0].args
        pending = "driver_documents_email_sent_at_pending"
        self.assertIn(f"{pending}.claimed_at", query["$or"][1])
        self.assertIn("$lt", query["$or"][1][f"{pending}.claimed_at"])
        token = update["$set"][pending]["token"]
        release_query, release_update = self.bookings.update_one.await_args.args
        self.assertEqual(release_query[f"{pending}.token"], token)
        self.assertEqual(release_update, {"$unset": {pending: ""}})

    async def test_in_flight_assignment_does_not_suppress_reassignment(self):
        state = {"driver_id": "driver-1"}
        pending = "client_driver_notified_driver_id_pending"
        flag = "client_driver_notified_driver_id"

        async def update_booking(query, update):
            if query.get("driver_id") and query["driver_id"] != state["driver_id"]:
                return SimpleNamespace(modified_count=0)
            values = update.get("$set", {})
            if pending in values:
                if state.get(flag) == query[flag]["$ne"]:
                    return SimpleNamespace(modified_count=0)
                if pending in state and state[pending]["driver_id"] == query["driver_id"]:
                    return SimpleNamespace(modified_count=0)
                self.assertIn({f"{pending}.driver_id": {"$ne": query["driver_id"]}}, query["$or"])
            if f"{pending}.token" in query:
                if state.get(pending, {}).get("token") != query[f"{pending}.token"]:
                    return SimpleNamespace(modified_count=0)
            state.update(values)
            for key in update.get("$unset", {}):
                state.pop(key, None)
            return SimpleNamespace(modified_count=1)

        self.bookings.update_one.side_effect = update_booking
        started, finish = asyncio.Event(), asyncio.Event()

        async def send_email(*_args, **kwargs):
            if kwargs["template_params"]["DRIVER_NAME"] == "Chauffeur":
                started.set()
                await finish.wait()
            return True

        with patch.object(server, "send_notification_email", AsyncMock(side_effect=send_email)) as send:
            first = asyncio.create_task(server.send_driver_assigned_to_client(self.booking, self.driver))
            try:
                await asyncio.wait_for(started.wait(), timeout=2)
                state["driver_id"] = "driver-2"
                self.assertTrue(await server.send_driver_assigned_to_client(
                    {**self.booking, "driver_id": "driver-2"},
                    {**self.driver, "id": "driver-2", "name": "Second Chauffeur"},
                ))
            finally:
                finish.set()
                self.assertTrue(await first)
            self.assertEqual(send.await_count, 2)
        self.assertEqual(state[flag], "driver-2")
        self.assertNotIn(pending, state)

    async def test_completion_notifications_isolate_both_recipients(self):
        for failing in ("notify_client_booking_completed", "send_driver_documents"):
            with self.subTest(failing=failing), patch.object(
                server, "notify_client_booking_completed", AsyncMock()
            ) as client, patch.object(server, "send_driver_documents", AsyncMock()) as driver:
                (client if failing == "notify_client_booking_completed" else driver).side_effect = RuntimeError("failed")
                await server.notify_booking_completed(self.booking)
                client.assert_awaited_once_with(self.booking)
                driver.assert_awaited_once_with(self.booking)

    async def test_all_four_status_routes_notify_without_failing_status_update(self):
        routes = [
            route for route in server.api_router.routes
            if route.path.removeprefix("/api") in (
                "/courses/{course_id}/status",
                "/driver/bookings/{booking_id}/status",
                "/admin/bookings/{booking_id}/status",
            )
        ]
        self.assertEqual(len(routes), 4)
        admin = {"id": "driver-1", "role": "admin"}
        for route in routes:
            with self.subTest(route=route.path, endpoint=route.endpoint):
                previous = {**self.booking, "status": "IN_PROGRESS", "fulfilled_by_admin": True}
                completed = {**previous, "status": "COMPLETED"}
                self.bookings.find_one.side_effect = [previous, completed]
                if "/courses/" in route.path:
                    self.bookings.find_one.side_effect = [completed]
                with patch.object(server, "require_admin", AsyncMock(return_value=admin)), patch.object(
                    server, "require_driver", AsyncMock(return_value=self.driver)
                ), patch.object(
                    server, "_get_course_for_user", AsyncMock(return_value=(admin, previous))
                ), patch.object(server, "log_booking_status_transition", AsyncMock()), patch.object(
                    server, "notify_client_booking_completed", AsyncMock()
                ) as client, patch.object(
                    server, "send_driver_documents", AsyncMock(side_effect=RuntimeError("mail failed"))
                ) as driver:
                    result = await route.endpoint(
                        self.booking["id"], server.BookingStatusUpdate(status="COMPLETED"), object()
                    )
                client.assert_awaited_once_with(completed)
                driver.assert_awaited_once_with(completed)
                status = result["status"] if isinstance(result, dict) else result.status
                self.assertEqual(status, "COMPLETED")

    async def test_transport_keeps_legacy_attachment_when_list_is_also_provided(self):
        self.assertTrue(await server.send_notification_email(
            "driver@example.com", "Documents", "<p>PDF</p>",
            attachment_bytes=b"legacy", attachment_filename="legacy.pdf",
            attachments=[("extra.pdf", b"extra")],
        ))
        self.assertEqual([item["name"] for item in self.payloads[0]["attachment"]], ["legacy.pdf", "extra.pdf"])


if __name__ == "__main__":
    unittest.main()
