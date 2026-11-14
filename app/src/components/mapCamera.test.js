import test from "node:test";
import assert from "node:assert/strict";
import { USER_MOVE, isUserMove, reportUserCamera } from "./mapCamera.js";

// A map that fires moveend with the event data a MapLibre move carries: a
// user's drag/wheel/key has `originalEvent`, a method called with event data
// (map.zoomIn(opts, USER_MOVE)) has that data's fields, flyTo/fitBounds
// called by the app itself have neither.
function fakeMap() {
  const handlers = {};
  let center = { lng: 40, lat: 30 };
  let zoom = 3;
  const map = {
    on: (type, fn) => (handlers[type] ??= new Set()).add(fn),
    off: (type, fn) => handlers[type]?.delete(fn),
    getCenter: () => center,
    getZoom: () => zoom,
    // Moves the camera, firing movestart and moveend with `eventData`, as MapLibre does.
    move(to, eventData = {}, startData = eventData) {
      for (const fn of handlers.movestart ?? []) fn({ type: "movestart", target: map, ...startData });
      center = to.center ?? center;
      zoom = to.zoom ?? zoom;
      for (const fn of handlers.moveend ?? []) fn({ type: "moveend", target: map, ...eventData });
    },
    fire: (type, e = {}) => {
      for (const fn of handlers[type] ?? []) fn({ type, target: map, ...e });
    },
    listeners: (type) => handlers[type]?.size ?? 0,
  };
  return map;
}

test("isUserMove: a browser event or USER_MOVE, nothing else", () => {
  assert.equal(isUserMove({ originalEvent: { type: "mouseup" } }), true);
  assert.equal(isUserMove({ type: "moveend", ...USER_MOVE }), true);
  assert.equal(isUserMove({ type: "moveend" }), false);
  assert.equal(isUserMove(undefined), false);
});

test("reportUserCamera: the app's own moves (an event flown to) are not reported", (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  const map = fakeMap();
  const got = [];
  reportUserCamera(map, (c) => got.push(c), 200);
  map.move({ center: { lng: 32, lat: 30 }, zoom: 5 }); // flyTo to an event
  ctx.mock.timers.tick(1000);
  assert.deepEqual(got, []);
});

test("reportUserCamera: a drag, wheel or key (originalEvent) is reported once it settles", (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  const map = fakeMap();
  const got = [];
  reportUserCamera(map, (c) => got.push(c), 200);
  map.move({ center: { lng: 35, lat: 31 } }, { originalEvent: { type: "keydown" } });
  ctx.mock.timers.tick(100);
  map.move({ center: { lng: 36, lat: 31 } }, { originalEvent: { type: "keydown" } }); // a key held down
  ctx.mock.timers.tick(199);
  assert.deepEqual(got, [], "not before the moves pause");
  ctx.mock.timers.tick(1);
  assert.deepEqual(got, [{ lon: 36, lat: 31, zoom: 3 }]);
});

test("reportUserCamera: the zoom/pan/reset keys and a cluster click (USER_MOVE) are user moves", (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  const map = fakeMap();
  const got = [];
  reportUserCamera(map, (c) => got.push(c), 200);
  map.move({ zoom: 4 }, USER_MOVE);
  ctx.mock.timers.tick(200);
  assert.deepEqual(got, [{ lon: 40, lat: 30, zoom: 4 }]);
});

test("reportUserCamera: a single wheel notch is a user's move, though MapLibre gives its move no originalEvent", (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  const map = fakeMap();
  const got = [];
  let t = 0;
  reportUserCamera(map, (c) => got.push(c), 200, () => t);
  map.fire("wheel", { originalEvent: { type: "wheel" } });
  t += 40; // MapLibre's scroll handler starts the zoom ~40 ms later
  map.move({ zoom: 3.4 }); // movestart and moveend without originalEvent
  ctx.mock.timers.tick(200);
  assert.deepEqual(got, [{ lon: 40, lat: 30, zoom: 3.4 }]);
  // A wheel that moved nothing (at the zoom limit) does not make a later flight the user's.
  map.fire("wheel", { originalEvent: { type: "wheel" } });
  t += 5000;
  map.move({ center: { lng: 32, lat: 30 }, zoom: 5 }); // flyTo to an event
  ctx.mock.timers.tick(1000);
  assert.equal(got.length, 1);
});

test("reportUserCamera: the cleanup removes the listener and drops a report still waiting", (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  const map = fakeMap();
  const got = [];
  const stop = reportUserCamera(map, (c) => got.push(c), 200);
  map.move({ zoom: 4 }, USER_MOVE);
  stop();
  ctx.mock.timers.tick(1000);
  assert.deepEqual(got, []);
  assert.equal(map.listeners("moveend") + map.listeners("movestart") + map.listeners("wheel"), 0);
});
