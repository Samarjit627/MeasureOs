import type { PhotoPose, UserAnswers } from '../types'

// Body silhouette guide, parametrized by the intro-form answers, so the
// on-screen outline roughly matches the customer's proportions and the
// operator can align them inside it rather than guessing at a generic box.

export interface GuidePoint {
  x: number // fraction of half-width reference; 0 = centerline
  y: number // fraction of body-box height; 0 = shoulder line, 1 = feet
}

export interface BodyGuide {
  torso: GuidePoint[] // closed polygon (right side only; mirrored when drawn)
  leftArm: GuidePoint[]
  side?: { back: GuidePoint[]; front: GuidePoint[] } // profile poses only
}

type Gender = NonNullable<UserAnswers['gender']>
type Shape = NonNullable<UserAnswers['bodyShape']>

const SHAPE_MUL: Record<Shape, number> = {
  slim: 0.84,
  average: 1.0,
  athletic: 1.06,
  heavy: 1.3,
}

function ratios(answers: UserAnswers) {
  const gender: Gender = answers.gender ?? 'male'
  const shape: Shape = answers.bodyShape ?? 'average'
  const m = SHAPE_MUL[shape]
  return {
    shoulder: gender === 'female' ? 0.86 : 1.0,
    chest: (gender === 'female' ? 0.78 : 0.85) * Math.min(m, 1.12),
    waist: (gender === 'female' ? 0.6 : 0.72) * m,
    hip: (gender === 'female' ? 0.86 : 0.78) * Math.min(m, 1.2),
    ankle: 0.16,
    armOut: gender === 'female' ? 1.05 : 1.15,
    chestDepth: (gender === 'female' ? 0.5 : 0.56) * Math.min(m, 1.1),
    waistDepth: (gender === 'female' ? 0.46 : 0.5) * m,
    hipDepth: (gender === 'female' ? 0.56 : 0.5) * Math.min(m, 1.15),
  }
}

function frontBackGuide(answers: UserAnswers): BodyGuide {
  const r = ratios(answers)
  const torso: GuidePoint[] = [
    { x: r.shoulder, y: 0 },
    { x: r.chest, y: 0.12 },
    { x: r.waist, y: 0.34 },
    { x: r.hip, y: 0.42 },
    { x: r.hip * 0.55, y: 0.5 },
    { x: 0.17, y: 0.74 },
    { x: r.ankle, y: 1.0 },
  ]
  const leftArm: GuidePoint[] = [
    { x: r.shoulder, y: 0 },
    { x: r.shoulder * r.armOut, y: 0.2 },
    { x: r.shoulder * r.armOut * 0.9, y: 0.36 },
  ]
  return { torso, leftArm }
}

function sideGuide(answers: UserAnswers): BodyGuide {
  const r = ratios(answers)
  // "back" edge (near-vertical, slight natural curve) and "front" edge
  // (bulges out at chest/waist/hip by depth ratio) of a profile silhouette.
  const back: GuidePoint[] = [
    { x: 0, y: 0 },
    { x: -0.02, y: 0.2 },
    { x: 0, y: 0.42 },
    { x: 0.01, y: 0.7 },
    { x: 0, y: 1.0 },
  ]
  const front: GuidePoint[] = [
    { x: 0.42, y: 0.02 },
    { x: r.chestDepth, y: 0.16 },
    { x: r.waistDepth, y: 0.36 },
    { x: r.hipDepth, y: 0.46 },
    { x: 0.3, y: 0.6 },
    { x: 0.22, y: 0.78 },
    { x: 0.18, y: 1.0 },
  ]
  return { torso: [], leftArm: [], side: { back, front } }
}

export function buildBodyGuide(pose: PhotoPose, answers: UserAnswers): BodyGuide {
  if (pose === 'left' || pose === 'right') return sideGuide(answers)
  return frontBackGuide(answers)
}
