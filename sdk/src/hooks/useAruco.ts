import { useEffect, useRef, useState, useCallback } from 'react'
import type { MarkerDetection, CameraCalibration } from '../types'
import type { MarkerMap } from '../utils/markers'
import { loadMarkerMaps } from '../utils/markers'
import { waitForCv, detectMarkers, computeCalibration, arucoModuleAvailable } from '../utils/arucoDetect'

// Runs directly on the main thread - see arucoDetect.ts for why the previous
// Web Worker version never worked in dev (importScripts vs module workers).
export function useAruco() {
  const [ready, setReady] = useState(false)
  const [supported, setSupported] = useState(true)
  const [detections, setDetections] = useState<MarkerDetection[]>([])
  const [calibration, setCalibration] = useState<CameraCalibration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<string | null>(null)
  const mapsRef = useRef<{ backdrop: MarkerMap; platform: MarkerMap } | null>(null)
  const busyRef = useRef(false)

  const setPersistentError = useCallback((msg: string | null) => {
    if (msg === errorRef.current) return
    errorRef.current = msg
    setError(msg)
  }, [])

  const clearError = useCallback(() => {
    if (errorRef.current) {
      errorRef.current = null
      setError(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    loadMarkerMaps().then((maps) => {
      if (mounted) mapsRef.current = maps
    })
    waitForCv()
      .then(() => {
        if (!mounted) return
        if (!arucoModuleAvailable()) {
          setPersistentError('ArUco module unavailable in this OpenCV build (marker detection disabled, not required to capture)')
          setSupported(false)
          return
        }
        setReady(true)
      })
      .catch((e) => mounted && setPersistentError(e.message))
    return () => {
      mounted = false
    }
  }, [setPersistentError])

  const detect = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (!ready || !supported || busyRef.current) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      busyRef.current = true
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const found = detectMarkers(imageData)
        setDetections(found)
        setCalibration(computeCalibration(found, mapsRef.current, canvas.width, canvas.height))
        clearError()
      } catch (e) {
        setPersistentError((e as Error).message)
      } finally {
        busyRef.current = false
      }
    },
    [ready, supported, clearError, setPersistentError],
  )

  return { ready, supported, detections, calibration, error, detect }
}
