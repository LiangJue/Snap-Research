# Snap Research API

This local prototype server keeps the provider key outside the browser extension.

Set the environment variables from `.env.example`, then run:

```powershell
$env:OPENAI_API_KEY='your-key'
npm run research:server
```

The start command enables Node's environment-proxy support, so `HTTP_PROXY`,
`HTTPS_PROXY`, and `NO_PROXY` are honored when present.

Build the extension with `SYNCNOS_RESEARCH_API_URL` when the endpoint is not
`http://127.0.0.1:8787/v1/research`.

The prototype defaults to one concurrent task and 20 Research Reports per UTC
day per server process. All tasks and retries inside the same Report share one
daily use. Deployments should replace the in-memory quota with durable,
per-user accounting and authentication.
