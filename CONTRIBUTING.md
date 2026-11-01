# Contributing

Thanks for improving Token & Balance.

## Development

No build step is required. The package is plain ESM on the Host side and a
browser CommonJS factory in `client.js`.

```powershell
npm run check
npm test
```

- `tests/smoke.mjs` covers the three rendered layouts with a minimal React stub.
- `tests/live.mjs` simulates Assistant stream chunks, provider usage, and
  settlement with an in-memory event source.

Both tests are self-contained and require no DSH installation.

## Local install

The intended install path is the DSH Plugin Manager. For a manual profile link,
see [README.md](README.md#安装). Do not commit generated profile files,
`node_modules`, `.testhome`, or browser test profiles.

## Pull requests

- Keep the plugin’s data sources to existing authenticated DSH services.
- Do not read Session message content; the live estimator only counts streamed
  character lengths and provider usage numbers.
- Keep visible copy in both `zh` and `en`.
- Include a short test or a manual verification note for behavior changes.
- Do not include credentials, session logs, screenshots containing private
  conversations, or extracted DSH implementation code.

## Security

This plugin never handles an account token directly. Balance reads go through
the Account Remote namespace already provided by DSH. Report security issues
privately to the repository owner rather than in a public issue.
