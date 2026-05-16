import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

function start(label, script) {
  const child = spawn("npm", ["run", script], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: true,
    detached: process.platform !== "win32"
  });

  children.push({ label, child });
  child.on("exit", (code, signal) => {
    if (signal) {
      shutdown(signal);
      return;
    }
    if (code && code !== 0) {
      shutdown("exit");
      process.exitCode = code;
    }
  });

  return child;
}

function killTree(child) {
  if (!child?.pid) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", shell: true });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // already exited
    }
  }
}

let shuttingDown = false;

function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (reason !== "exit") {
    console.log("\nStopping dev servers...");
  }

  for (const { child } of children) {
    killTree(child);
  }

  setTimeout(() => {
    for (const { child } of children) {
      if (process.platform === "win32") continue;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {
          // already exited
        }
      }
    }
    process.exit(process.exitCode ?? 0);
  }, 1500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start("api", "dev:api");
start("web", "dev:web");
