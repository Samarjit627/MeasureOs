import { useEffect, useRef, useState } from 'react'
import type { Pose as PoseClass, Results } from '@mediapipe/pose'
import type { PoseFrame, PoseLandmark } from '../types'

declare global {
  interface Window {
    Pose: typeof PoseClass
  }
}

export function usePose(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active = true,
  stream: MediaStream | null = null,
) {
  const [pose, setPose] = useState<PoseFrame | null>(null)
  const [ready, setReady] = useState(false)
  const poseRef = useRef<PoseClass | null>(null)
  const processingRef = useRef(false)

  // Initialize / teardown MediaPipe Pose.
  useEffect(() => {
    if (!active || typeof window.Pose === 'undefined') return

    const Pose = window.Pose
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

    return () => {
      pose.close()
      poseRef.current = null
      setPose(null)
      setReady(false)
    }
  }, [active])

  // Feed frames from the video element into MediaPipe Pose whenever the stream changes.
  useEffect(() => {
    if (!active || !poseRef.current) return
    const video = videoRef.current
    if (!video) return

    let intervalId = 0
    const tick = () => {
      if (!video || video.videoWidth === 0 || processingRef.current) return
      processingRef.current = true
      poseRef
        .current!.send({ image: video })
        .catch(() => {})
        .finally(() => {
          processingRef.current = false
        })
    }

    const onPlay = () => {
      setReady(true)
      intervalId = window.setInterval(tick, 150)
    }

    video.addEventListener('play', onPlay)
    if (!video.paused && video.videoWidth > 0) {
      onPlay()
    }

    return () => {
      video.removeEventListener('play', onPlay)
      window.clearInterval(intervalId)
      processingRef.current = false
    }
  }, [active, videoRef, stream])

  return { pose, ready }
}
