#!/usr/bin/env python3
"""
Generate MeasureOS 1:1 PRINT PNGs (backdrop + platform) and the matching
marker-map JSON used by the SDK's solvePnP calibration.

Single source of truth: marker x_cm / y_cm = the marker's TOP-LEFT corner,
origin at the sheet's top-left, x -> right, y -> down.  This matches the SDK
worker's to3d() which builds corners as [x,y],[x+s,y],[x+s,y+s],[x,y+s].
"""
import json
import os
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

DPI = 100                       # 100 px per inch -> crisp ArUco, manageable file
CM_PER_IN = 2.54
PX = lambda cm: round(cm / CM_PER_IN * DPI)

HERE = os.path.dirname(os.path.abspath(__file__))
SDK_MAPS = os.path.join(HERE, "..", "sdk", "public", "markerMaps")

GRAY_BD = (216, 216, 216)
GRAY_PF = (229, 229, 229)
TEAL = (13, 148, 136)
GREEN = (22, 163, 74)
DARK = (51, 51, 51)
WHITE = (255, 255, 255)

ARUCO = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
QUIET_CM = 2.0                  # white quiet zone around each marker

def font(sz, bold=True):
    p = ("/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold
         else "/System/Library/Fonts/Supplemental/Arial.ttf")
    return ImageFont.truetype(p, sz)

def paste_marker(img, mid, x_cm, y_cm, size_cm):
    """Paste marker with its black-pattern TOP-LEFT corner at (x_cm, y_cm)."""
    s = PX(size_cm)
    m = cv2.aruco.generateImageMarker(ARUCO, mid, 700)
    m = cv2.resize(m, (s, s), interpolation=cv2.INTER_NEAREST)
    q = PX(QUIET_CM)
    tile = Image.new("L", (s + 2 * q, s + 2 * q), 255)
    tile.paste(Image.fromarray(m), (q, q))
    img.paste(tile.convert("RGB"), (PX(x_cm) - q, PX(y_cm) - q))

def center_text(d, cx, y, text, fnt, fill):
    w = d.textbbox((0, 0), text, font=fnt)[2]
    d.text((cx - w / 2, y), text, font=fnt, fill=fill)

# ----------------------------------------------------------------- BACKDROP
def gen_backdrop():
    W_CM, H_CM = 121.92, 243.84
    SIZE = 14.0
    img = Image.new("RGB", (PX(W_CM), PX(H_CM)), GRAY_BD)
    d = ImageDraw.Draw(img)

    left_x, right_x = 7.62, W_CM - 7.62 - SIZE          # top-left corners
    ys = [7.62 + i * ((H_CM - 7.62 - SIZE - 7.62) / 3) for i in range(4)]
    markers, mid = [], 10
    for y in ys:
        for x in (left_x, right_x):
            paste_marker(img, mid, x, y, SIZE)
            markers.append({"id": mid, "x_cm": round(x, 2), "y_cm": round(y, 2),
                            "size_cm": SIZE, "corner": "frame"})
            mid += 1

    # lens alignment circle: 100 cm above platform top (= sheet bottom edge)
    cx = PX(W_CM / 2)
    cyl = PX(H_CM - 100.0)
    for r_cm, wpx in ((10, 14), (7, 8)):
        r = PX(r_cm)
        d.ellipse([cx - r, cyl - r, cx + r, cyl + r], outline=TEAL, width=wpx)
    cr = PX(12.5)
    d.line([cx - cr, cyl, cx + cr, cyl], fill=DARK, width=4)
    d.line([cx, cyl - cr, cx, cyl + cr], fill=DARK, width=4)
    d.ellipse([cx - 8, cyl - 8, cx + 8, cyl + 8], fill=TEAL)
    center_text(d, cx, cyl - PX(11) - 46, "ALIGN CAMERA LENS WITH THIS CIRCLE", font(34), DARK)
    center_text(d, cx, cyl + PX(11) + 12, "LENS HEIGHT = 100 CM ABOVE PLATFORM TOP", font(26), TEAL)

    # height ruler (inboard of right markers), 0 = platform top (bottom edge)
    rx = PX(W_CM - 24)
    d.line([rx, PX(2), rx, PX(H_CM - 20)], fill=DARK, width=3)
    fsm = font(20, bold=False)
    for cm in range(0, 226, 5):
        y = PX(H_CM - cm)
        if cm % 10 == 0:
            d.line([rx - PX(2.6), y, rx, y], fill=DARK, width=4)
            d.text((rx - PX(2.6) - 60, y - 12), str(cm), font=fsm, fill=DARK)
        else:
            d.line([rx - PX(1.4), y, rx, y], fill=DARK, width=2)

    center_text(d, cx, PX(3), "MEASUREOS BACKDROP", font(46), DARK)
    center_text(d, cx, PX(3) + 58, "FRONT / CAMERA SIDE", font(28), DARK)
    center_text(d, cx, PX(H_CM) - 70,
                "BOTTOM EDGE RESTS ON PLATFORM TOP - NOT ON SHOP FLOOR", font(26), DARK)
    center_text(d, cx, PX(H_CM) - 34,
                "Print 1:1 at 121.9 x 243.8 cm (4ft x 8ft). Do not scale. Matte anti-glare.",
                font(20, bold=False), DARK)

    img.save(os.path.join(HERE, "measureos_backdrop_4x8ft.png"), dpi=(DPI, DPI))
    return {"sheet": {"width_cm": W_CM, "height_cm": H_CM, "unit": "cm",
                      "coord_origin": "top-left; x->right, y->down; marker x_cm,y_cm = top-left corner",
                      "platform_zero": "bottom edge rests on platform top",
                      "lens_target_height_cm": 100.0}, "markers": markers}

