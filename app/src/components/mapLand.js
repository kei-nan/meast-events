// The map's land after its opening view (MapView's load handler): the land beyond that view,
// and the Middle East's 1:10m coast cell by cell. Plain MapLibre code, no React.
import { loadFarLand, loadLandCell } from "../lib/dataClient";
import { cellsInBounds, wantsBackgroundDetail } from "../lib/landStore";

// Below this zoom the light land is detailed enough; past it the cells in view load.
const DETAIL_FETCH_ZOOM = 5;

/**
 * Starts loading the land that the opening view did not need, once that view has drawn.
 *
 * @param {import("maplibre-gl").Map} map
 * @param {object} o
 * @param {{current: {near: object|null, far: object|null}}} o.landRef  the light land files (near: land.json)
 * @param {object} o.store             lib/landStore.js createLandStore(): what the "land" source holds
 * @param {() => boolean} o.isCancelled  true once MapView has unmounted
 * @returns {() => void} call when land.json arrives late (after a failure, via Retry)
 */
export function startLandLoading(map, { landRef, store, isCancelled }) {
  // Land beyond the opening view loads once that view has drawn, so it never
  // competes with it; a failed load is retried on the next pan or zoom.
  const addFarLand = () => {
    loadFarLand()
      .then((far) => {
        if (isCancelled() || landRef.current.far) return;
        landRef.current.far = far;
        map.off("moveend", addFarLand);
        const { add } = store.addLow(far);
        map.getSource("land")?.updateData({ add });
      })
      .catch(() => {});
  };
  map.once("idle", () => {
    if (isCancelled()) return;
    addFarLand();
    map.on("moveend", addFarLand);
    startLandDetail();
  });

  // The Middle East's Natural Earth 1:10m coast, one cell at a time (lib/landStore.js,
  // scripts/build-land.js): first the cells in and around the view once zoomed in past
  // DETAIL_FETCH_ZOOM, then - unless the visitor asked to save data, the link looks
  // slow, or a browser without the link's estimate has a touch screen
  // (wantsBackgroundDetail) - all the others in the background, nearest first, so
  // a zoom-in finds its coast already drawn. Only the cells land.json lists have a
  // file: an unlisted cell's light piece is already its exact 1:10m land, and stays.
  const requested = new Set();
  const manifest = () => landRef.current.near ?? { cells: [], cellSize: 5 };
  // Fetch cells and swap them in together, in one update of the source.
  const loadCells = (cells) => {
    const todo = cells.filter((c) => !requested.has(c));
    if (!todo.length) return Promise.resolve();
    for (const c of todo) requested.add(c);
    const fetches = todo.map((c) =>
      loadLandCell(c).then(
        (fc) => [c, fc],
        () => (requested.delete(c), null) // retried on a later pan or zoom
      )
    );
    return Promise.all(fetches).then(async (got) => {
      if (isCancelled()) return;
      const add = [];
      const remove = [];
      for (const [c, fc] of got.filter(Boolean)) {
        const d = store.addDetail(c, fc);
        add.push(...d.add);
        remove.push(...d.remove);
      }
      if (add.length || remove.length) await map.getSource("land")?.updateData({ add, remove });
    });
  };
  const onView = () => {
    if (map.getZoom() < DETAIL_FETCH_ZOOM) return;
    const { cells, cellSize } = manifest();
    const b = map.getBounds();
    const mx = (b.getEast() - b.getWest()) * 0.25;
    const my = (b.getNorth() - b.getSouth()) * 0.25;
    loadCells(cellsInBounds(cells, cellSize, [b.getWest() - mx, b.getSouth() - my, b.getEast() + mx, b.getNorth() + my]));
  };
  const backgroundFill = async () => {
    const { cells, cellSize } = manifest();
    const c = map.getCenter();
    const dist = (id) => {
      const [x, y] = id.split("_").map(Number);
      return Math.hypot(x + cellSize / 2 - c.lng, y + cellSize / 2 - c.lat);
    };
    const order = [...cells].sort((a, b) => dist(a) - dist(b));
    // A few cells per batch, each when the browser is idle, so no update of the source is large.
    for (let i = 0; i < order.length && !isCancelled(); i += 8) {
      await new Promise((r) => (window.requestIdleCallback ?? setTimeout)(r));
      await loadCells(order.slice(i, i + 8));
    }
  };
  // The cell list comes with land.json: until it is in (it may first fail
  // and arrive through Retry) there is nothing to fill, so the background
  // fill starts once both the map is idle and the list is known.
  let detailStarted = false;
  let fillStarted = false;
  const startFill = () => {
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
    if (fillStarted || !landRef.current.near || !wantsBackgroundDetail(navigator.connection, finePointer)) return;
    fillStarted = true;
    backgroundFill();
  };
  const startLandDetail = () => {
    detailStarted = true;
    map.on("moveend", onView);
    onView();
    startFill();
  };
  return () => {
    if (isCancelled() || !detailStarted) return;
    onView();
    startFill();
  };
}
