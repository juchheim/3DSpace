import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "../dist");

function fixRelativeImports(source) {
  return source.replace(/from "\.\/([^"]+)"/g, (match, importPath) => {
    if (importPath.endsWith(".js")) return match;
    return `from "./${importPath}.js"`;
  });
}

for (const file of readdirSync(distDir)) {
  if (!file.endsWith(".js")) continue;
  const filePath = join(distDir, file);
  const next = fixRelativeImports(readFileSync(filePath, "utf8"));
  writeFileSync(filePath, next);
}
