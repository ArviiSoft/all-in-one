const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createMongoRuntime } = require("./mongoWorker");

function runtime() {
  return createMongoRuntime({ url: "mongodb://example.invalid", dbName: "test" });
}

test("rejects unsupported worker operations", async () => {
  await assert.rejects(
    () => runtime().execute("__proto__", {}),
    { code: "MONGODB_OPERATION" },
  );
});

test("does not execute arbitrary operation names", async () => {
  await assert.rejects(
    () => runtime().execute("$where", { $ne: null }),
    { code: "MONGODB_OPERATION" },
  );
});

test("rejects non-string operation names", async () => {
  await assert.rejects(
    () => runtime().execute({ toString: () => "read" }, {}),
    { code: "MONGODB_OPERATION" },
  );
});

test("requires an active connection for supported operations", async () => {
  await assert.rejects(
    () => runtime().execute("read", { path: "settings.json" }),
    { code: "MONGODB_CLOSED" },
  );
});
