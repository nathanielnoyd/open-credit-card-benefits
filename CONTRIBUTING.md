# Contributing

Issues and pull requests are welcome, especially card terms the draft spec can't express.

- **Spec, schema or engine changes:** follow [Changing the spec](docs/maintaining.md#changing-the-spec). Include tests and a line under **Unreleased** in [`CHANGELOG.md`](CHANGELOG.md).
- **Reference catalog fixes:** a change in terms is a new version plus a dated release with sources; never edit history. See [`docs/maintaining.md`](docs/maintaining.md).
- **AI agents:** follow [`AGENTS.md`](AGENTS.md).

Run `npm run check` before opening a pull request. In the description, list each change with its source. If numbers in `conformance/valuation/` moved, explain why.

## Licensing

By contributing, you agree that your contribution is licensed under the license of the part you change: CC BY 4.0 for the spec text and catalog data, and Apache 2.0 for code, schemas and tools. Catalog facts must come from public sources. Write summaries in your own words rather than copying issuer or review text.
