# MeasureOS — capture SDK

Browser-based (PWA) body-measurement capture for made-to-measure clothing.
Customer stands in a calibrated booth (printed backdrop + platform with ArUco
markers); a phone takes 4 guided photos; the app returns garment measurements.

## Stack
- React 19 + Vite 8 + TypeScript, Tailwind 4. PWA (vite-plugin-pwa).
- `@mediapipe/pose` — 33 body landmarks (in `usePose`).
- OpenCV.js (`@techstark/opencv-js`, loaded from CDN in a Web Worker) — ArUco
  `DICT_4X4_50` detection + `solvePnP` camera calibration (`workers/arucoWorker.ts`).
- Device orientation for phone-level gate (`usePhoneLevel`).

## Flow (`src/App.tsx`)
`intro` (collect height/weight/age/gender/bodyShape/fit) → `capture` (4 poses:
front, left, right, back) → `review` (measurements + per-pose retake + export JSON).
Capture is gated (`utils/poseGate.ts`): fires only when ArUco markers ≥4 visible,
phone level, body centered, and target pose matched — then a 3s countdown.

On the capture screen, `drawGuide` renders a body-shaped alignment outline
(`utils/bodyGuide.ts`) sized from the intro-form answers (gender + bodyShape
ratios; front/back = mirrored torso+arms silhouette, left/right = profile
depth silhouette) — the operator aligns the live camera view of the customer
inside it. Outline tints green when `poseGate` reports a pose match.

## Measurement engine (`src/utils/measurements/`)
- `index.ts` — orchestrates; **scale = userHeight / (nose-to-ankle pixel span / 0.9)**.
- `lengths.ts` — height, backLength, sleeve/arm, inseam from front landmarks.
- `widths.ts` — shoulder/chest/waist/hip width from front, depth from side photo;
  falls back to ratio-based depth if no side. Widths come from sparse pose
  landmarks near a y-band (no silhouette).
- `circumferences.ts` — chest/waist/hip via **Ramanujan ellipse(width, depth)**;
  neck/bicep/wrist are placeholder ratios of shoulder width.

## Calibration & print assets
- `sdk/public/markerMaps/{backdrop,platform}.json` — the SDK's source of truth
  for marker object points. `x_cm,y_cm = marker TOP-LEFT corner`, origin top-left,
  x→right, y→down (matches worker `to3d`).
- `print_assets/gen_print_pngs.py` — generates the 1:1 print PNGs AND writes the
  marker maps (to print_assets/ and sdk/public/markerMaps/) from one source, so
  print and SDK never drift. Run it after any marker-layout change.
  Output: `measureos_backdrop_4x8ft.png` (121.92×243.84 cm), `measureos_platform_4x3ft.png`
  (121.92×91.44 cm), 100 DPI, print 1:1, do not scale.
- Backdrop: 8 markers ids 10-17 (14 cm), lens circle at 100 cm, height ruler.
- Platform: 4 markers ids 30-33 (12 cm), standing circle (center 44 cm from rear),
  front feet apart at shoulder width (solid) + side feet together (dashed),
  heel line 30 cm from rear edge.
- `print_assets/gen_print_pdfs.py` — **vector** PDF versions of the same two
  sheets (markers drawn as vector cells, not raster) — use these for actual
  printing so nothing pixelates on zoom; same coordinates as `gen_print_pngs.py`.
- The old center-based `gen_backdrop.py`/`gen_platform.py` and their
  `*_marker_map.json` outputs (7 cm center/corner offset bug) were deleted —
  `sdk/public/markerMaps/*.json` is the only source of truth now.

## Known gaps / TODO (priority order)
1. **Calibration is computed but unused in measurements.** `computeMeasurements`
   ignores `calibrations`; scale comes only from stated height. Wire the solvePnP
   result into metric scaling (accounting for the ~30 cm subject-to-backdrop
   parallax). Needs on-device testing.
2. **Backdrop + platform markers are both pushed with z=0** in the worker
   (`buildKnownMarkers`) — they're on different physical planes (vertical vs
   horizontal), so combining them in one solvePnP is geometrically wrong. Use the
   backdrop plane alone for scale, or model the two planes with correct z/rotation.
3. **No statistical prior.** Day-one numbers should start from an anthropometric
   prior (ANSUR-style regression on age/height/weight/gender) and be corrected by
   photos, confidence-weighted. Port the prior model (Desktop/measureos-prior-engine).
4. **Widths from sparse landmarks, not silhouette.** Add body segmentation
   (e.g. MediaPipe SelfieSegmentation) for real chest/waist/hip widths.
5. **weight/age/gender collected but unused** in circumference math; add the 6th
   question (usual brand size / waistband position).
6. **No ground-truth logging / server / flywheel** — client-only, manual export.

## Dev
- `cd sdk && npm install && npm run dev` (needs HTTPS or localhost for camera +
  device orientation; deploy target is Netlify per `netlify.toml`).
- `npm run build` — tsc + vite. `npm run lint` — oxlint.
