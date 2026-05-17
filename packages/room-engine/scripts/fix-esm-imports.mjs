import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "../dist");
const indexPath = join(distDir, "index.js");

let source = readFileSync(indexPath, "utf8");
source = source.replace(/from "\.\/([^"]+)"/g, (match, importPath) => {
  if (importPath.endsWith(".js")) return match;
  return `from "./${importPath}.js"`;
});

writeFileSync(indexPath, source);
