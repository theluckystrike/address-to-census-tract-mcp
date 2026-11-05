// Tool registry shared by the stdio and Worker entries.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InputError, REPO, SITE, VINTAGES, explainCensusGeoid, getCensusTractForAddress, getCensusTractForCoordinates } from './core.js';
import type { FetchText } from './types.js';

export const VERSION = '1.0.0';

export const TOOL_INFO = [
  { name: 'get_census_tract_for_address', blurb: 'Census tract, block group, block, county FIPS, place, congressional and state legislative districts for a US street address, from the US Census Bureau Geocoder.' },
  { name: 'get_census_tract_for_coordinates', blurb: 'The same census geographies for a latitude and longitude.' },
  { name: 'explain_census_geoid', blurb: 'Split a state, county, tract, block group or block GEOID into its FIPS parts and the tract number as Census displays it. Offline.' },
];

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(data: Record<string, unknown> & { summary: string }) {
  return { content: [{ type: 'text' as const, text: `${data.summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text' as const, text: `${e instanceof InputError ? 'Error' : 'Upstream Census Geocoder error'}: ${msg}` }] };
}

const vintage = z.enum(Object.keys(VINTAGES) as [string, ...string[]]).optional()
  .describe('Census vintage. current (default) uses today\'s geographies; census2020 uses the 2020 Census geographies; acs2017 to acs2026 match an ACS release.');

export function createServer(fetchText: FetchText): McpServer {
  const server = new McpServer({ name: REPO, version: VERSION, websiteUrl: SITE } as any, {
    instructions:
      'Exact census geographies for a US address or point, read at call time from the US Census Bureau Geocoder (geocoding.geo.census.gov). ' +
      'A model cannot know which census tract an address falls in; tract boundaries follow streets and change with each census. Use get_census_tract_for_address for a street address.',
  });

  server.registerTool('get_census_tract_for_address', {
    title: 'Get census tract for an address',
    description:
      'Look up the census tract for a US street address with the official US Census Bureau Geocoder. Returns the matched address, latitude and longitude, the 11-digit tract GEOID and tract number, ' +
      'block group and block GEOIDs, state and county FIPS, incorporated place, county subdivision, congressional district, state senate and house districts, urban area and combined statistical area. ' +
      'Use it for CRA, LIHTC, opportunity zone, grant eligibility and demographic lookups that start from an address.',
    inputSchema: {
      address: z.string().min(5).max(200).describe('One-line US address with house number, street, city and state or ZIP, for example "1600 Pennsylvania Ave NW, Washington, DC 20500".'),
      vintage,
    },
    annotations: { title: 'Census tract for address', ...RO },
  }, async (a) => {
    try { return ok(await getCensusTractForAddress(fetchText, a) as any); } catch (e) { return fail(e); }
  });

  server.registerTool('get_census_tract_for_coordinates', {
    title: 'Get census tract for coordinates',
    description: 'Census tract, block group, block, county, place and congressional and state legislative districts for a latitude and longitude, from the US Census Bureau Geocoder.',
    inputSchema: {
      latitude: z.number().min(-90).max(90).describe('Latitude, for example 41.8827.'),
      longitude: z.number().min(-180).max(180).describe('Longitude, for example -87.6237.'),
      vintage,
    },
    annotations: { title: 'Census tract for coordinates', ...RO },
  }, async (a) => {
    try { return ok(await getCensusTractForCoordinates(fetchText, a) as any); } catch (e) { return fail(e); }
  });

  server.registerTool('explain_census_geoid', {
    title: 'Explain a census GEOID',
    description: 'Split a census GEOID (2 digits state, 5 county, 11 tract, 12 block group, 15 block, or with a 1400000US style prefix) into state and county FIPS, tract code, the tract number as Census displays it (012405 is 124.05), block group and block. No network call.',
    inputSchema: { geoid: z.string().min(2).max(24).describe('GEOID, for example "06075012405" or "1400000US06075012405".') },
    annotations: { title: 'Explain GEOID', ...RO, openWorldHint: false },
  }, async (a) => {
    try { return ok(explainCensusGeoid(a) as any); } catch (e) { return fail(e); }
  });

  return server;
}
