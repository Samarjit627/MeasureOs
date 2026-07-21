import type { PoseFrame, BodyMeasurements, UserAnswers } from '../../types'
import {
  chestToShoulderRatio,
  waistToHipRatio,
  chestDepthToWidthRatio,
  waistDepthToWidthRatio,
  hipDepthToWidthRatio,
  hipJointToSurfaceFactor,
} from './anthropometricRatios'

export interface WidthsAndDepths extends Partial<BodyMeasurements> {
  shoulderWidth?: number
  chestWidth?: number
  chestDepth?: number
  waistWidth?: number
  waistDepth?: number
  hipWidth?: number
  hipDepth?: number
}

function dist2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function computeWidthsAndDepths(
  poses: {
    front?: PoseFrame
    left?: PoseFrame
    right?: PoseFrame
    back?: PoseFrame
  },
  scale: number,
  userAnswers: UserAnswers,
): WidthsAndDepths {
  const out: WidthsAndDepths = {}
  const anyFront = poses.front ?? poses.back

  if (!anyFront) return out
  const lm = anyFront.landmarks
  const lShoulder = lm[11]
  const rShoulder = lm[12]
  const lHip = lm[23]
  const rHip = lm[24]

  // Shoulder and hip are the only two torso widths MediaPipe gives us from
  // real joints - everything else below is derived FROM these two via
  // documented population ratios, not searched for among nearby landmarks
  // (which is what previously picked up wrist/elbow positions instead of
  // the torso edge - see anthropometricRatios.ts for the full explanation).
  if (lShoulder && rShoulder) {
    out.shoulderWidth = dist2d(lShoulder, rShoulder) * scale
  }
  if (lHip && rHip) {
    out.hipWidth = dist2d(lHip, rHip) * scale * hipJointToSurfaceFactor()
  }

  if (out.shoulderWidth) {
    out.chestWidth = out.shoulderWidth * chestToShoulderRatio(userAnswers)
  }
  if (out.hipWidth) {
    out.waistWidth = out.hipWidth * waistToHipRatio(userAnswers)
  }

  if (out.chestWidth) out.chestDepth = out.chestWidth * chestDepthToWidthRatio(userAnswers)
  if (out.waistWidth) out.waistDepth = out.waistWidth * waistDepthToWidthRatio(userAnswers)
  if (out.hipWidth) out.hipDepth = out.hipWidth * hipDepthToWidthRatio()

  return out
}
