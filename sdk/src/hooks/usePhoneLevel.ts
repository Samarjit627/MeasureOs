import { useCallback, useEffect, useState } from 'react'

type DOEStatic = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

export type OrientationPermission = 'unrequested' | 'granted' | 'denied' | 'unnecessary'

export function usePhoneLevel(thresholdDegrees = 5) {
  const [level, setLevel] = useState(false)
  const [orientation, setOrientation] = useState({ beta: 0, gamma: 0 })
  const [permission, setPermission] = useState<OrientationPermission>('unrequested')

  // iOS Safari 13+ gates deviceorientation behind an explicit permission
  // request that MUST be called from inside a user-gesture handler (e.g. a
  // button tap) - without this, orientation events never fire on iPhone and
  // the phone-level gate stays false forever, silently blocking capture.
  const requestPermission = useCallback(async () => {
    const DOE = DeviceOrientationEvent as DOEStatic
    if (typeof DOE.requestPermission === 'function') {
      try {
        const result = await DOE.requestPermission()
        setPermission(result)
        return result === 'granted'
      } catch {
        setPermission('denied')
        return false
      }
    }
    setPermission('unnecessary') // Android / desktop browsers don't require this
    return true
  }, [])

  useEffect(() => {
    const onDeviceOrientation = (event: DeviceOrientationEvent) => {
      const beta = event.beta ?? 0
      const gamma = event.gamma ?? 0
      setOrientation({ beta, gamma })
      setLevel(Math.abs(beta) < thresholdDegrees && Math.abs(gamma) < thresholdDegrees)
    }
    window.addEventListener('deviceorientation', onDeviceOrientation)
    return () => window.removeEventListener('deviceorientation', onDeviceOrientation)
  }, [thresholdDegrees])

  return { level, orientation, permission, requestPermission }
}
