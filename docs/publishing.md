# Published files

The catalog's source is the YAML in this repository. Consumers never read the YAML; they read the files CI publishes after every merge to `main`, at stable URLs on the project's GitHub Pages site (`<pages-url>` is `https://nathanielnoyd.github.io/open-credit-card-benefits`). The npm package ships the same files under `open-credit-card-benefits/data/*`:

```
<pages-url>/v0.3/index.json          # catalog version and a list of everything below
<pages-url>/v0.3/llms.txt            # entry point for AI agents: what's here and a link to every card
<pages-url>/v0.3/llms-full.txt       # every card's fact sheet in one plain-text file
<pages-url>/v0.3/cards.json          # one row per card: fee, summary, links
<pages-url>/v0.3/cards/<card id>.md  # fact sheet: today's terms in plain language
<pages-url>/v0.3/cards/<card id>.json  # full record: history plus `current`, today's terms for a new applicant
<pages-url>/v0.3/benefits.jsonl      # one row per current benefit, for search indexes
<pages-url>/v0.3/glossary.json       # what every kind, key, category, condition and currency means
<pages-url>/v0.3/catalog.json        # the full bundle: cards, benefits, releases, currencies, taxonomy (facts only; values are app inputs)
<pages-url>/v0.3/releases.json       # every release, newest first
<pages-url>/v0.3/directory.json      # access directory venues
<pages-url>/v0.3/value-sets/example.json  # example value set: opinions of what perks and points are worth, not facts
<pages-url>/v0.3/csv/*.csv           # spreadsheet projection (spec section 14)
```

The path carries the spec version, so a breaking spec change publishes to a new path and older consumers keep working. `catalog_version` in `index.json` changes on every build; compare it to decide whether to refetch.

Tagging a commit `vX.Y.Z` also attaches the built files to a GitHub Release, so any past catalog can be downloaded exactly.

## Consuming the files

- **Websites and servers** fetch `catalog.json` or the per-card files on a schedule, or on each new `catalog_version`.
- **AI agents** start at `llms.txt`, read a card's Markdown fact sheet to answer questions, and cite benefit IDs and source URLs. `glossary.json` explains every code they meet.
- **Apps** fetch `cards.json` for search and pickers, and a card's JSON for full terms; `current` holds today's terms, so most apps never replay release history.
- **Valuation** needs `catalog.json` (about 2.5 MB) and the reference engine.
- **Search and retrieval indexes** load `benefits.jsonl`.
- **Spreadsheets** import the CSVs.
- **Change watchers** poll `releases.json`.

APIs and MCP servers are left to implementers, built on these files (spec section 14).

## Setup for a new fork

In the repository settings, set Pages to deploy from GitHub Actions. The `publish` workflow does the rest.
