// The part of the world the map can show, shared by the app (MapView maxBounds)
// and the build (scripts/split-data.mjs, which drops land polygons entirely
// outside it). [minLon, minLat, maxLon, maxLat].
//
// Wide on purpose: it must hold every event marker (the 2020 normalization
// agreements were signed in Washington, D.C., lon -77), not just the region.
// Land polygons that cross the edge are kept whole, so everything inside the
// extent is complete; split-data fails the build if an event falls outside it.
export const MAP_EXTENT = [-100, -40, 120, 75];

// Land polygons that touch this box ship in data/land.json, which the first
// view waits for; the rest of MAP_EXTENT (the Americas, East Asia, Oceania, and
// distant islands) ships in data/land-far.json, loaded once that view has drawn
// (MapView.jsx). Polygons are split whole, never cut. The box must hold every
// opening view: measured on viewports from 320x568 to 3840x2160 and 3440x1440
// (21:9), the default view spans lon -24.3..104.3, lat -30.4..68.8. A wider
// screen may see a distant coast appear a moment after the rest.
export const NEAR_LAND_EXTENT = [-30, -35, 110, 72];
