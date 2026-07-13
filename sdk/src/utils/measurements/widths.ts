import type { PoseFrame, BodyMeasurements } from '../../types'

export interface WidthsAndDepths extends Partial<BodyMeasurements> {
  shoulderWidth?: number
  chestWidth?: number
  chestDepth?: number
  waistWidth?: number
  waistDepth?: number
  hipWidth?: number
  hipDepth?: number
}

export function computeWidthsAndDepths(
  poses: {
    front?: PoseFrame
    left?: PoseFrame
    right?: PoseFrame
    back?: PoseFrame
  },
  scale: number,
): WidthsAndDepths {
  const out: WidthsAndDepths = {}
  const { front, left, right, back } = poses

  const side = left ?? right
  const anyFront = front ?? back

  if (anyFront) {
    const lm = anyFront!.landmarks
    const lShoulder = lm[11]
    const rShoulder = lm[12]
    if (lShoulder && rShoulder) {
      out.shoulderWidth = Math.hypot(lShoulder.x - rShoulder.x, lShoulder.y - rShoulder.y) * scale
    }
  }

  if (front) {
    out.chestWidth = estimateWidthAtY(front, estimateChestY(front)) * scale
    out.waistWidth = estimateWidthAtY(front, estimateWaistY(front)) * scale
    out.hipWidth = estimateWidthAtY(front, estimateHipY(front)) * scale
  }

  if (side) {
    out.chestDepth = estimateWidthAtY(side, estimateChestY(side)) * scale
    out.waistDepth = estimateWidthAtY(side, estimateWaistY(side)) * scale
    out.hipDepth = estimateWidthAtY(side, estimateHipY(side)) * scale
  }

  // Fallback: if no side depth available, infer depth from width using a heuristic body ellipse ratio.
  // These ratios are placeholders; replace with population anthropometric data later.
  const defaultRatios = { chest: 0.42, waist: 0.38, hip: 0.45 }
  if (out.chestWidth && !out.chestDepth) out.chestDepth = out.chestWidth * defaultRatios.chest
  if (out.waistWidth && !out.waistDepth) out.waistDepth = out.waistWidth * defaultRatios.waist
  if (out.hipWidth && !out.hipDepth) out.hipDepth = out.hipWidth * defaultRatios.hip

  return out
}

function estimateChestY(pose: PoseFrame): number {
  const lm = pose.landmarks
  const lShoulder = lm[11]
  const rShoulder = lm[12]
  const lHip = lm[23]
  const rHip = lm[24]
  const shoulderY = lShoulder && rShoulder ? (lShoulder.y + rShoulder.y) / 2 : lm[0]?.y ?? 0
  const hipY = lHip && rHip ? (lHip.y + rHip.y) / 2 : shoulderY
  // Chest sits roughly 1/3 down from shoulder to hip
  return shoulderY + (hipY - shoulderY) * 0.33
}

function estimateWaistY(pose: PoseFrame): number {
  const lm = pose.landmarks
  const lShoulder = lm[11]
  const rShoulder = lm[12]
  const lHip = lm[23]
  const rHip = lm[24]
  const shoulderY = lShoulder && rShoulder ? (lShoulder.y + rShoulder.y) / 2 : lm[0]?.y ?? 0
  const hipY = lHip && rHip ? (lHip.y + rHip.y) / 2 : shoulderY
  return shoulderY + (hipY - shoulderY) * 0.55
}

function estimateHipY(pose: PoseFrame): number {
  const lm = pose.landmarks
  const lHip = lm[23]
  const rHip = lm[24]
  if (lHip && rHip) return (lHip.y + rHip.y) / 2
  return lm[11]?.y ?? 0
}

function estimateWidthAtY(pose: PoseFrame, y: number): number {
  const lm = pose.landmarks
  // Gather plausible boundary landmarks close to the requested y level.
  const candidates = [
    lm[11], lm[12], // shoulders
    lm[13], lm[14], // elbows
    lm[15], lm[16], // wrists
    lm[23], lm[24], // hips
    lm[25], lm[26], // knees
  ].filter((p) => p && p.visibility > 0.3)

  if (candidates.length < 2) return 0
  // In normalized screen coordinates, width is horizontal span at this y band.
  const near = candidates.filter((p) => Math.abs(p.y - y) < 0.12)
  if (near.length < 2) {
    const sorted = [...candidates].sort((a, b) => a.x - b.x)
    return sorted[sorted.length - 1].x - sorted[0].x
  }
  const sorted = near.sort((a, b) => a.x - b.x)
  return sorted[sorted.length - 1].x - sorted[0].x
}
