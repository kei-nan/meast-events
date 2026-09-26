import { test } from "node:test";
import assert from "node:assert/strict";
import { RespError, RespParser, encodeCommand, parseFtSearchWithFields } from "../src/resp-codec.js";

const enc = new TextEncoder();
const bytes = (s) => enc.encode(s);
const dec = new TextDecoder();

function parseAll(u8) {
  return new RespParser().feed(u8);
}
function parseChunks(u8, sizes) {
  const p = new RespParser();
  const out = [];
  let i = 0;
  for (const size of sizes) {
    if (i >= u8.length) break;
    out.push(...p.feed(u8.subarray(i, i + size)));
    i += size;
  }
  if (i < u8.length) out.push(...p.feed(u8.subarray(i)));
  return out;
}
// Error instances aren't deep-equal by message alone; normalise for comparison.
const norm = (v) => JSON.parse(JSON.stringify(v, (_k, x) => (x instanceof RespError ? { err: x.message } : x)));

test("encodeCommand: byte-length prefixes, not char counts", () => {
  assert.equal(dec.decode(encodeCommand(["PING"])), "*1\r\n$4\r\nPING\r\n");
  assert.equal(dec.decode(encodeCommand(["GET", "k"])), "*2\r\n$3\r\nGET\r\n$1\r\nk\r\n");
  // "é" is 2 bytes, "–" (en dash) is 3 bytes.
  assert.equal(dec.decode(encodeCommand(["SET", "café–"])), "*2\r\n$3\r\nSET\r\n$8\r\ncafé–\r\n");
  assert.equal(dec.decode(encodeCommand(["X", 42])), "*2\r\n$1\r\nX\r\n$2\r\n42\r\n");
  assert.equal(dec.decode(encodeCommand(["X", ""])), "*2\r\n$1\r\nX\r\n$0\r\n\r\n");
  assert.equal(dec.decode(encodeCommand(["X", new Uint8Array([65, 66])])), "*2\r\n$1\r\nX\r\n$2\r\nAB\r\n");
});

test("parses each supported type", () => {
  assert.deepEqual(parseAll(bytes("+OK\r\n")), ["OK"]);
  assert.deepEqual(parseAll(bytes(":-42\r\n")), [-42]);
  assert.deepEqual(parseAll(bytes("$5\r\nhello\r\n")), ["hello"]);
  assert.deepEqual(parseAll(bytes("$0\r\n\r\n")), [""]);
  assert.deepEqual(parseAll(bytes("*0\r\n")), [[]]);
  assert.deepEqual(parseAll(bytes("*2\r\n:1\r\n$1\r\na\r\n")), [[1, "a"]]);
});

test("bulk strings may contain CRLF and RESP-looking bytes", () => {
  assert.deepEqual(parseAll(bytes("$8\r\na\r\n$3\r\nb\r\n")), ["a\r\n$3\r\nb"]);
});

test("null bulk and null array", () => {
  assert.deepEqual(parseAll(bytes("$-1\r\n")), [null]);
  assert.deepEqual(parseAll(bytes("*-1\r\n")), [null]);
  assert.deepEqual(parseAll(bytes("*3\r\n$1\r\na\r\n$-1\r\n*-1\r\n")), [["a", null, null]]);
});

test("error replies are returned as RespError, top-level and nested", () => {
  const [e] = parseAll(bytes("-ERR unknown command\r\n"));
  assert.ok(e instanceof RespError);
  assert.equal(e.message, "ERR unknown command");
  const [[a, b]] = parseAll(bytes("*2\r\n:1\r\n-WRONGTYPE bad\r\n"));
  assert.equal(a, 1);
  assert.ok(b instanceof RespError);
});

test("nested arrays", () => {
  const wire = "*3\r\n:2\r\n$3\r\nk:1\r\n*4\r\n$1\r\na\r\n$1\r\n1\r\n$1\r\nb\r\n*1\r\n*0\r\n";
  assert.deepEqual(parseAll(bytes(wire)), [[2, "k:1", ["a", "1", "b", [[]]]]]);
});

test("multiple values in one buffer, and trailing partial value is held back", () => {
  const p = new RespParser();
  assert.deepEqual(p.feed(bytes("+A\r\n:7\r\n$3\r\nab")), ["A", 7]);
  assert.deepEqual(p.feed(bytes("c\r")), []);
  assert.deepEqual(p.feed(bytes("\n")), ["abc"]);
});

