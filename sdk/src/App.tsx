import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import type { PhotoPose, CapturePhoto, PoseFrame, GatingStatus, UserAnswers, CaptureSession } from './types'
import { useCamera } from './hooks/useCamera'
import { usePose } from './hooks/usePose'
import { useAruco } from './hooks/useAruco'
import { usePhoneLevel } from './hooks/usePhoneLevel'
import { checkGating } from './utils/poseGate'
import { computeMeasurements } from './utils/measurements'
import { buildBodyGuide } from './utils/bodyGuide'

const POSE_ORDER: PhotoPose[] = ['front', 'left', 'right', 'back']

const POSE_LABELS: Record<PhotoPose, string> = {
  front: 'Front',
  left: 'Left side',
  right: 'Right side',
  back: 'Back',
}

const POSE_HINTS: Record<PhotoPose, string> = {
  front: 'Stand facing the camera, feet inside the green circle, arms slightly away from body.',
  left: 'Turn 90° so your left side faces the camera. Arms relaxed.',
  right: 'Turn 90° so your right side faces the camera. Arms relaxed.',
  back: 'Turn around so your back faces the camera, arms relaxed.',
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function App() {
  const [step, setStep] = useState<'intro' | 'capture' | 'review'>('intro')
  const [answers, setAnswers] = useState<UserAnswers>({})
  const [currentPose, setCurrentPose] = useState<PhotoPose>('front')
  const [photos, setPhotos] = useState<CapturePhoto[]>([])
  const [poses, setPoses] = useState<Partial<Record<PhotoPose, PoseFrame>>>({})
  const [calibrations, setCalibrations] = useState<CaptureSession['calibrations']>({})
  const [measurements, setMeasurements] = useState<Record<string, { value: number; unit: 'cm'; confidence: 'high' | 'medium' | 'low'; method: string }>>({})
  const [gating, setGating] = useState<GatingStatus | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const { start, stop, captureFrame } = useCamera(videoRef)
  const { ready: poseReady, pose } = usePose(videoRef)
  const { ready: arucoReady, detections, calibration, error: arucoError, detect } = useAruco()
  const { level: phoneLevel } = usePhoneLevel()

  const currentPhoto = useMemo(() => photos.find((p) => p.pose === currentPose), [photos, currentPose])

  useEffect(() => {
    if (step === 'capture') {
      start({ video: { facingMode: 'environment' } }).catch((e) => setError(e.message))
    } else {
      stop()
    }
  }, [step, start, stop])

  useEffect(() => {
    const id = setInterval(() => {
      const canvas = captureFrame()
      if (canvas) detect(canvas)
    }, 500)
    return () => clearInterval(id)
  }, [captureFrame, detect])

  useEffect(() => {
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video || !overlay || !video.videoWidth) return
    overlay.width = video.videoWidth
    overlay.height = video.videoHeight
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)

    const markersVisible = detections.length >= 4
    const status = pose
      ? checkGating(pose, markersVisible, phoneLevel, currentPose, video.videoWidth, video.videoHeight)
      : {
          markersVisible,
          phoneLevel,
          bodyCentered: false,
          poseMatched: false,
          allReady: false,
          messages: ['No pose detected'],
        }
    setGating(status)

    drawGuide(ctx, currentPose, answers, status.poseMatched, overlay.width, overlay.height)
    if (pose) drawSkeleton(ctx, pose, overlay.width, overlay.height)
    if (detections.length) drawMarkers(ctx, detections)
  }, [pose, detections, phoneLevel, currentPose, answers])

  useEffect(() => {
    if (calibration && currentPose) {
      setCalibrations((prev) => ({ ...prev, [currentPose]: calibration }))
    }
  }, [calibration, currentPose])

  useEffect(() => {
    if (pose && currentPose) {
      setPoses((prev) => ({ ...prev, [currentPose]: pose }))
    }
  }, [pose, currentPose])

  useEffect(() => {
    if (arucoError) setError(arucoError)
  }, [arucoError])

  const startCountdown = useCallback(() => {
    if (countdown > 0) return
    setCountdown(3)
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          captureCurrentPose()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [countdown, currentPose, photos, poses, calibrations])

  const captureCurrentPose = useCallback(() => {
    const canvas = captureFrame()
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const photo: CapturePhoto = {
        pose: currentPose,
        blob,
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        width: canvas.width,
        height: canvas.height,
        timestamp: Date.now(),
      }
      setPhotos((prev) => [...prev.filter((p) => p.pose !== currentPose), photo])

      const nextIndex = POSE_ORDER.indexOf(currentPose) + 1
      if (nextIndex < POSE_ORDER.length) {
        setCurrentPose(POSE_ORDER[nextIndex])
      }
    }, 'image/jpeg', 0.92)
  }, [currentPose, captureFrame])

  const finishSession = useCallback(() => {
    const session: CaptureSession = {
      id: generateId(),
      createdAt: Date.now(),
      userAnswers: answers,
      photos,
      calibrations,
      poses,
      measurements: {},
    }
    const computed = computeMeasurements({
      photos,
      poses,
      calibrations,
      userAnswers: answers,
    })
    session.measurements = computed
    setMeasurements(computed)
    setStep('review')
    stop()
  }, [answers, photos, poses, calibrations, stop])

  useEffect(() => {
    if (step === 'capture' && photos.length === 4) {
      finishSession()
    }
  }, [step, photos.length, finishSession])

  const retakePose = useCallback((pose: PhotoPose) => {
    setCurrentPose(pose)
    setStep('capture')
    setPhotos((prev) => prev.filter((p) => p.pose !== pose))
  }, [])

  const startCapture = useCallback(() => {
    setStep('capture')
    setCurrentPose('front')
    setPhotos([])
    setPoses({})
    setCalibrations({})
    setMeasurements({})
  }, [])

  const exportSession = useCallback(() => {
    const session: CaptureSession = {
      id: generateId(),
      createdAt: Date.now(),
      userAnswers: answers,
      photos,
      calibrations,
      poses,
      measurements,
    }
    downloadJson(`measureos-session-${session.id}.json`, session)
    photos.forEach((p) => {
      const a = document.createElement('a')
      a.href = p.dataUrl
      a.download = `measureos-${p.pose}-${p.timestamp}.jpg`
      a.click()
    })
  }, [answers, photos, poses, calibrations, measurements])

  if (step === 'intro') {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
        <div className="max-w-md mx-auto space-y-6">
          <h1 className="text-2xl font-bold">MeasureOS</h1>
          <p className="text-slate-600">Body measurement capture using your phone camera.</p>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); startCapture() }}>
            <label className="block">
              <span className="text-sm font-medium">Height (cm)</span>
              <input
                type="number"
                required
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={answers.height ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, height: parseFloat(e.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Weight (kg)</span>
              <input
                type="number"
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={answers.weight ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, weight: parseFloat(e.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Age</span>
              <input
                type="number"
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={answers.age ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, age: parseFloat(e.target.value) }))}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Gender</span>
              <select
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={answers.gender ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, gender: e.target.value as UserAnswers['gender'] }))}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Body shape</span>
              <select
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={answers.bodyShape ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, bodyShape: e.target.value as UserAnswers['bodyShape'] }))}
              >
                <option value="">Select</option>
                <option value="slim">Slim</option>
                <option value="average">Average</option>
                <option value="athletic">Athletic</option>
                <option value="heavy">Heavy</option>
              </select>
              <span className="text-xs text-slate-400">Used to size the on-screen alignment outline.</span>
            </label>
            <label className="block">
              <span className="text-sm font-medium">Fit preference</span>
              <select
                className="mt-1 w-full rounded border border-slate-300 p-2"
                value={answers.fitPreference ?? ''}
                onChange={(e) => setAnswers((a) => ({ ...a, fitPreference: e.target.value as UserAnswers['fitPreference'] }))}
              >
                <option value="">Select</option>
                <option value="slim">Slim</option>
                <option value="regular">Regular</option>
                <option value="loose">Loose</option>
              </select>
            </label>
            <button type="submit" className="w-full rounded bg-indigo-600 py-3 text-white font-semibold">Start capture</button>
          </form>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>
      </main>
    )
  }

  if (step === 'review') {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
        <div className="max-w-md mx-auto space-y-6">
          <h1 className="text-2xl font-bold">Measurements</h1>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(measurements).map(([key, m]) => (
              <div key={key} className="rounded bg-white p-3 shadow">
                <p className="text-xs uppercase text-slate-500">{key}</p>
                <p className="text-lg font-semibold">{m.value} {m.unit}</p>
                <p className="text-xs text-slate-400 capitalize">{m.confidence}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {POSE_ORDER.map((pose) => {
              const photo = photos.find((p) => p.pose === pose)
              return (
                <div key={pose} className="space-y-2">
                  <p className="text-sm font-medium">{POSE_LABELS[pose]}</p>
                  {photo ? (
                    <img src={photo.dataUrl} alt={pose} className="rounded w-full h-32 object-cover" />
                  ) : (
                    <div className="h-32 rounded bg-slate-200" />
                  )}
                  <button onClick={() => retakePose(pose)} className="w-full rounded border border-slate-300 py-1 text-sm">Retake</button>
                </div>
              )
            })}
          </div>
          <button onClick={exportSession} className="w-full rounded bg-indigo-600 py-3 text-white font-semibold">Export session</button>
          <button onClick={startCapture} className="w-full rounded border border-slate-300 py-3 text-slate-700 font-semibold">New session</button>
        </div>
      </main>
    )
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-black text-white">
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
      <canvas ref={overlayRef} className="absolute inset-0 h-full w-full object-cover" />

      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{POSE_LABELS[currentPose]}</h2>
          <div className="text-sm">{photos.length + 1} / {POSE_ORDER.length}</div>
        </div>
        <p className="text-sm text-slate-200 mt-1">{POSE_HINTS[currentPose]}</p>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent space-y-3">
        {gating && !gating.allReady && (
          <div className="rounded bg-red-600/90 px-3 py-2 text-sm">
            {gating.messages.join(' · ')}
          </div>
        )}
        {gating?.allReady && countdown > 0 && (
          <div className="rounded bg-green-600/90 px-3 py-2 text-center text-2xl font-bold">{countdown}</div>
        )}
        <div className="flex items-center justify-between text-xs text-slate-300">
          <span>Pose: {poseReady ? 'ready' : 'loading'}</span>
          <span>ArUco: {arucoReady ? `${detections.length} markers` : 'loading'}</span>
          <span>Level: {phoneLevel ? 'ok' : 'tilt'}</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={startCountdown}
            disabled={!gating?.allReady || countdown > 0}
            className="flex-1 rounded bg-indigo-600 py-3 font-semibold disabled:bg-slate-600 disabled:opacity-50"
          >
            {currentPhoto ? 'Retake' : 'Capture'}
          </button>
          <button onClick={() => { stop(); setStep('review') }} className="rounded border border-white/30 px-4 py-3 font-semibold">Done</button>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
      </div>
    </main>
  )
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  pose: PoseFrame,
  width: number,
  height: number,
) {
  ctx.strokeStyle = '#22d3ee'
  ctx.lineWidth = 3
  const toScreen = (p: { x: number; y: number }) => ({ x: p.x * width, y: p.y * height })
  const pairs = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28],
  ] as [number, number][]
  for (const [a, b] of pairs) {
    const pa = pose.landmarks[a]
    const pb = pose.landmarks[b]
    if (!pa || !pb || pa.visibility < 0.3 || pb.visibility < 0.3) continue
    const sa = toScreen(pa)
    const sb = toScreen(pb)
    ctx.beginPath()
    ctx.moveTo(sa.x, sa.y)
    ctx.lineTo(sb.x, sb.y)
    ctx.stroke()
  }
}

