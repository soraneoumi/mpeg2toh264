import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createServer } from "vite";

// Execute the production read loop, not a duplicate of the EOF decision.
// Only transport/queue notifications are simulated; conversion is outside
// this test and remains covered by the decode-mode and MSE suites.
const source = fs.readFileSync("packages/player/src/worker.ts", "utf8");
const tree = ts.createSourceFile(
  "worker.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const readings = [];
const helpers = [];
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "reading")
    readings.push(node.initializer.getText(tree));
  if (
    ts.isFunctionDeclaration(node) &&
    node.name?.getText(tree) === "readWithin"
  )
    helpers.push(node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);
assert.equal(helpers.length, 1, "the stall-bounded read is unambiguous");
assert.equal(readings.length, 1, "production reading loop must be unambiguous");
const [reading] = readings;
const server = await createServer({
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { isRangeExhaustion, withRangeContext } = await server.ssrLoadModule(
    "/packages/player/src/source.ts",
  );
  const js = ts.transpileModule(
    `${helpers[0]}
  class Reader {
    #command = {url: "test", id: 1};
    #leg = {signal: {aborted:false}};
    #totalBytes; #readingMs = 0;
    #running() {return !this.#leg.signal.aborted;}
    constructor(total) {this.#totalBytes = total;}
    async run(source, reopen, abort) {
      const leg=1, id=1, chunks=[];
      const available={set(){}, abandon(){}}, refill={set(){}, async wait(){}, abandon(){}};
      let queuedBytes=0, nextByte=source.offset, response=source;
      let ended=false, readError=null, firstRead=true;
      const openSource=async()=>{if(abort)this.#leg.signal.aborted=true; return reopen();};
      const reading=${reading};
      await reading;
      return {ended, readError, chunks:chunks.length, nextByte};
    }
  }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const Reader = new Function(
    "isRangeExhaustion",
    "withRangeContext",
    "INPUT_QUEUE_HIGH_WATER_BYTES",
    "MAX_PACKAGE_CHUNK_BYTES",
    "post",
    "mark",
    "READ_STALL_MS",
    `${js}; return Reader;`,
  )(
    isRangeExhaustion,
    withRangeContext,
    1,
    10,
    () => {},
    () => {},
    20,
  );
  const error416 = () => new Error("range refused", { cause: { status: 416 } });
  function sourceWith(read) {
    return {
      offset: 0,
      resumable: true,
      close() {},
      stream: {
        getReader() {
          return { read };
        },
      },
    };
  }
  const chunk = () =>
    sourceWith(async () => ({ value: new Uint8Array([1, 2]), done: false }));
  const refused = async () => {
    throw error416();
  };
  let r = await new Reader(2).run(chunk(), refused, false);
  assert.equal(r.readError, null);
  assert.equal(r.chunks, 1);
  assert.equal(r.ended, true);
  for (const total of [null, 3]) {
    r = await new Reader(total).run(chunk(), refused, false);
    assert.ok(r.readError instanceof Error);
  }
  r = await new Reader(2).run(
    chunk(),
    async () => {
      throw new Error("network failed");
    },
    false,
  );
  assert.ok(r.readError instanceof Error);
  // A reader rejection with a synthetic 416 cause must not be treated as a
  // refused reopen, even when the known end has already been reached.
  r = await new Reader(0).run(sourceWith(refused), refused, false);
  assert.ok(r.readError instanceof Error);
  r = await new Reader(2).run(chunk(), refused, true);
  assert.equal(r.readError, null); // cancellation is owned by the enclosing leg
  r = await new Reader(null).run(
    sourceWith(async () => ({ done: true })),
    async () => assert.fail("normal EOF must not reopen"),
    false,
  );
  assert.equal(r.readError, null);
  assert.equal(r.ended, true);
  assert.equal(r.chunks, 0);
  // A response that stalls without failing is given up and the input
  // reopened at the next byte, which then reads on to the end.
  let reopens = 0;
  let closed = 0;
  const stalled = sourceWith(() => new Promise(() => {}));
  stalled.close = () => closed++;
  r = await new Reader(2).run(
    stalled,
    async () => (reopens++ === 0 ? chunk() : refused()),
    false,
  );
  assert.equal(closed, 1, "the stalled response is closed");
  assert.equal(r.readError, null);
  assert.equal(r.chunks, 1, "the reopened response's bytes");
  assert.equal(r.ended, true);
  console.log("production range reading: 8 cases passed");
} finally {
  await server.close();
}
