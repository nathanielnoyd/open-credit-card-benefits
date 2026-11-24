# Contributing

Corrections are welcome as issues or pull requests.

- **Catalog changes:** follow [`docs/maintaining.md`](docs/maintaining.md). A change in terms is a new version plus a dated release with sources; never edit history.
- **Engine, schema or spec changes:** include tests and a line under **Unreleased** in [`CHANGELOG.md`](CHANGELOG.md).
- **AI agents:** follow [`AGENTS.md`](AGENTS.md).

Run `npm run check` before opening a pull request. In the description, list each change with its source. If numbers in `conformance/valuation/` moved, explain why.

## Licensing

By contributing, you agree that your contribution is licensed under the license of the part you change: CC BY 4.0 for the spec text and catalog data, and Apache 2.0 for code, schemas and tools. Catalog facts must come from public sources. Write summaries in your own words rather than copying issuer or review text.
