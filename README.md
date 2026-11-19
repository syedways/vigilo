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

List development tasks with `mise tasks`. Git hooks are installed automatically.

### Preview the docs

Run `mise run docs:preview` and open <http://localhost:8787/>. The Markdown source
lives in [`site/src/content/docs/`](site/src/content/docs/).
