import { useEffect, useRef, useState, useCallback } from 'react'
import type { MarkerDetection, CameraCalibration } from '../types'
import type { MarkerMap } from '../utils/markers'
import { loadMarkerMaps } from '../utils/markers'
import { waitForCv, detectMarkers, computeCalibration } from '../utils/arucoDetect'

// Runs directly on the main thread - see arucoDetect.ts for why the previous
// Web Worker version never worked in dev (importScripts vs module workers).
export function useAruco() {
  const [ready, setReady] = useState(false)
  const [detections, setDetections] = useState<MarkerDetection[]>([])
  const [calibration, setCalibration] = useState<CameraCalibration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mapsRef = useRef<{ backdrop: MarkerMap; platform: MarkerMap } | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    let mounted = true
    loadMarkerMaps().then((maps) => {
      if (mounted) mapsRef.current = maps
    })
    waitForCv()
      .then(() => mounted && setReady(true))
      .catch((e) => mounted && setError(e.message))
    return () => {
      mounted = false
    }
  }, [])

  const detect = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (!ready || busyRef.current) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      busyRef.current = true
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const found = detectMarkers(imageData)
        setDetections(found)
        setCalibration(computeCalibration(found, mapsRef.current, canvas.width, canvas.height))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        busyRef.current = false
      }
    },
    [ready],
  )

  return { ready, detections, calibration, error, detect }
}
