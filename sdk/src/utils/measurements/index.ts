import type { CapturePhoto, PhotoPose, PoseFrame, CameraCalibration, BodyMeasurements, MeasurementResult, UserAnswers } from '../../types'

export * from './lengths'
export * from './widths'
export * from './circumferences'

import { computeLengths } from './lengths'
import { computeWidthsAndDepths } from './widths'
import { computeCircumferences } from './circumferences'

export interface MeasurementInput {
  photos: CapturePhoto[]
  poses: Partial<Record<PhotoPose, PoseFrame>>
  calibrations: Partial<Record<PhotoPose, CameraCalibration>>
  userAnswers: UserAnswers
}

function computeScaleFactor(front: PoseFrame | undefined, heightCm?: number): number {
  if (!heightCm || !front || front.landmarks.length < 33) return 170
  const lm = front.landmarks
  const nose = lm[0]
  const lAnkle = lm[27]
  const rAnkle = lm[28]
  if (!nose || !lAnkle || !rAnkle) return 170
  const ankleY = (lAnkle.y + rAnkle.y) / 2
  const bodySpan = Math.abs(nose.y - ankleY)
  if (bodySpan <= 0) return 170
  // The visible nose-to-ankle span covers roughly 90% of total height.
  return heightCm / (bodySpan / 0.9)
}

// Points computed straight from two real, well-tracked joints (a direct
// Euclidean distance) - these are the only ones honestly "medium" so far.
// Everything else below is either a rough population ratio or has no
// individual signal at all, and must say so rather than claim a confidence
// it hasn't earned. See anthropometricRatios.ts for why chest/waist/neck/
// bicep/wrist can't be measured directly from MediaPipe's 33 joints.
const JOINT_DERIVED = new Set(['height', 'backLength', 'sleeveLength', 'armLength', 'inseam', 'shoulderWidth'])

export function computeMeasurements(input: MeasurementInput): Record<string, MeasurementResult> {
  const { photos, poses, userAnswers } = input
  if (photos.length < 4) return {}

  const front = poses.front
  const left = poses.left
  const right = poses.right
  const back = poses.back

  const scaleFactor = computeScaleFactor(front, userAnswers.height)
  const lengths = computeLengths(front, scaleFactor)
  const widths = computeWidthsAndDepths({ front, left, right, back }, scaleFactor, userAnswers)
  const circumferences = computeCircumferences(widths, userAnswers)

  const all: BodyMeasurements = { ...lengths, ...widths, ...circumferences }

  const out: Record<string, MeasurementResult> = {}
  for (const [key, value] of Object.entries(all)) {
    if (value !== undefined && !Number.isNaN(value)) {
      const jointDerived = JOINT_DERIVED.has(key)
      out[key] = {
        value: Math.round(value * 10) / 10,
        unit: 'cm',
        confidence: jointDerived ? 'medium' : 'low',
        method: jointDerived ? 'landmark' : 'population-ratio',
      }
    }
  }

  // Height gets high confidence if user provided it; otherwise medium
  if (userAnswers.height && out.height) {
    out.height.value = userAnswers.height
    out.height.confidence = 'high'
    out.height.method = 'user-stated'
  }

  return out
}
