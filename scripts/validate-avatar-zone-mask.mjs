import { resolve } from "node:path";

import sharp from "sharp";

const REQUIRED_ZONE_IDS = Array.from({ length: 23 }, (_, index) => index + 1);

async function main() {
  const maskPath = resolve(process.cwd(), process.argv[2] ?? "apps/web/public/avatars/azure-vanguard-zone-mask.png");
  const { data, info } = await sharp(maskPath).raw().toBuffer({ resolveWithObject: true });
  const coverage = new Map();

  for (let offset = 0; offset < data.length; offset += info.channels) {
    const zoneId = data[offset] ?? 0;
    coverage.set(zoneId, (coverage.get(zoneId) ?? 0) + 1);
    if (zoneId > 23) {
      throw new Error(`Unexpected zone id ${zoneId} in ${maskPath}. Expected only 0-23.`);
    }
  }

  const missing = REQUIRED_ZONE_IDS.filter((zoneId) => !coverage.has(zoneId));
  if (missing.length > 0) {
    throw new Error(`Mask is missing required zone ids: ${missing.join(", ")}`);
  }

  console.log(
    JSON.stringify(
      {
        path: maskPath,
        width: info.width,
        height: info.height,
        coverage: Object.fromEntries(
          [...coverage.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([zoneId, count]) => [zoneId, { texels: count, percent: Number(((count / (info.width * info.height)) * 100).toFixed(3)) }])
        ),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