const emoji = "\u{1F600}";
const SAMPLE_WIRE =
  "+OK\r\n" +
  "*5\r\n:2\r\n$7\r\nevent:1\r\n*4\r\n$5\r\ntitle\r\n$17\r\nArab–Israeli é\r\n$3\r\nlat\r\n$4\r\n31.5\r\n$-1\r\n*-1\r\n" +
  "-ERR nope\r\n" +
  ":123456\r\n" +
  `$4\r\n${emoji}\r\n` +
  "*2\r\n*2\r\n$1\r\nx\r\n*0\r\n:9\r\n";

test("sample wire is what we think it is", () => {
  const whole = norm(parseAll(bytes(SAMPLE_WIRE)));
  assert.equal(whole.length, 6);
  assert.equal(whole[1][2][1], "Arab–Israeli é");
});

test("byte-by-byte feeding equals single-shot parsing", () => {
  const u8 = bytes(SAMPLE_WIRE);
  const whole = norm(parseAll(u8));
  assert.deepEqual(norm(parseChunks(u8, new Array(u8.length).fill(1))), whole);
});

test("random chunk sizes equal single-shot parsing", () => {
  const u8 = bytes(SAMPLE_WIRE);
  const whole = norm(parseAll(u8));
  let seed = 12345; // deterministic LCG so failures reproduce
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let run = 0; run < 300; run++) {
    const sizes = [];
    for (let n = 0; n < u8.length; ) {
      const s = 1 + Math.floor(rnd() * 12);
      sizes.push(s);
      n += s;
    }
    assert.deepEqual(norm(parseChunks(u8, sizes)), whole, `sizes=${sizes}`);
  }
});

test("multi-byte UTF-8 character split across two chunks decodes intact", () => {
  const text = `Arab–Israeli café ${emoji} שלום`;
  const wire = bytes(`$${bytes(text).length}\r\n${text}\r\n`);
  const header = bytes(`$${bytes(text).length}\r\n`).length;
  let splitsInsideChar = 0;
  for (let cut = 1; cut < wire.length; cut++) {
    const p = new RespParser();
    const first = p.feed(wire.subarray(0, cut));
    const second = p.feed(wire.subarray(cut));
    assert.deepEqual([...first, ...second], [text], `cut=${cut}`);
    if (cut >= header && (wire[cut] & 0xc0) === 0x80) splitsInsideChar++;
  }
  assert.ok(splitsInsideChar > 5, "test must actually split inside multi-byte characters");
});

test("split inside an en dash specifically (E2 80 93)", () => {
  const wire = bytes("$3\r\n–\r\n");
  const p = new RespParser();
  assert.deepEqual(p.feed(wire.subarray(0, 5)), []); // "$3\r\n" + first byte E2
  assert.deepEqual(p.feed(wire.subarray(5, 6)), []); // second byte
  assert.deepEqual(p.feed(wire.subarray(6)), ["–"]);
});

test("large reply arriving in many chunks (buffer growth/compaction)", () => {
  const items = Array.from({ length: 2000 }, (_, i) => `value-${i}-é–`.repeat(20));
  const wire = bytes(`*${items.length}\r\n` + items.map((s) => `$${bytes(s).length}\r\n${s}\r\n`).join(""));
  const p = new RespParser();
  const got = [];
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < wire.length; i += 1460) got.push(...p.feed(wire.subarray(i, i + 1460)));
  }
  assert.equal(got.length, 2);
  assert.deepEqual(got[0], items);
  assert.deepEqual(got[1], items);
});

test("malformed input throws", () => {
  assert.throws(() => parseAll(bytes("?x\r\n")), /Unsupported RESP type/);
  assert.throws(() => parseAll(bytes("$abc\r\n")), /Bad RESP bulk length/);
});

test("parseFtSearchWithFields: documents with fields", () => {
  const reply = [2, "event:1", ["id", "1", "title", "A"], "event:2", ["id", "2", "title", "B"]];
  assert.deepEqual(parseFtSearchWithFields(reply), {
    total: 2,
    documents: [
      { id: "event:1", value: { id: "1", title: "A" } },
      { id: "event:2", value: { id: "2", title: "B" } },
    ],
  });
});

test("parseFtSearchWithFields: RETURN 1 $ (JSON document under field '$') and empty result", () => {
  const doc = '{"name":"Iran","start_year":1935}';
  const r = parseFtSearchWithFields([1, "boundary:iran", ["$", doc]]);
  assert.equal(r.total, 1);
  assert.equal(r.documents[0].value["$"], doc);
  assert.deepEqual(parseFtSearchWithFields([0]), { total: 0, documents: [] });
  assert.throws(() => parseFtSearchWithFields(null), /Unexpected FT.SEARCH/);
});
