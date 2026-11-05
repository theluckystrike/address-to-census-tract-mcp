// Pure core for address-to-census-tract-mcp. The only I/O is keyless reads of the US Census Bureau
// Geocoder (geocoding.geo.census.gov), done through an injected fetchText.
import type { FetchText } from './types.js';

export const REPO = 'address-to-census-tract-mcp';
export const SITE = 'https://www.mcpstamp.com';
export const UTM = `utm_source=mcp&utm_medium=${REPO}`;
export const GEOCODER = 'https://geocoding.geo.census.gov/geocoder';
export const DOCS_PAGE = 'https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html';
export const STATE_FILE = 'https://www2.census.gov/geo/docs/reference/state.txt';
export const BENCHMARK = 'Public_AR_Current';

export class InputError extends Error {}
export class UpstreamError extends Error {}

export const more = () => `${SITE}/servers/?${UTM}`;

/** Census vintages offered with the Public_AR_Current benchmark (geocoder/vintages, fetched 2026-11-05). */
export const VINTAGES: Record<string, string> = {
  current: 'Current_Current', census2020: 'Census2020_Current', census2010: 'Census2010_Current',
  acs2017: 'ACS2017_Current', acs2018: 'ACS2018_Current', acs2019: 'ACS2019_Current', acs2021: 'ACS2021_Current', acs2022: 'ACS2022_Current',
  acs2023: 'ACS2023_Current', acs2024: 'ACS2024_Current', acs2025: 'ACS2025_Current', acs2026: 'ACS2026_Current',
};
export type VintageKey = keyof typeof VINTAGES;

/** State FIPS codes from www2.census.gov/geo/docs/reference/state.txt (fetched 2026-11-05). */
export const STATE_FIPS: Record<string, [string, string]> = {
  '01': ['AL', 'Alabama'], '02': ['AK', 'Alaska'], '04': ['AZ', 'Arizona'], '05': ['AR', 'Arkansas'], '06': ['CA', 'California'], '08': ['CO', 'Colorado'], '09': ['CT', 'Connecticut'],
  '10': ['DE', 'Delaware'], '11': ['DC', 'District of Columbia'], '12': ['FL', 'Florida'], '13': ['GA', 'Georgia'], '15': ['HI', 'Hawaii'], '16': ['ID', 'Idaho'], '17': ['IL', 'Illinois'],
  '18': ['IN', 'Indiana'], '19': ['IA', 'Iowa'], '20': ['KS', 'Kansas'], '21': ['KY', 'Kentucky'], '22': ['LA', 'Louisiana'], '23': ['ME', 'Maine'], '24': ['MD', 'Maryland'],
  '25': ['MA', 'Massachusetts'], '26': ['MI', 'Michigan'], '27': ['MN', 'Minnesota'], '28': ['MS', 'Mississippi'], '29': ['MO', 'Missouri'], '30': ['MT', 'Montana'], '31': ['NE', 'Nebraska'],
  '32': ['NV', 'Nevada'], '33': ['NH', 'New Hampshire'], '34': ['NJ', 'New Jersey'], '35': ['NM', 'New Mexico'], '36': ['NY', 'New York'], '37': ['NC', 'North Carolina'], '38': ['ND', 'North Dakota'],
  '39': ['OH', 'Ohio'], '40': ['OK', 'Oklahoma'], '41': ['OR', 'Oregon'], '42': ['PA', 'Pennsylvania'], '44': ['RI', 'Rhode Island'], '45': ['SC', 'South Carolina'], '46': ['SD', 'South Dakota'],
  '47': ['TN', 'Tennessee'], '48': ['TX', 'Texas'], '49': ['UT', 'Utah'], '50': ['VT', 'Vermont'], '51': ['VA', 'Virginia'], '53': ['WA', 'Washington'], '54': ['WV', 'West Virginia'],
  '55': ['WI', 'Wisconsin'], '56': ['WY', 'Wyoming'], '60': ['AS', 'American Samoa'], '66': ['GU', 'Guam'], '69': ['MP', 'Northern Mariana Islands'], '72': ['PR', 'Puerto Rico'],
  '74': ['UM', 'U.S. Minor Outlying Islands'], '78': ['VI', 'U.S. Virgin Islands'],
};

// ---------------------------------------------------------------- inputs and URLs

export function resolveVintage(v?: string): string {
  const k = (v ?? 'current').toLowerCase().replace(/[^a-z0-9]/g, '');
  const name = VINTAGES[k];
  if (!name) throw new InputError(`Unknown vintage "${v}". Use one of ${Object.keys(VINTAGES).join(', ')}.`);
  return name;
}

