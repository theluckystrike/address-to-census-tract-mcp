// Fixtures: US Census Bureau Geocoder payloads saved 2026-11-05 (benchmark Public_AR_Current) for the White House
// (Current_Current and Census2020_Current), San Francisco City Hall, a no-match address and a Chicago Loop point.
// Expected values are read off the saved payloads; tract display numbers are hand-checked arithmetic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  resolveVintage, addressUrl, coordinatesUrl, tractNumber, parseGeoid, shapeGeographies, STATE_FIPS,
  getCensusTractForAddress, getCensusTractForCoordinates, explainCensusGeoid, InputError, UpstreamError, UTM,
} from '../dist/core.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');
const fake = (over = {}) => async (url) => {
  const u = decodeURIComponent(url);
  for (const [k, v] of Object.entries(over)) if (u.includes(k)) { if (v instanceof Error) throw v; return v; }
  if (u.includes('1600 Pennsylvania') && u.includes('Census2020_Current')) return fx('oneline-whitehouse-census2020.json');
  if (u.includes('1600 Pennsylvania')) return fx('oneline-whitehouse.json');
  if (u.includes('Goodlett')) return fx('oneline-sf-cityhall.json');
  if (u.includes('Nowhere')) return fx('oneline-nomatch.json');
  if (u.includes('/coordinates?x=-87.6237&y=41.8827')) return fx('coords-chicago.json');
  throw new Error('unexpected url ' + url);
};

