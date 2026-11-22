import { $ } from "bun";
import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { chmod, mkdtempDisposable } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const binary = join(import.meta.dir, "../target/.lisette/bin/vigilo");
const fixturePrefix = join(tmpdir(), "vigilo-integration-");
const testTimeoutMs = 12_000;
const requestTimeoutMs = 2_000;
const readinessLine = /^server: listening on (https?:\/\/127\.0\.0\.1:\d+)\r?\n/m;
const processOptions = { env: {}, stderr: "pipe", timeout: 8_000, killSignal: "SIGKILL" } as const;

function runVigilo(args: string[], expectedCode = 0) {
  const { exitCode, signalCode, stdout, stderr } = Bun.spawnSync([binary, ...args], processOptions);
  const error = stderr.toString();
  expect(exitCode, signalCode ? `vigilo received ${signalCode}: ${error}` : error).toBe(expectedCode);
  return { stdout: stdout.toString(), stderr: error };
}

async function checkServer(
  configPath: string,
  signal: "SIGTERM" | "SIGINT",
  check?: (address: string) => Promise<void>,
) {
  const child = Bun.spawn([binary, "server", configPath], processOptions);
  const stderr = child.stderr.text();
  const ready = Promise.withResolvers<string>();
  let output = "";
  const stdout = child.stdout.pipeThrough(new TextDecoderStream()).pipeTo(
    new WritableStream<string>({
      write(chunk) {
        output += chunk;
        const address = readinessLine.exec(output)?.[1];
        if (address) ready.resolve(address);
      },
    }),
  );
  try {
    const address = await Promise.race([ready.promise, stdout.then(() => undefined)]);
    if (!address) {
      throw new Error(`server did not announce readiness\n${output}${await stderr}`);
    }

    await check?.(address);
    child.kill(signal);
    const exitCode = await child.exited;
    expect(exitCode, `server exited on ${signal}: ${await stderr}`).toBe(0);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
    await Promise.all([child.exited, stdout, stderr]);
  }
}

async function writeConfig(dir: string, settings: Record<string, unknown>, port = 0) {
  const path = join(dir, "vigilo.toml");
  const config = { server: { listen: `127.0.0.1:${port}`, ...settings } };
  await Bun.write(path, Bun.TOML.stringify(config));
  return path;
}

async function request(address: string, path: string, options?: RequestInit) {
  const response = await fetch(new URL(path, address), {
    ...options,
    proxy: false,
    signal: AbortSignal.timeout(requestTimeoutMs),
  });
  return { status: response.status, headers: response.headers, body: await response.text() };
}

