import { execSync } from "node:child_process";

const ports = [8080, 3000];

for (const port of ports) {
  try {
    const output = execSync(`lsof -ti :${port}`, { encoding: "utf8" }).trim();
    if (!output) continue;

    for (const pid of output.split("\n").filter(Boolean)) {
      try {
        process.kill(Number(pid), "SIGKILL");
        console.log(`Killed PID ${pid} on port ${port}`);
      } catch (error) {
        console.warn(`Could not kill PID ${pid} on port ${port}:`, error.message);
      }
    }
  } catch {
    console.log(`Port ${port} is free`);
  }
}
