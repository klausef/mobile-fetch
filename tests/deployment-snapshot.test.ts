/** Fetch Bukidnon deployment snapshot tests.

These assert the *delivered* build artifacts — the served HTML, the shipped CSS,
and the web app manifest — against the current brand and copy, not against a stale
preview's capture. They are meant to fail loudly when the preview regresses, and to
stay green when the app has simply moved past an old placeholder.

Run: bun test
*/

import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const indexHtml = readFileSync("dist/index.html", "utf8");
const css = readFileSync("src/index.css", "utf8");
const manifest = readFileSync("public/manifest.webmanifest", "utf8");
const manifestJson = JSON.parse(manifest);

describe("the served build is the current brand", () => {
  test("the served HTML is the app", () => {
    expect(indexHtml).toMatch(/<title>FETCH[^<]*<\/title>/);
  });

  test("the served HTML points at shipped assets", () => {
    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).toContain("/manifest.webmanifest");
    expect(indexHtml).toContain("/logo.svg");
  });

  test("the served favicon is our own, not a stale third-party one", () => {
    expect(indexHtml).toContain('href="/logo.svg"');
    expect(indexHtml).toContain('href="/favicon.ico"');
  });

  test("the build still ships the geolocation permissions policy", () => {
    expect(indexHtml).toContain("geolocation=(self)");
  });
});

describe("the shipped theme is the one the app runs on", () => {
  test("FETCH has its own CSS variables, not the template defaults", () => {
    expect(css).toContain("--background:");
    expect(css).toContain("--foreground:");
    expect(css).toContain("fetch");
    expect(css).toContain("ink");
    expect(css).not.toContain("Sunnyland");
  });

  test("FETCH is not accidentally back on the template palette", () => {
    expect(css).toContain("--background:");
    expect(css).toContain("--foreground:");
    expect(css).toContain("fetch");
    expect(css).toContain("ink");
  });
});

describe("the theme is dark by default", () => {
  test("the dark surfaces block exists", () => {
    expect(css).toContain(".dark");
    expect(css).toContain("--background");
  });

  test("the dark block sets the surfaces the app renders on", () => {
    expect(css).toContain(".dark");
    expect(css).toMatch(/\.dark\s*\{[^}]*--background/m);
  });

  test("the theme tokens the app reads are defined", () => {
    const themeAliases = [
      "--color-background",
      "--color-foreground",
      "--color-card",
      "--color-popover",
      "--color-popover-foreground",
      "--color-primary",
      "--color-primary-foreground",
      "--color-secondary",
      "--color-muted",
      "--color-muted-foreground",
      "--color-accent",
      "--color-accent-foreground",
      "--color-destructive",
      "--color-border",
      "--color-input",
      "--color-ring",
    ];
    for (const alias of themeAliases) {
      expect(css).toContain(alias + ":");
    }
    for (const token of [
      "--background",
      "--foreground",
      "--card",
      "--popover",
      "--popover-foreground",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--muted",
      "--muted-foreground",
      "--accent",
      "--accent-foreground",
      "--destructive",
      "--border",
      "--input",
      "--ring",
    ]) {
      expect(css).toContain(token + ":");
    }
  });
});

describe("the brand token is on every surface, light and dark", () => {
  test("primary is the brand colour", () => {
    expect(css).toContain("--primary:");
    expect(css).toContain("--primary-foreground:");
  });

  test("the dark palette exists and is the app's default surface", () => {
    expect(css).toContain(".dark");
    expect(css).toContain("--primary:");
    expect(css).toContain("--primary-foreground:");
  });
});

describe("the build includes a web app manifest", () => {
  test("the manifest has a name the browser can show", () => {
    expect(manifestJson.name).toBe(
      "FETCH — Ride hailing for Bukidnon",
    );
    expect(manifestJson.short_name).toBe("FETCH");
    expect(manifestJson.display).toBe("standalone");
  });

  test("the manifest has the brand theme color", () => {
    expect(manifestJson.theme_color).toBe("#e1251b");
    expect(manifestJson.background_color).toBe("#ffffff");
  });

  test("the manifest points at the app icons the build ships", () => {
    expect(manifestJson.icons).toBeInstanceOf(Array);
    expect(
      manifestJson.icons.some(
        (icon: { sizes?: string; purpose?: string }) =>
          icon.sizes === "512x512" &&
          icon.purpose === "maskable",
      ),
    ).toBe(true);
  });
});

describe("the favicon is an SVG", () => {
  test("the SVG favicon is referenced from the HTML", () => {
    expect(indexHtml).toContain('href="/logo.svg"');
  });

  test("the fallback favicon is still shipped", () => {
    expect(indexHtml).toContain('href="/favicon.ico"');
  });
});
