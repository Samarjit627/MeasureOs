#!/usr/bin/env python3
"""
Generate MeasureOS backdrop print file.
Size: 8ft x 4ft (243.84 x 121.92 cm)
Purpose: vertical calibration + camera-alignment target
"""
import json
import os
import tempfile
from math import pi

import cv2
from reportlab.lib.pagesizes import landscape
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, black, white, teal

# Output
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PDF = os.path.join(OUT_DIR, "measureos_backdrop_8x4ft.pdf")
OUT_JSON = os.path.join(OUT_DIR, "backdrop_marker_map.json")

# Sheet dimensions (true size, points)
WIDTH_IN = 48.0   # 4 ft wide (horizontal on print)
HEIGHT_IN = 96.0  # 8 ft tall (vertical on print)
WIDTH_PT = WIDTH_IN * inch
HEIGHT_PT = HEIGHT_IN * inch

# Convert to cm for spec
CM_PER_IN = 2.54
WIDTH_CM = WIDTH_IN * CM_PER_IN
HEIGHT_CM = HEIGHT_IN * CM_PER_IN

# Colors
GRAY_BG = HexColor("#D8D8D8")
TEAL = HexColor("#0D9488")
DARK_GRAY = HexColor("#333333")
MARKER_BG = HexColor("#F8F8F8")

# Marker settings
ARUCO_DICT = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
MARKER_SIZE_CM = 14.0
MARKER_SIZE_IN = MARKER_SIZE_CM / CM_PER_IN
MARKER_SIZE_PT = MARKER_SIZE_IN * inch
MARKER_MARGIN_IN = 3.0
MARKER_MARGIN_PT = MARKER_MARGIN_IN * inch

# Marker grid: 2 wide x 4 tall = 8 markers, spaced evenly
COLS = 2
ROWS = 4
START_ID = 10

# Alignment circle (camera lens target)
LENS_HEIGHT_CM = 100.0  # platform top = 0
LENS_HEIGHT_IN = LENS_HEIGHT_CM / CM_PER_IN
LENS_HEIGHT_PT = LENS_HEIGHT_IN * inch
ALIGN_CIRCLE_DIA_IN = 6.0
ALIGN_CIRCLE_DIA_PT = ALIGN_CIRCLE_DIA_IN * inch

# Height ruler
RULER_X_IN = 6.0  # from right edge
RULER_WIDTH_IN = 0.6
RULER_BOTTOM_IN = MARKER_MARGIN_IN + 1.0  # start a bit above bottom
RULER_TOP_IN = HEIGHT_IN - MARKER_MARGIN_IN - 1.0
RULER_X_PT = WIDTH_PT - (RULER_X_IN * inch)
RULER_WIDTH_PT = RULER_WIDTH_IN * inch
RULER_BOTTOM_PT = RULER_BOTTOM_IN * inch
RULER_TOP_PT = RULER_TOP_IN * inch
RULER_HEIGHT_PT = RULER_TOP_PT - RULER_BOTTOM_PT


def aruco_to_png(marker_id, size_px):
    """Render a single ArUco marker to a temporary PNG file."""
    img = cv2.aruco.generateImageMarker(ARUCO_DICT, marker_id, size_px)
    # Add quiet zone (white border)
    border_px = int(size_px * 0.15)
    padded = cv2.copyMakeBorder(
        img, border_px, border_px, border_px, border_px,
        cv2.BORDER_CONSTANT, value=255
    )
    fd, path = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    cv2.imwrite(path, padded)
    return path


def draw_marker(c, marker_id, cx, cy, size_pt):
    """Draw an ArUco marker centered at (cx, cy)."""
    # Resolution: aim for ~300 dpi within marker size
    dpi = 300
    size_in = size_pt / inch
    px = int(size_in * dpi)
    png_path = aruco_to_png(marker_id, px)
    x = cx - size_pt / 2
    y = cy - size_pt / 2
    c.drawImage(png_path, x, y, width=size_pt, height=size_pt, preserveAspectRatio=True)
    os.remove(png_path)


def draw_alignment_target(c):
    """Draw the camera-lens alignment circle + crosshair at center, lens height."""
    cx = WIDTH_PT / 2
    cy = LENS_HEIGHT_PT
    r_outer = ALIGN_CIRCLE_DIA_PT / 2
    r_inner = r_outer * 0.7
    r_dot = r_outer * 0.08

    # Outer circle
    c.setStrokeColor(TEAL)
    c.setLineWidth(10)
    c.circle(cx, cy, r_outer, stroke=1, fill=0)

    # Inner circle
    c.setLineWidth(5)
    c.circle(cx, cy, r_inner, stroke=1, fill=0)

    # Crosshair
    c.setStrokeColor(DARK_GRAY)
    c.setLineWidth(3)
    cross = r_outer * 1.25
    c.line(cx - cross, cy, cx + cross, cy)
    c.line(cx, cy - cross, cx, cy + cross)

    # Center dot
    c.setFillColor(TEAL)
    c.circle(cx, cy, r_dot, stroke=0, fill=1)

    # Label above and below
    c.setFont("Helvetica-Bold", 28)
    c.setFillColor(DARK_GRAY)
    label = "ALIGN CAMERA LENS WITH THIS CIRCLE"
    c.drawCentredString(cx, cy + r_outer + 34, label)
    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(TEAL)
    c.drawCentredString(cx, cy - r_outer - 36, f"LENS HEIGHT = {int(LENS_HEIGHT_CM)} CM ABOVE PLATFORM TOP")


