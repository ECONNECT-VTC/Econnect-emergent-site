import asyncio
import logging
import os
from base64 import b64encode
from typing import Any, Dict, Optional

try:
    import sib_api_v3_sdk
    from sib_api_v3_sdk.rest import ApiException
except ImportError:  # pragma: no cover - handled gracefully at runtime
    sib_api_v3_sdk = None

    class ApiException(Exception):
        status = None


logger = logging.getLogger(__name__)

TEMPLATE_KEY_ACCOUNT_ACTIVATION = "account_activation"
TEMPLATE_KEY_PASSWORD_RESET = "password_reset"
TEMPLATE_KEY_BOOKING_CREATED = "booking_created"
TEMPLATE_KEY_QUOTE_AVAILABLE = "quote_available"
TEMPLATE_KEY_PAYMENT_CONFIRMED = "payment_confirmed"
TEMPLATE_KEY_DRIVER_ASSIGNED = "driver_assigned"
TEMPLATE_KEY_BOOKING_COMPLETED = "booking_completed"
TEMPLATE_KEY_INVOICE = "invoice"
TEMPLATE_KEY_CANCELLATION = "cancellation"
TEMPLATE_KEY_ADMIN_MESSAGE = "admin_message"

BREVO_TEMPLATE_ENV_BY_KEY = {
    TEMPLATE_KEY_ACCOUNT_ACTIVATION: "BREVO_TEMPLATE_ACCOUNT_ACTIVATION",
    TEMPLATE_KEY_PASSWORD_RESET: "BREVO_TEMPLATE_PASSWORD_RESET",
    TEMPLATE_KEY_BOOKING_CREATED: "BREVO_TEMPLATE_BOOKING_CREATED",
    TEMPLATE_KEY_QUOTE_AVAILABLE: "BREVO_TEMPLATE_QUOTE_AVAILABLE",
    TEMPLATE_KEY_PAYMENT_CONFIRMED: "BREVO_TEMPLATE_PAYMENT_CONFIRMED",
    TEMPLATE_KEY_DRIVER_ASSIGNED: "BREVO_TEMPLATE_DRIVER_ASSIGNED",
    TEMPLATE_KEY_BOOKING_COMPLETED: "BREVO_TEMPLATE_BOOKING_COMPLETED",
    TEMPLATE_KEY_INVOICE: "BREVO_TEMPLATE_INVOICE",
    TEMPLATE_KEY_CANCELLATION: "BREVO_TEMPLATE_CANCELLATION",
    TEMPLATE_KEY_ADMIN_MESSAGE: "BREVO_TEMPLATE_ADMIN_MESSAGE",
}


def _parse_positive_template_id(raw_value: Any, source_name: str) -> Optional[int]:
    if raw_value is None:
        return None
    try:
        parsed = int(str(raw_value).strip())
    except (TypeError, ValueError):
        logger.warning("%s must be a positive integer; falling back to HTML email", source_name)
        return None
    if parsed <= 0:
        logger.warning("%s must be a positive integer; falling back to HTML email", source_name)
        return None
    return parsed


def resolve_brevo_template_id(template_key: Optional[str], template_id: Optional[int] = None) -> Optional[int]:
    explicit_template_id = _parse_positive_template_id(template_id, "template_id")
    if explicit_template_id:
        return explicit_template_id

    if not template_key:
        return None

    env_name = BREVO_TEMPLATE_ENV_BY_KEY.get(template_key)
    if env_name is None:
        logger.warning("Unknown Brevo template key '%s'; falling back to HTML email", template_key)
        return None

    return _parse_positive_template_id(os.environ.get(env_name), env_name)


async def send_brevo_transactional_email(
    to_email: str,
    subject: str,
    html_content: str,
    *,
    attachment_bytes: Optional[bytes] = None,
    attachment_filename: Optional[str] = None,
    template_key: Optional[str] = None,
    template_id: Optional[int] = None,
    template_params: Optional[Dict[str, Any]] = None,
) -> bool:
    brevo_api_key = os.environ.get("BREVO_API_KEY")
    sender_email = os.environ.get("BREVO_SENDER_EMAIL", "noreply@econnect-vtc.com")
    sender_name = os.environ.get("BREVO_SENDER_NAME", "Econnect VTC")

    if not brevo_api_key:
        logger.warning("Brevo API key not configured, skipping email")
        return False

    if sib_api_v3_sdk is None:
        logger.error("Brevo SDK unavailable, cannot send email")
        return False

    resolved_template_id = resolve_brevo_template_id(template_key, template_id)

    payload: Dict[str, Any] = {
        "sender": {"email": sender_email, "name": sender_name},
        "to": [{"email": to_email}],
        "subject": subject,
    }

    if resolved_template_id:
        payload["template_id"] = resolved_template_id
        payload["params"] = template_params or {}
    else:
        payload["html_content"] = html_content

    if attachment_bytes:
        filename = attachment_filename or "document.pdf"
        payload["attachment"] = [{"content": b64encode(attachment_bytes).decode(), "name": filename}]

    def _send_sync() -> bool:
        configuration = sib_api_v3_sdk.Configuration()
        configuration.api_key["api-key"] = brevo_api_key
        with sib_api_v3_sdk.ApiClient(configuration) as api_client:
            api_instance = sib_api_v3_sdk.TransactionalEmailsApi(api_client)
            request = sib_api_v3_sdk.SendSmtpEmail(**payload)
            api_instance.send_transac_email(request)
        return True

    try:
        return await asyncio.to_thread(_send_sync)
    except ApiException as exc:
        logger.error(
            "Brevo API error while sending email to %s (status=%s)",
            to_email,
            getattr(exc, "status", None),
        )
        return False
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.error("Unexpected email transport error (%s)", exc.__class__.__name__)
        return False
