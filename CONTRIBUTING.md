# Contributing

Thanks for your interest in improving Automated Web.

## Getting started

```sh
bun install
bun run dev          # load .output/chrome-mv3 as an unpacked extension
```

## Before opening a pull request

Run the same checks CI runs:

```sh
bun run check        # lint + format (Ultracite / Biome)
bun run compile      # typecheck
bun run test         # unit tests (Vitest)
bun run build        # production build
```

`bun run fix` auto-fixes most lint/format issues. A pre-commit hook runs the
formatter on staged files automatically.

## Coding standards

Code style and conventions are enforced by [Ultracite](https://ultracite.ai)
(a Biome preset). See [`AGENTS.md`](./AGENTS.md) for the full guide. Formatting
is not a matter of opinion here — let the tooling handle it.

## Reporting issues

Use the issue templates for bugs and feature requests. For security issues, see
[`SECURITY.md`](./SECURITY.md).
