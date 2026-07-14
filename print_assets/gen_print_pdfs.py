#!/usr/bin/env python3
"""
Vector print PDFs (infinitely crisp) for the MeasureOS backdrop + platform.
ArUco markers are drawn as vector cell-squares (not scaled raster), so nothing
pixelates on zoom. Marker coordinates match sdk/public/markerMaps/*.json
(x_cm,y_cm = marker TOP-LEFT corner, origin top-left, x->right, y->down).
"""
import os
import numpy as np
import cv2
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white

HERE = os.path.dirname(os.path.abspath(__file__))
ARUCO = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
QUIET_CM = 2.0
GRID = 6                                   # 4x4 data + 1-cell border each side
PT = lambda cm: cm / 2.54 * 72.0           # cm -> PDF points

GRAY_BD = HexColor("#D8D8D8")
GRAY_PF = HexColor("#E5E5E5")
TEAL = HexColor("#0D9488")
GREEN = HexColor("#16A34A")
GREEN_FILL = HexColor("#96C8AA")
DARK = HexColor("#333333")
BLACK = HexColor("#000000")

def marker_cells(mid):
    img = cv2.aruco.generateImageMarker(ARUCO, mid, GRID * 10)
    return np.array([[img[r * 10 + 5, c * 10 + 5] < 128 for c in range(GRID)]
                     for r in range(GRID)])                     # True = black

class Sheet:
    def __init__(self, path, w_cm, h_cm, bg):
        self.w, self.h = w_cm, h_cm
        self.c = canvas.Canvas(path, pagesize=(PT(w_cm), PT(h_cm)))
        self.c.setFillColor(bg)
        self.c.rect(0, 0, PT(w_cm), PT(h_cm), stroke=0, fill=1)

    def X(self, x_cm):
        return PT(x_cm)

    def Y(self, y_cm):                       # flip: top-left cm -> reportlab bottom-left
        return PT(self.h - y_cm)

    def marker(self, mid, x_cm, y_cm, size_cm):
        c = self.c
        q = QUIET_CM
        c.setFillColor(white)
        c.rect(self.X(x_cm - q), self.Y(y_cm + size_cm + q),
               PT(size_cm + 2 * q), PT(size_cm + 2 * q), stroke=0, fill=1)
        cells = marker_cells(mid)
        cc = size_cm / GRID
        c.setFillColor(BLACK)
        for r in range(GRID):
            for col in range(GRID):
                if cells[r][col]:
                    c.rect(self.X(x_cm + col * cc), self.Y(y_cm + (r + 1) * cc),
                           PT(cc) + 0.5, PT(cc) + 0.5, stroke=0, fill=1)

    def text(self, x_cm, y_cm, s, size_cm, color, bold=True):
        # size given as physical CAP HEIGHT in cm (readable on a large banner)
        self.c.setFont("Helvetica-Bold" if bold else "Helvetica", PT(size_cm) / 0.717)
        self.c.setFillColor(color)
        self.c.drawCentredString(self.X(x_cm), self.Y(y_cm), s)

    def save(self):
        self.c.save()

# ------------------------------------------------------------------- BACKDROP
def backdrop():
    W, H, S = 121.92, 243.84, 14.0
    s = Sheet(os.path.join(HERE, "measureos_backdrop_4x8ft.pdf"), W, H, GRAY_BD)
    c = s.c
    left_x, right_x = 7.62, W - 7.62 - S
    ys = [7.62 + i * ((H - 7.62 - S - 7.62) / 3) for i in range(4)]
    mid = 10
    for y in ys:
        for x in (left_x, right_x):
            s.marker(mid, x, y, S); mid += 1

    cx = W / 2
    cyl = H - 100.0                          # lens circle 100 cm above platform top
    c.setStrokeColor(TEAL)
    c.setLineWidth(10); c.circle(s.X(cx), s.Y(cyl), PT(10), stroke=1, fill=0)
    c.setLineWidth(6);  c.circle(s.X(cx), s.Y(cyl), PT(7), stroke=1, fill=0)
    c.setStrokeColor(DARK); c.setLineWidth(2.5)
    c.line(s.X(cx) - PT(12.5), s.Y(cyl), s.X(cx) + PT(12.5), s.Y(cyl))
    c.line(s.X(cx), s.Y(cyl) - PT(12.5), s.X(cx), s.Y(cyl) + PT(12.5))
    c.setFillColor(TEAL); c.circle(s.X(cx), s.Y(cyl), PT(1.6), stroke=0, fill=1)
    s.text(cx, cyl - 13.5, "ALIGN CAMERA LENS WITH THIS CIRCLE", 2.2, DARK)
    s.text(cx, cyl + 17, "LENS HEIGHT = 100 CM ABOVE PLATFORM TOP", 1.9, TEAL)

    # height ruler (0 = platform top = sheet bottom edge)
    rx = W - 26
    c.setStrokeColor(DARK); c.setLineWidth(3)
    c.line(s.X(rx), s.Y(2), s.X(rx), s.Y(H - 24))
    c.setFont("Helvetica-Bold", PT(2.0) / 0.717)
    for cm in range(0, 226, 5):
        yy = s.Y(H - cm)
        if cm % 10 == 0:
            c.setLineWidth(3); c.line(s.X(rx) - PT(3.4), yy, s.X(rx), yy)
            c.setFillColor(DARK); c.drawRightString(s.X(rx) - PT(4.2), yy - PT(0.7), str(cm))
        else:
            c.setLineWidth(1.6); c.line(s.X(rx) - PT(1.8), yy, s.X(rx), yy)

    s.text(cx, 7.5, "MEASUREOS BACKDROP", 3.5, DARK)
    s.text(cx, 14.5, "FRONT / CAMERA SIDE", 2.2, DARK)
    # placed in the clear band above the bottom markers so nothing overlaps
    s.text(cx, 198, "BOTTOM EDGE RESTS ON PLATFORM TOP", 2.2, DARK)
    s.text(cx, 205, "NOT ON THE SHOP FLOOR", 2.2, DARK)
    s.text(cx, 213, "Print 1:1 at 121.9 x 243.8 cm (4ft x 8ft). Do not scale. Matte anti-glare.", 1.4, DARK, bold=False)
    s.save()

