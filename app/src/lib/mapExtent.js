// The part of the world the map can show, shared by the app (MapView maxBounds)
// and the build (scripts/split-data.mjs, which drops land polygons entirely
// outside it). [minLon, minLat, maxLon, maxLat].
//
// Wide on purpose: it must hold every event marker (the 2020 normalization
// agreements were signed in Washington, D.C., lon -77), not just the region.
// Land polygons that cross the edge are kept whole, so everything inside the
// extent is complete; split-data fails the build if an event falls outside it.
export const MAP_EXTENT = [-100, -40, 120, 75];
