export interface MarkerMap {
  sheet: {
    width_cm: number
    height_cm: number
    depth_cm?: number
    unit: string
    platform_zero?: string
    origin?: string
    x_axis?: string
    y_axis?: string
    lens_target_height_cm?: number
    standing_heel_y_cm?: number
    standing_circle_center_y_cm?: number
  }
  markers: Array<{
    id: number
    x_cm: number
    y_cm: number
    size_cm: number
    corner: string
  }>
}

export interface KnownMarker {
  id: number
  objectPoints: number[][] // 4 corners in 3D (cm), origin = platform top/rear-left
  imagePoints: number[][] // detected 4 corners in pixels
}

let backdropMap: MarkerMap | null = null
let platformMap: MarkerMap | null = null

export async function loadMarkerMaps(): Promise<{ backdrop: MarkerMap; platform: MarkerMap }> {
  if (backdropMap && platformMap) return { backdrop: backdropMap, platform: platformMap }
  const [b, p] = await Promise.all([
    fetch('/markerMaps/backdrop.json').then((r) => r.json()),
    fetch('/markerMaps/platform.json').then((r) => r.json()),
  ])
  backdropMap = b
  platformMap = p
  return { backdrop: b, platform: p }
}

export function buildKnownMarkers(detections: Array<{ id: number; corners: { x: number; y: number }[] }>): {
  backdrop: KnownMarker[]
  platform: KnownMarker[]
} {
  if (!backdropMap || !platformMap) throw new Error('Marker maps not loaded')

  const byId = (map: MarkerMap) => {
    const dict: Record<number, MarkerMap['markers'][number]> = {}
    for (const m of map.markers) dict[m.id] = m
    return dict
  }
  const bdDict = byId(backdropMap)
  const pfDict = byId(platformMap)

  const to3d = (m: MarkerMap['markers'][number], z: number): number[][] => {
    const s = m.size_cm
    // corners in object space: TL, TR, BR, BL
    return [
      [m.x_cm, m.y_cm, z],
      [m.x_cm + s, m.y_cm, z],
      [m.x_cm + s, m.y_cm + s, z],
      [m.x_cm, m.y_cm + s, z],
    ]
  }

  const backdrop: KnownMarker[] = []
  const platform: KnownMarker[] = []

  for (const det of detections) {
    const pts = det.corners.map((c) => [c.x, c.y])
    if (bdDict[det.id]) {
      backdrop.push({ id: det.id, objectPoints: to3d(bdDict[det.id], 0), imagePoints: pts })
    } else if (pfDict[det.id]) {
      platform.push({ id: det.id, objectPoints: to3d(pfDict[det.id], 0), imagePoints: pts })
    }
  }

  return { backdrop, platform }
}

export function getMarkerSizeCm(id: number): number | undefined {
  if (!backdropMap || !platformMap) return undefined
  for (const m of backdropMap.markers) if (m.id === id) return m.size_cm
  for (const m of platformMap.markers) if (m.id === id) return m.size_cm
  return undefined
}
