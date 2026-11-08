import test from "node:test";
import assert from "node:assert/strict";
import { elements, registerRenderHooks, settle, view } from "../lib/testing/render.mjs";

// ShareButton rendered with react-dom/server (lib/testing/render.mjs), with a
// stand-in document (its listeners kept, so Escape can be pressed) and navigator.
registerRenderHooks();
const { default: ShareButton } = await import("./ShareButton.jsx");

let docListeners;
function setup({ share = false, clipboard = null } = {}) {
  docListeners = {};
  globalThis.document = {
    activeElement: null,
    addEventListener: (type, fn) => (docListeners[type] = fn),
    removeEventListener: (type, fn) => docListeners[type] === fn && delete docListeners[type],
  };
  globalThis.window = { location: { href: "https://middleeast.events/?from=1948&to=1949" }, prompt: () => {} };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "test", ...(share && { share: async () => {} }), ...(clipboard && { clipboard }) },
  });
}

const buttons = (html) => elements(html, "button").map((b) => b.text);
const press = (v, label) => {
  const [b] = v.find((e) => e.type === "button" && [e.props.children].flat().includes(label));
  assert.ok(b, `a ${JSON.stringify(label)} button`);
  b.props.onClick({ currentTarget: {} });
};
const toggle = (v) => v.find((e) => e.type === "button" && e.props["aria-controls"])[0].props.onClick();

test("ShareButton: closed, a Share button that says it controls a collapsed panel", () => {
  setup();
  const v = view(ShareButton, { title: "Suez Crisis" });
  const [btn] = elements(v.html, "button");
  assert.equal(btn.text, "Share");
  assert.equal(btn.attrs["aria-expanded"], "false");
  assert.ok(btn.attrs["aria-controls"]);
  assert.match(btn.html, /<svg[^>]*aria-hidden="true"/, "the icon is hidden from screen readers");
  assert.doesNotMatch(v.html, /share-panel/);
});

test("ShareButton: opened, the panel it controls offers Copy link and QR code; Share via… and Cite only when available", () => {
  setup();
  const v = view(ShareButton, { title: "Suez Crisis" });
  toggle(v);
  v.rerender();
  const [btn] = elements(v.html, "button");
  assert.equal(btn.attrs["aria-expanded"], "true");
  const panel = elements(v.html, "div").find((d) => d.attrs.class === "share-panel");
  assert.equal(panel.attrs.id, btn.attrs["aria-controls"]);
  assert.equal(panel.attrs.role, "group");
  assert.equal(panel.attrs["aria-label"], "Share this view");
  assert.deepEqual(buttons(v.html), ["Share", "Copy link", "QR code"]);

  setup({ share: true });
  const withCite = view(ShareButton, { title: "Suez Crisis", cite: { id: "Q1" } });
  toggle(withCite);
  withCite.rerender();
  assert.deepEqual(buttons(withCite.html), ["Share", "Share via…", "Copy link", "QR code", "Cite"]);
  const cite = elements(withCite.html, "button").find((b) => b.text === "Cite");
  assert.equal(cite.attrs["aria-haspopup"], "dialog");
});

test("ShareButton: Escape closes the panel; pressing Share again also closes it", () => {
  setup();
  const v = view(ShareButton, { title: "Suez Crisis" });
  toggle(v);
  v.rerender();
  assert.ok(docListeners.keydown, "listens for Escape while open");
  let prevented = false;
  docListeners.keydown({ key: "Escape", preventDefault: () => (prevented = true), stopPropagation() {} });
  v.rerender();
  assert.ok(prevented, "Escape is marked handled, so other Escape handlers skip it");
  assert.equal(elements(v.html, "button")[0].attrs["aria-expanded"], "false");
  assert.doesNotMatch(v.html, /share-panel/);
  assert.equal(docListeners.keydown, undefined, "stops listening once closed");

  toggle(v);
  v.rerender();
  toggle(v);
  v.rerender();
  assert.doesNotMatch(v.html, /share-panel/);
});

test("ShareButton: Copy link copies the page's address, says so, and goes back to Copy link after 2.5 s", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const copied = [];
  setup({ clipboard: { writeText: async (s) => copied.push(s) } });
  const v = view(ShareButton, { title: "Suez Crisis" });
  toggle(v);
  v.rerender();
  press(v, "Copy link");
  await settle();
  v.rerender();
  assert.deepEqual(copied, ["https://middleeast.events/?from=1948&to=1949"]);
  assert.ok(buttons(v.html).includes("Link copied"));
  assert.match(v.html, /role="status">Link copied</);
  t.mock.timers.tick(2500);
  v.rerender();
  assert.ok(buttons(v.html).includes("Copy link"));
  assert.match(v.html, /role="status"><\/span>/);
});

test("ShareButton: QR code says it is being made, then shows a labelled code with Download PNG in its place", async () => {
  setup();
  const v = view(ShareButton, { title: "Suez Crisis" });
  toggle(v);
  v.rerender();
  press(v, "QR code");
  v.rerender();
  const making = elements(v.html, "button").find((b) => b.text === "QR code");
  assert.equal(making.attrs["aria-disabled"], "true", "kept while the code is made, so focus stays on it");
  assert.match(v.html, /role="status">Making the QR code…</);
  for (let i = 0; i < 5 && /aria-disabled/.test(v.html); i++) {
    await settle();
    v.rerender();
  }
  assert.ok(!buttons(v.html).includes("QR code"), "the finished code replaces the button");
  assert.ok(buttons(v.html).includes("Download PNG"));
  const svg = elements(v.html, "svg").find((s) => s.attrs.role === "img");
  assert.equal(svg.attrs["aria-label"], "QR code for the link to this view");
  assert.match(svg.html, /<path d="M\d/);
  assert.match(v.html, /role="status">QR code shown, with a Download PNG button.</);
});
