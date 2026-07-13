import { useEffect, useRef, useState, useCallback } from 'react'
import type { Pose as PoseClass, Results } from '@mediapipe/pose'
import type { Camera as CameraClass } from '@mediapipe/camera_utils'
import type { PoseFrame, PoseLandmark } from '../types'

declare global {
  interface Window {
    Pose: typeof PoseClass
    Camera: typeof CameraClass
  }
}

export function usePose(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [pose, setPose] = useState<PoseFrame | null>(null)
  const [ready, setReady] = useState(false)
  const poseRef = useRef<PoseClass | null>(null)
  const cameraRef = useRef<CameraClass | null>(null)

  const start = useCallback(async () => {
    const video = videoRef.current
    if (!video || typeof window.Pose === 'undefined' || typeof window.Camera === 'undefined') return

    const Pose = window.Pose
    const Camera = window.Camera

    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    })
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    pose.onResults((results: Results) => {
      if (results.poseLandmarks && results.poseWorldLandmarks) {
        const normalize = (list: any[]): PoseLandmark[] =>
          list.map((lm) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility ?? 0,
          }))
        setPose({
          landmarks: normalize(results.poseLandmarks),
          worldLandmarks: normalize(results.poseWorldLandmarks),
        })
      } else {
        setPose(null)
      }
      setReady(true)
    })
    poseRef.current = pose

    const camera = new Camera(video, {
      onFrame: async () => {
        await pose.send({ image: video })
      },
      width: 1280,
      height: 720,
    })
    cameraRef.current = camera
    await camera.start()
  }, [videoRef])

  const stop = useCallback(() => {
    cameraRef.current?.stop()
    poseRef.current?.close()
    cameraRef.current = null
    poseRef.current = null
    setPose(null)
    setReady(false)
  }, [])

  useEffect(() => {
    return () => stop()
  }, [stop])

  return { pose, ready, start, stop }
}
