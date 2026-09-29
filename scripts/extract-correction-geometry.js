// One-off extraction/computation step producing data/corrections-geometry.json - the
// polygon shapes our own corrections need that don't already exist in raw CShapes.
// Unlike data/raw/*, this file's inputs are OUR choice of sources and OUR computation
// (e.g. a polygon difference), so it's not upstream data - it's authored by us, same as
// boundary-corrections.js, just too large/computed to write out by hand as coordinates.
//
// Requires @turf/turf and shapefile, NEITHER of which is a project dependency (both are
// only needed to regenerate this file) - run `npm install --no-save @turf/turf shapefile`
// before running this script, and don't commit either to package.json.
//
// Sources:
//
// 1. Natural Earth (public domain) - ne_10m_admin_0_countries, ne_10m_admin_1_states_provinces:
//      https://github.com/nvkelso/natural-earth-vector
//    Download commands:
//      curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson -o data/raw/ne10-countries.geojson
//      curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson -o data/raw/ne10-admin1.geojson
//
// 2. UN OCHA occupied Palestinian territory (oPt), "State of Palestine - Oslo Agreement in
//    the West Bank" (source: Palestinian Authority Ministry of Planning), published on the
//    Humanitarian Data Exchange:
//      https://data.humdata.org/dataset/state-of-palestine-other-0-0-0-0-0
//    Download commands:
//      curl -sL -A "Mozilla/5.0" https://data.humdata.org/dataset/d3a843df-a640-4e9d-b867-8ca974c2aa74/resource/86f2707a-dc64-46af-bd41-b31e95611b45/download/osloagreement.zip -o data/raw/oslo-agreement.zip
//      unzip -o -d data/raw/oslo-agreement data/raw/oslo-agreement.zip
//    License: HDX lists it under the legacy HumanitarianResponse.info terms, which grant
//    permission to download and copy the material for non-commercial use and permit
//    derivative works "subject to the inclusion of credit to the source of the Materials
//    used" (archived at
//    https://web.archive.org/web/20260728185723/https://data.humdata.org/about/license/legacy_hrinfo).
//    That is compatible with this project, which is already non-commercial-only because of
//    CShapes' CC BY-NC-SA 4.0 terms. Note this is NOT the same as the more restrictive
//    terms on the ochaopt.org website itself, which forbid derivative works; the HDX
//    dataset page is the one we took the data from and is the license that applies to it.
//
// 3. The two Uqair Protocol "Neutral Zones" (see NEUTRAL ZONES below) are different: no open
//    dataset maps them, so their shapes are digitized here from the coordinates their own
//    delimitation documents state. Those documents, and the gazetteer used to resolve the
//    place names they refer to but don't give coordinates for:
//      - U.S. Dept. of State, Office of the Geographer, International Boundary Study No. 103,
//        "Kuwait - Saudi Arabia Boundary" (15 Sept 1970) - quotes the 1922 Uqair Protocol's
//        definition of the Saudi-Kuwaiti zone and prints the full 1969 partition-line survey.
//        https://library.law.fsu.edu/Digital-Collections/LimitsinSeas/pdf/ibs103.pdf
//      - Ditto No. 111, "Iraq - Saudi Arabia Boundary" (1 June 1971) - quotes Uqair's
//        definition of the Saudi-Iraqi zone and gives the Batin junction's coordinates.
//        https://library.law.fsu.edu/Digital-Collections/LimitsinSeas/pdf/ibs111.pdf
//      - International Frontier Treaty between Saudi Arabia and Iraq (26 Dec 1981), with the
//        1975 Baghdad and Riyadh Agreed Minutes annexed, UN Treaty Series vol. 1638, I-28158.
//        https://treaties.un.org/doc/Publication/UNTS/volume%201638/english.pdf
//      - U.S. Dept. of State (INR/GE) Cartographic Guidance Bulletin No. 4, "Revised Guidance
//        on the Iraq/Saudi Arabia Boundary" (30 Mar 1992) - turning points of the 1981 line,
//        one of them labelled as the former Neutral Zone's western vertex.
//        https://data.geodata.state.gov/guidance/DoS_Bulletin_04-Iraq-Saudi-Arabia-1992.pdf
//      - GeoNames gazetteer country dumps (public domain, derived from NGA GNS), used only to
//        look up the wells/capes the treaties name: https://download.geonames.org/export/dump/
//        (SA.zip, KW.zip, IQ.zip)
//    Every coordinate below is transcribed from one of those; none is estimated from a map
//    image or from general knowledge of where the zones were. The checks in
//    reportNeutralZoneChecks() re-derive independent facts the sources state separately
//    (segment lengths, which side of a named cape the line meets the coast on, and that the
//    1969 partition line really does bisect the reconstructed Saudi-Kuwaiti zone), and are
//    printed on every run so the reconstruction stays falsifiable.
import { readFile, writeFile } from "node:fs/promises";
import * as turf from "@turf/turf";
import * as shapefile from "shapefile";

