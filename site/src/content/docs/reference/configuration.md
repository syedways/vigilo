---
title: Configuration
description: TOML examples, validation, and accepted values for each setting.
tableOfContents:
  maxHeadingLevel: 4
---

## Configure the server

Use lowercase keys in `/etc/vigilo/vigilo.toml`. Choose how the server receives
its admin password and whether it serves HTTPS directly.

### Password file

```toml title="/etc/vigilo/vigilo.toml"
[server.admin]
username = "admin"
password_file = "/run/secrets/vigilo-admin"
```

Save the password to `/run/secrets/vigilo-admin` and give the server read access.

### systemd credential

```toml title="/etc/vigilo/vigilo.toml"
[server.admin]
username = "admin"
password_credential = "admin-password"
```

Save the password to `/run/secrets/vigilo-admin` and add this drop-in to the
systemd service that runs the server.

```ini
[Service]
LoadCredential=admin-password:/run/secrets/vigilo-admin
```

The credential name `admin-password` matches `password_credential` in the TOML.

### HTTPS directly from Vigilo

```toml title="/etc/vigilo/vigilo.toml"
[server]
listen = "0.0.0.0:8443"

[server.admin]
username = "admin"
password_file = "/run/secrets/vigilo-admin"

[server.tls]
certificate_file = "/run/secrets/vigilo-tls/fullchain.pem"
key_file = "/run/secrets/vigilo-tls/privkey.pem"
```

Use a PEM certificate chain for the hostname clients connect to and its
matching PEM private key. Give the server read access to both files, and
restrict access to the private key. Restart Vigilo to load a renewed
certificate. By default, Vigilo listens on loopback. Set `listen` explicitly
to serve HTTPS on another interface.

### Without built-in authentication

```toml title="/etc/vigilo/vigilo.toml"
[server]
auth = "none"
```

Omit `[server.admin]` in this mode. Any process that can reach Vigilo's loopback
listener can access the server. If you proxy it to other machines, require
authentication at the proxy and set the upstream `Host` header to the
loopback address, such as `127.0.0.1:8080`. Vigilo accepts only `localhost`
and loopback IPs in the `Host` header when built-in authentication is disabled.

### Server storage

If you configure HTTP checks or register agents, create the parent directory
for `server.storage.path` and restrict read and write access to the server's
service user.

## Validate the file

Pass a path to `vigilo config check` or set `VIGILO_CONFIG_PATH`. A command-line
path takes priority. If you omit the path and the variable is empty or unset,
Vigilo reads `/etc/vigilo/vigilo.toml`. Relative paths start from your working
directory.

```sh
vigilo config check
VIGILO_CONFIG_PATH=/path/to/vigilo.toml vigilo config check
vigilo config check ./vigilo.toml
```

The command validates every section without reading secrets, opening TLS files,
or creating a database. Start the roles with `vigilo server [path]` and
`vigilo agent [path]`. Both use the same config lookup order and load their
credentials at startup.

## Monitor an HTTP endpoint

Add a named check to your server configuration. Vigilo probes the URL when the
server starts and waits for the configured interval between attempts.

```toml title="/etc/vigilo/vigilo.toml"
[server.checks.homepage]
url = "https://example.com/"
interval = "1m"
```

Open Vigilo in your browser and select **Checks** to see each check's latest
result. Select a check to see its recent history.

Vigilo records `up` for HTTP 2xx, `down` for other HTTP statuses, `timeout` when
the five-second deadline expires, and `error` for other request failures.
Checks do not follow redirects. Results older than seven days are removed as
new results are recorded.

## Set up agent reporting

Generate a separate token for each machine.

```sh
umask 077
openssl rand -hex 32 > vigilo-web-01
```

Install the token at `/run/secrets/vigilo-web-01` on the server and its assigned
machine. Give each service user read access. Add the registration to the server
configuration.

```toml
[server.agents.web-01]
token_file = "/run/secrets/vigilo-web-01"
```

Use the same machine name and token on the agent.

```toml
[agent]
name = "web-01"
server_url = "https://vigilo.example.com"
token_file = "/run/secrets/vigilo-web-01"
```

For a remote server, use its HTTPS origin. The agent uses the machine's system
trust store. On a trusted host running both roles, you can keep both tables in
one file and use `http://127.0.0.1:8080` for the default loopback listener.
Loopback HTTP trusts the local process listening on that port.

For systemd credentials, replace both `token_file` entries with
`token_credential = "web-01-token"` and set
`LoadCredential=web-01-token:/run/secrets/vigilo-web-01` in both units.

Restart the server after adding a registration. Start the agent once the server
has loaded the registration, and restart both after rotating the token.
The agent reports immediately and every 30 seconds, with a five-second timeout.
Open **Agents** to see the last contact in UTC. A machine is **Never seen** until
its first report, **Online** for 90 seconds after its latest report, and
**Offline** after that.

## All settings

### Server

| Key | Default | Accepted values |
| --- | --- | --- |
| `server.listen` | `"127.0.0.1:8080"` | Host and a decimal port from 0 to 65535. A non-loopback address requires both TLS and password auth. Use brackets for IPv6, as in `"[::1]:8080"`. |
| `server.auth` | `"password"` | `"password"` for one configured admin, or `"none"` to disable built-in authentication |
| `server.tls.certificate_file` | None | Absolute path to the PEM certificate chain. Required if `server.tls` is present. |
| `server.tls.key_file` | None | Absolute path to the matching PEM private key. Required if `server.tls` is present. |
| `server.storage.path` | `"/var/lib/vigilo/vigilo.db"` | Absolute SQLite database path for check history and agent contacts. |
| `server.checks.<name>.url` | Required for each check | HTTP or HTTPS URL without credentials or a fragment. Names use lowercase ASCII letters, digits, hyphens, or underscores. |
| `server.checks.<name>.interval` | `"1m"` | A duration of at least one second, such as `"30s"` or `"5m"`. |
| `server.agents.<name>.token_file` | None | Absolute path to the machine's token file. Choose one token source per registration. |
| `server.agents.<name>.token_credential` | None | systemd credential name for the machine's token. |
| `server.admin.username` | Required in password mode | Username on a single line without a colon |
| `server.admin.password_file` | None | Absolute password file path |
| `server.admin.password_credential` | None | Credential name containing ASCII letters, digits, dots, underscores, or hyphens. `.` and `..` are invalid. |

In password mode, choose one password source. The password must have at least
6 characters and at most 1,024 bytes on a single line. Vigilo removes a final
LF or CRLF when reading the file and preserves the other bytes. To rotate the
password, replace the secret and restart Vigilo.

The server uses HTTP Basic authentication in password mode. For remote
access, configure HTTPS directly in Vigilo or use an HTTPS reverse proxy
in front of its loopback listener.

### Agent

| Key | Default | Accepted values |
| --- | --- | --- |
| `agent.name` | Required | Matches the server registration. Names used for reporting contain 1 to 1,013 lowercase ASCII letters, digits, hyphens, or underscores. |
| `agent.server_url` | None | HTTPS origin or HTTP origin with a literal loopback IP. |
| `agent.token_file` | None | Absolute path to the machine's token file. |
| `agent.token_credential` | None | systemd credential name for the machine's token. |

To start an agent, supply `server_url` and choose one token source. A name-only
section is valid for config checks. Each token is 64 hexadecimal characters
with an optional final newline (LF or CRLF).
