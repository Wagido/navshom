// Service worker : démarrage hors ligne, et séparation entre la production (/) et le site de test (/beta/).
const { test, expect } = require("@playwright/test");
const { mockNetwork } = require("./mock");

test.use({ serviceWorkers: "allow" });

let errors;
test.beforeEach(async ({ context, page }) => {
  errors = [];
  await mockNetwork(context); // au niveau du contexte : couvre aussi les requêtes du service worker
  page.on("pageerror", e => errors.push(e.message));
});
test.afterEach(async () => { expect(errors, "erreurs JavaScript").toEqual([]); });

const swReady = page => page.evaluate(async () => {
  const r = await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise(ok => navigator.serviceWorker.addEventListener("controllerchange", ok, { once: true }));
  return r.scope;
});

test("démarrage hors ligne (service worker)", async ({ page, context }) => {
  await page.goto("./");
  expect(await swReady(page)).toMatch(/:8799\/$/);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).filter(k => /^navshom-app-v\d+$/.test(k)).length)).toBe(1);
  await page.waitForTimeout(1500); // fin du remplissage du cache de l'app
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#splash")).toBeHidden({ timeout: 6000 });
  await page.waitForFunction(() => typeof map !== "undefined" && map._loaded);
  await expect(page.locator(".bar")).toBeVisible();
  await context.setOffline(false);
});

test("/beta/ séparée de la production (service worker, caches, réglages)", async ({ page }) => {
  // production : réglage et service worker
  await page.goto("./");
  await swReady(page);
  await page.click('#bMode button[data-m="rando"]');
  expect(await page.evaluate(() => localStorage.getItem("nav_mode"))).toBe('"rando"');
  // site de test
  await page.goto("./beta/");
  await expect(page.locator("#spVer")).toContainText("bêta");
  expect(await swReady(page)).toMatch(/\/beta\/$/);
  await page.waitForTimeout(1500);
  const st = await page.evaluate(async () => ({
    keys: Object.keys(localStorage), caches: await caches.keys(),
    regs: (await navigator.serviceWorker.getRegistrations()).map(r => r.scope),
    rando: document.body.classList.contains("rando"),
  }));
  expect(st.rando, "la beta ne lit pas les réglages de la production").toBe(false);
  expect(st.keys.some(k => k.startsWith("navb_"))).toBe(true);
  expect(st.regs.length).toBe(2);
  expect(st.caches.some(k => /^navshom-app-v\d+$/.test(k))).toBe(true);
  expect(st.caches.some(k => /^navshom-beta-app-v\d+$/.test(k))).toBe(true);
  // les fichiers de /beta/ ne vont pas dans le cache de la production
  const prodHasBeta = await page.evaluate(async () => {
    const n = (await caches.keys()).find(k => /^navshom-app-v\d+$/.test(k)), c = await caches.open(n);
    return (await c.keys()).some(r => r.url.includes("/beta/"));
  });
  expect(prodHasBeta).toBe(false);
  // retour à la production : réglage intact
  await page.goto("./");
  await expect(page.locator("body")).toHaveClass(/rando/);
});
