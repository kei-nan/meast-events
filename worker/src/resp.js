// Minimal RESP2 client over cloudflare:sockets, scoped to exactly the
// command shapes this API needs: PING, FT.SEARCH, JSON.MGET (see index.js).
//
// Why hand-rolled instead of using the `redis-on-workers` npm package
// (kane50613, MIT, github.com/kane50613/redis-on-workers - the existing
// project referenced in the task brief that does `cloudflare:sockets` ->
// Redis)? It was tried first. Its generic send()/sendRaw() *would* carry
// arbitrary commands like FT.SEARCH/JSON.MGET (no command allowlist), but
// verified locally against a real redis-stack instance: its RESP decoder
// hangs the connection indefinitely on any bulk string containing
// multi-byte UTF-8 (confirmed with `SET k "café"` / an en-dash - ASCII-only
// values like "hello world" decode fine, non-ASCII ones never resolve and
// the Workers runtime eventually kills the request as hung). This dataset's
// event/boundary text is full of non-ASCII characters (e.g. "Arab–Israeli
// War", diacritics in names), so that bug is a hard blocker, not an edge
// case. Root cause looks like the decoder using decoded-string/character
// length somewhere it should use the raw byte length from the `$<len>`
// bulk-string header - RESP lengths are always byte lengths. Given the API
// surface here is exactly 3 command shapes, a small purpose-built decoder
// that is byte-exact throughout is more reliable than patching/forking a
// third-party one.

import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();
const decoder = new TextDecoder(); // UTF-8, fatal:false - decodes a byte-exact slice

// --- command encoding -------------------------------------------------
// RESP2 request form: *<argc>\r\n($<len>\r\n<bytes>\r\n)+
function encodeCommand(args) {
  const encodedArgs = args.map((a) => (a instanceof Uint8Array ? a : encoder.encode(String(a))));
  const header = encoder.encode(`*${encodedArgs.length}\r\n`);
  let total = header.length;
  const partHeaders = encodedArgs.map((bytes) => {
    const h = encoder.encode(`$${bytes.length}\r\n`);
    total += h.length + bytes.length + 2; // +2 for trailing \r\n
    return h;
  });
  const out = new Uint8Array(total);
  let offset = 0;
  out.set(header, offset);
  offset += header.length;
  for (let i = 0; i < encodedArgs.length; i++) {
    out.set(partHeaders[i], offset);
    offset += partHeaders[i].length;
    out.set(encodedArgs[i], offset);
    offset += encodedArgs[i].length;
    out[offset++] = 13; // \r
    out[offset++] = 10; // \n
  }
  return out;
}

// --- reply decoding -----------------------------------------------------
// Byte-exact: every bulk string's length comes from the `$<len>` header and
// is used as a raw byte count into the buffer (never a character count),
// decoded to a JS string with TextDecoder only once the full byte range is
// available. This is the property redis-on-workers' decoder got wrong.
class RespError extends Error {}

function findCRLF(buf, start) {
  const limit = buf.length - 1;
  for (let i = start; i < limit; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i;
  }
  return -1;
}

// Returns [value, bytesConsumed] for one complete RESP value at the front
// of `buf`, or null if `buf` doesn't yet contain a complete value (caller
// should wait for more bytes and retry).
function parseValue(buf) {
  if (buf.length < 1) return null;
  const type = buf[0];
  const lineEnd = findCRLF(buf, 1);
  if (lineEnd === -1) return null;
  const line = decoder.decode(buf.subarray(1, lineEnd));
  const afterLine = lineEnd + 2;

  if (type === 43) return [line, afterLine]; // '+' simple string
  if (type === 45) return [new RespError(line), afterLine]; // '-' error
  if (type === 58) return [Number(line), afterLine]; // ':' integer

  if (type === 36) {
    // '$' bulk string - `line` is a BYTE length, sliced as bytes below.
    const len = Number(line);
    if (len === -1) return [null, afterLine];
    const end = afterLine + len;
    if (buf.length < end + 2) return null; // need more bytes (incl. trailing CRLF)
    const str = decoder.decode(buf.subarray(afterLine, end));
    return [str, end + 2];
  }

  if (type === 42) {
    // '*' array (recursive; RediSearch/JSON.MGET replies nest this type)
    const count = Number(line);
    if (count === -1) return [null, afterLine];
    const items = new Array(count);
    let offset = afterLine;
    for (let i = 0; i < count; i++) {
      const sub = parseValue(buf.subarray(offset));
      if (sub === null) return null; // incomplete - caller waits for more data
      items[i] = sub[0];
      offset += sub[1];
    }
    return [items, offset];
  }

  throw new Error(`Unsupported RESP type byte ${type} (${String.fromCharCode(type)})`);
}

// --- connection -----------------------------------------------------------
export class RedisConnection {
  constructor(url) {
    const u = new URL(url);
    this.hostname = u.hostname;
    this.port = Number(u.port) || 6379;
    this.username = u.username ? decodeURIComponent(u.username) : undefined;
    this.password = u.password ? decodeURIComponent(u.password) : undefined;
    this.tls = u.protocol === "rediss:";
    this.socket = null;
    this.writer = null;
    this.reader = null;
    this.buf = new Uint8Array(0);
    this.pending = []; // FIFO of {resolve,reject} - Redis replies come back in request order
    this.ready = null;
  }

  connect() {
    if (!this.ready) this.ready = this._connect();
    return this.ready;
  }

  async _connect() {
    this.socket = connect(
      { hostname: this.hostname, port: this.port },
      this.tls ? { secureTransport: "on" } : undefined
    );
    this.writer = this.socket.writable.getWriter();
    this.reader = this.socket.readable.getReader();
    this._pump(); // fire-and-forget read loop for the life of the connection

    if (this.password) {
      const authArgs = this.username ? [this.username, this.password] : [this.password];
      await this._send("AUTH", ...authArgs);
    }
  }

  async _pump() {
    try {
      for (;;) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this._feed(value);
      }
      this._failPending(new Error("Redis connection closed by server"));
    } catch (err) {
      this._failPending(err);
    }
  }

  _feed(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    let buf = merged;

    for (;;) {
      const result = parseValue(buf);
      if (result === null) {
        this.buf = buf;
        return;
      }
      const [value, consumed] = result;
      buf = buf.subarray(consumed);
      const waiter = this.pending.shift();
      if (!waiter) continue; // shouldn't happen - defensive only
      if (value instanceof RespError) waiter.reject(value);
      else waiter.resolve(value);
    }
  }

  _failPending(err) {
    while (this.pending.length) this.pending.shift().reject(err);
  }

  async send(...args) {
    await this.connect();
    return this._send(...args);
  }

  _send(...args) {
    const promise = new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
    // Fire the write but don't await the writer here - awaiting per-write
    // serializes network round-trips of the write itself; the promise above
    // is what actually waits for the reply.
    this.writer.write(encodeCommand(args)).catch((err) => {
      const waiter = this.pending.pop();
      if (waiter) waiter.reject(err);
    });
    return promise;
  }

  close() {
    try {
      this.reader?.cancel();
    } catch {
      /* already closed */
    }
    try {
      this.writer?.close();
    } catch {
      /* already closed */
    }
    try {
      this.socket?.close();
    } catch {
      /* already closed */
    }
  }
}
