// Pure RESP2 encoding/decoding - no cloudflare:sockets import, so it loads in
// plain Node (unit tests, CPU benchmarks). The socket-owning RedisConnection
// lives in ./resp.js. See that file's header for why RESP2 is hand-rolled.

const encoder = new TextEncoder();
const decoder = new TextDecoder(); // UTF-8, fatal:false - only ever fed a byte-exact slice

// A RESP '-' error reply. Returned as a value by the parser (also possible
// nested inside arrays); the connection turns top-level ones into rejections.
export class RespError extends Error {}

// --- command encoding -------------------------------------------------
// RESP2 request form: *<argc>\r\n($<len>\r\n<bytes>\r\n)+   (len = BYTE length)
export function encodeCommand(args) {
  const encodedArgs = args.map((a) => (a instanceof Uint8Array ? a : encoder.encode(String(a))));
  const header = encoder.encode(`*${encodedArgs.length}\r\n`);
  let total = header.length;
  const partHeaders = encodedArgs.map((bytes) => {
    const h = encoder.encode(`$${bytes.length}\r\n`);
    total += h.length + bytes.length + 2;
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
    out[offset++] = 13;
    out[offset++] = 10;
  }
  return out;
}

// --- reply decoding -----------------------------------------------------
function findCRLF(buf, from, end) {
  const limit = end - 1;
  for (let i = from; i < limit; i++) {
    if (buf[i] === 13 && buf[i + 1] === 10) return i;
  }
  return -1;
}

// Incremental, resumable RESP2 parser. feed(chunk) appends bytes and returns
// every top-level value that is now complete (possibly none).
//
// Properties that matter:
//  * Byte-exact: bulk-string lengths are BYTE counts; a string is decoded
//    only once its whole byte range has arrived, so a multi-byte UTF-8
//    character split across TCP chunks is never decoded half-way.
//  * Linear time: parse state (a stack of partially filled arrays) survives
//    between feed() calls, so a large reply arriving in many chunks is parsed
//    once, not re-parsed from the start per chunk. The receive buffer grows
//    geometrically instead of being re-copied per chunk.
export class RespParser {
  constructor() {
    this.buf = new Uint8Array(16384);
    this.start = 0; // first unconsumed byte
    this.end = 0; // one past last valid byte
    this.stack = []; // partially built arrays: {items, i}
  }

  _append(chunk) {
    const need = this.end - this.start + chunk.length;
    if (this.end + chunk.length > this.buf.length) {
      if (need <= this.buf.length && this.start > 0) {
        this.buf.copyWithin(0, this.start, this.end);
      } else {
        let size = this.buf.length;
        while (size < need) size *= 2;
        const next = new Uint8Array(size);
        next.set(this.buf.subarray(this.start, this.end), 0);
        this.buf = next;
      }
      this.end -= this.start;
      this.start = 0;
    }
    this.buf.set(chunk, this.end);
    this.end += chunk.length;
  }

  feed(chunk) {
    this._append(chunk);
    const out = [];
    const buf = this.buf;
    for (;;) {
      if (this.start >= this.end) break;
      const type = buf[this.start];
      const lineEnd = findCRLF(buf, this.start + 1, this.end);
      if (lineEnd === -1) break;
      const line = decoder.decode(buf.subarray(this.start + 1, lineEnd));
      let next = lineEnd + 2;
      let value;

      if (type === 43) value = line; // '+'
      else if (type === 45) value = new RespError(line); // '-'
      else if (type === 58) value = Number(line); // ':'
      else if (type === 36) {
        // '$' bulk string
        const len = Number(line);
        if (!Number.isInteger(len) || len < -1) throw new Error(`Bad RESP bulk length "${line}"`);
        if (len === -1) value = null;
        else {
          if (this.end < next + len + 2) break; // wait for the rest (incl. trailing CRLF)
          value = decoder.decode(buf.subarray(next, next + len));
          next += len + 2;
        }
      } else if (type === 42) {
        // '*' array
        const count = Number(line);
        if (!Number.isInteger(count) || count < -1) throw new Error(`Bad RESP array length "${line}"`);
        if (count === -1) value = null;
        else if (count === 0) value = [];
        else {
          this.stack.push({ items: new Array(count), i: 0 });
          this.start = next;
          continue;
        }
      } else {
        throw new Error(`Unsupported RESP type byte ${type} (${String.fromCharCode(type)})`);
      }

      this.start = next;
      // Hand the finished value to its parent array(s), unwinding completed ones.
      for (;;) {
        const top = this.stack[this.stack.length - 1];
        if (!top) {
          out.push(value);
          break;
        }
        top.items[top.i++] = value;
        if (top.i < top.items.length) break;
        this.stack.pop();
        value = top.items;
      }
    }
    if (this.start === this.end) this.start = this.end = 0;
    return out;
  }
}

// --- FT.SEARCH reply unpacking -------------------------------------------
// Default reply shape (verified against redis-stack with redis-cli --no-raw):
//   [ total, key1, [field1, value1, field2, value2, ...], key2, [...], ... ]
// For an ON JSON index, `RETURN 1 $` yields one field named "$" per document
// whose value is the whole JSON document as a string.
export function parseFtSearchWithFields(reply) {
  if (!Array.isArray(reply)) throw new Error("Unexpected FT.SEARCH reply shape");
  const total = reply[0];
  const documents = [];
  for (let i = 1; i < reply.length; i += 2) {
    const id = reply[i];
    const fields = reply[i + 1] || [];
    const value = {};
    for (let j = 0; j < fields.length; j += 2) {
      value[fields[j]] = fields[j + 1];
    }
    documents.push({ id, value });
  }
  return { total, documents };
}
