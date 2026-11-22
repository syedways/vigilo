# Vigilo

Vigilo is a self-hosted uptime and resource monitor in development.

See the [Introduction](https://vigilo.syed.page/docs/introduction/) to learn where
to run the server and agents. [Configuration](https://vigilo.syed.page/reference/configuration/)
covers examples and settings.

## Development

Install [mise](https://mise.jdx.dev/getting-started.html) and start the development watcher.

```sh
mise install
mise run dev
```

Open <http://127.0.0.1:8080/> once Vigilo is listening. The default
[`vigilo.dev.toml`](vigilo.dev.toml) uses loopback HTTP with no authentication
or checks.

Use `mise run dev <path>` with an absolute or checkout-relative config path.
For configs with checks, set `server.storage.path` to an absolute, writable
location. The watcher reloads on changes to the config, `lisette.toml`, or
Lisette sources.

For one-off commands, use `mise run vigilo --help` or
`mise run vigilo config check path/to/vigilo.toml`.

List development tasks with `mise tasks`. Git hooks are installed automatically.

### Preview the docs

Run `mise run docs:preview` and open <http://localhost:8787/>. The Markdown source
lives in [`site/src/content/docs/`](site/src/content/docs/).
