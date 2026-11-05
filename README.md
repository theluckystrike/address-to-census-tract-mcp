# address-to-census-tract-mcp

Address to census tract for AI assistants. Give a US street address or a latitude and longitude and get the exact census tract, block group, block, county FIPS and districts from the US Census Bureau Geocoder.

This is a Model Context Protocol (MCP) server. It calls the Census Geocoder at call time. It needs no API key.

## Tools

| Tool | What it returns |
| --- | --- |
| `get_census_tract_for_address` | The matched address, latitude and longitude, 11-digit tract GEOID and tract number, block group and block GEOIDs, state and county FIPS, incorporated place, county subdivision, congressional district, state senate and house districts, urban area and combined statistical area. |
| `get_census_tract_for_coordinates` | The same geographies for a latitude and longitude. |
| `explain_census_geoid` | A state, county, tract, block group or block GEOID split into its FIPS parts, with the tract number as Census shows it (012405 is 124.05). Works offline. |

Both lookup tools take an optional `vintage`. The default `current` uses today's geographies. `census2020` uses the 2020 Census geographies, and `acs2017` to `acs2026` match an American Community Survey release.

Every result has structured JSON, a one-paragraph summary, `as_of`, `source` (the exact Census Geocoder request), a data.census.gov profile link for the tract and `more` (a page on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=address-to-census-tract-mcp)).

## What it knows that your model does not

- Which census tract a given address is in. Tract lines follow streets, rivers and rail lines, and the two sides of one street can be in different tracts. A model cannot work that out from an address.
- The 11, 12 and 15 digit GEOIDs that census data, CRA, LIHTC and grant eligibility lists are keyed on.
- The congressional and state legislative districts the Census Bureau currently publishes for that point.

## Install

### Hosted (Claude.ai custom connector, ChatGPT developer mode)

Paste this URL. No token, no sign-up. It works now.

```
https://address-to-census-tract-mcp.lipmichal.workers.dev/mcp
```

### Claude Code

```
claude mcp add --transport http census-tract https://address-to-census-tract-mcp.lipmichal.workers.dev/mcp
```

### Claude Desktop

Claude Desktop adds remote servers under Settings, Connectors, Add custom connector. Paste the URL above.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "census-tract": { "url": "https://address-to-census-tract-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "census-tract": { "type": "http", "url": "https://address-to-census-tract-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### Local stdio (after npm release)

The npm package is not published yet. After it is, run it locally with Node 20 or newer:

```
claude mcp add census-tract -- npx -y address-to-census-tract-mcp
```

## Example prompts

- "What census tract is 1 Dr Carlton B Goodlett Pl, San Francisco, CA 94102 in?"
- "Give me the 11-digit tract GEOID and block group for this address."
- "Which census tract and congressional district is 41.8827, -87.6237 in?"
- "What is the 2020 census tract for 1600 Pennsylvania Ave NW, Washington, DC?"
- "What does GEOID 060750124053007 mean?"

## Data sources

Full list with fetch dates in [DATA_SOURCES.md](DATA_SOURCES.md).

- Address matching and geographies from the [US Census Bureau Geocoder](https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html), benchmark `Public_AR_Current`.
- State FIPS codes from the [Census state reference file](https://www2.census.gov/geo/docs/reference/state.txt).

## Limitations

- US addresses only.
- The Census Geocoder matches street addresses from Census address ranges. PO boxes, rural routes and very new streets may not match. Use the coordinates tool for those.
- When an address matches more than one record, the first match is used and the others are listed in `other_matches`.
- The geocoder can be slow. The tool waits up to 30 seconds and then returns a clear error instead of a guess.

## More

More MCP servers that answer questions your assistant cannot answer alone are on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=address-to-census-tract-mcp).

Part of the Zovo MCP collection: https://mcp.zovo.one

Built by [theluckystrike](https://github.com/theluckystrike).

## Development

```
npm install
npm test                              # builds, then runs the fixture tests and an offline stdio test
node scripts/stdio-transcript.mjs     # live stdio round trip, writes .live/stdio-transcript.jsonl
```

## License

MIT
