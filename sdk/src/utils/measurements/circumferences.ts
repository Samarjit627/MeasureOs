import type { UserAnswers, BodyMeasurements } from '../../types'
import type { WidthsAndDepths } from './widths'

export interface Circumferences extends Partial<BodyMeasurements> {
  chestCircumference?: number
  waistCircumference?: number
  hipCircumference?: number
  neckCircumference?: number
  bicepCircumference?: number
  wristCircumference?: number
}

export function computeCircumferences(widths: WidthsAndDepths, _userAnswers: UserAnswers): Circumferences {
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

  // Neck: heuristic ratio of neck circumference to shoulder width.
  if (widths.shoulderWidth) {
    out.neckCircumference = widths.shoulderWidth * 0.35
  }

  // Bicep and wrist: rough ratios of arm segment length, can be refined later with anthropometric data.
  // Placeholder: bicep ~0.25 of shoulder-to-wrist span, wrist ~0.12.
  if (widths.shoulderWidth) {
    out.bicepCircumference = widths.shoulderWidth * 0.25
    out.wristCircumference = widths.shoulderWidth * 0.12
  }

  return out
}
