export type PhotoPose = 'front' | 'left' | 'right' | 'back'

export interface CapturePhoto {
  pose: PhotoPose
  blob: Blob
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

export interface MarkerDetection {
  id: number
  corners: { x: number; y: number }[] // 4 corners in image coords
  center: { x: number; y: number }
}

export interface CameraCalibration {
  fx: number
  fy: number
  cx: number
  cy: number
  rvec: number[]
  tvec: number[]
  reprojectionError?: number
}

export interface PoseLandmark {
  x: number // normalized [0,1]
  y: number // normalized [0,1]
  z: number // relative depth
  visibility: number
}

export interface PoseFrame {
  landmarks: PoseLandmark[]
  worldLandmarks: PoseLandmark[]
}

export interface GatingStatus {
  markersVisible: boolean
  phoneLevel: boolean
  bodyCentered: boolean
  poseMatched: boolean
  allReady: boolean
  messages: string[]
}

export interface BodyMeasurements {
  height?: number
  backLength?: number
  shoulderWidth?: number
  chestWidth?: number
  chestDepth?: number
  chestCircumference?: number
  waistWidth?: number
  waistDepth?: number
  waistCircumference?: number
  hipWidth?: number
  hipDepth?: number
  hipCircumference?: number
  neckCircumference?: number
  sleeveLength?: number
  armLength?: number
  inseam?: number
}

export interface MeasurementResult {
  value: number
  unit: 'cm'
  confidence: 'high' | 'medium' | 'low'
  method: string
}

export interface CaptureSession {
  id: string
  createdAt: number
  userAnswers: UserAnswers
  photos: CapturePhoto[]
  calibrations: Partial<Record<PhotoPose, CameraCalibration>>
  poses: Partial<Record<PhotoPose, PoseFrame>>
  measurements: Record<string, MeasurementResult>
}

export interface UserAnswers {
  height?: number
  weight?: number
  age?: number
  gender?: 'male' | 'female'
  fitPreference?: 'slim' | 'regular' | 'loose'
  bodyShape?: 'slim' | 'average' | 'athletic' | 'heavy'
}
