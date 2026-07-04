# Automated Web

[![Validate](https://github.com/arsenstorm/automated-web/actions/workflows/validate.yml/badge.svg)](https://github.com/arsenstorm/automated-web/actions/workflows/validate.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/arsenstorm/automated-web/badge)](https://scorecard.dev/viewer/?uri=github.com/arsenstorm/automated-web)

A browser extension for automating repetitive web tasks.

## Development

```sh
bun install
bun run dev          # start dev, then load .output/chrome-mv3 as unpacked
bun run build        # production build
bun run zip          # package for the store
```

## Scripts

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `bun run check`   | Lint + format check (Ultracite)      |
| `bun run fix`     | Auto-fix lint/format                 |
| `bun run compile` | TypeScript typecheck                 |
| `bun run test`    | Unit tests (Vitest)                  |
| `bun run build`   | Build the extension                  |

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Security issues: [`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE)
