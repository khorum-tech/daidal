import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, coreVersionProblem, shippedCoreFiles } from "./core-version-lib.mjs";

test("only core's shipped sources count, not its tests or fixtures", () => {
  assert.deepEqual(
    shippedCoreFiles(["packages/core/src/render.ts", "packages/core/src/render.test.ts", "packages/core/src/fixtures.ts", "packages/core/README.md", "app/src/x.ts"]),
    ["packages/core/src/render.ts"],
  );
});

test("versions compare part by part", () => {
  assert.equal(compareVersions("0.2.0", "0.1.0"), 1);
  assert.equal(compareVersions("0.1.0", "0.1.0"), 0);
  assert.equal(compareVersions("0.9.0", "0.10.0"), -1);
  assert.throws(() => compareVersions("0.2", "0.1.0"), /not an x\.y\.z/);
});

test("a core change needs a version npm doesn't have yet", () => {
  const changed = ["packages/core/src/render.ts"];
  assert.match(coreVersionProblem({ changed, local: "0.1.0", published: "0.1.0" }), /still 0\.1\.0 and npm already has 0\.1\.0/);
  assert.ok(coreVersionProblem({ changed, local: "0.1.0", published: "0.2.0" }), "older than npm's is refused too");
  assert.equal(coreVersionProblem({ changed, local: "0.2.0", published: "0.1.0" }), null);
});

test("no core change, or nothing on npm yet, needs nothing", () => {
  assert.equal(coreVersionProblem({ changed: [], local: "0.1.0", published: "0.1.0" }), null);
  assert.equal(coreVersionProblem({ changed: ["packages/core/src/model.ts"], local: "0.1.0", published: null }), null);
});
