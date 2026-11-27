import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GENERATED, pluginNames, renderPlugins } from "./auth-plugins.mjs";

test("reads package names, scoped or not, once each", () => {
  assert.deepEqual(pluginNames("daidal-auth-gitlab, @acme/daidal-sso daidal-auth-gitlab"), ["daidal-auth-gitlab", "@acme/daidal-sso"]);
  assert.deepEqual(pluginNames(undefined), []);
});

test("refuses anything that isn't a package name", () => {
  for (const bad of ['x"; import "evil', "../local", "Upper", "@scope", "a/b/c"]) assert.throws(() => pluginNames(bad));
});

test("imports each plugin's default export", () => {
  assert.equal(
    renderPlugins(["daidal-auth-gitlab", "@acme/daidal-sso"]),
    [
      "// Written by scripts/auth-plugins.mjs from DAIDAL_AUTH_PLUGINS. With none set, there are no plugin providers.",
      'import plugin0 from "daidal-auth-gitlab";',
      'import plugin1 from "@acme/daidal-sso";',
      'import type { ProviderPlugin } from "./provider";',
      "",
      "export const GENERATED: ProviderPlugin[] = [plugin0, plugin1];",
      "",
    ].join("\n"),
  );
});

test("the committed module is the one for no plugins", () => {
  assert.equal(readFileSync(GENERATED, "utf8"), renderPlugins([]));
});