const dms = (deg, min, sec = 0) => deg + min / 60 + sec / 3600;

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// --- NEUTRAL ZONES -------------------------------------------------------------------
//
// Saudi-Iraqi Neutral Zone (1922-1981). Uqair Protocol No. 1, Article 1, as quoted in
// IBS 111, makes it a straight-sided quadrilateral: the Najd/Saudi (southern) side runs
// from the Wadi al-Aujah/Al-Batin junction to the Al-Wuqubah wells and on to Bir Ansab;
// the Iraqi (northern) side runs from the same junction to Al-Amghar and back down to
// Bir Ansab. Three of the four vertices are stated as coordinates in the sources; the
// fourth (Al-Wuqubah) is only named, so it is taken from the gazetteer - see below.
const SAUDI_IRAQI_ZONE_VERTICES = [
  // Junction of Wadi al-Aujah with Al-Batin. 1975 Baghdad Agreed Minutes para. 1
  // (UNTS 1638 p. 86); IBS 111 p. 12 gives the same point to the nearest 0.5".
  [dms(46, 33, 18.9), dms(29, 6, 4.5)],
  // Al-Wuqubah (Al-Wukabbah) wells. The Baghdad Minutes fix the frontier point 44 m south
  // of the southernmost well but print no coordinates for it, so this is the well group
  // itself: GeoNames 108072 "Abar al Wuquba" (Al Waqbah / Al Uqba / "El Ukabba" in Uqair).
  [45.5302, 28.7749],
  // Bir Ansab. DoS Guidance Bulletin No. 4 turning point 3, annotated in that bulletin as
  // "Western vertex of former Neutral Zone". GeoNames "Makhfar Hudud Ansab" (the Ansab
  // frontier post) sits 0.8 km away, which is what confirms the two are the same place.
  [dms(44, 43.3), dms(29, 11.9)],
  // Al-Amghar. 1975 Baghdad Agreed Minutes para. 4 (UNTS 1638 p. 87), which places the
  // frontier point ~1,100 m north of the triangulation point on southern Jabal al-Amghar.
  [dms(45, 29, 58.14), dms(29, 27, 23.35)],
];

// Saudi-Kuwaiti Neutral Zone (1922-1969). Uqair's definition, as quoted in IBS 103 p. 4,
// is bounded north by "the indubitable southern frontier of Kuwait territory", west by
// Ash Shaq, east by the sea, and south by "a line passing from west to east from Ash Shaq
// to 'Ayn al 'Abd and thence to the coast north of Ras al Mish'ab". Kuwait's southern
// frontier there is the arc of the "red semi-circle" of the 1913 Anglo-Ottoman Convention
// - "a semi-circle, 40 miles in radius, with the town of Kuwait as its center" - running
// from boundary marker No. 2 to the coast south of Ras al Qali'ah.
const KUWAIT_TOWN = [47.97429, 29.367]; // GeoNames 285787, Kuwait City (the 1913 centre)
// Boundary marker No. 2, "now fixed as 29 00' 00" North latitude and 47 28' 05.683" East
// longitude ... where it joins latitude 29 and the semi circle formed by the radius from
// Kuwait, which formed the former boundary between Kuwait and the then Neutral Zone"
// (IBS 103 p. 4-5). This is the one point of the arc that is documented exactly.
const MARKER_2 = [dms(47, 28, 5.683), 29.0];
// Marker "H", the south end of the Wadi ash Shaq segment (IBS 103 p. 5). Footnote 8 of
// that study notes this segment was "formerly part of the Neutral Zone - Saudi Arabia
// boundary", i.e. it is the zone's western side.
const MARKER_H = [dms(47, 42, 25.153), dms(28, 31, 26.526)];
// 'Ayn al 'Abd, the one named point on the zone's southern side. GeoNames 108889.
const AYN_AL_ABD = [48.2715, 28.2344];
const RAS_AL_QULAYAH = [48.2917, 28.875]; // GeoNames 285242 (Ra's al Qulay'ah / Qali'ah)
const RAS_AL_MISHAB = [48.6344, 28.1922]; // GeoNames 102585 (Ra's al Mish'ab)
const SEAWARD_LON = 48.9; // east of any coastline here; trimmed off against Natural Earth

