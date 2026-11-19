---
title: Configuration
description: TOML examples, validation, and accepted values for each setting.
tableOfContents:
  maxHeadingLevel: 4
---

## Choose a setup

Copy one of the examples into `/etc/vigilo/vigilo.toml`. Use lowercase keys.

### Server only

Set the admin password using one of the options below. Both use the default
listen address and database path.

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

The command validates every section. Before starting the server, separately
confirm it can read the password source, open the database, and bind to the
configured address.

## All settings

### Server

| Key | Default | Accepted values |
| --- | --- | --- |
| `server.listen` | `"127.0.0.1:8080"` | `host:port` with a decimal port from 0 to 65535. Use brackets for IPv6, as in `"[::1]:8080"`. |
| `server.storage.path` | `"/var/lib/vigilo/vigilo.db"` | Absolute SQLite database path |
| `server.admin.username` | Required | Username on a single line |
| `server.admin.password_file` | None | Absolute password file path |
| `server.admin.password_credential` | None | Credential name containing ASCII letters, digits, dots, underscores, or hyphens. `.` and `..` are invalid. |

Choose one password source. Use 1 to 1,024 bytes on a single line. Vigilo
removes a final LF or CRLF and keeps spaces and tabs.

### Agent

| Key | Default | Accepted values |
| --- | --- | --- |
| `agent.name` | Required | Machine name on a single line |
