"""Versioned booking terms. Published versions must never be edited or removed."""

import os
from io import BytesIO
from pathlib import Path
from types import MappingProxyType
from xml.sax.saxutils import escape

from pydantic import BaseModel, ConfigDict, Field
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


class TermsSection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    heading: str = Field(min_length=1)
    paragraphs: tuple[str, ...] = Field(min_length=1)


class TermsDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)
    version: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    title: str = Field(min_length=1)
    sections: tuple[TermsSection, ...] = Field(min_length=1)


CURRENT_TERMS_VERSION = "2026-11-04"
# Explicit allowlist: no request value is ever used to construct a filesystem path.
_ASSETS = {
    "2026-11-04": Path(__file__).parent / "assets" / "booking-terms" / "2026-11-04.json",
}
_documents = {}
for _version, _path in _ASSETS.items():
    _document = TermsDocument.model_validate_json(_path.read_bytes())
    if _document.version != _version:
        raise ValueError(f"Booking terms asset version mismatch: {_version}")
    _documents[_version] = _document
TERMS_DOCUMENTS = MappingProxyType(_documents)


def booking_terms_enabled(published: bool = False) -> bool:
    """Publication enables consent live; an explicit false is an emergency kill switch."""
    return published and os.environ.get("BOOKING_TERMS_ENABLED", "").strip().lower() != "false"


def generate_booking_terms_pdf(version: str) -> bytes:
    return generate_legal_document_pdf(TERMS_DOCUMENTS[version].model_dump(mode="json"))


def generate_legal_document_pdf(document: dict) -> bytes:
    output = BytesIO()
    pdf = SimpleDocTemplate(
        output, pagesize=A4, rightMargin=48, leftMargin=48,
        topMargin=48, bottomMargin=48, title=document["title"],
    )
    styles = getSampleStyleSheet()
    styles["BodyText"].textColor = colors.HexColor("#222222")
    story = [
        Paragraph(escape(document["title"]), styles["Title"]),
        Paragraph(f"Version : {escape(document['version'])}", styles["Normal"]),
        Spacer(1, 16),
    ]
    for section in document["sections"]:
        story.append(Paragraph(escape(section["heading"]), styles["Heading2"]))
        for paragraph in section["paragraphs"]:
            story.append(Paragraph(escape(paragraph), styles["BodyText"]))
            story.append(Spacer(1, 8))
    pdf.build(story)
    return output.getvalue()
