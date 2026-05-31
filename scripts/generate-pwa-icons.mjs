import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const source = "public/logo.png.jpg";
const outputDir = "public/icons";

async function makeIcon(size, filename, paddingRatio) {
  const logoSize = Math.round(size * paddingRatio);
  const logo = await sharp(source)
    .resize(logoSize, logoSize, { fit: "inside" })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(`${outputDir}/${filename}`);
}

await mkdir(outputDir, { recursive: true });
await makeIcon(192, "icon-192.png", 0.82);
await makeIcon(512, "icon-512.png", 0.82);
await makeIcon(192, "maskable-192.png", 0.64);
await makeIcon(512, "maskable-512.png", 0.64);
