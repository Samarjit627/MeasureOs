import type { UserAnswers } from '../../types'

// MediaPipe Pose has no landmark on the chest, waist, neck, bicep, or wrist -
// only 33 skeletal JOINTS (shoulders, elbows, wrists, hips, knees, ankles).
// The previous approach ("find whichever joint happens to be near this
// height, take the widest span") silently measured wrist-to-wrist or
// elbow-to-elbow span instead of torso width whenever arms were held away
// from the body - which the capture protocol explicitly instructs. That's
// confirmed root cause of the ~40% chest overestimate and the identical
// waist/hip values seen in testing (both bands snagged the same wrist
// landmarks).
//
// This file replaces that landmark search with population-average ratios,
// anchored to the two widths MediaPipe genuinely measures well (shoulder:
// landmarks 11-12, hip: landmarks 23-24). This does NOT make chest/waist
// individually accurate - it makes them plausible and stable instead of
// anatomically absurd. Real per-customer accuracy for these points still
// requires actual sensing (3DLook or an owned engine) - see index.ts's
// confidence tagging, which marks everything derived here as 'low'.

type Gender = NonNullable<UserAnswers['gender']>
type Shape = NonNullable<UserAnswers['bodyShape']>

const SHAPE_MUL: Record<Shape, number> = { slim: 0.88, average: 1.0, athletic: 1.05, heavy: 1.22 }

function gender(answers: UserAnswers): Gender {
  return answers.gender ?? 'male'
}
function shape(answers: UserAnswers): Shape {
  return answers.bodyShape ?? 'average'
}

// Chest (front-view) width relative to shoulder width - chest is usually
// close to, or slightly under, biacromial width for most adult bodies.
export function chestToShoulderRatio(answers: UserAnswers): number {
  return (gender(answers) === 'female' ? 0.9 : 0.92) * SHAPE_MUL[shape(answers)]
}

// Waist width relative to hip width - narrower than hip for most bodies,
// though heavier/male abdomens can approach or exceed hip width.
export function waistToHipRatio(answers: UserAnswers): number {
  return (gender(answers) === 'female' ? 0.78 : 0.86) * SHAPE_MUL[shape(answers)]
}

// Circumferences (girths) expressed relative to shoulder width - a rough
// dimensional stretch (comparing a straight width to a round-the-limb
// measurement), same approach the old code used, just with realistic
// population ratios instead of arbitrary constants that produced a 6cm
// wrist and an 18cm neck.
export function neckToShoulderRatio(answers: UserAnswers): number {
  return gender(answers) === 'female' ? 0.74 : 0.84
}
export function bicepToShoulderRatio(answers: UserAnswers): number {
  return (gender(answers) === 'female' ? 0.52 : 0.6) * SHAPE_MUL[shape(answers)]
}
export function wristToShoulderRatio(answers: UserAnswers): number {
  return gender(answers) === 'female' ? 0.3 : 0.33
}

// Depth (front-to-back) ratios, relative to the corresponding width. Real
// depth needs a genuinely good side-photo silhouette measurement; until
// that exists, a ratio anchored to width is more honest than a landmark
// search that previously produced a smaller waist depth than chest depth
// (anatomically backwards for almost any body).
export function chestDepthToWidthRatio(answers: UserAnswers): number {
  return gender(answers) === 'female' ? 0.54 : 0.58
}
export function waistDepthToWidthRatio(answers: UserAnswers): number {
  return (gender(answers) === 'female' ? 0.62 : 0.66) * SHAPE_MUL[shape(answers)]
}
export function hipDepthToWidthRatio(): number {
  return 0.62
}

// Hip joint centers (landmarks 23/24) sit inside the body, not on its
// surface - soft tissue extends the true hip width beyond the joint-to-joint
// span. This correction factor is a rough population average, not a
// per-customer measurement.
export function hipJointToSurfaceFactor(): number {
  return 1.16
}
