import { useEffect, useState } from 'react'

export function usePhoneLevel(thresholdDegrees = 5) {
  const [level, setLevel] = useState(false)
  const [orientation, setOrientation] = useState({ beta: 0, gamma: 0 })

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

  return { level, orientation }
}
