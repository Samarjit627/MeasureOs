import type { GatingStatus, PoseFrame, PhotoPose } from '../types'

const POSE_NAMES: Record<PhotoPose, string> = {
  front: 'Front',
  left: 'Left side',
  right: 'Right side',
  back: 'Back',
}

export function checkGating(
  pose: PoseFrame | null,
  markersVisible: boolean,
  phoneLevel: boolean,
  targetPose: PhotoPose,
  videoWidth: number,
  videoHeight: number,
): GatingStatus {
  const messages: string[] = []
  const poseMatched = pose ? checkPoseMatch(pose, targetPose) : false
  const bodyCentered = pose ? checkBodyCentered(pose, videoWidth, videoHeight) : false

  if (!markersVisible) messages.push('ArUco markers not detected')
  if (!phoneLevel) messages.push('Phone is not level')
  if (!bodyCentered) messages.push('Body not centered')
  if (!poseMatched) messages.push(`Pose not matched (${POSE_NAMES[targetPose]})`)

  const allReady = markersVisible && phoneLevel && bodyCentered && poseMatched
  return {
    markersVisible,
    phoneLevel,
    bodyCentered,
    poseMatched,
    allReady,
    messages,
  }
}

function checkBodyCentered(pose: PoseFrame, width: number, height: number): boolean {
  const lm = pose.landmarks
  // Use hips as center proxy (indices 23, 24)
  const leftHip = lm[23]
  const rightHip = lm[24]
  if (!leftHip || !rightHip || leftHip.visibility < 0.5 || rightHip.visibility < 0.5) return false
  const midX = ((leftHip.x + rightHip.x) / 2) * width
  const midY = ((leftHip.y + rightHip.y) / 2) * height
  // Allow 20% off center horizontally, 30% vertically
  return Math.abs(midX - width / 2) < width * 0.2 && Math.abs(midY - height / 2) < height * 0.3
}

function checkPoseMatch(pose: PoseFrame, target: PhotoPose): boolean {
  const lm = pose.landmarks
  if (!lm || lm.length < 33) return false

  const lWrist = lm[15]
  const rWrist = lm[16]
  const lShoulder = lm[11]
  const rShoulder = lm[12]
  const lHip = lm[23]
  const rHip = lm[24]
  const lAnkle = lm[27]
  const rAnkle = lm[28]

  const visible = (p: typeof lm[0]) => p && p.visibility > 0.5

  switch (target) {
    case 'front':
      // Shoulders wide, wrists near hips but not touching torso, both ankles visible
      if (!visible(lShoulder) || !visible(rShoulder) || !visible(lAnkle) || !visible(rAnkle)) return false
      // Wrists below shoulders and slightly out
      return (
        lWrist.y > lShoulder.y &&
        rWrist.y > rShoulder.y &&
        Math.abs(lWrist.x - lShoulder.x) > 0.05 &&
        Math.abs(rWrist.x - rShoulder.x) > 0.05
      )
    case 'back':
      // Similar to front but typically arms down; check both sides visible
      return visible(lShoulder) && visible(rShoulder) && visible(lAnkle) && visible(rAnkle)
    case 'left':
    case 'right':
      // Profile: one side shoulder/hip/ankle roughly aligned vertically, other side occluded
      const side = target === 'left' ? 'left' : 'right'
      const shoulder = side === 'left' ? lShoulder : rShoulder
      const hip = side === 'left' ? lHip : rHip
      const ankle = side === 'left' ? lAnkle : rAnkle
      const oppShoulder = side === 'left' ? rShoulder : lShoulder
      if (!visible(shoulder) || !visible(hip) || !visible(ankle)) return false
      // Opposite shoulder should be mostly hidden (lower visibility or close in x)
      return oppShoulder.visibility < 0.4 || Math.abs(oppShoulder.x - shoulder.x) < 0.1
    default:
      return false
  }
}
