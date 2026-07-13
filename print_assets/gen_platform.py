#!/usr/bin/env python3
"""
Generate MeasureOS platform-top print file.
Size: 4ft x 3ft (W x D) = 121.92 x 91.44 cm
Purpose: ground-plane calibration + standing position + pose guides
"""
import json
import os
import tempfile
from math import radians, sin, cos

import cv2
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, black, white, teal

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_PDF = os.path.join(OUT_DIR, "measureos_platform_4x3ft.pdf")
OUT_JSON = os.path.join(OUT_DIR, "platform_marker_map.json")

# Sheet dimensions (true size)
WIDTH_IN = 48.0   # 4 ft
DEPTH_IN = 36.0   # 3 ft
WIDTH_PT = WIDTH_IN * inch
DEPTH_PT = DEPTH_IN * inch

CM_PER_IN = 2.54
WIDTH_CM = WIDTH_IN * CM_PER_IN
DEPTH_CM = DEPTH_IN * CM_PER_IN

# Colors
GRAY_BG = HexColor("#E5E5E5")
GREEN = HexColor("#16A34A")
WHITE = HexColor("#FFFFFF")
DARK_GRAY = HexColor("#333333")
TEAL = HexColor("#0D9488")

# Geometry (all measured from REAR edge, which matches backdrop)
HEEL_OFFSET_CM = 30.0  # heels 30 cm forward of backdrop / rear edge
HEEL_OFFSET_IN = HEEL_OFFSET_CM / CM_PER_IN
HEEL_OFFSET_PT = HEEL_OFFSET_IN * inch

# Standing circle: centered around the stance point
CIRCLE_DIA_CM = 56.0
CIRCLE_DIA_IN = CIRCLE_DIA_CM / CM_PER_IN
CIRCLE_DIA_PT = CIRCLE_DIA_IN * inch
CIRCLE_CENTER_FROM_REAR_CM = HEEL_OFFSET_CM + 14.0  # circle center 44 cm from rear
CIRCLE_CENTER_FROM_REAR_PT = (CIRCLE_CENTER_FROM_REAR_CM / CM_PER_IN) * inch

# Feet marks
HEEL_SPACING_CM = 30.0  # distance between heels (front pose), approx shoulder-width
HEEL_SPACING_IN = HEEL_SPACING_CM / CM_PER_IN
HEEL_SPACING_PT = HEEL_SPACING_IN * inch
FOOT_LENGTH_CM = 25.0
FOOT_LENGTH_IN = FOOT_LENGTH_CM / CM_PER_IN
FOOT_LENGTH_PT = FOOT_LENGTH_IN * inch
FOOT_WIDTH_CM = 9.0
FOOT_WIDTH_IN = FOOT_WIDTH_CM / CM_PER_IN
FOOT_WIDTH_PT = FOOT_WIDTH_IN * inch

# ArUco markers
ARUCO_DICT = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
MARKER_SIZE_CM = 12.0
MARKER_SIZE_IN = MARKER_SIZE_CM / CM_PER_IN
MARKER_SIZE_PT = MARKER_SIZE_IN * inch
MARKER_MARGIN_IN = 1.5
MARKER_MARGIN_PT = MARKER_MARGIN_IN * inch
PLATFORM_MARKER_IDS = [30, 31, 32, 33]


def aruco_to_png(marker_id, size_px):
    img = cv2.aruco.generateImageMarker(ARUCO_DICT, marker_id, size_px)
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
    dpi = 300
    size_in = size_pt / inch
    px = int(size_in * dpi)
    png_path = aruco_to_png(marker_id, px)
    x = cx - size_pt / 2
    y = cy - size_pt / 2
    c.drawImage(png_path, x, y, width=size_pt, height=size_pt, preserveAspectRatio=True)
    os.remove(png_path)


def draw_foot(c, cx, cy, angle_deg, fill, stroke, dashed=False):
    """Draw a simple foot outline centered at heel (cx, cy), pointing along angle."""
    c.saveState()
    c.translate(cx, cy)
    c.rotate(angle_deg)

    # Foot outline: half ellipse / rounded rectangle shape
    # Heel at (0,0), toes at (FOOT_LENGTH_PT, 0)
    path = c.beginPath()
    hw = FOOT_WIDTH_PT / 2
    hl = FOOT_LENGTH_PT
    # Heel arc (left semicircle)
    path.moveTo(0, hw)
    path.arcTo(-hw, -hw, hw, hw, 90, 180)
    # Side to toe
    path.lineTo(hl, -hw)
    # Toe arc
    path.arcTo(hl - hw, -hw, hl + hw, hw, -90, 180)
    path.lineTo(0, hw)
    path.close()

    if dashed:
        c.setDash([8, 6], 0)
    c.setStrokeColor(stroke)
    c.setLineWidth(3)
    if fill:
        c.setFillColor(fill)
        c.drawPath(path, stroke=1, fill=1)
    else:
        c.drawPath(path, stroke=1, fill=0)
    c.restoreState()


