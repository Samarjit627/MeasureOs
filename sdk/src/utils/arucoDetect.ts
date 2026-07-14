import type { MarkerDetection, CameraCalibration } from '../types'
import type { MarkerMap } from './markers'

// Runs OpenCV.js directly on the main thread (loaded via a classic <script>
// tag in index.html - see CLAUDE.md). A Web Worker version previously called
// importScripts() to load it, but Vite's dev server always instantiates
// `?worker` imports as ES-module workers, and importScripts() throws
// synchronously in that context ("importScripts cannot be used if worker type
// is 'module'") - so the worker died before ever processing a frame and
// ArUco detection silently never came online. Running on the main thread
// sidesteps that dev/build inconsistency entirely.

declare global {
  interface Window {
    cv: any
  }
}

let cvReady = false
let scriptPromise: Promise<void> | null = null

// NOTE: npm published version is "4.10.0-release.1", not "4.10.0" - the bare
// "4.10.0" tag was never published, so this URL 404'd from day one (verified
// with curl). That's the actual reason ArUco never worked, on any device.
const CV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.min.js'

// Loaded via a dynamically-injected <script> (not a static tag in index.html)
// so load failures (bad network, CDN blocked, ngrok hiccup) are caught
// explicitly instead of surfacing as an opaque "timeout".
function loadScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    if (window.cv) return resolve()
    const el = document.createElement('script')
    el.src = CV_URL
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`Failed to fetch OpenCV.js from CDN (${CV_URL})`))
    document.head.appendChild(el)
  })
  return scriptPromise
}

function hookReady() {
  if (window.cv && !window.cv.onRuntimeInitialized) {
    window.cv.onRuntimeInitialized = () => {
      cvReady = true
    }
  }
}

// The WASM runtime can take longer than a naive 30s on a slow/first-time
// connection (this is an ~8MB download) - default generously, and report
// which phase failed (network fetch vs runtime init) rather than one
// generic "timeout" that gives no clue which half of the problem it is.
export function waitForCv(timeout = 60000): Promise<void> {
  return loadScript().then(
    () =>
      new Promise((resolve, reject) => {
        const start = Date.now()
        const check = () => {
          hookReady()
          if (cvReady) return resolve()
          if (Date.now() - start > timeout) {
            return reject(new Error('OpenCV.js loaded but its WASM runtime never signaled ready (timeout)'))
          }
          setTimeout(check, 150)
        }
        check()
      }),
  )
}

export function detectMarkers(imageData: ImageData): MarkerDetection[] {
  const cv = window.cv
  const src = new cv.Mat(imageData.height, imageData.width, cv.CV_8UC4)
  src.data.set(imageData.data)
  const gray = new cv.Mat()
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

  const dict = new cv.Dictionary(cv.ARUCO_DICT_4X4_50)
  const param = new cv.DetectorParameters()
  const corners = new cv.MatVector()
  const ids = new cv.Mat()
  const rejected = new cv.MatVector()

  cv.detectMarkers(gray, dict, corners, ids, param, rejected)

  const out: MarkerDetection[] = []
  for (let i = 0; i < ids.rows; i++) {
    const id = ids.intPtr(i, 0)[0]
    const cornerMat = corners.get(i)
    const pts: { x: number; y: number }[] = []
    let cx = 0
    let cy = 0
    for (let j = 0; j < 4; j++) {
      const x = cornerMat.floatPtr(0, j)[0]
      const y = cornerMat.floatPtr(0, j)[1]
      pts.push({ x, y })
      cx += x
      cy += y
    }
    out.push({ id, corners: pts, center: { x: cx / 4, y: cy / 4 } })
    cornerMat.delete()
  }

  src.delete()
  gray.delete()
  dict.delete()
  param.delete()
  corners.delete()
  ids.delete()
  rejected.delete()

  return out
}

