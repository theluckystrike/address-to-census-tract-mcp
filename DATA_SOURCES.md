# Data sources

All sources below were fetched on 2026-11-05 while building version 1.0.0. Address matches and geographies are read at call time; only the state FIPS table and the list of vintages are written into the code.

| Data | URL | Notes |
|---|---|---|
| Address to geographies | https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=...&benchmark=Public_AR_Current&vintage=Current_Current&format=json | Keyless. Returns the matched address, coordinates and layers including Census Tracts, 2020 Census Blocks, Counties, States, Incorporated Places, County Subdivisions, 120th Congressional Districts, 2026 State Legislative Districts, Urban Areas, Combined Statistical Areas. Cache 1 day. |
| Coordinates to geographies | https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x={lon}&y={lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json | Same layers. |
| Vintages | https://geocoding.geo.census.gov/geocoder/vintages?benchmark=Public_AR_Current&format=json | Current_Current, Census2010_Current, ACS2017_Current to ACS2026_Current (no ACS2020), Census2020_Current. |
| API documentation | https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html | |
| State FIPS codes | https://www2.census.gov/geo/docs/reference/state.txt | 57 rows, copied into `STATE_FIPS`. |

Test fixtures in `test/fixtures/` are raw Census Geocoder payloads saved on 2026-11-05 for 1600 Pennsylvania Ave NW (Current_Current and Census2020_Current), 1 Dr Carlton B Goodlett Pl San Francisco, a no-match address, and the point 41.8827, -87.6237.
