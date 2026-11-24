import { Database } from "bun:sqlite";
import { expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdtempDisposable } from "node:fs/promises";
import { join } from "node:path";
import { checkProcess, checkServer, fixturePrefix, request, runVigilo, testTimeoutMs, writeConfig, writeToml } from "./fixtures";

const ack = /^(agent: heartbeat acknowledged)\r?$/m;

it("authenticates a real agent, keeps its contact across restart, and shuts down both processes", async () => {
  await using fixture = await mkdtempDisposable(fixturePrefix);
  const dir = fixture.path;
  const token = randomBytes(32).toString("hex");
  const storagePath = join(dir, "state.db");
  const tokenFile = join(dir, "web-token");
  const otherTokenFile = join(dir, "worker-token");
  const passwordFile = join(dir, "admin-password");
  const password = "agent-test-admin-password";
  await Bun.write(tokenFile, `${token}\n`);
  await Bun.write(otherTokenFile, randomBytes(32).toString("hex"));
  await Bun.write(passwordFile, password);
  const config = await writeConfig(dir, {
    admin: { username: "admin", password_file: passwordFile },
    storage: { path: storagePath },
    agents: { worker: { token_file: otherTokenFile }, web: { token_file: tokenFile } },
  });
  const admin = { headers: { authorization: `Basic ${btoa(`admin:${password}`)}` } };
  const heartbeat = "/api/agents/heartbeat";
  let lastContact: string | undefined;

  await checkServer(config, "SIGTERM", async (address) => {
    expect((await request(address, "/agents")).status).toBe(401);
    const before = await request(address, "/agents", admin);
    expect(before.status).toBe(200);
    expect(before.body.match(/Never seen/g)).toHaveLength(2);
    const names = Array.from(before.body.matchAll(/<th scope='row'>([^<]+)<\/th>/g), ([, name]) => name);
    expect(names).toEqual(["web", "worker"]);
    const wrongMethod = await request(address, heartbeat);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
    for (const [body, authorization, status] of [
      ['{"name":"worker"}', `Bearer ${token}`, 401],
      ['{"name":"unknown"}', `Bearer ${token}`, 401],
      ['{"name":"web"}', admin.headers.authorization, 401],
      ['{"name":', `Bearer ${token}`, 400],
      ['{"name":"web","extra":"1"}', `Bearer ${token}`, 400],
      ['{"NAME":"web"}', `Bearer ${token}`, 400],
      [" ".repeat(1025), `Bearer ${token}`, 413],
    ] as const) {
      const rejected = await request(address, heartbeat, { method: "POST", body, headers: { authorization } });
      expect(rejected.status).toBe(status);
      if (status === 401) {
        expect(rejected.headers.get("www-authenticate")).toBe("Bearer");
      }
    }
    const stillUnseen = await request(address, "/agents", admin);
    expect(stillUnseen.body.match(/Never seen/g)).toHaveLength(2);

    const agentConfig = await writeToml(dir, "agent.toml", {
      agent: { name: "web", server_url: address, token_file: tokenFile },
    });
    await checkProcess("agent", agentConfig, ack, "SIGINT", async () => {
      const after = await request(address, "/agents", admin);
      expect(after.status).toBe(200);
      expect(after.body).toContain(">web</th><td>Online</td>");
      expect(after.body).toContain(">worker</th><td>Never seen</td>");
      lastContact = /datetime='([^']+Z)'/.exec(after.body)?.[1];
      expect(lastContact).toBeDefined();
    });
  });

  await checkServer(config, "SIGINT", async (address) => {
    const page = await request(address, "/agents", admin);
    expect(page.status).toBe(200);
    expect(page.body).toContain(`datetime='${lastContact}'`);
    expect(page.body).toContain(">web</th><td>Online</td>");
  });

  // removing an agent prunes its stored contact so reusing the name starts unseen.
  const withoutWeb = await writeToml(dir, "without-web.toml", {
    server: {
      listen: "127.0.0.1:0",
      admin: { username: "admin", password_file: passwordFile },
      storage: { path: storagePath },
      agents: { worker: { token_file: otherTokenFile } },
    },
  });
  await checkServer(withoutWeb, "SIGINT", async (address) => {
    const page = await request(address, "/agents", admin);
    expect(page.status).toBe(200);
    expect(page.body).not.toContain(">web</th>");
  });

  await checkServer(config, "SIGINT", async (address) => {
    const page = await request(address, "/agents", admin);
    expect(page.status).toBe(200);
    expect(page.body).toContain(">web</th><td>Never seen</td>");

    using db = new Database(storagePath, { create: false });
    db.run("DROP TABLE agent_contacts");
    const unavailable = await request(address, heartbeat, {
      method: "POST",
      body: '{"name":"web"}',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(unavailable.status).toBe(503);
  });
}, testTimeoutMs);

it("rejects duplicate tokens on startup regardless of hex case", async () => {
  await using fixture = await mkdtempDisposable(fixturePrefix);
  const token = "a".repeat(64);
  const first = join(fixture.path, "first");
  const second = join(fixture.path, "second");
  await Bun.write(first, token);
  await Bun.write(second, token.toUpperCase());
  const config = await writeConfig(fixture.path, {
    auth: "none",
    agents: { first: { token_file: first }, second: { token_file: second } },
  });
  runVigilo(["config", "check", config]);
  expect(runVigilo(["server", config], 1).stderr).toContain("distinct tokens");
}, testTimeoutMs);

it("checks a name-only config and requires reporting settings at startup", async () => {
  await using fixture = await mkdtempDisposable(fixturePrefix);
  const config = await writeToml(fixture.path, "agent.toml", { agent: { name: "Legacy machine" } });
  runVigilo(["config", "check", config]);
  expect(runVigilo(["agent", config], 1).stderr).toContain("requires server_url and a token source");
}, testTimeoutMs);