# ------------------------------------------------------------------- PLATFORM
def foot_pts(cx_cm, heel_y_cm, angle_deg):
    L, Wd = 25.0, 9.0
    pts = [(-Wd/2, 0), (Wd/2, 0), (Wd/2, L*0.75), (Wd/3, L), (-Wd/3, L), (-Wd/2, L*0.75)]
    a = np.radians(angle_deg)
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    out = []
    for px, py in pts:
        rx, ry = R @ np.array([px, py])
        out.append((cx_cm + rx, heel_y_cm + ry))
    return out

def platform():
    W, D, S = 121.92, 91.44, 12.0
    s = Sheet(os.path.join(HERE, "measureos_platform_4x3ft.pdf"), W, D, GRAY_PF)
    c = s.c
    left_x, right_x = 3.81, W - 3.81 - S
    top_y, bot_y = 3.81, D - 3.81 - S
    for mid, x, y in [(30, left_x, top_y), (31, right_x, top_y),
                      (32, left_x, bot_y), (33, right_x, bot_y)]:
        s.marker(mid, x, y, S)

    cx, circ_y, heel_y = W / 2, 44.0, 30.0
    c.setStrokeColor(TEAL); c.setLineWidth(12)
    c.circle(s.X(cx), s.Y(circ_y), PT(28), stroke=1, fill=0)

    # dashed heel line
    c.setStrokeColor(TEAL); c.setLineWidth(3); c.setDash([8, 6], 0)
    c.line(s.X(cx - 22), s.Y(heel_y), s.X(cx + 22), s.Y(heel_y)); c.setDash([], 0)

    def draw_foot(pts, fill, stroke, dashed):
        p = c.beginPath()
        p.moveTo(s.X(pts[0][0]), s.Y(pts[0][1]))
        for x, y in pts[1:]:
            p.lineTo(s.X(x), s.Y(y))
        p.close()
        c.setLineWidth(3); c.setStrokeColor(stroke)
        if dashed:
            c.setDash([9, 6], 0)
        if fill:
            c.setFillColor(fill); c.drawPath(p, stroke=1, fill=1)
        else:
            c.drawPath(p, stroke=1, fill=0)
        c.setDash([], 0)

    # front feet (solid), apart ~shoulder width, toes toward camera (+y)
    draw_foot(foot_pts(cx - 12, heel_y, 0), GREEN_FILL, GREEN, False)
    draw_foot(foot_pts(cx + 12, heel_y, 0), GREEN_FILL, GREEN, False)
    # side feet (dashed), together, toes to the side
    draw_foot(foot_pts(cx - 12, circ_y - 6, -90), None, DARK, True)
    draw_foot(foot_pts(cx - 12, circ_y + 6, -90), None, DARK, True)

    s.text(cx, circ_y + 22, "STAND HERE", 3.2, TEAL)
    s.text(cx, circ_y + 28, "Stand facing the camera. Turn 90 deg for side and back shots.", 1.7, DARK, bold=False)
    s.text(cx, 3.0, "REAR EDGE - ALIGN WITH BACKDROP", 2.4, DARK)
    s.text(cx, D - 6, "CAMERA THIS SIDE   -   Print 1:1 at 121.9 x 91.4 cm (4ft x 3ft). Do not scale.", 1.7, DARK, bold=False)
    s.save()

if __name__ == "__main__":
    backdrop()
    platform()
    print("vector PDFs written")