function drawMarkers(ctx: CanvasRenderingContext2D, markers: { id: number; corners: { x: number; y: number }[] }[]) {
  ctx.strokeStyle = '#facc15'
  ctx.lineWidth = 2
  for (const m of markers) {
    ctx.beginPath()
    ctx.moveTo(m.corners[0].x, m.corners[0].y)
    for (let i = 1; i < m.corners.length; i++) {
      ctx.lineTo(m.corners[i].x, m.corners[i].y)
    }
    ctx.closePath()
    ctx.stroke()
    ctx.fillStyle = '#facc15'
    const cx = m.corners.reduce((s, c) => s + c.x, 0) / 4
    const cy = m.corners.reduce((s, c) => s + c.y, 0) / 4
    ctx.font = '14px sans-serif'
    ctx.fillText(String(m.id), cx, cy)
  }
}

function drawGuide(
  ctx: CanvasRenderingContext2D,
  pose: PhotoPose,
  answers: UserAnswers,
  matched: boolean,
  width: number,
  height: number,
) {
  ctx.save()
  const color = matched ? 'rgba(74,222,128,0.9)' : 'rgba(255,255,255,0.55)'
  ctx.strokeStyle = color
  ctx.fillStyle = matched ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 3
  ctx.setLineDash([10, 8])

  const cx = width / 2
  const h = height * 0.62
  const top = height * 0.16
  const halfW = width * 0.19 // pixels per unit of guide x (1.0 = shoulder half-width ref)
  const guide = buildBodyGuide(pose, answers)
  const px = (p: { x: number; y: number }) => ({ x: cx + p.x * halfW, y: top + p.y * h })

  if (guide.side) {
    // side/profile pose: asymmetric outline, back edge + front (depth) edge
    const pts = [...guide.side.back, ...[...guide.side.front].reverse()]
    ctx.beginPath()
    pts.forEach((p, i) => {
      const s = px(p)
      if (i === 0) ctx.moveTo(s.x, s.y)
      else ctx.lineTo(s.x, s.y)
    })
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else {
    // front/back pose: mirrored torso+legs outline
    const right = guide.torso.map(px)
    const left = [...guide.torso].reverse().map((p) => px({ x: -p.x, y: p.y }))
    ctx.beginPath()
    right.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)))
    left.forEach((s) => ctx.lineTo(s.x, s.y))
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // arms, offset outward with a visible gap from the torso
    ctx.setLineDash([6, 6])
    for (const sign of [-1, 1] as const) {
      const arm = guide.leftArm.map((p) => px({ x: sign * p.x, y: p.y }))
      ctx.beginPath()
      arm.forEach((s, i) => (i === 0 ? ctx.moveTo(s.x, s.y) : ctx.lineTo(s.x, s.y)))
      ctx.stroke()
    }
    ctx.setLineDash([10, 8])
  }

  // head
  const headTop = px({ x: 0, y: 0 })
  const headR = h * 0.085
  ctx.beginPath()
  ctx.arc(headTop.x, headTop.y - headR * 1.05, headR, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.restore()
}
