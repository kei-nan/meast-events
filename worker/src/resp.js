// Minimal RESP2 client over cloudflare:sockets, scoped to exactly the
// command shapes this API needs: AUTH, PING, FT.SEARCH (see index.js).
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

// The pure encode/decode logic lives in ./resp-codec.js (importable in plain
// Node for tests/benchmarks); this file only owns the socket.

import { connect } from "cloudflare:sockets";
import { RespError, RespParser, encodeCommand } from "./resp-codec.js";

export { RespError };

// Lets callers tell a credentials problem apart from other upstream failures.
export class RedisAuthError extends Error {}

export class RedisConnection {
  constructor(url) {
    const u = new URL(url); // throws on a malformed URL - caller treats as a config error
    this.hostname = u.hostname;
    this.port = Number(u.port) || 6379;
    this.username = u.username ? decodeURIComponent(u.username) : undefined;
    this.password = u.password ? decodeURIComponent(u.password) : undefined;
    this.tls = u.protocol === "rediss:";
    this.socket = null;
    this.writer = null;
    this.reader = null;
    this.parser = new RespParser();
    this.pending = []; // FIFO of {resolve,reject} - Redis replies come back in request order
    this.failure = null; // set once the connection is dead
    this.authPromise = null;
  }

  // Opens the socket and (if credentials exist) fires AUTH immediately
  // WITHOUT awaiting its reply: AUTH and the first real command go out
  // back-to-back and replies are matched to waiters in order, so the first
  // command costs one round trip instead of two. If AUTH fails, Redis answers
  // the follow-up command with NOAUTH; send() surfaces the AUTH error, not that.
  _ensureConnected() {
    if (this.socket) return;
    this.socket = connect(
      { hostname: this.hostname, port: this.port },
      this.tls ? { secureTransport: "on" } : undefined
    );
    this.writer = this.socket.writable.getWriter();
    this.reader = this.socket.readable.getReader();
    this.socket.opened.catch((err) => this._failPending(err));
    this._pump(); // fire-and-forget read loop for the life of the connection

    if (this.password) {
      const authArgs = this.username ? [this.username, this.password] : [this.password];
      this.authPromise = this._send("AUTH", ...authArgs).catch((err) => {
        throw err instanceof RespError ? new RedisAuthError(`Redis AUTH failed: ${err.message}`) : err;
      });
      this.authPromise.catch(() => {}); // send() observes it; avoid an unhandled rejection
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
    for (const value of this.parser.feed(chunk)) {
      const waiter = this.pending.shift();
      if (!waiter) continue; // unsolicited reply - defensive only
      if (value instanceof RespError) waiter.reject(value);
      else waiter.resolve(value);
    }
  }

  _failPending(err) {
    if (!this.failure) this.failure = err;
    while (this.pending.length) this.pending.shift().reject(err);
  }

  async send(...args) {
    this._ensureConnected();
    const reply = this._send(...args);
    if (!this.authPromise) return reply;
    // allSettled, not all: a failed AUTH also makes the command fail (NOAUTH),
    // and the AUTH error is the one worth reporting.
    const [auth, result] = await Promise.allSettled([this.authPromise, reply]);
    if (auth.status === "rejected") throw auth.reason;
    if (result.status === "rejected") throw result.reason;
    return result.value;
  }

  _send(...args) {
    if (this.failure) return Promise.reject(this.failure);
    const promise = new Promise((resolve, reject) => this.pending.push({ resolve, reject }));
    // Don't await the write: the promise above waits for the reply, and
    // writes issued in order stay ordered on the socket.
    this.writer.write(encodeCommand(args)).catch((err) => this._failPending(err));
    return promise;
  }

  close() {
    this._failPending(new Error("Redis connection closed"));
    try {
      this.reader?.cancel().catch(() => {});
    } catch {
      /* already closed */
    }
    try {
      this.writer?.close().catch(() => {});
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
