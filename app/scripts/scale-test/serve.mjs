// Serves a built dist/ with brotli and the single-page not-found handling, as
// Cloudflare does, so the benchmark's transfer sizes and timings are realistic
// (vite preview does not compress) and missing files behave as in production.
// Listens on 127.0.0.1 only. Port 0 picks a free port (the log line says which).
//   node app/scripts/scale-test/serve.mjs app/dist 5101
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const HOST = "127.0.0.1";
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm",
  ".woff2": "font/woff2", ".png": "image/png", ".pbf": "application/x-protobuf",
};

/** True when `file` is `dir` itself or inside it (a sibling such as dist-old/ is not). */
export function isInside(dir, file) {
  const rel = path.relative(dir, file);
  return rel === "" || (!path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`));
}

export function createServer(root) {
  const compressed = new Map();
  return http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      return res.writeHead(400).end(); // malformed %-escape
    }
    if (rel.endsWith("/")) rel += "index.html";
    let file = path.join(root, rel);
    // The URL parser resolves "/../" but not an encoded "/..%2f", which decodes to "../".
    if (!isInside(root, file)) return res.writeHead(403).end();
    if (!fs.existsSync(file) && fs.existsSync(`${file}.html`)) file += ".html";
    // Like the host (html_handling "auto-trailing-slash", the default): a folder
    // asked for without its slash is redirected to it (/event -> /event/).
    if (fs.existsSync(file) && fs.statSync(file).isDirectory() && fs.existsSync(path.join(file, "index.html"))) {
      const { search } = new URL(req.url, "http://localhost");
      return res.writeHead(307, { Location: `${encodeURI(rel)}/${search}` }).end();
    }
    // Like the host (wrangler.jsonc not_found_handling "404-page"): a missing path
    // gets 404.html with status 404 (an empty 404 if the build has none).
    let status = 200;
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      status = 404;
      file = path.join(root, "404.html");
      if (!fs.existsSync(file)) return res.writeHead(404).end();
    }
    const ext = path.extname(file);
    const type = TYPES[ext] ?? "application/octet-stream";
    const headers = { "Content-Type": type, "Cache-Control": "no-store" };
    const compressible = /text|json|javascript|svg/.test(type) || ext === ".pagefind" || ext === ".pf_meta";
    if (compressible && /\bbr\b/.test(req.headers["accept-encoding"] ?? "")) {
      const key = `${file}@${fs.statSync(file).mtimeMs}`; // a redeployed folder is not served stale
      if (!compressed.has(key)) {
        compressed.set(key, zlib.brotliCompressSync(fs.readFileSync(file), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }));
      }
      res.writeHead(status, { ...headers, "Content-Encoding": "br" });
      return res.end(compressed.get(key));
    }
    res.writeHead(status, headers);
    res.end(fs.readFileSync(file));
  });
}

// Started only when run as a script, so the test can import the module.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [root, port] = [path.resolve(process.argv[2] ?? "dist"), Number(process.argv[3] ?? 5101)];
  const server = createServer(root);
  server.listen(port, HOST, () => console.log(`serving ${root} on http://${HOST}:${server.address().port}/`));
}