def draw_height_ruler(c):
    """Draw a vertical cm ruler starting at platform top."""
    # Ruler background strip
    c.setFillColor(white)
    c.rect(RULER_X_PT - RULER_WIDTH_PT, RULER_BOTTOM_PT,
           RULER_WIDTH_PT, RULER_HEIGHT_PT, stroke=0, fill=1)

    # Ticks
    c.setStrokeColor(DARK_GRAY)
    c.setLineWidth(1)
    c.setFont("Helvetica", 8)
    c.setFillColor(DARK_GRAY)

    total_cm = int((RULER_TOP_PT - RULER_BOTTOM_PT) / inch * CM_PER_IN)
    for cm in range(0, total_cm + 1, 5):
        y = RULER_BOTTOM_PT + (cm / CM_PER_IN) * inch
        if y > RULER_TOP_PT:
            break
        if cm % 10 == 0:
            tick = RULER_WIDTH_PT * 0.55
            c.drawString(RULER_X_PT - RULER_WIDTH_PT + 4, y - 3, str(cm))
        elif cm % 5 == 0:
            tick = RULER_WIDTH_PT * 0.35
        else:
            tick = RULER_WIDTH_PT * 0.2
        c.line(RULER_X_PT - tick, y, RULER_X_PT, y)

    # Ruler border
    c.setStrokeColor(DARK_GRAY)
    c.setLineWidth(1.5)
    c.rect(RULER_X_PT - RULER_WIDTH_PT, RULER_BOTTOM_PT,
           RULER_WIDTH_PT, RULER_HEIGHT_PT, stroke=1, fill=0)

    c.setFont("Helvetica-Bold", 9)
    c.saveState()
    c.translate(RULER_X_PT - RULER_WIDTH_PT - 10, RULER_BOTTOM_PT + RULER_HEIGHT_PT / 2)
    c.rotate(90)
    c.drawCentredString(0, 0, "cm from platform top")
    c.restoreState()


def main():
    c = canvas.Canvas(OUT_PDF, pagesize=(WIDTH_PT, HEIGHT_PT))

    # Background
    c.setFillColor(GRAY_BG)
    c.rect(0, 0, WIDTH_PT, HEIGHT_PT, stroke=0, fill=1)

    # Compute marker positions (grid, margins excluded)
    usable_w = WIDTH_PT - 2 * MARKER_MARGIN_PT
    usable_h = HEIGHT_PT - 2 * MARKER_MARGIN_PT
    dx = usable_w / (COLS - 1) if COLS > 1 else 0
    dy = usable_h / (ROWS - 1) if ROWS > 1 else 0

    marker_map = {
        "sheet": {
            "width_cm": round(WIDTH_CM, 2),
            "height_cm": round(HEIGHT_CM, 2),
            "unit": "cm",
            "platform_zero": "bottom edge rests on platform top",
            "lens_target_height_cm": LENS_HEIGHT_CM,
        },
        "markers": []
    }

    marker_id = START_ID
    for row in range(ROWS):
        for col in range(COLS):
            # Leave center columns empty so markers don't crowd the subject
            if COLS >= 4 and 1 <= col <= COLS - 2:
                continue
            cx = MARKER_MARGIN_PT + col * dx
            cy = MARKER_MARGIN_PT + row * dy

            draw_marker(c, marker_id, cx, cy, MARKER_SIZE_PT)

            # Convert center to cm from bottom-left
            cx_cm = (cx / inch) * CM_PER_IN
            cy_cm = (cy / inch) * CM_PER_IN
            marker_map["markers"].append({
                "id": marker_id,
                "x_cm": round(cx_cm, 2),
                "y_cm": round(cy_cm, 2),
                "size_cm": round(MARKER_SIZE_CM, 2),
                "corner": "frame"
            })
            marker_id += 1

    # Draw alignment target
    draw_alignment_target(c)

    # Draw height ruler
    draw_height_ruler(c)

    # Orientation labels
    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(DARK_GRAY)
    c.drawCentredString(WIDTH_PT / 2, HEIGHT_PT - 42, "MEASUREOS BACKDROP")
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(WIDTH_PT / 2, HEIGHT_PT - 64, "FRONT / CAMERA SIDE")
    c.drawCentredString(WIDTH_PT / 2, 28, "BOTTOM EDGE RESTS ON PLATFORM TOP — NOT ON SHOP FLOOR")

    # Print instructions footer
    c.setFont("Helvetica", 9)
    c.setFillColor(DARK_GRAY)
    note = (
        f"Print at true size {int(WIDTH_IN/12)}ft x {int(HEIGHT_IN/12)}ft "
        f"({WIDTH_CM:.1f} x {HEIGHT_CM:.1f} cm). Do not scale. "
        "Matte anti-glare banner material. "
        "Platform top = 0 cm; phone lens = 100 cm above platform top."
    )
    c.drawCentredString(WIDTH_PT / 2, 12, note)

    c.save()

    with open(OUT_JSON, "w") as f:
        json.dump(marker_map, f, indent=2)

    print(f"Generated {OUT_PDF}")
    print(f"Generated {OUT_JSON}")


if __name__ == "__main__":
    main()
