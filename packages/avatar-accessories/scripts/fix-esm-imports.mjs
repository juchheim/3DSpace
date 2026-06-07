import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "../dist");

function fixRelativeImports(source) {
  return source
    .replace(/from "(\.\.?\/[^"]+)"/g, (match, importPath) => {
      if (importPath.endsWith(".js") || importPath.endsWith(".json")) return match;
      return `from "${importPath}.js"`;
    })
    .replace(/from "(\.\.?\/[^"]+\.json)";/g, 'from "$1" with { type: "json" };');
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const filePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(filePath);
      continue;
    }
    if (!entry.name.endsWith(".js")) continue;
    const next = fixRelativeImports(readFileSync(filePath, "utf8"));
    writeFileSync(filePath, next);
  }
}

walk(distDir);