// The 1969 dividing line, Article 1 of the Supplementary Agreement of 18 December 1969 as
// printed in IBS 103 p. 6-7: 50 points, G on the coast through D-1..D-48 to H. Two rows
// are unusable in the scan - D-21's seconds of latitude are printed as "49.(?)", and
// D-43's are printed as "37.883" where the monotonic sequence around it requires ~31.9 -
// so those two points are omitted rather than guessed at. The remaining 48 are verbatim.
// This line is not part of any output shape; it is here because it is an independent test
// of the reconstruction above (see reportNeutralZoneChecks).
const PARTITION_LINE_1969 = `28 32 02.488 48 25 59.019 | 28 32 01.985 48 25 12.952
28 32 01.284 48 24 09.539 | 28 32 00.874 48 23 32.787 | 28 32 00.382 48 22 48.927
28 31 59.676 48 21 46.685 | 28 31 59.239 48 21 08.534 | 28 31 58.580 48 20 11.430
28 31 58.021 48 19 23.434 | 28 31 57.530 48 18 41.590 | 28 31 57.050 48 18 00.993
28 31 56.662 48 17 28.381 | 28 31 56.035 48 16 36.094 | 28 31 55.485 48 15 50.592
28 31 54.947 48 15 06.374 | 28 31 54.362 48 14 18.748 | 28 31 53.713 48 13 26.262
28 31 52.948 48 12 25.088 | 28 31 52.076 48 11 16.032 | 28 31 51.410 48 10 23.736
28 31 50.630 48 09 23.111 | 28 31 48.907 48 07 13.206 | 28 31 48.056 48 06 07.037
28 31 47.518 48 05 26.749 | 28 31 46.788 48 04 32.594 | 28 31 45.842 48 03 22.955
28 31 44.833 48 02 09.560 | 28 31 44.361 48 01 35.432 | 28 31 43.435 48 00 29.090
28 31 42.472 47 59 20.742 | 28 31 41.526 47 58 14.252 | 28 31 40.470 47 57 00.761
28 31 39.454 47 55 50.778 | 28 31 38.554 47 54 49.360 | 28 31 37.795 47 53 57.908
28 31 37.363 47 53 28.842 | 28 31 36.567 47 52 35.536 | 28 31 35.865 47 51 48.853
28 31 35.156 47 51 02.006 | 28 31 34.360 47 50 09.743 | 28 31 33.596 47 49 19.897
28 31 32.789 47 48 27.676 | 28 31 30.941 47 46 29.303 | 28 31 30.339 47 45 51.168
28 31 29.449 47 44 55.060 | 28 31 28.369 47 43 59.412 | 28 31 27.072 47 42 52.962
28 31 26.526 47 42 25.153`
  .split("|")
  .map((row) => {
    const n = row.trim().split(/\s+/).map(Number);
    return [dms(n[3], n[4], n[5]), dms(n[0], n[1], n[2])];
  });

