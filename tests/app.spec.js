// Parcours principaux de Balise sur téléphone (Pixel 7), avec réseau externe simulé.
const { test, expect } = require("@playwright/test");
const { mockNetwork } = require("./mock");

const SEA = { latitude: 47.45, longitude: -3.0 };      // baie de Quiberon (mer)
const SEA_DEST = [47.25, -2.95];                        // au sud-est de Belle-Île (mer)
const MOUNTAIN = { latitude: 45.30, longitude: 6.58 };  // Vanoise

// Erreurs JavaScript de la page : chaque test échoue s'il y en a une
let errors;
test.beforeEach(async ({ context, page }) => {
  errors = [];
  await mockNetwork(context);
  page.on("pageerror", e => errors.push(e.message));
});
test.afterEach(async () => { expect(errors, "erreurs JavaScript").toEqual([]); });

// Ouvre l'app dans un mode donné (Mer ou Rando), sans écran de démarrage
async function open(page, mode = "mer", extra = {}) {
  await page.addInitScript(([m, ex]) => {
    if (sessionStorage.getItem("t_init")) return; sessionStorage.setItem("t_init", "1");
    localStorage.setItem("nav_mode", JSON.stringify(m));
    for (const [k, v] of Object.entries(ex)) localStorage.setItem("nav_" + k, JSON.stringify(v));
  }, [mode, extra]);
  await page.goto("./");
  await expect(page.locator("#splash")).toBeHidden({ timeout: 5000 });
  await page.waitForFunction(() => typeof map !== "undefined" && map._loaded);
}
const mapCenterClick = async page => { const b = await page.locator("#map").boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };

test("démarrage sans erreur JavaScript", async ({ page }) => {
  await open(page);
  await expect(page.locator("#spVer")).toContainText("Version 20");
  await expect(page.locator(".bar")).toBeVisible();
  await page.waitForTimeout(1500); // laisse passer les chargements différés
});

test("bascule Mer et Rando", async ({ page }) => {
  await open(page, "mer");
  await expect(page.locator("body")).not.toHaveClass(/rando/);
  await expect(page.locator("#c1l")).toHaveText("Vitesse");
  await page.click('#bMode button[data-m="rando"]');
  await expect(page.locator("body")).toHaveClass(/rando/);
  await expect(page.locator("#c1l")).toHaveText("Altitude");
  await expect(page.locator("#bRec")).toBeVisible();
  await page.click('#bMode button[data-m="mer"]');
  await expect(page.locator("body")).not.toHaveClass(/rando/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("nav_mode")))).toBe("mer");
});

test("affichage de la carte", async ({ page }) => {
  await open(page);
  const box = await page.locator("#map").boundingBox();
  expect(box.width).toBeGreaterThan(300); expect(box.height).toBeGreaterThan(500);
  await expect(page.locator("#map .leaflet-tile-loaded").first()).toBeAttached();
  const z0 = await page.evaluate(() => map.getZoom());
  await page.evaluate(() => map.setZoom(map.getZoom() + 1, { animate: false }));
  expect(await page.evaluate(() => map.getZoom())).toBe(z0 + 1);
  await expect(page.locator("#scale")).toBeVisible();
});

for (const mode of ["mer", "rando"]) test(`panneau Météo avec tableau (${mode})`, async ({ page }) => {
  await open(page, mode, { tblOpen: true, tbarOpen: true });
  await page.click("#bWind");
  await expect(page.locator("#tbar")).toBeVisible();
  if (await page.locator("#tbar.mini").count()) await page.click("#tFold");
  if (!(await page.locator("#tTblBtn.on").count())) await page.click("#tTblBtn");
  const table = page.locator("#tTbl table");
  await expect(table).toBeVisible();
  expect(await table.locator("tr").count()).toBeGreaterThan(3);
  expect(await table.locator("td[data-t]").count()).toBeGreaterThan(24);
  await expect(page.locator("#tErr")).toBeHidden();
  await expect(page.locator("#tTime")).not.toHaveText("");
});

