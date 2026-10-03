import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { THEMES } from "./useThemePreferences.js";

describe("color themes", () => {
  it("provides a unique id and three-color swatch for every theme", () => {
    const ids = THEMES.map(({ id }) => id);

    assert.equal(new Set(ids).size, ids.length);
    assert.equal(THEMES.length, 14);
    for (const theme of THEMES) {
      assert.equal(theme.swatch.length, 3, `${theme.id} should have a complete swatch`);
      assert.ok(theme.swatch.every((color) => /^#[\da-f]{6}$/i.test(color)), `${theme.id} has an invalid swatch color`);
    }
  });
});