function buildSaudiKuwaitiNeutralZone(land) {
  // The arc: centred on Kuwait town, with the radius taken as the exact distance from
  // there to marker No. 2, so that the one documented point of the arc lies on it by
  // construction. That radius comes out at 39.7 statute miles against the 1913
  // Convention's nominal 40, which is the first of the checks reported below.
  const centre = turf.point(KUWAIT_TOWN);
  const radiusKm = turf.distance(centre, turf.point(MARKER_2));
  const startBearing = turf.bearing(centre, turf.point(MARKER_2));
  const arc = [];
  for (let sweep = 0; sweep <= 100; sweep += 0.2) {
    arc.push(turf.destination(centre, radiusKm, startBearing - sweep, { units: "kilometers" }).geometry.coordinates);
  }

  // The southern side runs west-to-east through 'Ayn al 'Abd, so its western end is where
  // that line meets Ash Shaq - i.e. the marker 2 -> H line produced south to 'Ayn al
  // 'Abd's latitude. (GeoNames puts Wadi ash Shaqq at 28.2169N 47.9178E, ~7 km east of
  // the resulting corner and at effectively the same latitude, which is the corroboration
  // that this really is where the zone's western and southern sides meet.)
  const t = (MARKER_2[1] - AYN_AL_ABD[1]) / (MARKER_2[1] - MARKER_H[1]);
  const ashShaqCorner = [MARKER_2[0] + t * (MARKER_H[0] - MARKER_2[0]), AYN_AL_ABD[1]];

  // Close the ring well out to sea on the east, then trim to the real coast by
  // intersecting with Natural Earth's Kuwait and Saudi Arabia land polygons.
  const arcEnd = arc[arc.length - 1];
  const draft = turf.polygon([[
    MARKER_2,
    ...arc,
    [SEAWARD_LON, arcEnd[1]],
    [SEAWARD_LON, AYN_AL_ABD[1]],
    AYN_AL_ABD,
    ashShaqCorner,
    MARKER_H,
    MARKER_2,
  ]]);
  return { zone: turf.intersect(turf.featureCollection([draft, land])), arc, radiusKm };
}

function reportNeutralZoneChecks({ saudiIraqi, saudiKuwaiti, arc, radiusKm, land }) {
  const km2 = (f) => turf.area(f) / 1e6;
  const len = (a, b) => turf.distance(turf.point(a), turf.point(b));
  const [batin, wuqubah, ansab, amghar] = SAUDI_IRAQI_ZONE_VERTICES;
  console.log("\nNeutral zone cross-checks (each re-derives something a source states separately):");

  // Saudi-Iraqi: IBS 111 p. 2 gives the two sides' lengths independently of the vertices.
  const north = len(batin, amghar) + len(amghar, ansab);
  const south = len(batin, wuqubah) + len(wuqubah, ansab);
  console.log(`  SA-IQ north side ${north.toFixed(0)} km vs IBS 111 "about 119 miles" (${(119 * 1.609344).toFixed(0)} km)`);
  console.log(`  SA-IQ south side ${south.toFixed(0)} km vs IBS 111 "about 125 miles" (${(125 * 1.609344).toFixed(0)} km)`);
  console.log(`  SA-IQ area ${km2(saudiIraqi).toFixed(0)} km2 vs the 7,044 km2 usually quoted`);
  // The 1981 line's turning point 2 is stated to lie on the Batin-junction -> Al-Wuqubah
  // line, so its distance off that line tests the gazetteer's Al-Wuqubah position.
  const turningPoint2 = turf.point([dms(46, 25.6), dms(29, 3.7)]);
  const offLine = turf.pointToLineDistance(turningPoint2, turf.lineString([batin, wuqubah]), { units: "meters" });
  console.log(`  1981 turning point 2 lies ${offLine.toFixed(0)} m off the Batin-Al-Wuqubah line (treaty: on it)`);

  // Saudi-Kuwaiti: the 1913 radius, where the arc meets the coast, and the 1969 bisection.
  console.log(`  SA-KW arc radius ${(radiusKm / 1.609344).toFixed(2)} statute miles vs the 1913 Convention's 40`);
  const landfall = arc.find((p) => !turf.booleanPointInPolygon(turf.point(p), land));
  console.log(
    `  SA-KW arc meets the coast ${(len(landfall, RAS_AL_QULAYAH)).toFixed(1)} km ` +
      `${landfall[1] < RAS_AL_QULAYAH[1] ? "south" : "NORTH"} of Ras al Qulay'ah (Uqair: south of it)`
  );
  const southHalf = turf.intersect(turf.featureCollection([saudiKuwaiti, turf.polygon([[
    ...PARTITION_LINE_1969,
    [SEAWARD_LON, PARTITION_LINE_1969[0][1]],
    [SEAWARD_LON, 27.5],
    [47, 27.5],
    [47, PARTITION_LINE_1969[PARTITION_LINE_1969.length - 1][1]],
    PARTITION_LINE_1969[0],
  ]])]));
  const total = km2(saudiKuwaiti);
  const s = km2(southHalf);
  console.log(
    `  SA-KW 1969 line splits the reconstruction ${s.toFixed(0)} / ${(total - s).toFixed(0)} km2 ` +
      `(the 1965 Partition Agreement required equal halves)`
  );
  console.log(`  SA-KW area ${total.toFixed(0)} km2 onshore vs the ~5,700-5,770 km2 usually quoted\n`);
}

