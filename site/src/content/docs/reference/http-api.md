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

## Agent heartbeat

`POST /api/agents/heartbeat` accepts a JSON body of up to 1 KiB with the
configured machine name, such as `{"name":"web-01"}`. Send the machine's token
in the `Authorization: Bearer <token>` header. The server records its own
timestamp when it accepts the heartbeat.

| Status | Meaning |
| --- | --- |
| `204` | Heartbeat recorded. |
| `400` | Invalid JSON or heartbeat payload. |
| `401` | Unknown machine, missing or invalid token, or a token assigned to another machine. |
| `405` | Request method other than `POST`. |
| `413` | Request body exceeds 1 KiB. |
| `503` | The server could not write the heartbeat to SQLite. |

`GET /agents` shows configured machines and their last contact. It uses the
same admin authentication as the overview and checks pages.
