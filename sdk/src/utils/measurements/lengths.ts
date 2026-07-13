import type { PoseFrame, BodyMeasurements } from '../../types'

function dist(a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = (a.z ?? 0) - (b.z ?? 0)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function verticalComponent(a: { x: number; y: number; z?: number }, b: { x: number; y: number; z?: number }): number {
  return Math.abs(a.y - b.y)
}

export function computeLengths(
  front: PoseFrame | undefined,
  scale: number,
): Partial<BodyMeasurements> {
  const out: Partial<BodyMeasurements> = {}
  if (!front || front.landmarks.length < 33 || scale <= 0) return out
  const lm = front.landmarks

  const lAnkle = lm[27]
  const rAnkle = lm[28]
  const lHip = lm[23]
  const rHip = lm[24]
  const lShoulder = lm[11]
  const rShoulder = lm[12]
  const lWrist = lm[15]
  const rWrist = lm[16]
  const nose = lm[0]

  if (nose && lAnkle && rAnkle) {
    const ankleY = (lAnkle.y + rAnkle.y) / 2
    const bodyPixel = Math.abs(nose.y - ankleY)
    out.height = bodyPixel > 0 ? (bodyPixel / 0.9) * scale : undefined
  }

  if (lShoulder && rShoulder && lHip && rHip) {
    const shoulderY = (lShoulder.y + rShoulder.y) / 2
    const hipY = (lHip.y + rHip.y) / 2
    out.backLength = Math.abs(shoulderY - hipY) * scale
  }

  const lKnee = lm[25]
  const rKnee = lm[26]

  if (lShoulder && lWrist) {
    out.sleeveLength = dist(lShoulder, lWrist) * scale
    out.armLength = out.sleeveLength
  } else if (rShoulder && rWrist) {
    out.sleeveLength = dist(rShoulder, rWrist) * scale
    out.armLength = out.sleeveLength
  }

  if (lHip && lKnee && lAnkle) {
    out.inseam = verticalComponent(lHip, lAnkle) * scale
  } else if (rHip && rKnee && rAnkle) {
    out.inseam = verticalComponent(rHip, rAnkle) * scale
  }

  return out
}
