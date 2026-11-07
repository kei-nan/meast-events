import test from "node:test";
import assert from "node:assert/strict";
import { panelLiveText } from "./panelLive.js";

test("the panel announces its status line, after 'Paused at' when Play paused", () => {
  assert.equal(panelLiveText({ playing: false, status: "815 events in 1900–2026" }), "815 events in 1900–2026");
  assert.equal(panelLiveText({ playing: false, pausedAtYear: 1967, status: "40 events in 1960–1967" }), "Paused at 1967. 40 events in 1960–1967");
  assert.equal(panelLiveText({ playing: true, status: "40 events in 1960–1967" }), "");
});

test("events that failed to load are announced once, by the header's notice, not again by the panel", () => {
  assert.equal(panelLiveText({ playing: false, eventsError: true, status: "Events could not be loaded - retrying" }), "");
});