export function addressUrl(address: string, vintage?: string): string {
  const a = address.replace(/\s+/g, ' ').trim();
  if (a.length < 5 || !/\d/.test(a)) throw new InputError('Give a full US street address with a house number, for example "1600 Pennsylvania Ave NW, Washington, DC 20500".');
  return `${GEOCODER}/geographies/onelineaddress?address=${encodeURIComponent(a)}&benchmark=${BENCHMARK}&vintage=${resolveVintage(vintage)}&format=json`;
}

export function coordinatesUrl(lat: number, lon: number, vintage?: string): string {
  if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) throw new InputError('Latitude must be -90 to 90 and longitude -180 to 180.');
  return `${GEOCODER}/geographies/coordinates?x=${lon}&y=${lat}&benchmark=${BENCHMARK}&vintage=${resolveVintage(vintage)}&format=json`;
}

// ---------------------------------------------------------------- GEOID arithmetic

/** "012405" -> "124.05"; "980000" -> "9800". The Census display form of a 6-digit tract code. */
export function tractNumber(code6: string): string {
  if (!/^\d{6}$/.test(code6)) throw new InputError(`Tract code "${code6}" must be 6 digits.`);
  const base = String(Number(code6.slice(0, 4)));
  const suffix = code6.slice(4);
  return suffix === '00' ? base : `${base}.${suffix}`;
}

/** Split a state (2), county (5), tract (11), block group (12) or block (15) GEOID into its parts. */
export function parseGeoid(geoid: string) {
  const g = geoid.replace(/^\d{7}US/, '').trim();
  if (!/^\d+$/.test(g) || ![2, 5, 11, 12, 15].includes(g.length)) {
    throw new InputError(`"${geoid}" is not a census GEOID. Use 2 digits (state), 5 (county), 11 (tract), 12 (block group) or 15 (block).`);
  }
  const st = STATE_FIPS[g.slice(0, 2)];
  if (!st) throw new InputError(`"${g.slice(0, 2)}" is not a state FIPS code.`);
  const level = ({ 2: 'state', 5: 'county', 11: 'tract', 12: 'block group', 15: 'block' } as Record<number, string>)[g.length];
  const out: Record<string, unknown> = { geoid: g, level, state_fips: g.slice(0, 2), state: st[1], state_abbr: st[0] };
  if (g.length >= 5) { out.county_fips = g.slice(2, 5); out.county_geoid = g.slice(0, 5); }
  if (g.length >= 11) { out.tract_code = g.slice(5, 11); out.tract_number = tractNumber(g.slice(5, 11)); out.tract_geoid = g.slice(0, 11); }
  if (g.length >= 12) { out.block_group = g.slice(11, 12); out.block_group_geoid = g.slice(0, 12); }
  if (g.length === 15) out.block = g.slice(11, 15);
  return out;
}

// ---------------------------------------------------------------- parsing

const first = (geos: Record<string, any[]>, re: RegExp) => {
  const key = Object.keys(geos).find((k) => re.test(k));
  const v = key ? geos[key]?.[0] : undefined;
  return v ? { layer: key!, ...v } : null;
};
const named = (x: any) => (x ? { name: x.NAME as string, geoid: x.GEOID as string, layer: x.layer as string } : null);

export function shapeGeographies(geos: Record<string, any[]>) {
  const tract = first(geos, /^Census Tracts$/);
  const block = first(geos, /Census Blocks$/);
  const state = first(geos, /^States$/);
  const county = first(geos, /^Counties$/);
  if (!tract || !state) throw new InputError('The Census Geocoder found the place but returned no census tract for it. It may be outside the US or in open water.');
  const blockGeoid: string | null = block?.GEOID ?? null;
  return {
    state: { name: state.NAME, fips: state.STATE ?? state.GEOID, abbr: STATE_FIPS[state.GEOID]?.[0] ?? null },
    county: county ? { name: county.NAME, fips: county.COUNTY, geoid: county.GEOID } : null,
    tract: { geoid: tract.GEOID, name: tract.NAME, number: tract.BASENAME, code: tract.TRACT, layer: tract.layer },
    block_group: blockGeoid ? { geoid: blockGeoid.slice(0, 12), code: blockGeoid.slice(11, 12) } : null,
    block: block ? { geoid: blockGeoid, number: block.BLOCK ?? block.BASENAME, layer: block.layer } : null,
    place: named(first(geos, /Incorporated Places$/)),
    county_subdivision: named(first(geos, /^County Subdivisions$/)),
    congressional_district: named(first(geos, /Congressional Districts$/)),
    state_senate_district: named(first(geos, /Legislative Districts - Upper$/)),
    state_house_district: named(first(geos, /Legislative Districts - Lower$/)),
    urban_area: named(first(geos, /Urban Areas/)),
    combined_statistical_area: named(first(geos, /^Combined Statistical Areas$/)),
  };
}