function matFromPoints(points: number[][]): any {
  const cv = window.cv
  const mat = new cv.Mat(points.length, points[0].length, cv.CV_64F)
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points[i].length; j++) {
      mat.doublePtr(i, j)[0] = points[i][j]
    }
  }
  return mat
}

function buildObjectImagePoints(
  detections: MarkerDetection[],
  maps: { backdrop: MarkerMap; platform: MarkerMap },
) {
  const byId = (map: MarkerMap) => {
    const dict: Record<number, MarkerMap['markers'][number]> = {}
    for (const m of map.markers) dict[m.id] = m
    return dict
  }
  const bd = byId(maps.backdrop)
  const pf = byId(maps.platform)

  const to3d = (m: MarkerMap['markers'][number], z: number) => {
    const s = m.size_cm
    return [
      [m.x_cm, m.y_cm, z],
      [m.x_cm + s, m.y_cm, z],
      [m.x_cm + s, m.y_cm + s, z],
      [m.x_cm, m.y_cm + s, z],
    ]
  }

  const objectPoints: number[][] = []
  const imagePoints: number[][] = []

  for (const det of detections) {
    const pts = det.corners.map((c) => [c.x, c.y])
    if (bd[det.id]) {
      objectPoints.push(...to3d(bd[det.id], 0))
      imagePoints.push(...pts)
    } else if (pf[det.id]) {
      objectPoints.push(...to3d(pf[det.id], 0))
      imagePoints.push(...pts)
    }
  }
  return { objectPoints, imagePoints }
}

function refineFocalLength(
  objectPoints: number[][],
  imagePoints: number[][],
  width: number,
  height: number,
): CameraCalibration | null {
  const cv = window.cv
  const cx = width / 2
  const cy = height / 2
  const distCoeffs = new cv.Mat()
  const rvec = new cv.Mat()
  const tvec = new cv.Mat()
  const objMat = matFromPoints(objectPoints)
  const imgMat = matFromPoints(imagePoints)

  let bestF = Math.max(width, height)
  let bestError = Infinity
  let bestRvec = rvec
  let bestTvec = tvec

  for (let f = bestF * 0.4; f <= bestF * 1.6; f += bestF * 0.1) {
    const k = matFromPoints([
      [f, 0, cx],
      [0, f, cy],
      [0, 0, 1],
    ])
    const success = cv.solvePnP(objMat, imgMat, k, distCoeffs, rvec, tvec, false, cv.SOLVEPNP_ITERATIVE)
    if (success) {
      const reproj = new cv.Mat()
      cv.projectPoints(objMat, rvec, tvec, k, distCoeffs, reproj)
      let err = 0
      for (let i = 0; i < imagePoints.length; i++) {
        const dx = reproj.data64F[i * 2] - imagePoints[i][0]
        const dy = reproj.data64F[i * 2 + 1] - imagePoints[i][1]
        err += Math.sqrt(dx * dx + dy * dy)
      }
      err /= imagePoints.length
      if (err < bestError) {
        bestError = err
        bestF = f
        bestRvec = rvec.clone()
        bestTvec = tvec.clone()
      }
      reproj.delete()
    }
    k.delete()
  }

  objMat.delete()
  imgMat.delete()
  distCoeffs.delete()
  rvec.delete()
  tvec.delete()

  if (bestError === Infinity) return null

  return {
    fx: bestF,
    fy: bestF,
    cx,
    cy,
    rvec: Array.from(bestRvec.data64F),
    tvec: Array.from(bestTvec.data64F),
    reprojectionError: bestError,
  }
}

export function computeCalibration(
  detections: MarkerDetection[],
  maps: { backdrop: MarkerMap; platform: MarkerMap } | null,
  width: number,
  height: number,
): CameraCalibration | null {
  if (!maps || detections.length < 4) return null
  const { objectPoints, imagePoints } = buildObjectImagePoints(detections, maps)
  if (objectPoints.length < 16) return null
  return refineFocalLength(objectPoints, imagePoints, width, height)
}