def main():
    c = canvas.Canvas(OUT_PDF, pagesize=(WIDTH_PT, DEPTH_PT))

    # Background
    c.setFillColor(GRAY_BG)
    c.rect(0, 0, WIDTH_PT, DEPTH_PT, stroke=0, fill=1)

    # Coordinate system: x left→right, y rear→front
    # Rear edge is y = DEPTH_PT (top of print if you look from above with rear away from you)
    # But for a floor graphic, we print it so user stands facing camera. Let's put rear at top of page.
    rear_y = DEPTH_PT
    front_y = 0
    center_x = WIDTH_PT / 2

    # Standing circle
    circle_cy = rear_y - CIRCLE_CENTER_FROM_REAR_PT
    c.setStrokeColor(GREEN)
    c.setLineWidth(10)
    c.circle(center_x, circle_cy, CIRCLE_DIA_PT / 2, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(GREEN)
    c.drawCentredString(center_x, circle_cy - 8, "STAND HERE")

    # Heel line
    heel_y = rear_y - HEEL_OFFSET_PT
    c.setStrokeColor(TEAL)
    c.setLineWidth(2)
    c.setDash([4, 4], 0)
    c.line(center_x - 80, heel_y, center_x + 80, heel_y)
    c.setDash([], 0)

    # Pose 1: front pose feet (solid green)
    left_heel_x = center_x - HEEL_SPACING_PT / 2
    right_heel_x = center_x + HEEL_SPACING_PT / 2
    # Feet point toward camera, i.e., toward front (down on page, -y direction => 270° rotation in reportlab)
    # reportlab rotation 0 points to the right; we want toes pointing down => -90° or 270°
    for hx in (left_heel_x, right_heel_x):
        draw_foot(c, hx, heel_y, -90, fill=GREEN, stroke=GREEN, dashed=False)

    # Pose 1 badge
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 14)
    badge_r = 14
    c.circle(left_heel_x - 24, heel_y - 30, badge_r, stroke=0, fill=1)
    c.setFillColor(GREEN)
    c.drawCentredString(left_heel_x - 24, heel_y - 35, "1")

    # Pose 2: side pose feet (dashed dark/teal), rotated 90° (profile)
    side_heel_x = center_x
    # Side feet overlap at center; one slightly forward is fine as graphic
    draw_foot(c, side_heel_x, heel_y, 0, fill=None, stroke=DARK_GRAY, dashed=True)

    # Pose 2 badge
    c.setFillColor(white)
    c.circle(right_heel_x + 24, heel_y - 30, badge_r, stroke=0, fill=1)
    c.setFillColor(DARK_GRAY)
    c.drawCentredString(right_heel_x + 24, heel_y - 35, "2")

    # ArUco markers in corners
    corners = [
        (MARKER_MARGIN_PT, rear_y - MARKER_MARGIN_PT, PLATFORM_MARKER_IDS[0]),    # rear-left
        (WIDTH_PT - MARKER_MARGIN_PT, rear_y - MARKER_MARGIN_PT, PLATFORM_MARKER_IDS[1]),  # rear-right
        (MARKER_MARGIN_PT, front_y + MARKER_MARGIN_PT, PLATFORM_MARKER_IDS[2]),      # front-left
        (WIDTH_PT - MARKER_MARGIN_PT, front_y + MARKER_MARGIN_PT, PLATFORM_MARKER_IDS[3])  # front-right
    ]

    marker_map = {
        "sheet": {
            "width_cm": round(WIDTH_CM, 2),
            "depth_cm": round(DEPTH_CM, 2),
            "unit": "cm",
            "origin": "rear-left corner, platform top surface",
            "x_axis": "right",
            "y_axis": "front (toward camera)",
            "standing_heel_y_cm": round(HEEL_OFFSET_CM, 2),
            "standing_circle_center_y_cm": round(CIRCLE_CENTER_FROM_REAR_CM, 2)
        },
        "markers": []
    }

    for cx, cy, mid in corners:
        draw_marker(c, mid, cx, cy, MARKER_SIZE_PT)
        marker_map["markers"].append({
            "id": mid,
            "x_cm": round((cx / inch) * CM_PER_IN, 2),
            "y_cm": round(((DEPTH_PT - cy) / inch) * CM_PER_IN, 2),  # y measured from rear edge
            "size_cm": round(MARKER_SIZE_CM, 2),
            "corner": "frame"
        })

    # Orientation labels
    c.setFont("Helvetica-Bold", 24)
    c.setFillColor(DARK_GRAY)
    c.drawCentredString(center_x, rear_y - 36, "REAR EDGE — BACKDROP RESTS HERE")

    c.saveState()
    c.translate(center_x, 44)
    c.rotate(-90)
    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(0, 0, "CAMERA THIS SIDE")
    c.restoreState()

    # Arrow pointing up (toward camera / front)
    arrow_x = center_x
    arrow_y = 80
    c.setStrokeColor(TEAL)
    c.setFillColor(TEAL)
    c.setLineWidth(6)
    c.line(arrow_x, arrow_y, arrow_x, arrow_y + 70)
    # Arrowhead
    path = c.beginPath()
    path.moveTo(arrow_x - 14, arrow_y + 54)
    path.lineTo(arrow_x, arrow_y + 78)
    path.lineTo(arrow_x + 14, arrow_y + 54)
    path.close()
    c.drawPath(path, stroke=1, fill=1)

    # Print instructions
    c.setFont("Helvetica", 9)
    c.setFillColor(DARK_GRAY)
    note = (
        f"Print true size {int(WIDTH_IN/12)}ft x {int(DEPTH_IN/12)}ft "
        f"({WIDTH_CM:.1f} x {DEPTH_CM:.1f} cm). No scaling. "
        "Use matte anti-slip laminated floor vinyl. "
        "Align REAR EDGE with backdrop bottom edge."
    )
    c.drawCentredString(center_x, 12, note)

    c.save()

    with open(OUT_JSON, "w") as f:
        json.dump(marker_map, f, indent=2)

    print(f"Generated {OUT_PDF}")
    print(f"Generated {OUT_JSON}")


if __name__ == "__main__":
    main()