async function main() {
  const cshapes = JSON.parse(await readFile(new URL("../data/raw/cshapes-2.0.geojson", import.meta.url), "utf-8"));
  const ne10 = JSON.parse(await readFile(new URL("../data/raw/ne10-countries.geojson", import.meta.url), "utf-8"));
  const ne10admin1 = JSON.parse(await readFile(new URL("../data/raw/ne10-admin1.geojson", import.meta.url), "utf-8"));

  // Turkey's current CShapes geometry (single 1923-9999 record) already includes Hatay,
  // correctly, for the post-1939 period - we only need to subtract Hatay to get the
  // pre-1939 shape.
  const turkeyFeature = cshapes.features.find(
    (f) => f.properties.cntry_name === "Turkey (Ottoman Empire)" && f.properties.gwsyear === 1923
  );
  const hatayFeature = ne10admin1.features.find((f) => f.properties.admin === "Turkey" && f.properties.name === "Hatay");
  const turkeyMinusHatay = turf.difference(
    turf.featureCollection([turf.feature(turkeyFeature.geometry), turf.feature(hatayFeature.geometry)])
  );

  // Natural Earth's "Palestine" feature is a MultiPolygon combining the West Bank and
  // Gaza Strip as two disconnected parts - split by testing which part contains a known
  // point in each.
  const palestineFeature = ne10.features.find((f) => f.properties.NAME === "Palestine");
  const gazaCity = [34.4667, 31.5];
  const gazaPart = palestineFeature.geometry.coordinates.find((poly) => pointInRing(gazaCity, poly[0]));
  const westBankPart = palestineFeature.geometry.coordinates.find((poly) => poly !== gazaPart);

  // --- Oslo II Areas A/B/C in the West Bank (OCHA oPt / PA Ministry of Planning) ---
  //
  // The shapefile has 8 features with a CLASS attribute: A (twice), C, "Nature Reserve",
  // "Israeli Declared East Jerusalem", "No Man's Land", H1 and H2. There is no feature
  // labelled B - one of the two CLASS="A" features is in fact Area B, and OCHA's own
  // metadata says the dataset is "categorized into A,B,C", so this looks like a labelling
  // error introduced when the layer was unioned with the Hebron H1/H2 layer (the .shp.xml
  // metadata records exactly such a Union step).
  //
  // Rather than hard-code an OBJECTID, we identify Area A the way the Oslo II Accord
  // defines it - the major Palestinian city centres - and take the other CLASS="A"
  // feature as Area B. Two independent checks confirm the result below: the shapes,
  // (Area A is 15-16 large blocks around the cities, Area B is ~210 small village
  // enclaves), and the resulting area percentages, which match the published figures.
  const oslo = await shapefile.read(
    new URL("../data/raw/oslo-agreement/OsloAgreement.shp", import.meta.url).pathname.slice(1),
    new URL("../data/raw/oslo-agreement/OsloAgreement.dbf", import.meta.url).pathname.slice(1)
  );
  const osloByClass = (cls) => oslo.features.filter((f) => f.properties.CLASS === cls);
  const osloOne = (cls) => {
    const hits = osloByClass(cls);
    if (hits.length !== 1) throw new Error(`expected exactly one OsloAgreement feature of class ${cls}, got ${hits.length}`);
    return hits[0];
  };

  // City centres that Oslo II placed in Area A (Hebron is excluded - the 1997 Hebron
  // Protocol split it into H1/H2, which are their own features in this dataset).
  const AREA_A_CITY_CENTRES = [
    [35.2544, 32.2211], // Nablus
    [35.2042, 31.9038], // Ramallah
    [35.2969, 32.4597], // Jenin
    [35.4444, 31.8569], // Jericho
    [35.0286, 32.3097], // Tulkarm
    [35.2025, 31.7054], // Bethlehem
    [34.9706, 32.1897], // Qalqilya
  ];
  const ambiguousA = osloByClass("A");
  if (ambiguousA.length !== 2) throw new Error(`expected two CLASS="A" features, got ${ambiguousA.length}`);
  const areaAFeature = ambiguousA.find((f) =>
    AREA_A_CITY_CENTRES.every((pt) => turf.booleanPointInPolygon(turf.point(pt), f))
  );
  if (!areaAFeature) throw new Error("no CLASS=\"A\" feature contains all seven Area A city centres");
  const areaBFeature = ambiguousA.find((f) => f !== areaAFeature);

  const unionAll = (feats) =>
    feats.reduce((acc, f) => (acc ? turf.union(turf.featureCollection([acc, f])) : f), null);

  // Groupings, and why each one:
  //   A: Area A + Hebron H1, the part of Hebron under Palestinian control since the 1997
  //      Hebron Protocol - functionally the same control regime as Area A.
  //   B: Area B + the Oslo Nature Reserves, which OCHA keeps as a separate class but which
  //      Oslo II placed under the Area B regime (Palestinian civil control) with building
  //      restricted. Counting them with B is what reproduces the published "~21-22%".
  //   C: Area C + Hebron H2 (Israeli-controlled Hebron) + the two categories that sit
  //      outside the Oslo A/B/C classification altogether but are likewise under Israeli
  //      control - Israeli-declared East Jerusalem (~69 km2) and the 1949-1967 no-man's-
  //      land (~50 km2). Folding those two into C is OUR simplification, made so the three
  //      output shapes tile the West Bank with no holes; it is called out in the note on
  //      the Area C correction entry.
  const osloGroups = {
    westBankAreaA: [areaAFeature, osloOne("H1")],
    westBankAreaB: [areaBFeature, osloOne("Nature Reserve")],
    westBankAreaC: [osloOne("C"), osloOne("H2"), osloOne("Israeli Declared East Jerusalem"), osloOne("No Man's Land")],
  };

  const osloGeometry = {};
  let osloTotalKm2 = 0;
  const osloAreasKm2 = {};
  for (const [key, feats] of Object.entries(osloGroups)) {
    const merged = unionAll(feats);
    osloAreasKm2[key] = turf.area(merged) / 1e6;
    osloTotalKm2 += osloAreasKm2[key];
    // ~0.001 degrees is ~100m, far below anything visible at this map's zoom levels.
    // Keeps the three shapes to ~290KB combined while holding every area to within 0.5%
    // of the unsimplified source (checked below).
    const simplified = turf.simplify(merged, { tolerance: 0.001, highQuality: true, mutate: false });
    osloGeometry[key] = turf.truncate(simplified, { precision: 5, coordinates: 2 }).geometry;
  }

  console.log("Oslo II area shares (computed from the unsimplified OCHA geometry):");
  for (const [key, km2] of Object.entries(osloAreasKm2)) {
    const simplifiedKm2 = turf.area(turf.feature(osloGeometry[key])) / 1e6;
    console.log(
      `  ${key}: ${km2.toFixed(1)} km2 = ${((km2 / osloTotalKm2) * 100).toFixed(1)}% of the West Bank ` +
        `(${simplifiedKm2.toFixed(1)} km2 after simplification)`
    );
  }
  console.log(`  total: ${osloTotalKm2.toFixed(1)} km2`);

  // The two Uqair Protocol neutral zones, digitized from their delimitation documents.
  const land = turf.union(turf.featureCollection(
    ["Kuwait", "Saudi Arabia"].map((name) =>
      turf.feature(ne10.features.find((f) => f.properties.NAME === name).geometry)
    )
  ));
  const saudiIraqiNeutralZone = turf.polygon([[...SAUDI_IRAQI_ZONE_VERTICES, SAUDI_IRAQI_ZONE_VERTICES[0]]]);
  const { zone: saudiKuwaitiNeutralZone, arc, radiusKm } = buildSaudiKuwaitiNeutralZone(land);

  // --- Golan Heights: the part of Israel's post-1967 CShapes shape that is not Israel's
  // 1949 shape, the West Bank or Gaza. Computed entirely from CShapes 2.0, so it lines up
  // with the Israel and Syria polygons it sits between. CShapes does not cut out the 1974
  // UN (UNDOF) buffer zone, so the eastern edge is approximate.
  const cshapesRecord = (name, startYear) => {
    const hits = cshapes.features.filter(
      (f) => f.properties.cntry_name === name && (startYear === undefined || f.properties.gwsyear === startYear)
    );
    if (hits.length !== 1) throw new Error(`expected one CShapes record ${name} ${startYear ?? ""}, got ${hits.length}`);
    return turf.feature(hits[0].geometry);
  };
  let golanDiff = cshapesRecord("Israel", 1979);
  for (const minus of [cshapesRecord("Israel", 1948), cshapesRecord("West Bank"), cshapesRecord("Gaza")]) {
    golanDiff = turf.difference(turf.featureCollection([golanDiff, minus]));
  }
  const golanParts = turf.getGeom(golanDiff).type === "Polygon"
    ? [turf.getGeom(golanDiff).coordinates]
    : turf.getGeom(golanDiff).coordinates;
  const KATZRIN = [35.69, 32.99];
  const golanRings = golanParts.find((rings) => turf.booleanPointInPolygon(turf.point(KATZRIN), turf.polygon(rings)));
  if (!golanRings) throw new Error("Golan: no part of the CShapes difference contains Katzrin");
  const golan = turf.polygon(golanRings);
  console.log(`Golan Heights (CShapes difference): ${(turf.area(golan) / 1e6).toFixed(0)} km2`);

  // --- Abu Musa and Greater Tunb (held by Iran since 30 November 1971, claimed by the
  // UAE). Natural Earth 10m "minor islands" (public domain), picked by the point on each
  // island. Lesser Tunb (~2 km2) is not in any Natural Earth layer, so it is not drawn.
  //      curl -sL https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_minor_islands.geojson -o data/raw/ne10-minor-islands.geojson
  const minorIslands = JSON.parse(await readFile(new URL("../data/raw/ne10-minor-islands.geojson", import.meta.url), "utf-8"));
  const islandPolygon = (label, point) => {
    for (const f of minorIslands.features) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      const hit = polys.find((rings) => turf.booleanPointInPolygon(turf.point(point), turf.polygon(rings)));
      if (hit) return hit;
    }
    throw new Error(`no Natural Earth minor island contains ${label}`);
  };
  const gulfIslands = turf.multiPolygon([
    islandPolygon("Abu Musa", [55.03, 25.875]),
    islandPolygon("Greater Tunb", [55.3, 26.26]),
  ]);
  console.log(`Abu Musa + Greater Tunb (Natural Earth): ${(turf.area(gulfIslands) / 1e6).toFixed(1)} km2`);

  const out = {
    turkeyPre1939: turkeyMinusHatay.geometry,
    hatay: hatayFeature.geometry,
    westBank: { type: "Polygon", coordinates: westBankPart },
    gaza: { type: "Polygon", coordinates: gazaPart },
    ...osloGeometry,
    saudiIraqiNeutralZone: saudiIraqiNeutralZone.geometry,
    saudiKuwaitiNeutralZone: saudiKuwaitiNeutralZone.geometry,
    golan: turf.truncate(golan, { precision: 5, coordinates: 2 }).geometry,
    gulfIslands: turf.truncate(gulfIslands, { precision: 5, coordinates: 2 }).geometry,
  };

  await writeFile(new URL("../data/corrections-geometry.json", import.meta.url), JSON.stringify(out));
  console.log("Wrote data/corrections-geometry.json:", Object.keys(out));
  reportNeutralZoneChecks({
    saudiIraqi: saudiIraqiNeutralZone,
    saudiKuwaiti: saudiKuwaitiNeutralZone,
    arc,
    radiusKm,
    land,
  });
}

main();
