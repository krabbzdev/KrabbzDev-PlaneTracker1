# Paid/keyed APIs for flight origin, destination and schedule data (personal hobby dashboard)

## FlightAware AeroAPI: tiers, pricing, limits, terms, signup, fields

### Takeaway
AeroAPI Personal has no monthly minimum, about $5/month of free per-query usage ($10 for ADS-B feeders), 10 result sets/min, and is licensed for personal/academic use only. At $0.005 per flight-info result set, a few hundred lookups a month would cost about $1-2, inside the free allowance. It is the best fit.

### Cited Findings
- Tiers: Personal (no monthly minimum, 10 result sets/min, no historical data, no alerts, no support, "personal or academic" use); Standard ($100/mo minimum, 5 result sets/s, business and B2C); Premium ($1,000/mo minimum, 100 result sets/s, B2B allowed) — [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/)
- Per result set (1 set = 15 records): flight info $0.005, flight position $0.010, track $0.012, flight search $0.050, historical flight info $0.020 — [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/)
- Per-query usage free up to $5/month ($10 for ADS-B feeders) — [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/); a forum reply says feeders get $10/month of per-query usage free — [FlightAware forum](https://discussions.flightaware.com/t/does-being-a-flight-feeder-entitle-you-to-api-access/100067)
- Terms: storage and distribution of derivative works allowed for personal or academic purposes only; business use and commercialization not included — [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/)
- Signup: pick a tier, "Get started" links, Personal at https://www.flightaware.com/aeroapi/signup/personal (signup steps not described on the page) — [FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/)
- Endpoint GET /flights/{ident}: ident may be callsign/designator, registration or fa_flight_id; `ident_type` param; auth via `x-apikey` header; response includes origin, destination (with ICAO/IATA codes), scheduled_out, estimated_in, status, fa_flight_id; one ident returns a flights[] array of several dated flights — [FlightAware docs page snippet](https://www.flightaware.com/aeroapi/portal/documentation), [third-party reference wal.sh](https://wal.sh/research/ads-b/aeroapi-reference), [FlightAware forum](https://discussions.flightaware.com/t/fa-flight-id-taken-from-scheduled-endpoint-returns-no-flight-details-when-called/82636)
- Website premium membership does NOT include AeroAPI: a forum reply says a feeder account doesn't include API access and you must sign up for a Personal AeroAPI account — [FlightAware forum](https://discussions.flightaware.com/t/does-being-a-flight-feeder-entitle-you-to-api-access/100067); another thread reports that upgrading the web account to Premium+ doesn't change API quotas (AeroAPI tier must be upgraded) — [FlightAware forum](https://discussions.flightaware.com/t/keep-getting-status-429-even-when-using-premium-account/80564), summarized via search only

### Inferences
- Looking up a callsign (e.g. MXY1606) or registration returns a flights[] array, possibly several days of that ident. One request is 1 result set (~$0.005) as long as records are under 15, so cost is trivial.
- FlightAware's dedicated Breeze/GA coverage is not stated on the pages read, but its data is ADS-B + FAA-feed based, so US GA and low-cost carriers are very likely covered. This is not verified here.

### Gaps
- Official field-by-field schema and exact ident_type values: official docs page was login-gated/unreadable; only third-party and snippet evidence.
- Standard License PDF (caching/display terms) was unreadable via fetch; a local copy is saved in the tool-results dir. Caching and display restrictions not verified. Needs review by the appropriate owner.
- Whether the $5 free credit is billed automatically on Personal signup with a card required: not verified.
- A FlightAware web premium statement from FlightAware itself was not found; evidence is forum posts only.
- FlightAware Firehose: not researched (streaming, enterprise-priced; not a fit for one-off lookups; pricing unverified).

## Competing APIs: pricing, free tiers, coverage

### Takeaway
Only AeroAPI and AirLabs/AeroDataBox look workable for free or near-free use. AviationStack's free plan (100 req/mo, non-commercial) is enough for volume but lacks flight-plan depth and is not verified for GA/Breeze. Aviation Edge is $7 first month, then $299/mo, so it is poor value.

### Cited Findings
- AviationStack: Free $0, 100 requests/month, real-time flights, HTTPS, non-commercial only; Basic $49.99/mo (10,000 requests, historical, commercial); Professional $149.99; Business $499.99 — [AviationStack](https://aviationstack.com/product)
- AeroDataBox: marketplace Basic free (RapidAPI "free forever" 400 units/mo, 1 req/s); Pro $8 on RapidAPI (5,000 units); direct plans from $19/mo (40,000 units; shown as "coming soon"); direct free plan via ADS-B data contribution; flight plans add-on doubles lookup cost, mainland US flights since Jan 2026 only; coverage "not worldwide" — [AeroDataBox pricing](https://aerodatabox.com/pricing/)
- AirLabs: has a free package (limit not stated on pricing page); flight endpoint takes flight_icao or flight_iata (not reg/hex) and returns dep_icao, arr_icao, dep_time, arr_time, reg_number, hex; plan-gated fields unclear; page comparison table suggests about $19/10k, $99/100k, $499/1M requests (columns unlabeled, unverified) — [AirLabs flight docs](https://airlabs.co/docs/flight), [AirLabs pricing](https://airlabs.co/#pricing)
- Aviation Edge: Developer 30,000 calls $7 first month then $299/mo; Business 100,000 $15 then $599; no true free trial (free key with limited data/calls); tracker, real-time/historical/future schedules — [Aviation Edge](https://aviation-edge.com/premium-api/)

### Inferences
- A callsign like MXY1606 would map to flight_icao "MXY1606" on AirLabs, plausible but unverified; AeroDataBox and AviationStack mostly key on IATA flight numbers (e.g. MX1606), which would need a callsign-to-IATA mapping.
- AeroDataBox via RapidAPI (400 units/mo free) fits a few hundred lookups, but tier-2 endpoints may cost 2+ units each and the flight-plan add-on doubles cost.

### Gaps
- FlightLabs pricing page returned 404; Cirium, OAG, FlightAware Firehose not researched.
- AirLabs free-tier request limit and terms, and which fields are paywalled: not stated on pages read.
- Breeze Airways (MXY) / GA coverage for AviationStack, AirLabs, AeroDataBox, Aviation Edge: not verified for any vendor.
- Terms on caching/display for all vendors: not read (need review by the appropriate owner).
- Node.js ease: all are simple REST + key (AeroAPI via `x-apikey` header; AirLabs/AviationStack via `api_key`/`access_key` query param, partly inferred); no SDK needed.
