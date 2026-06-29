/**
 * Shared GeoJSON filtering utilities for map rendering.
 *
 * IMPORTANT: Keep in sync between:
 *   - RegionMapWidgetComponent (web map)
 *   - renderUserGroupMap in ListComponent (PDF map)
 */

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: { name: string; iso_a2: string; iso_a3: string };
    geometry: any;
  }>;
}

/** Detect bounding-box placeholder rectangles (small islands with 4-5 coords that fill their bbox). */
export function isRectPlaceholder(coords: number[][]): boolean {
  if (coords.length > 6 || coords.length < 4) return false;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const bboxArea = (Math.max(...lngs) - Math.min(...lngs)) * (Math.max(...lats) - Math.min(...lats));
  if (bboxArea === 0) return false;
  const n = coords.length - 1;
  const area = Math.abs(coords.slice(0, n).reduce((s, c, i) => s + c[0] * coords[(i + 1) % n][1] - coords[(i + 1) % n][0] * c[1], 0)) / 2;
  return area / bboxArea > 0.95;
}

function bboxArea(coords: number[][]): number {
  const lngs = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
  return (Math.max(...lngs) - Math.min(...lngs)) * (Math.max(...lats) - Math.min(...lats));
}

/** For a MultiPolygon, returns the bbox area of the largest polygon. */
export function largestPolygonBBoxArea(coords: number[][][] | number[][][][]): number {
  let max = 0;
  for (const poly of coords) {
    // poly is number[][][] (one polygon = array of rings)
    const allPts = (poly as number[][][]).flat() as number[][];
    const area = bboxArea(allPts);
    if (area > max) max = area;
  }
  return max;
}

/**
 * Strip overseas territories: keep only polygons whose bbox area is ≥ 5% of the
 * largest polygon's bbox area. Prevents e.g. French Guiana rendering for FR.
 */
export function getMainlandGeometry(geom: any): any {
  if (geom.type === 'Polygon') return geom;
  if (geom.type !== 'MultiPolygon' || !geom.coordinates?.length) return geom;
  const maxArea = largestPolygonBBoxArea(geom.coordinates);
  const threshold = maxArea * 0.10;
  const kept = geom.coordinates.filter((poly: number[][][]) => {
    const pts = (poly as number[][][]).flat() as number[][];
    return bboxArea(pts) >= threshold;
  });
  return { ...geom, coordinates: kept.length > 0 ? kept : geom.coordinates };
}

/** Apply all GeoJSON filters: rect placeholders + overseas territories. */
export function filterGeoJson(data: GeoJSONFeatureCollection): GeoJSONFeatureCollection {
  return {
    ...data,
    features: data.features
      .filter((f) => {
        const geom = f.geometry;
        if (!geom) return false;
        const rings: number[][][] = geom.type === 'Polygon'
          ? geom.coordinates
          : geom.type === 'MultiPolygon'
            ? (geom.coordinates as number[][][][]).flat()
            : [];
        if (rings.some((ring) => isRectPlaceholder(ring))) return false;
        return true;
      })
      .map((f) => {
        const filtered = getMainlandGeometry(f.geometry);
        return { ...f, geometry: filtered };
      }),
  };
}
