import type { UserAnswers, BodyMeasurements } from '../../types'
import type { WidthsAndDepths } from './widths'
import {
  neckToShoulderRatio,
  bicepToShoulderRatio,
  wristToShoulderRatio,
} from './anthropometricRatios'

export interface Circumferences extends Partial<BodyMeasurements> {
  chestCircumference?: number
  waistCircumference?: number
  hipCircumference?: number
  neckCircumference?: number
  bicepCircumference?: number
  wristCircumference?: number
}

export function computeCircumferences(widths: WidthsAndDepths, userAnswers: UserAnswers): Circumferences {
  const out: Circumferences = {}

  // Ellipse circumference approximation: Ramanujan 1
  const ellipseCircumference = (w: number, d: number) => {
    const a = w / 2
    const b = d / 2
    if (a <= 0 || b <= 0) return 0
    const h = Math.pow((a - b) / (a + b), 2)
    return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
  }

  if (widths.chestWidth && widths.chestDepth) {
    out.chestCircumference = ellipseCircumference(widths.chestWidth, widths.chestDepth)
  }
  if (widths.waistWidth && widths.waistDepth) {
    out.waistCircumference = ellipseCircumference(widths.waistWidth, widths.waistDepth)
  }
  if (widths.hipWidth && widths.hipDepth) {
    out.hipCircumference = ellipseCircumference(widths.hipWidth, widths.hipDepth)
  }

  // Neck/bicep/wrist: population-ratio estimates anchored to shoulder width
  // (see anthropometricRatios.ts). Previously these used undocumented
  // constants (0.35 / 0.25 / 0.12) that produced an 18cm neck and a 6cm
  // wrist - anatomically impossible. Still not individually measured.
  if (widths.shoulderWidth) {
    out.neckCircumference = widths.shoulderWidth * neckToShoulderRatio(userAnswers)
    out.bicepCircumference = widths.shoulderWidth * bicepToShoulderRatio(userAnswers)
    out.wristCircumference = widths.shoulderWidth * wristToShoulderRatio(userAnswers)
  }

  return out
}
