"""QR code rendering for booking entry tokens.

The QR carries ONE thing: the booking's qr_token (a uuid4). Nothing else — no name,
no time, no slot id. It's pure proof-of-possession; the verify endpoint resolves
everything else from the booking row at scan time.
"""
import base64
import io

import qrcode
from qrcode.constants import ERROR_CORRECT_M


def render_png(payload: str, *, box_size: int = 10, border: int = 4) -> bytes:
    """Return PNG bytes for a QR encoding `payload`. Defaults sized for ~300x300 image —
    big enough to scan from a phone screen one foot away, small enough to inline in email."""
    qr = qrcode.QRCode(
        version=None,  # auto
        error_correction=ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def render_data_uri(payload: str) -> str:
    """Same as render_png but returns a `data:image/png;base64,…` URI for inlining
    directly into HTML emails. Resend handles ~10kB inline images comfortably."""
    png = render_png(payload)
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")
