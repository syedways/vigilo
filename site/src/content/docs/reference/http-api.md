---
title: HTTP API
description: Endpoints, authentication, and response formats for the Vigilo server.
---

## Server health

`GET /healthz` returns `200` and the text `ok` when the server is responding.
It is available without credentials.

## Check history

`GET /api/checks/<name>/history` returns up to 100 results for a configured check,
newest first. Use HTTP Basic authentication when the server runs in password
mode.

| Field | Meaning |
| --- | --- |
| `checked_at_ms` | Unix timestamp in milliseconds when the check began. |
| `duration_ms` | Check duration in milliseconds. |
| `outcome` | `up` for HTTP 2xx, `down` for other HTTP statuses, `timeout` for a deadline expiry, or `error` for another request failure. |
| `status_code` | HTTP status, present when the target sent a response. |

A configured check with no stored results returns `[]`. An unknown check returns
`404`. Missing or invalid credentials in password mode return `401`.
