// Tests automatiques de Balise : Chromium, profil Pixel 7, réseau externe simulé (tests/mock.js)
const { defineConfig, devices } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Pixel 7"],
    baseURL: "http://localhost:8799/",
    serviceWorkers: "block", // sauf dans le test du service worker, qui le réautorise
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    geolocation: { latitude: 47.48, longitude: -3.12 },
    permissions: ["geolocation"],
    trace: "off",
  },
  projects: [{ name: "Pixel 7", use: { ...devices["Pixel 7"] } }],
  webServer: { command: "node tests/server.js 8799", url: "http://localhost:8799/", reuseExistingServer: !process.env.CI },
});
