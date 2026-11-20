// Mise en page : lance tools-check.js (5 écrans × 6 états × 2 modes, chevauchements et débordements).
const { test, expect } = require("@playwright/test");
const { execFile } = require("child_process");
const path = require("path");

test("mise en page (tools-check.js)", async () => {
  test.setTimeout(15 * 60_000);
  const out = await new Promise(ok => execFile(process.execPath, [path.join(__dirname, "..", "tools-check.js"), "http://localhost:8799/"],
    { maxBuffer: 1 << 22 }, (err, stdout, stderr) => ok({ code: err ? err.code : 0, text: stdout + stderr })));
  console.log(out.text.trim());
  expect(out.code, out.text).toBe(0);
});
