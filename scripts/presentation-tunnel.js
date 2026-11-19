const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { createInterface } = require("node:readline");

function findCloudflared() {
  const candidates = [
    process.env.CLOUDFLARED_PATH,
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "cloudflared", "cloudflared.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "cloudflared", "cloudflared.exe"),
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate)) || "cloudflared";
}

function forwardTunnelOutput(stream, destination) {
  const lines = createInterface({ input: stream });
  lines.on("line", (line) => {
    if (line.includes("Thank you for trying Cloudflare Tunnel.")) return;
    destination.write(`${line}\n`);
  });
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const connection = net.createConnection({ host: "127.0.0.1", port });
    connection.once("connect", () => {
      connection.destroy();
      resolve(true);
    });
    connection.once("error", () => resolve(false));
    connection.setTimeout(2_000, () => {
      connection.destroy();
      resolve(false);
    });
  });
}

async function isBackendReady() {
  try {
    const response = await fetch("http://127.0.0.1:3001/api/v1/health", {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApp() {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const [frontendReady, backendReady] = await Promise.all([
      isPortOpen(3000),
      isBackendReady(),
    ]);
    if (frontendReady && backendReady) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("The frontend and backend did not become ready. Check their startup logs above.");
}

async function main() {
  await waitForApp();
  console.log("Local storefront: http://localhost:3000");
  console.log("Backend API: http://localhost:3001");
  console.log("The app is ready. Starting a temporary public tunnel; its public URL will appear below.");

  const tunnel = spawn(findCloudflared(), ["tunnel", "--url", "http://localhost:3000"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  forwardTunnelOutput(tunnel.stdout, process.stdout);
  forwardTunnelOutput(tunnel.stderr, process.stderr);

  process.on("SIGINT", () => tunnel.kill());
  process.on("SIGTERM", () => tunnel.kill());
  tunnel.on("error", (error) => {
    if ("code" in error && error.code === "ENOENT") {
      console.error("cloudflared was not found. Install it with: winget install --id Cloudflare.cloudflared --exact");
    } else {
      console.error(`Could not start Cloudflare Tunnel: ${error.message}`);
    }
    process.exitCode = 1;
  });
  tunnel.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Could not start the presentation tunnel.");
  process.exitCode = 1;
});
