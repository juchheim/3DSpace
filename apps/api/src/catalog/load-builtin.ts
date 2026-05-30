import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveBuiltinCatalogPath(importMetaUrl: string, packagePath: string) {
  const moduleDir = dirname(fileURLToPath(importMetaUrl));
  const bundled = join(moduleDir, "catalog/builtin.json");
  if (existsSync(bundled)) return bundled;
  const monorepo = join(moduleDir, packagePath);
  if (existsSync(monorepo)) return monorepo;
  throw new Error(`Builtin catalog not found (tried ${bundled} and ${monorepo})`);
}

export function loadBuiltinCatalog<T>(input: {
  importMetaUrl: string;
  packagePath: string;
  parse: (entry: unknown) => T;
}) {
  const raw = JSON.parse(readFileSync(resolveBuiltinCatalogPath(input.importMetaUrl, input.packagePath), "utf8")) as unknown[];
  return raw.map((entry) => input.parse(entry));
}
