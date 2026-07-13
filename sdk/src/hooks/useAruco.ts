import { useEffect, useRef, useState, useCallback } from 'react'
import type { MarkerDetection, CameraCalibration } from '../types'
import type { MarkerMap } from '../utils/markers'
import { loadMarkerMaps } from '../utils/markers'
import ArucoWorker from '../workers/arucoWorker.ts?worker'

export function useAruco() {
  const workerRef = useRef<Worker | null>(null)
  const [ready, setReady] = useState(false)
  const [detections, setDetections] = useState<MarkerDetection[]>([])
  const [calibration, setCalibration] = useState<CameraCalibration | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mapsRef = useRef<{ backdrop: MarkerMap; platform: MarkerMap } | null>(null)

  useEffect(() => {
    let mounted = true
    loadMarkerMaps().then((maps) => {
      if (mounted) mapsRef.current = maps
    })
    const worker = new ArucoWorker()
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'result') {
        setDetections(e.data.detections)
        setCalibration(e.data.calibration)
        setReady(true)
      } else if (e.data.type === 'error') {
        setError(e.data.error)
      }
    }
    worker.onerror = (e) => {
      setError(e.message)
    }
    return () => {
      mounted = false
      worker.terminate()
    }
  }, [])

  const detect = useCallback((canvas: HTMLCanvasElement) => {
    const worker = workerRef.current
    if (!worker) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    worker.postMessage(
      { imageData, maps: mapsRef.current },
      [imageData.data.buffer],
    )
  }, [])

  return { ready, detections, calibration, error, detect }
}
