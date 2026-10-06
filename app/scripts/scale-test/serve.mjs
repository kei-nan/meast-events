// Serves a built dist/ with brotli, as Cloudflare does, so the benchmark's
// transfer sizes and timings are realistic (vite preview does not compress).
//   node app/scripts/scale-test/serve.mjs app/dist 5101
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";

const [root, port] = [path.resolve(process.argv[2] ?? "dist"), Number(process.argv[3] ?? 5101)];
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm",
  ".woff2": "font/woff2", ".png": "image/png", ".pbf": "application/x-protobuf",
};
const compressed = new Map();

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    let file = path.join(root, rel);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file += ".html";
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    const ext = path.extname(file);
    const type = TYPES[ext] ?? "application/octet-stream";
    const headers = { "Content-Type": type, "Cache-Control": "no-store" };
    const compressible = /text|json|javascript|svg/.test(type) || ext === ".pagefind" || ext === ".pf_meta";
    if (compressible && /\bbr\b/.test(req.headers["accept-encoding"] ?? "")) {
      if (!compressed.has(file)) {
        compressed.set(file, zlib.brotliCompressSync(fs.readFileSync(file), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }));
      }
      res.writeHead(200, { ...headers, "Content-Encoding": "br" });
      return res.end(compressed.get(file));
    }
    res.writeHead(200, headers);
    res.end(fs.readFileSync(file));
  })
  .listen(port, () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
