import { useEffect, useRef, useState, useCallback } from 'react'

export interface CameraState {
  stream: MediaStream | null
  error: string | null
  videoReady: boolean
}

export function useCamera(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<CameraState>({ stream: null, error: null, videoReady: false })
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const start = useCallback(async (constraints?: MediaStreamConstraints) => {
    try {
      const merged: MediaStreamConstraints = constraints ?? {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(merged)
      const track = stream.getVideoTracks()[0]
      trackRef.current = track
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setState({ stream, error: null, videoReady: false })
    } catch (err) {
      setState({ stream: null, error: (err as Error).message, videoReady: false })
    }
  }, [videoRef])

  const stop = useCallback(() => {
    trackRef.current?.stop()
    if (videoRef.current) videoRef.current.srcObject = null
    setState({ stream: null, error: null, videoReady: false })
  }, [videoRef])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onPlay = () => setState((s) => ({ ...s, videoReady: true }))
    video.addEventListener('play', onPlay)
    return () => video.removeEventListener('play', onPlay)
  }, [videoRef])

  useEffect(() => {
    return () => {
      trackRef.current?.stop()
    }
  }, [])

  const captureFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return null
    let canvas = canvasRef.current
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvasRef.current = canvas
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0)
    return canvas
  }, [videoRef])

  return { ...state, start, stop, captureFrame }
}
