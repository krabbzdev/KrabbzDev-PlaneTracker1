# Free/open flight origin-destination sources and extra ADS-B fields (TAS/IAS/Mach/wind/temp)

## Which free sources can fill route gaps (e.g. MXY1606, private N-numbers)?

### Takeaway
No free source gives a real filed flight plan for private/GA flights. Callsign-keyed route databases (adsbdb, vrs-standing-data) cover scheduled airlines only; OpenSky's flights endpoint gives only observed past flights (previous day or older) and is research/non-commercial. For a private N-number, the realistic options are "unknown" or a heuristic guess.

### Cited Findings
- adsbdb returned a route for MXY1606 in a live test on 2026-10-31 (KLAS to KGPT, Breeze Airways). Treat that as a static callsign-to-route record, not the day's real flight. adsb.lol's /api/0/route/MXY1606 302-redirected to vrs-standing-data.adsb.lol/routes/MX/MXY1606.json with a "#deprecated" fragment; hexdb.io route/icao/MXY1606 returned 404 "Route not found." (my own curl tests, 2026-10-31; not documented elsewhere)
- adsbdb: GET api.adsbdb.com/v[major]/callsign/[CALLSIGN] returns airline, origin, destination (midpoints for few routes); /aircraft/[MODE_S or REGISTRATION] gives type/owner; unknown callsign = 404; rate limits and terms not stated; route data credited to David Taylor and Jim Mason with a "may not be copied, published, or incorporated into other databases without explicit permission" note. — [adsbdb README](https://github.com/mrjackwills/adsbdb)
- hexdb.io: GET https://hexdb.io/api/v1/route/icao/{callsign} (and /route/iata/), 404 if unknown; GET /api/v1/aircraft/{hex}. Terms/rate limit not verified. — [hexdb.io](https://www.hexdb.io/) (via search snippet; page itself not fetched)
- adsb.lol API: base api.adsb.lol/v2, ADSBx-v2-compatible; rate limits "dynamic based on environment load"; "If you get 4xx errors, you are doing something wrong"; an API key (obtainable by feeding) is planned to be required in future; repo BSD-3-Clause. Route/routeset endpoint docs are at api.adsb.lol/docs (could not read that page). — [adsblol/api](https://github.com/adsblol/api)
- adsb.lol routeset: a POST to /api/0/routeset with a callsign/lat/lng body returned HTTP 201 with an empty body in my test; I did not determine the expected request format. (own test, unverified semantics)
- OpenSky REST: /flights/aircraft returns flights for one icao24 within a window of max 2 days, batch-processed nightly so only the previous day or earlier; no /routes endpoint documented; docs say routes currently not available via REST; docs conflict on arrival/departure window wording. — [OpenSky REST docs](https://openskynetwork.github.io/opensky-api/rest.html)
- OpenSky limits: anonymous 400 credits/day, standard 4,000/day, active feeder 8,000/day; OAuth2 client-credentials only (basic auth no longer accepted), tokens expire after 30 min; 429 with X-Rate-Limit-Retry-After-Seconds. — [OpenSky REST docs](https://openskynetwork.github.io/opensky-api/rest.html)
- OpenSky terms: live API described as for research and non-commercial purposes; data license limited to non-profit research/education, commercial internal testing/evaluation, or government; cite OpenSky. — [OpenSky license text via Zenodo](https://zenodo.org/records/6325961/files/LICENSE.txt?download=1), search snippet only; I did not read the primary terms page.
- airplanes.live: official guide says REST API limited to 1 request/second, "No SLA", "Non-Commercial Use", base api.airplanes.live/v2 — [airplanes.live API guide](https://airplanes.live/api-guide) (via search snippet; fetch returned 403). My curl to /v2/callsign/MXY1606 returned an error requiring contact at contact@airplanes.live with project description (own test; suggests access now needs registration/contact). A competitor's comparison lists a 500 req/day free tier — [flyitalyadsb comparison](https://flyitalyadsb.com/en/dati/confronto/), secondary and unverified.
- airplanes.live has no route endpoint in the archived API doc (the archived repo documents the ADSB One API: hex/callsign/reg/type/squawk/mil/ladd/pia/point, 1 req/s; archived April 29, 2026). — [api-archive](https://github.com/airplanes-live/api-archive)
- ADS-B Exchange: Community API (formerly API Lite) via RapidAPI at about $10/month personal, 10,000 requests; commercial use (including non-profits) needs written authorization — [ADSBx Developer Hub](https://www.adsbexchange.com/api-lite/). No route endpoint found. A competitor says internal business use also needs a commercial license — [flyitalyadsb comparison](https://flyitalyadsb.com/en/dati/confronto/) (unverified, biased source).
- FAA SWIM (SFDPS, TFMS): free but requires account at data.faa.gov and signed FAA access agreement; SCDS cloud delivery via Solace JMS messaging; SFDPS covers 20 ARTCCs in the lower 48. I could not confirm which flight-plan fields (origin/destination) are exposed or the data-use terms. — [Getting Access to SWIM](https://www.faa.gov/air_traffic/technology/swim/products/get_connected) and search snippets
- flightplandatabase.com: fetch failed (HTTP 500). Not verified.

### Inferences
- Because adsbdb/vrs return the same static callsign route every day, a plausibility check (compare current position/heading to the route's origin and destination) is useful before showing it. I did not find official docs for adsb.lol's plausibility behaviour.
- Private/GA N-numbers have no callsign route; only OpenSky history (previous-day flights, estimated airports) or heuristics apply. OpenSky's non-commercial terms fit a personal hobby app, but the daily batch lag means it cannot help with today's flights.
- Heuristic: nearest airport to first-seen/last-seen low-altitude position for departure/arrival; destination from heading is a guess, not data. No authoritative documented technique source found.

### Gaps
- adsb.lol routeset request format and exact route semantics (docs page unreadable).
- hexdb.io and adsbdb rate limits/terms; airplanes.live primary terms text; OpenSky primary terms page.
- Whether FAA SFDPS/TFMS public feeds include origin/destination for GA, and whether SWIM is practical for a one-user Node app.
- OpenFlights routes dataset and flightplandatabase.com (not fetched).
- Published documentation of destination-inference techniques; none fetched.

## Which local-receiver fields give TAS/IAS/Mach/wind/temperature, and how to read them?

### Takeaway
readsb's aircraft.json includes tas, ias, mach, mag_heading, true_heading, nav_qnh, nav_altitude_mcp and calculated wd, ws, oat, tat. Wind/temperature are computed by readsb from track, heading, TAS, GS and Mach, so they appear only for aircraft that transmit the underlying data. Aggregators pass the fields through, but only for a small fraction of aircraft.

### Cited Findings
- readsb README-json lists: ias, tas, mach (knots/Mach), track, mag_heading, true_heading, roll, nav_qnh (hPa), nav_altitude_mcp/fms, nav_heading, nav_modes, version; wd, ws, oat, tat are marked "calculated". true_heading is usually transmitted only on the ground; airborne it is usually derived from magnetic heading using WMM2020. Temperature is "typically somewhat inaccurate at lower altitudes / mach numbers below 0.5" and calculation is inhibited for mach < 0.395. — [readsb README-json](https://github.com/wiedehopf/readsb/blob/dev/README-json.md)
- That page does not mention BDS/EHS or which registers feed each field. (Background from my own knowledge, unverified here: ias/tas/mach/mag_heading/roll come from Mode S EHS registers BDS 5,0/6,0/4,0 or ADS-B airspeed messages; nav_qnh/nav_altitude_mcp from BDS 4,0 or ADS-B target state.)
- readsb flags: --write-json=<dir>, --write-json-every=<sec> (default 1), --write-json-gzip, --json-reliable=<n>, --net-json-port=<ports>, --json-trace-interval; no EHS-specific flag documented in the README. — [readsb README](https://github.com/wiedehopf/readsb/blob/dev/README.md)
- dump1090-fa README-json lists gs, ias, tas, mach, track, nav_qnh etc., but a FlightAware thread says the READMEs lag actual output; sample dump1090-fa output shows ias, tas, mach, oat, tat, nav_qnh populated for airliners. I found nothing on wd/ws in dump1090-fa. — [dump1090-fa README-json](https://github.com/flightaware/dump1090/blob/master/README-json.md), [FlightAware forum](https://discussions.flightaware.com/t/aircraft-json-attribute-name/45350)
- URLs: forum posts report http://<pi>:8080/data/aircraft.json (older PiAware) and http://<pi>/dump1090-fa/data/aircraft.json (PiAware 3+); tar1090 commonly /tar1090/data/aircraft.json; tar1090 reads aircraft.json from /run/readsb or /run/dump1090-fa. Port 8080 may not exist on newer installs. — [FlightAware forum](https://discussions.flightaware.com/t/aircraft-json-file/80072), [tar1090](https://github.com/wiedehopf/tar1090) (forum-based, version-dependent)
- Aggregator live test (adsb.fi v3, 150 nm around Tampa, 2026-10-31, one snapshot, my own curl): of 205 aircraft, tas/ias/mach/wd/ws/oat/tat/mag_heading appeared on only 6-7 (about 3%); true_heading on 31; nav_qnh on 152; nav_altitude_mcp on 147; version on 204.
- adsb.fi opendata: endpoints /v2/hex, /v2/callsign, /v2/registration, /v2/sqk, /v2/mil, /v3/lat/lon/dist (max 250 nm); public limit 1 req/s; personal non-commercial only; must cite adsb.fi; IP restriction after repeated 4xx. — [adsb.fi opendata](https://github.com/adsbfi/opendata)
- airplanes.live field page could not be fetched (403); ADSBx v2 field doc describes the same ias/tas/mach/wd/ws/oat set — [ADSBx v2 fields](https://www.adsbexchange.com/?p=1897) (search snippet).

### Inferences
- The dashboard can already read these from adsb.fi's `ac` array without a receiver (null-check each field), but only about 3% of planes carry them, mostly airliners. A local receiver gives no extra EHS data per plane unless its reception is better than the aggregator's mix.
- To read a local receiver: fetch the aircraft.json URL, key by `hex`, treat every field as optional; try /tar1090/data/aircraft.json, then :8080/data/aircraft.json, then /dump1090-fa/data/aircraft.json.

### Gaps
- Exact readsb version/flag needed for wd/ws/oat/tat; not in fetched docs.
- Mapping of each field to its BDS register; not found.
- Current PiAware default port/path; sources are older forum posts.
- Official statements from adsb.fi and airplanes.live on which fields they expose; only adsb.fi observed live, airplanes.live unobserved (403/contact required).