test('vintages: default current, keys case and punctuation tolerant, unknown rejected', () => {
  assert.equal(resolveVintage(), 'Current_Current'); assert.equal(resolveVintage('Census 2020'), 'Census2020_Current'); assert.equal(resolveVintage('ACS2024'), 'ACS2024_Current');
  assert.throws(() => resolveVintage('census1990'), InputError);
});
test('URLs: one-line address and coordinates (x is longitude)', () => {
  assert.equal(addressUrl('1600 Pennsylvania Ave NW, Washington, DC 20500'),
    'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=1600%20Pennsylvania%20Ave%20NW%2C%20Washington%2C%20DC%2020500&benchmark=Public_AR_Current&vintage=Current_Current&format=json');
  assert.equal(coordinatesUrl(41.8827, -87.6237), 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=-87.6237&y=41.8827&benchmark=Public_AR_Current&vintage=Current_Current&format=json');
  assert.throws(() => addressUrl('Main Street'), InputError); assert.throws(() => coordinatesUrl(91, 0), InputError);
});
test('tract display numbers: 012405 -> 124.05, 980000 -> 9800, 320102 -> 3201.02, 000100 -> 1', () => {
  assert.equal(tractNumber('012405'), '124.05'); assert.equal(tractNumber('980000'), '9800'); assert.equal(tractNumber('320102'), '3201.02'); assert.equal(tractNumber('000100'), '1');
  assert.throws(() => tractNumber('12405'), InputError);
});
test('state FIPS table from Census state.txt: 57 entries, 06 California, 11 DC, 72 Puerto Rico', () => {
  assert.equal(Object.keys(STATE_FIPS).length, 57);
  assert.deepEqual(STATE_FIPS['06'], ['CA', 'California']); assert.equal(STATE_FIPS['11'][1], 'District of Columbia'); assert.equal(STATE_FIPS['72'][0], 'PR');
});
test('parseGeoid: block 060750124053007 splits into state, county, tract, block group, block', () => {
  const p = parseGeoid('060750124053007');
  assert.equal(p.level, 'block'); assert.equal(p.state, 'California'); assert.equal(p.county_geoid, '06075'); assert.equal(p.tract_geoid, '06075012405');
  assert.equal(p.tract_number, '124.05'); assert.equal(p.block_group, '3'); assert.equal(p.block_group_geoid, '060750124053'); assert.equal(p.block, '3007');
});
test('parseGeoid: prefixed tract, county and bad lengths', () => {
  assert.equal(parseGeoid('1400000US17031320102').tract_number, '3201.02');
  assert.equal(parseGeoid('17031').level, 'county');
  assert.throws(() => parseGeoid('1703132010'), InputError); assert.throws(() => parseGeoid('99031'), InputError);
});
test('shape SF City Hall: tract 124.05, block group 3, CD 11, Senate 11, Assembly 17', () => {
  const g = shapeGeographies(JSON.parse(fx('oneline-sf-cityhall.json')).result.addressMatches[0].geographies);
  assert.equal(g.tract.geoid, '06075012405'); assert.equal(g.tract.number, '124.05'); assert.equal(g.block_group.geoid, '060750124053');
  assert.equal(g.county.geoid, '06075'); assert.equal(g.state.abbr, 'CA');
  assert.equal(g.congressional_district.name, 'Congressional District 11'); assert.equal(g.congressional_district.layer, '120th Congressional Districts');
  assert.equal(g.state_senate_district.name, 'State Senate District 11'); assert.equal(g.state_house_district.name, 'Assembly District 17');
  assert.equal(g.place.name, 'San Francisco city');
});
test('shape: missing tract layer is a clear error', () => {
  assert.throws(() => shapeGeographies({ States: [{ GEOID: '06', NAME: 'California' }] }), /no census tract/);
});
test('address: White House is tract 9800 (11001980000), block group 110019800001, DC delegate district, no lower house', async () => {
  const r = await getCensusTractForAddress(fake(), { address: '1600 Pennsylvania Ave NW, Washington, DC 20500' });
  assert.equal(r.matched_address, '1600 PENNSYLVANIA AVE NW, WASHINGTON, DC, 20500');
  assert.equal(r.tract.geoid, '11001980000'); assert.equal(r.tract.number, '9800'); assert.equal(r.block_group.geoid, '110019800001');
  assert.equal(r.congressional_district.name, 'Delegate District (at Large)'); assert.equal(r.state_house_district, null);
  assert.equal(r.vintage, 'Current_Current'); assert.equal(r.census_profile, 'https://data.census.gov/profile?g=1400000US11001980000');
  assert.ok(r.more.includes(UTM)); assert.ok(r.source.startsWith('https://geocoding.geo.census.gov/'));
  assert.match(r.summary, /Census Tract 9800 \(GEOID 11001980000\)/);
});
test('address with census2020 vintage reads the 2020 layers (116th districts, Census Blocks)', async () => {
  const r = await getCensusTractForAddress(fake(), { address: '1600 Pennsylvania Ave NW, Washington, DC 20500', vintage: 'census2020' });
  assert.equal(r.vintage, 'Census2020_Current'); assert.equal(r.tract.geoid, '11001980000'); assert.equal(r.block.layer, 'Census Blocks');
  assert.equal(r.congressional_district.layer, '116th Congressional Districts');
});
test('address with no match: input error that suggests coordinates', async () => {
  await assert.rejects(getCensusTractForAddress(fake(), { address: '99999 Nowhere Street, Faketown, ZZ' }), (e) => e instanceof InputError && /no match/.test(e.message));
});
test('coordinates: Chicago Loop point is tract 3201.02 in Cook County, CD 7, block 170313201022004', async () => {
  const r = await getCensusTractForCoordinates(fake(), { latitude: 41.8827, longitude: -87.6237 });
  assert.equal(r.tract.geoid, '17031320102'); assert.equal(r.tract.number, '3201.02'); assert.equal(r.county.name, 'Cook County');
  assert.equal(r.block.geoid, '170313201022004'); assert.equal(r.block_group.code, '2'); assert.equal(r.congressional_district.name, 'Congressional District 7');
  assert.equal(r.state_house_district.name, 'State House District 5');
});
test('upstream: non-JSON and network errors surface', async () => {
  await assert.rejects(getCensusTractForCoordinates(fake({ '/coordinates?': '<html>' }), { latitude: 1, longitude: 1 }), UpstreamError);
  await assert.rejects(getCensusTractForAddress(fake({ Goodlett: new Error('no answer within 30 s') }), { address: '1 Dr Carlton B Goodlett Pl, San Francisco, CA' }), /30 s/);
});
test('explain_census_geoid: tract 06075012405', () => {
  const r = explainCensusGeoid({ geoid: '06075012405' });
  assert.equal(r.level, 'tract'); assert.equal(r.census_profile, 'https://data.census.gov/profile?g=1400000US06075012405');
  assert.match(r.summary, /Census Tract 124\.05/);
});
test('stdio: initialize, tools/list and an offline tools/call over JSON-RPC', async () => {
  const child = spawn(process.execPath, [new URL('../dist/stdio.js', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = []; let buf = '';
  const got = (id) => new Promise((res) => { const iv = setInterval(() => { const m = lines.find((l) => l.id === id); if (m) { clearInterval(iv); res(m); } }, 10); });
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const send = (m) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\n');
  send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
  assert.equal((await got(1)).result.serverInfo.name, 'address-to-census-tract-mcp');
  send({ method: 'notifications/initialized' });
  send({ id: 2, method: 'tools/list' });
  assert.deepEqual((await got(2)).result.tools.map((t) => t.name), ['get_census_tract_for_address', 'get_census_tract_for_coordinates', 'explain_census_geoid']);
  send({ id: 3, method: 'tools/call', params: { name: 'explain_census_geoid', arguments: { geoid: '170313201022004' } } });
  assert.equal((await got(3)).result.structuredContent.block_group_geoid, '170313201022');
  child.kill();
});
