---
title: Configuration
description: TOML examples, validation, and accepted values for each setting.
tableOfContents:
  maxHeadingLevel: 4
---

## Choose a setup

Copy one of the examples into `/etc/vigilo/vigilo.toml`. Use lowercase keys.

### Server only

Use a password file or a systemd credential to supply the admin password.

#### Password file

```toml title="/etc/vigilo/vigilo.toml"
[server.admin]
username = "admin"
password_file = "/run/secrets/vigilo-admin"
```

Save the password to `/run/secrets/vigilo-admin` and give the server read access.

#### systemd credential

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

#### HTTPS directly from Vigilo

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

#### Without built-in authentication

```toml title="/etc/vigilo/vigilo.toml"
[server]
auth = "none"
```

Omit `[server.admin]` in this mode. Any process that can reach Vigilo's loopback
listener can access the server. If you proxy it to other machines, require
authentication at the proxy and set the upstream `Host` header to the
loopback address, such as `127.0.0.1:8080`. Vigilo accepts only `localhost`
and loopback IPs in the `Host` header when built-in authentication is disabled.

### Agent only

```toml title="/etc/vigilo/vigilo.toml"
[agent]
name = "web-01"
```

### Server and agent

```toml title="/etc/vigilo/vigilo.toml"
[server]
listen = "127.0.0.1:8080"

[server.storage]
path = "/var/lib/vigilo/vigilo.db"

[server.admin]
username = "admin"
password_credential = "admin-password"

[agent]
name = "web-01"
```

Use the [systemd drop-in above](#systemd-credential) to supply `admin-password`.

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

The command validates every section without opening the password source
or TLS files.
Start the server with `vigilo server`, which uses the same config path
precedence. At startup, Vigilo checks the password and loads the configured
TLS pair before opening the listener.

## All settings

### Server

| Key | Default | Accepted values |
| --- | --- | --- |
| `server.listen` | `"127.0.0.1:8080"` | Host and a decimal port from 0 to 65535. A non-loopback address requires both TLS and password auth. Use brackets for IPv6, as in `"[::1]:8080"`. |
| `server.auth` | `"password"` | `"password"` for one configured admin, or `"none"` to disable built-in authentication |
| `server.tls.certificate_file` | None | Absolute path to the PEM certificate chain. Required if `server.tls` is present. |
| `server.tls.key_file` | None | Absolute path to the matching PEM private key. Required if `server.tls` is present. |
| `server.storage.path` | `"/var/lib/vigilo/vigilo.db"` | Absolute database path. Reserved for persistent check history. |
| `server.admin.username` | Required in password mode | Username on a single line without a colon |
| `server.admin.password_file` | None | Absolute password file path |
| `server.admin.password_credential` | None | Credential name containing ASCII letters, digits, dots, underscores, or hyphens. `.` and `..` are invalid. |

In password mode, choose one password source. The password must have at least
6 characters and at most 1,024 bytes on a single line. Vigilo removes a final
LF or CRLF when reading the file and preserves the other bytes. To rotate the
password, replace the secret and restart Vigilo.

The server uses HTTP Basic authentication in password mode. For remote
access, configure HTTPS directly in Vigilo or use an HTTPS reverse proxy
in front of its loopback listener. `GET /healthz` is available without
credentials in either mode.

### Agent

| Key | Default | Accepted values |
| --- | --- | --- |
| `agent.name` | Required | Machine name on a single line |
