import { expect } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const binary = process.env.VIGILO_TEST_BINARY ?? join(import.meta.dir, "../target/.lisette/bin/vigilo");
export const fixturePrefix = join(tmpdir(), "vigilo-integration-");
export const testTimeoutMs = 12_000;
const requestTimeoutMs = 2_000;
export const readinessLine = /^server: listening on (https?:\/\/127\.0\.0\.1:\d+)\r?\n/m;
const processOptions = { env: {}, stderr: "pipe", timeout: 8_000, killSignal: "SIGKILL" } as const;

export function runVigilo(args: string[], expectedCode = 0) {
  const { exitCode, signalCode, stdout, stderr } = Bun.spawnSync([binary, ...args], processOptions);
  const error = stderr.toString();
  expect(exitCode, signalCode ? `vigilo received ${signalCode}: ${error}` : error).toBe(expectedCode);
  return { stdout: stdout.toString(), stderr: error };
}

export function checkServer(
  configPath: string,
  signal: "SIGTERM" | "SIGINT",
  check?: (address: string) => Promise<void>,
) {
  return checkProcess("server", configPath, readinessLine, signal, check);
}

export async function checkProcess(
  role: "server" | "agent",
  configPath: string,
  readyLine: RegExp,
  signal: "SIGTERM" | "SIGINT",
  check?: (match: string) => Promise<void>,
) {
  const child = Bun.spawn([binary, role, configPath], processOptions);
  const stderr = child.stderr.text();
  const ready = Promise.withResolvers<string>();
  let output = "";
  const stdout = child.stdout.pipeThrough(new TextDecoderStream()).pipeTo(
    new WritableStream<string>({
      write(chunk) {
        output += chunk;
        const address = readyLine.exec(output)?.[1];
        if (address) ready.resolve(address);
      },
    }),
  );
  try {
    const address = await Promise.race([ready.promise, stdout.then(() => undefined)]);
    if (!address) {
      throw new Error(`${role} did not announce readiness\n${output}${await stderr}`);
    }

    await check?.(address);
    child.kill(signal);
    const exitCode = await child.exited;
    expect(exitCode, `${role} exited on ${signal}: ${await stderr}`).toBe(0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    await Promise.all([child.exited, stdout, stderr]);
  }
}

export async function writeConfig(dir: string, settings: Record<string, unknown>, port = 0) {
  return writeToml(dir, "vigilo.toml", { server: { listen: `127.0.0.1:${port}`, ...settings } });
}

export async function writeToml(dir: string, filename: string, config: Record<string, unknown>) {
  const path = join(dir, filename);
  await Bun.write(path, Bun.TOML.stringify(config));
  return path;
}

export async function request(address: string, path: string, options?: RequestInit) {
  const response = await fetch(new URL(path, address), {
    ...options,
    proxy: false,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  return { status: response.status, headers: response.headers, body: await response.text() };
}