test("enregistrement d'une trace (Rando)", async ({ page, context }) => {
  await context.setGeolocation(MOUNTAIN);
  await open(page, "rando");
  await page.evaluate(() => map.setView([45.30, 6.58], 14, { animate: false }));
  await page.click("#bRec");
  await expect(page.locator("#bRec")).toHaveClass(/(^|\s)on(\s|$)/);
  for (let i = 1; i <= 6; i++) { // on marche vers le nord-est
    await context.setGeolocation({ latitude: MOUNTAIN.latitude + i * 0.0008, longitude: MOUNTAIN.longitude + i * 0.0006, accuracy: 5 });
    await page.waitForTimeout(400);
  }
  await page.click("#bRec");                 // bulle Pause / Terminer / Détails
  await expect(page.locator("#recAsk")).toBeVisible();
  await page.click("#raStop");               // premier toucher : demande de confirmation
  await expect(page.locator("#raStop")).toHaveText(/Confirmer/);
  await page.click("#raStop");               // second toucher : fin
  await expect(page.locator("#bRec")).not.toHaveClass(/(^|\s)on(\s|$)/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("nav_tracks") || "[]").length)).toBe(1);
  const tr = await page.evaluate(() => JSON.parse(localStorage.getItem("nav_tracks"))[0]);
  expect(tr.pts.length).toBeGreaterThan(4); expect(tr.dist).toBeGreaterThan(400);
  await page.click("#bTrack");
  await expect(page.locator("#sTrack")).toBeVisible();
  await expect(page.locator("#trList")).not.toBeEmpty();
});

for (const mode of ["mer", "rando"]) test(`mesure (${mode})`, async ({ page }) => {
  await open(page, mode);
  if (mode === "mer") await page.evaluate(() => map.setView([47.4, -3.0], 11, { animate: false }));
  else await page.evaluate(() => map.setView([45.30, 6.58], 14, { animate: false }));
  await page.click("#bMeasure");
  await expect(page.locator("#measure")).toBeVisible();
  const b = await page.locator("#map").boundingBox();
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.35);
  await page.mouse.click(b.x + b.width * 0.7, b.y + b.height * 0.45);
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.55);
  await expect(page.locator("#mTot")).toHaveText(/\d/);
  await page.waitForTimeout(500);
  await page.click("#bMeasure");
  await expect(page.locator("#measure")).toBeHidden();
});

test("routage (Mer)", async ({ page, context }) => {
  await context.setGeolocation(SEA);
  await open(page, "mer");
  await page.evaluate(([la, lo]) => map.setView([la, lo], 11, { animate: false }), SEA_DEST);
  await page.waitForTimeout(300);
  await mapCenterClick(page);                // point touché : panneau du point
  await expect(page.locator("#sPoint")).toBeVisible();
  await page.click("#aRouting");
  await expect(page.locator("#sRouting")).toBeVisible();
  await page.click("#rtGo");
  await expect(page.locator("#rtRes")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("#rtSum")).toHaveText(/\d/);
  expect(await page.evaluate(() => RT.result && RT.result.path.length)).toBeGreaterThan(2);
});

test("menu Plus", async ({ page }) => {
  await open(page);
  await page.click("#bMenu");
  await expect(page.locator("#sMenu")).toBeVisible();
  for (const id of ["#bInst", "#bRouting", "#hbNight", "#cRoutes", "#cWps", "#cOff", "#cSet", "#cSave", "#cAbout"])
    await expect(page.locator(id)).toBeAttached();
  await expect(page.locator("#appver")).toContainText("version");
  await page.click("#bInst");                // écran Instruments
  await expect(page.locator("#inst")).toBeVisible();
  await page.click("#instClose");
  await expect(page.locator("#inst")).toBeHidden();
  await page.click("#bMenu");
  await page.click("#bRouting");
  await expect(page.locator("#sRouting")).toBeVisible();
});
