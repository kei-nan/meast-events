// Tests scale-test/serve.mjs (the benchmark's local server). Lives here, not in
// scale-test/, so the app's `npm test` glob (scripts/*.test.mjs) runs it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createServer, isInside } from "./scale-test/serve.mjs";

test("isInside accepts the folder and its files, rejects siblings and parents", () => {
  const root = path.resolve("/srv/dist");
  assert.ok(isInside(root, root));
  assert.ok(isInside(root, path.join(root, "index.html")));
  assert.ok(isInside(root, path.join(root, "..foo", "x"))); // a name starting with "..", still inside
  assert.ok(!isInside(root, path.resolve("/srv/dist-old/x"))); // the old startsWith check let this through
  assert.ok(!isInside(root, path.resolve("/srv")));
  assert.ok(!isInside(root, path.resolve("/etc/passwd")));
});

function get(port, rawPath) {
  return new Promise((resolve, reject) => {
    // http.request sends the path as given (no URL normalisation), like a hostile client.
    http.get({ host: "127.0.0.1", port, path: rawPath }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject);
  });
}

test("the server refuses an encoded ../ into a sibling folder and listens on 127.0.0.1", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "serve-test-"));
  const dist = path.join(tmp, "dist");
  fs.mkdirSync(dist);
  fs.mkdirSync(path.join(tmp, "dist-old"));
  fs.writeFileSync(path.join(dist, "index.html"), "INDEX");
  fs.writeFileSync(path.join(dist, "a.json"), "{}");
  fs.writeFileSync(path.join(tmp, "dist-old", "secret.txt"), "SECRET");
  const server = createServer(dist);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const { address, port } = server.address();
    assert.equal(address, "127.0.0.1");
    assert.equal((await get(port, "/a.json")).body, "{}");
    assert.equal((await get(port, "/missing")).body, "INDEX");
    for (const p of ["/..%2fdist-old/secret.txt", "/..%5cdist-old%5csecret.txt", "/%2e%2e%2fdist-old%2fsecret.txt"]) {
      const r = await get(port, p);
      assert.notEqual(r.body, "SECRET", p);
    }
    assert.equal((await get(port, "/..%2fdist-old/secret.txt")).status, 403);
    assert.equal((await get(port, "/%E0%A4%A")).status, 400);
  } finally {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
