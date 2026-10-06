/**
 * Rasterizes the FETCH logo (public/logo.svg) into every icon and splash the
 * project ships. Android sources go to `assets/`, which
 * `bunx capacitor-assets generate --android` expands into `android/.../res`;
 * the web/PWA icons are written straight into `public/` (Vite copies that dir
 * into `dist/`).
 *
 * Run: bun scripts/generate-app-icons.mjs
 */
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";

/**
 * The splash plate. Matches capacitor.config.ts and the Android
 * `splash_background` colour, so the native splash tears down into a
 * background of the same colour and there is no flash.
 */
const BRAND = "#0a0a0a";
/**
 * The plate the crest sits on.
 *
 * White, because the crest is drawn on white: its black rim reads as a rim
 * only against a light field, and its own white gap ring is part of the
 * artwork rather than the edge of it.
 */
const PLATE = "#ffffff";

/** public/logo.svg is a 512-unit canvas with the crest filling it. */
const VIEW_BOX = 512;
const CENTER = VIEW_BOX / 2;

const logo = await readFile("public/logo.svg", "utf8");
// The rim wordmarks are stripped before rasterizing: librsvg in this container
// has no fonts (fontconfig cannot load a config), so type renders as nothing at
// all, and at 48px "FETCH" is a grey smear regardless. The year is paths in the
// artwork, so it survives and the band still reads as a year band.
const markSource = logo.replace(/<text[\s\S]*?<\/text>/g, "");
// The crest is the last group in the file, so match greedily to the last
// </g> before the closing tag. A lazy match would stop at the first nested
// </g> and hand back half a helmet. Anchored to the start of a line so a
// mention of the tag inside a comment cannot match first.
const crest = markSource.match(/^[ \t]*<g id="crest">([\s\S]*)<\/g>\s*<\/svg>/m);
if (!crest) {
  throw new Error('Could not find <g id="crest"> in public/logo.svg');
}

// Scale the crest about the canvas centre so it fills `fraction` of it.
const crestLayer = (fraction) =>
  `<g transform="translate(${CENTER} ${CENTER}) scale(${fraction}) translate(${-CENTER} ${-CENTER})">${crest[1]}</g>`;

/** Full-canvas artwork: optional plate (rounded only when it is the art
 *  itself, i.e. the Android legacy icon) plus the crest at its own colours. */
const art = ({ markFraction, plate = false, radius = 18 }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}">
  ${plate ? `<rect width="${VIEW_BOX}" height="${VIEW_BOX}" rx="${radius}" fill="${PLATE}"/>` : ""}
  ${crestLayer(markFraction)}
</svg>`;

/** Rasterize an SVG at 2x so the vector geometry stays crisp when downscaled. */
const rasterize = (svg, size) =>
  sharp(Buffer.from(svg), { density: 144 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

// ---------------------------------------------------------------------------
// Android sources (assets/ -> android/app/src/main/res via capacitor-assets)
// ---------------------------------------------------------------------------
await mkdir("assets", { recursive: true });

// Adaptive icon: the tool insets both layers by 16.7% (the masked 72dp area),
// so markFraction 0.84 lands at ~56% of the finished icon, inside the safe zone.
await Bun.write("assets/icon-foreground.png", await rasterize(art({ markFraction: 0.84 }), 1024));
await Bun.write("assets/icon-only.png", await rasterize(art({ markFraction: 0.84, plate: true }), 1024));

// The adaptive background is the crest's own plate rather than the splash
// colour, so the installed Android icon and the installed web app are the same
// picture. On a red or black field the crest's red middle would sink into it.
await Bun.write(
  "assets/icon-background.png",
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: PLATE } })
    .png()
    .toBuffer(),
);

// Splash: square source that the tool center-crops to every screen density and
// orientation - a portrait target keeps only its own aspect ratio out of the
// square, so 0.19 of the canvas lands the crest at ~30% of the screen width.
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}">
  <rect width="${VIEW_BOX}" height="${VIEW_BOX}" fill="${BRAND}"/>
  ${crestLayer(0.19)}
</svg>`;
await Bun.write(
  "assets/splash.png",
  await sharp(Buffer.from(splash), { density: 144 })
    .resize(2732, 2732, { fit: "contain" })
    .png()
    .toBuffer(),
);

const written = ["icon-background", "icon-foreground", "icon-only", "splash"];
for (const name of written) {
  const meta = await sharp(`assets/${name}.png`).metadata();
  console.log(`assets/${name}.png  ${meta.width}x${meta.height}  alpha=${meta.hasAlpha}`);
}

// ---------------------------------------------------------------------------
// Web / PWA icons (public/ -> dist/)
// ---------------------------------------------------------------------------

/** Browsers and OS launchers apply their own mask, so these plates stay square
 *  and full-bleed. `any` keeps the crest inside the iOS squircle; `maskable`
 *  keeps it inside the inner 80% safe circle the platform may crop to. */
const anyIcon = art({ markFraction: 0.72, plate: true, radius: 0 });
const maskableIcon = art({ markFraction: 0.54, plate: true, radius: 0 });

/** Read the ICO back: sharp has no ICO loader, so check the container by hand. */
const describeIco = async (file) => {
  const buffer = await readFile(file);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const count = view.getUint16(4, true);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16;
    const length = view.getUint32(entry + 8, true);
    const offset = view.getUint32(entry + 12, true);
    const frame = await sharp(buffer.subarray(offset, offset + length)).metadata();
    frames.push(`${frame.width}x${frame.height} ${frame.format}`);
  }
  return `ico ${count} frames: ${frames.join(", ")}`;
};

/** Pack PNG frames into an ICO container (PNG-in-ICO, read by every current browser). */
const ico = async (sizes, svg) => {
  const frames = await Promise.all(sizes.map((size) => rasterize(svg, size)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(frames.length, 4);
  const entries = [];
  let offset = header.length + frames.length * 16;
  for (const [i, frame] of frames.entries()) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(sizes[i], 0); // width (0 means 256)
    entry.writeUInt8(sizes[i], 1); // height
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(frame.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += frame.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...frames]);
};

await mkdir("public/icons", { recursive: true });

// Tab favicon, home screen shortcuts and install prompts.
await Bun.write("public/favicon.ico", await ico([16, 32, 48], anyIcon));
await Bun.write("public/apple-touch-icon.png", await rasterize(anyIcon, 180));
for (const size of [192, 256, 384, 512]) {
  await Bun.write(`public/icons/icon-${size}.png`, await rasterize(anyIcon, size));
}
await Bun.write("public/icons/icon-maskable-512.png", await rasterize(maskableIcon, 512));

const web = [
  "favicon.ico",
  "apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-256.png",
  "icons/icon-384.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
];
for (const file of web) {
  if (file.endsWith(".ico")) {
    console.log(`public/${file}  ${await describeIco(`public/${file}`)}`);
    continue;
  }
  const meta = await sharp(`public/${file}`).metadata();
  console.log(`public/${file}  ${meta.width}x${meta.height} ${meta.format} alpha=${meta.hasAlpha}`);
}