describe("Server integration", () => {
  it("advertises the server command syntax", () => {
    const { stdout } = runVigilo(["server", "--help"]);
    expect(stdout).toContain("Usage: vigilo server [path]");
  }, testTimeoutMs);

  it("checks config without opening the password file", async () => {
    await using fixture = await mkdtempDisposable(fixturePrefix);
    const configPath = await writeConfig(fixture.path, {
      admin: { username: "admin", password_file: join(fixture.path, "missing-password") },
    });

    runVigilo(["config", "check", configPath]);
    const startup = runVigilo(["server", configPath], 1);
    expect(startup.stderr).toContain("open admin password");
    expect(startup.stdout).not.toMatch(readinessLine);
  }, 2 * testTimeoutMs);

  it("serves health requests and shuts down cleanly on SIGTERM", async () => {
    await using fixture = await mkdtempDisposable(fixturePrefix);
    const configPath = await writeConfig(fixture.path, { auth: "none" });
    await checkServer(configPath, "SIGTERM", async (address) => {
      const health = await request(address, "/healthz");
      expect(health.status).toBe(200);
      expect(health.body).toBe("ok\n");

      const post = await request(address, "/healthz", { method: "POST" });
      expect(post.status).toBe(405);
      expect(post.headers.get("allow")).toBe("GET");

      expect((await request(address, "/unknown")).status).toBe(404);
    });
  }, testTimeoutMs);

  it("serves the overview after authentication and keeps health public", async () => {
    await using fixture = await mkdtempDisposable(fixturePrefix);
    const password = "integration-test-password";
    const passwordPath = join(fixture.path, "admin-password");
    await Bun.write(passwordPath, `${password}\n`);
    const configPath = await writeConfig(fixture.path, {
      admin: { username: "admin", password_file: passwordPath },
    });

    await checkServer(configPath, "SIGTERM", async (address) => {
      expect((await request(address, "/healthz")).status).toBe(200);

      const cases = [
        { name: "no credentials", supplied: undefined, status: 401 },
        { name: "wrong password", supplied: "wrong", status: 401 },
        { name: "correct password", supplied: password, status: 200 },
      ];
      for (const { name, supplied, status } of cases) {
        const headers = new Headers();
        if (supplied !== undefined) {
          headers.set("authorization", `Basic ${btoa(`admin:${supplied}`)}`);
        }
        const response = await request(address, "/", { headers });
        expect(response.status, name).toBe(status);
        if (status === 401) {
          expect(response.headers.get("www-authenticate"), name).toMatch(/^Basic\b/);
        } else {
          expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
          expect(response.body).toContain("<h1>Server overview</h1>");
          expect(response.body).toContain("<dt>Uptime</dt>");
          expect(response.body).toMatch(/datetime='\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ'/);
        }
      }
    });
  }, testTimeoutMs);

  it("serves HTTPS with the configured certificate and key", async () => {
    await using fixture = await mkdtempDisposable(fixturePrefix);
    // use the pinned go distribution's certificate generator in the temporary fixture.
    const goRoot = (await $`go env GOROOT`.text()).trim();
    const generator = join(goRoot, "src/crypto/tls/generate_cert.go");
    await $`go run ${generator} -host 127.0.0.1 -duration 1h -ed25519`.cwd(fixture.path).quiet();
    const certPath = join(fixture.path, "cert.pem");
    const configPath = await writeConfig(fixture.path, {
      auth: "none",
      tls: { certificate_file: certPath, key_file: join(fixture.path, "key.pem") },
    });

    await checkServer(configPath, "SIGTERM", async (address) => {
      expect(new URL(address).protocol).toBe("https:");
      const health = await request(address, "/healthz", {
        tls: { ca: Bun.file(certPath), rejectUnauthorized: true },
      });
      expect(health.status).toBe(200);
      expect(health.body).toBe("ok\n");
    });
  }, 45_000);

  it("shuts down cleanly on SIGINT", async () => {
    await using fixture = await mkdtempDisposable(fixturePrefix);
    const dbPath = join(fixture.path, "unused.db");
    const configPath = await writeConfig(fixture.path, { auth: "none", storage: { path: dbPath } });
    await checkServer(configPath, "SIGINT", async (address) => {
      const checks = await request(address, "/checks");
      expect(checks.status).toBe(200);
      expect(checks.body).toContain("No HTTP checks configured.");
    });
    expect(await Bun.file(dbPath).exists()).toBe(false);
  }, testTimeoutMs);

  it("keeps authenticated HTTP check history across a restart", async () => {
    await using fixture = await mkdtempDisposable(fixturePrefix);
    let status = 200;
    using target = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("fixture", { status }),
    });
    const passwordPath = join(fixture.path, "admin-password");
    const password = "integration-test-password";
    await Bun.write(passwordPath, password);
    const configPath = await writeConfig(fixture.path, {
      admin: { username: "admin", password_file: passwordPath },
      storage: { path: join(fixture.path, "checks.db") },
      checks: { site: { url: target.url.href, interval: "1s" } },
    });
    const route = "/api/checks/site/history";
    const headers = { authorization: `Basic ${btoa(`admin:${password}`)}` };
    type Sample = { checked_at_ms: number; duration_ms: number; outcome: string; status_code: number };

    async function history(address: string): Promise<Sample[]> {
      const response = await request(address, route, { headers });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      return JSON.parse(response.body);
    }

    async function waitForSample(address: string, code: number) {
      const deadline = performance.now() + 4_000;
      do {
        const sample = (await history(address)).find((row) => row.status_code === code);
        if (sample) return sample;
        await Bun.sleep(25);
      } while (performance.now() < deadline);
      throw new Error(`no stored result with HTTP status ${code}`);
    }

    let beforeRestart: Sample[] = [];
    await checkServer(configPath, "SIGTERM", async (address) => {
      expect((await request(address, route)).status).toBe(401);
      expect((await request(address, "/checks")).status).toBe(401);
      expect((await request(address, route, { method: "POST", headers })).status).toBe(405);
      expect((await request(address, "/api/checks/unknown/history", { headers })).status).toBe(404);
      const up = await waitForSample(address, 200);
      expect(up.outcome).toBe("up");
      status = 503;
      const down = await waitForSample(address, 503);
      expect(down.outcome).toBe("down");
      expect(down.duration_ms).toBeGreaterThanOrEqual(0);
      beforeRestart = [up, down];
    });
    await checkServer(configPath, "SIGTERM", async (address) => {
      expect(await history(address)).toEqual(expect.arrayContaining(beforeRestart));
      const overview = await request(address, "/", { headers });
      expect(overview.body).toContain("href='/checks'");
      const checks = await request(address, "/checks?check=site", { headers });
      expect(checks.status).toBe(200);
      expect(checks.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(checks.body).toContain("<h2>History for site</h2>");
      expect(checks.body).toContain("<td>Up</td>");
      expect(checks.body).toContain("<td>Down</td>");
      expect(checks.body).toContain("<td>503</td>");
      expect((await request(address, "/checks?check=unknown", { headers })).status).toBe(404);
    });
  }, testTimeoutMs);

  it("refuses to start with a newer history schema without switching it to WAL", async () => {
    await using fixture = await mkdtempDisposable(fixturePrefix);
    const dbPath = join(fixture.path, "checks.db");
    {
      using database = new Database(dbPath);
      database.run("PRAGMA user_version = 2");
    }
    await chmod(dbPath, 0o600);
    const configPath = await writeConfig(fixture.path, {
      auth: "none",
      storage: { path: dbPath },
      checks: { site: { url: "http://127.0.0.1:0/" } },
    });

    const { stdout, stderr } = runVigilo(["server", configPath], 1);
    expect(stderr).toContain("open check history: database schema is newer");
    expect(stdout).not.toMatch(readinessLine);

    using database = new Database(dbPath, { readonly: true });
    expect(database.query("PRAGMA user_version").get()).toEqual({ user_version: 2 });
    expect(database.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "delete" });
    expect(database.query("SELECT name FROM sqlite_schema WHERE type = 'table'").all()).toEqual([]);
  }, testTimeoutMs);

  it("reports a bind failure before announcing readiness", async () => {
    await using fixture = await mkdtempDisposable(fixturePrefix);
    using occupied = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data() {} },
    });
    const configPath = await writeConfig(fixture.path, { auth: "none" }, occupied.port);
    const { stdout, stderr } = runVigilo(["server", configPath], 1);
    expect(stderr).toContain("listen");
    expect(stderr).toContain("address already in use");
    expect(stdout).not.toMatch(readinessLine);
  }, testTimeoutMs);
});