function parse(body: string): any {
  try { return JSON.parse(body); } catch { throw new UpstreamError('the Census Geocoder returned a response that is not JSON'); }
}

const profile = (tractGeoid: string) => `https://data.census.gov/profile?g=1400000US${tractGeoid}`;

function summarize(where: string, g: ReturnType<typeof shapeGeographies>, vintage: string) {
  return (
    `${where} is in Census Tract ${g.tract.number} (GEOID ${g.tract.geoid})` +
    `${g.block_group ? `, block group ${g.block_group.code} (${g.block_group.geoid})` : ''}, ${g.county?.name ?? 'county unknown'}, ${g.state.name}. ` +
    `${g.congressional_district ? `${g.congressional_district.name} (${g.congressional_district.layer}). ` : ''}` +
    `Census vintage ${vintage}.`
  );
}

// ---------------------------------------------------------------- tools

export async function getCensusTractForAddress(fetchText: FetchText, a: { address: string; vintage?: string }, nowMs = Date.now()) {
  const url = addressUrl(a.address, a.vintage);
  const j = parse(await fetchText(url, { cacheTtl: 86400, timeoutMs: 30000 }));
  if (j.errors) throw new InputError(`Census Geocoder rejected the request: ${[].concat(j.errors).join('; ')}`);
  const matches: any[] = j.result?.addressMatches ?? [];
  if (!matches.length) {
    throw new InputError(`The Census Geocoder found no match for "${a.address.trim()}". Check the house number, street, city and state or ZIP, or use get_census_tract_for_coordinates with a latitude and longitude.`);
  }
  const m = matches[0];
  const g = shapeGeographies(m.geographies ?? {});
  const vintage = j.result?.input?.vintage?.vintageName ?? resolveVintage(a.vintage);
  return {
    summary: summarize(m.matchedAddress, g, vintage),
    input_address: a.address.trim(),
    matched_address: m.matchedAddress,
    other_matches: matches.slice(1).map((x) => x.matchedAddress),
    latitude: m.coordinates?.y ?? null,
    longitude: m.coordinates?.x ?? null,
    ...g,
    vintage,
    benchmark: BENCHMARK,
    census_profile: profile(g.tract.geoid),
    note: 'The match uses Census address ranges and places the address on its side of the street. Rural routes, PO boxes and new streets may not match.',
    as_of: new Date(nowMs).toISOString(),
    source: url,
    more: more(),
  };
}

export async function getCensusTractForCoordinates(fetchText: FetchText, a: { latitude: number; longitude: number; vintage?: string }, nowMs = Date.now()) {
  const url = coordinatesUrl(a.latitude, a.longitude, a.vintage);
  const j = parse(await fetchText(url, { cacheTtl: 86400, timeoutMs: 30000 }));
  if (j.errors) throw new InputError(`Census Geocoder rejected the request: ${[].concat(j.errors).join('; ')}`);
  const g = shapeGeographies(j.result?.geographies ?? {});
  const vintage = j.result?.input?.vintage?.vintageName ?? resolveVintage(a.vintage);
  return {
    summary: summarize(`The point ${a.latitude}, ${a.longitude}`, g, vintage),
    latitude: a.latitude,
    longitude: a.longitude,
    ...g,
    vintage,
    benchmark: BENCHMARK,
    census_profile: profile(g.tract.geoid),
    as_of: new Date(nowMs).toISOString(),
    source: url,
    more: more(),
  };
}

export function explainCensusGeoid(a: { geoid: string }) {
  const p = parseGeoid(a.geoid) as Record<string, any>;
  const parts = [`state ${p.state_fips} (${p.state})`];
  if (p.county_fips) parts.push(`county ${p.county_fips}`);
  if (p.tract_code) parts.push(`tract ${p.tract_code}, shown as Census Tract ${p.tract_number}`);
  if (p.block_group) parts.push(`block group ${p.block_group}`);
  if (p.block) parts.push(`block ${p.block}`);
  return {
    summary: `GEOID ${p.geoid} is a ${p.level} GEOID: ${parts.join(', ')}.`,
    ...p,
    census_profile: p.tract_geoid && p.level === 'tract' ? profile(p.tract_geoid) : null,
    rule: 'A block GEOID is state FIPS (2 digits) + county FIPS (3) + tract (6) + block (4). The first digit of the block is the block group, so a block group GEOID is the first 12 digits of a block GEOID and a tract GEOID is the first 11.',
    as_of: '2026-11-05',
    source: STATE_FILE,
    more: more(),
  };
}
