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

export function computeMeasurements(input: MeasurementInput): Record<string, MeasurementResult> {
  const { photos, poses, userAnswers } = input
  if (photos.length < 4) return {}

  const front = poses.front
  const left = poses.left
  const right = poses.right
  const back = poses.back

  const scaleFactor = computeScaleFactor(front, userAnswers.height)
  const lengths = computeLengths(front, scaleFactor)
  const widths = computeWidthsAndDepths({ front, left, right, back }, scaleFactor)
  const circumferences = computeCircumferences(widths, userAnswers)

  const all: BodyMeasurements = { ...lengths, ...widths, ...circumferences }

  const out: Record<string, MeasurementResult> = {}
  for (const [key, value] of Object.entries(all)) {
    if (value !== undefined && !Number.isNaN(value)) {
      out[key] = {
        value: Math.round(value * 10) / 10,
        unit: 'cm',
        confidence: 'medium',
        method: 'heuristic',
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