# ----------------------------------------------------------------- PLATFORM
def dash_edge(d, p0, p1, dash, gap, width, fill):
    p0 = np.array(p0, float); p1 = np.array(p1, float)
    L = np.hypot(*(p1 - p0))
    if L == 0:
        return
    u = (p1 - p0) / L
    pos = 0.0
    while pos < L:
        a = p0 + u * pos
        b = p0 + u * min(pos + dash, L)
        d.line([a[0], a[1], b[0], b[1]], fill=fill, width=width)
        pos += dash + gap

def foot(d, cx_cm, heel_y_cm, angle_deg, fill, outline, dashed=False):
    L, Wd = 25.0, 9.0
    pts = [(-Wd/2, 0), (Wd/2, 0), (Wd/2, L*0.75), (Wd/3, L),
           (-Wd/3, L), (-Wd/2, L*0.75)]
    a = np.radians(angle_deg)
    R = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    scr = []
    for px, py in pts:
        rx, ry = R @ np.array([px, py])
        scr.append((PX(cx_cm + rx), PX(heel_y_cm + ry)))
    if dashed:
        for i in range(len(scr)):
            dash_edge(d, scr[i], scr[(i + 1) % len(scr)], 22, 14, 5, outline)
    else:
        d.polygon(scr, fill=fill, outline=outline)
        d.line(scr + [scr[0]], fill=outline, width=4, joint="curve")

def badge(d, cx_cm, cy_cm, text, color):
    r = PX(3.2)
    x, y = PX(cx_cm), PX(cy_cm)
    d.ellipse([x - r, y - r, x + r, y + r], fill=WHITE, outline=color, width=4)
    f = font(30)
    w = d.textbbox((0, 0), text, font=f)[2:]
    d.text((x - w[0] / 2, y - w[1] / 2 - 4), text, font=f, fill=color)

def gen_platform():
    W_CM, D_CM = 121.92, 91.44
    SIZE = 12.0
    img = Image.new("RGB", (PX(W_CM), PX(D_CM)), GRAY_PF)
    d = ImageDraw.Draw(img)

    left_x, right_x = 3.81, W_CM - 3.81 - SIZE
    top_y, bot_y = 3.81, D_CM - 3.81 - SIZE
    coords = [(30, left_x, top_y), (31, right_x, top_y),
              (32, left_x, bot_y), (33, right_x, bot_y)]
    markers = []
    for mid, x, y in coords:
        paste_marker(img, mid, x, y, SIZE)
        markers.append({"id": mid, "x_cm": round(x, 2), "y_cm": round(y, 2),
                        "size_cm": SIZE, "corner": "frame"})

    cx = W_CM / 2
    circ_y = 44.0                         # circle center, from rear edge (top)
    heel_y = 30.0
    r = PX(28)
    d.ellipse([PX(cx) - r, PX(circ_y) - r, PX(cx) + r, PX(circ_y) + r], outline=TEAL, width=12)

    # dashed heel line
    dash_edge(d, (PX(cx - 22), PX(heel_y)), (PX(cx + 22), PX(heel_y)), 16, 10, 3, TEAL)

    # front feet (solid green): apart ~shoulder width, toes toward camera (+y)
    foot(d, cx - 12, heel_y, 0, (150, 200, 170), GREEN)
    foot(d, cx + 12, heel_y, 0, (150, 200, 170), GREEN)

    # side/profile feet (dashed): together (clean profile), toes to the side
    foot(d, cx - 12, circ_y - 6, -90, None, DARK, dashed=True)
    foot(d, cx - 12, circ_y + 6, -90, None, DARK, dashed=True)

    # STAND HERE at the front (camera side), facing the person as they step in
    center_text(d, PX(cx), PX(circ_y + 19), "STAND HERE", font(40), TEAL)
    center_text(d, PX(cx), PX(circ_y + 19) + 46, "Stand facing the camera. Turn 90 deg for side and back shots.", font(22), DARK)

    center_text(d, PX(cx), PX(1.5), "REAR EDGE - ALIGN WITH BACKDROP", font(30), DARK)
    center_text(d, PX(cx), PX(D_CM) - 60, "CAMERA THIS SIDE", font(30), DARK)
    center_text(d, PX(cx), PX(D_CM) - 26,
                "Print 1:1 at 121.9 x 91.4 cm (4ft x 3ft). Do not scale. Matte anti-slip.",
                font(20, bold=False), DARK)

    img.save(os.path.join(HERE, "measureos_platform_4x3ft.png"), dpi=(DPI, DPI))
    return {"sheet": {"width_cm": W_CM, "depth_cm": D_CM, "unit": "cm",
                      "coord_origin": "rear-left corner, platform top; x->right, y->front(camera); marker x_cm,y_cm = top-left corner",
                      "standing_heel_y_cm": 30.0, "standing_circle_center_y_cm": 44.0}, "markers": markers}

def write_json(name, data):
    for path in (os.path.join(HERE, name), os.path.join(SDK_MAPS, name)):
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

if __name__ == "__main__":
    bd = gen_backdrop()
    pf = gen_platform()
    write_json("backdrop.json", bd)
    write_json("platform.json", pf)
    print("PNGs + marker maps written (backdrop + platform)")
