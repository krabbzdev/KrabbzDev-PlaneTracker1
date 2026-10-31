# Fill route, speed and ship gaps cheaply

**Short answer:** Use FlightAware AeroAPI Personal for routes, keep reading speed and wind fields from adsb.fi (plus a local receiver if you build one), and for cruise ships combine a free "last seen" cache with a small prepaid VesselFinder balance. AeroAPI Personal has no monthly minimum, about $5 a month of free usage, and a licence limited to personal or academic use; a flight lookup costs $0.005, so a few hundred lookups a month stay inside the free allowance ([FlightAware AeroAPI](https://www.flightaware.com/commercial/aeroapi/)). No free source gives a real flight plan for private or GA flights, so those stay "unknown" unless you pay or guess. True airspeed, Mach, wind and temperature are free but rare: in one adsb.fi snapshot near Tampa only about 3% of planes (6-7 of 205) carried them, mostly airliners (researcher's own test, 150 nm around Tampa, one snapshot). For ships, no free source gives satellite (mid-ocean) positions; the only published satellite price is VesselFinder at 10 credits per fix, with 10,000 credits costing 330 EUR ([VesselFinder API](https://api.vesselfinder.com/docs/)). Several terms-of-use questions below are unverified and need review by the appropriate owner before you rely on them.

## 1. Flight origin and destination: AeroAPI first, free sources only for airlines

Your existing sources already cover scheduled airlines. adsbdb returned a route for MXY1606 (KLAS to KGPT) in a live test, but that is a fixed callsign-to-route record rather than that day's actual flight (researcher's own test; adsbdb documents callsign lookups at [adsbdb](https://github.com/mrjackwills/adsbdb)). Treat it as a hint and sanity-check it against the plane's position and heading. adsbdb credits its route data to David Taylor and Jim Mason and says it may not be copied or put into other databases without permission, so do not build a stored copy.

| Option | Data | Cost | Limits | Terms for personal app | Reliability | Difficulty |
|---|---|---|---|---|---|---|
| FlightAware AeroAPI Personal | Origin, destination (ICAO/IATA), scheduled and estimated times, status; lookup by callsign, registration or flight ID | $0.005 per flight lookup; about $5/month free ($10 for ADS-B feeders) | 10 result sets per minute; no history or alerts | Personal or academic only ([FlightAware](https://www.flightaware.com/commercial/aeroapi/)) | Likely good; Breeze and GA coverage not verified | Easy: one REST call with an `x-apikey` header |
| adsbdb / adsb.lol route data | Static callsign route, airlines only | Free | adsbdb limits and terms not stated; adsb.lol limits "dynamic" ([adsb.lol API](https://github.com/adsblol/api)) | Attribution and no-copy notes above | Fine for airlines, wrong on some days | Already done |
| OpenSky flights endpoint | Observed past flights with estimated airports | Free | Previous day or older only; 400 to 8,000 credits/day ([OpenSky docs](https://openskynetwork.github.io/opensky-api/rest.html)) | Research and non-commercial | Cannot help with today's flight | Moderate (OAuth2) |
| AviationStack free | Real-time flights | $0 | 100 requests/month, non-commercial ([AviationStack](https://aviationstack.com/product)) | Non-commercial | Depth and GA coverage unverified | Easy |
| AeroDataBox via RapidAPI | Flights and schedules | Free 400 units/month | Not worldwide; flight plans cost double and cover mainland US only since Jan 2026 ([AeroDataBox](https://aerodatabox.com/pricing/)) | Not read | Unverified | Easy, but keys on IATA numbers |
| AirLabs | dep/arr ICAO, times, registration | Free package, limit not stated | Plan-gated fields unclear ([AirLabs](https://airlabs.co/docs/flight)) | Not read | Unverified | Easy |
| Aviation Edge | Schedules, tracker | $7 first month, then $299/month ([Aviation Edge](https://aviation-edge.com/premium-api/)) | n/a | n/a | n/a | Poor value, skip |

Two things to know about AeroAPI. A callsign lookup returns a list of several dated flights for that ident, so your code must pick the one that matches today's time; this comes from third-party docs rather than FlightAware's own documentation. And owning a FlightAware website account or feeding them data does not include API access: a forum reply says feeders still need a Personal AeroAPI account ([FlightAware forum](https://discussions.flightaware.com/t/does-being-a-flight-feeder-entitle-you-to-api-access/100067)). Your build 67.8 already has an optional AeroAPI key field, so this option is mostly done; the remaining work is checking that it picks the right dated flight and caches results.

For private N-numbers with no airline flight plan, the honest choices are "unknown" or a labelled guess: nearest airport to where the plane was first seen low and slow, and nothing reliable for destination. I found no documented method for destination guessing. FAA SWIM is free but needs an FAA account and signed agreement, and I could not confirm it exposes origin and destination for GA, so I rank it as not worth the effort for one user ([FAA SWIM](https://www.faa.gov/air_traffic/technology/swim/products/get_connected)). ADS-B Exchange offers about $10/month for 10,000 requests, but I found no route endpoint ([ADSBx](https://www.adsbexchange.com/api-lite/)). airplanes.live no longer answered the researcher's test without contacting them and has no route endpoint ([api-archive](https://github.com/airplanes-live/api-archive)).

## 2. Speed, Mach, wind and temperature: you probably already have what exists

Aircraft broadcast or answer with these values only sometimes, so no source can supply them for every plane. The readsb receiver software exposes true airspeed (`tas`), indicated airspeed (`ias`), `mach`, magnetic heading, and altimeter setting (`nav_qnh`), and it calculates wind direction and speed (`wd`, `ws`) and outside and total air temperature (`oat`, `tat`) from them ([readsb README-json](https://github.com/wiedehopf/readsb/blob/dev/README-json.md)). Calculated temperature is "typically somewhat inaccurate" at low altitude or below Mach 0.5, and is not calculated below Mach 0.395, so small GA planes will rarely show wind or temperature.

The adsb.fi feed you already use passes these fields through, but only about 3% of aircraft in the researcher's one snapshot carried them (other fields were far more common: `nav_qnh` on 152 of 205, `nav_altitude_mcp` on 147). adsb.fi allows 1 request per second, personal non-commercial use, and requires you to cite them ([adsb.fi opendata](https://github.com/adsbfi/opendata)). So the cheapest step is to read those fields in your existing code, treat every one as optional, and hide the line when missing. A local receiver adds no new kinds of data; it only helps if your antenna hears planes the aggregator mix hears poorly. If you build one, read its `aircraft.json`, key by `hex`, and try these paths in order: `/tar1090/data/aircraft.json`, `:8080/data/aircraft.json`, `/dump1090-fa/data/aircraft.json`. Those paths come from older forum posts and vary by install ([FlightAware forum](https://discussions.flightaware.com/t/aircraft-json-file/80072)).

## 3. Ship by name: free "last seen" cache plus pay-as-you-go satellite

AISStream, which you already use, is a push feed: you subscribe by region or up to 200 ship IDs, and it has no documented "where was this ship last" query ([AISStream docs](https://aisstream.io/documentation)). Terrestrial AIS reaches roughly 40 nm (up to about 80 nm) from shore, so mid-ocean is a blind spot that only satellite AIS fills ([Spire whitepaper](https://spire.com/wp-content/uploads/2020/02/spire_maritime_d-ais_whitepaper.pdf)). A name search is therefore a two-step job: keep a local table mapping names like "Carnival Breeze" to IMO and MMSI numbers (VesselFinder does not search by name), then query by number.

| Option | Data | Cost | Limits | Terms | Reliability | Difficulty |
|---|---|---|---|---|---|---|
| Last-seen cache from AISStream (save each ship's last fix to disk) | Last position and time while in coastal range | Free | Only ships you have heard; stale mid-ocean | AISStream terms not on its docs page | Honest if labelled with age | Easy |
| Itinerary estimate (last port to next port at about 18-20 kn, labelled "estimated") | Rough position, likely tens of nm off | Free, but itineraries are hand-entered | No verified free machine-readable itinerary source | Cruise-line page terms unchecked; do not scrape | Rough | Moderate |
| VesselFinder API | Timestamp, lat, lon, and `SRC` (TER or SAT) by IMO or MMSI | 1 credit terrestrial, 10 credits satellite; 10,000 credits = 330 EUR, expire after 12 months; trial on request ([docs](https://api.vesselfinder.com/docs/vessels.html)) | Satellite fix only returned if newer than last terrestrial | Personal-use terms not found | Unverified for cruise ships mid-ocean | Easy |
| Datalastic | Vessel lookups; satellite "estimator" add-on on top plans | Credit plans, 14-day trial; prices not visible ([Datalastic](https://datalastic.com/pricing/)) | Name search and satellite behaviour unverified | Not read | Unknown | Easy |
| AISHub | Volunteer-receiver coverage, terrestrial | Free if you share your own receiver feed (10+ vessels, 90% uptime) | 1 request/minute ([AISHub](https://www.aishub.net/join-us)) | Credit "Data: AISHub contributors" | Coastal only | Needs hardware |
| MarineTraffic, Spire, Kpler | Satellite | Quote-based; one forum anecdote of about 200 EUR/month for 20 boats | n/a | Not found | Likely good | Overkill |
| CruiseMapper | Itineraries and positions | No API | Terms allow personal viewing and caching only ([terms](https://cruisemapper.com/terms-of-use)) | Do not scrape | n/a | Do not use |

VesselFinder cost depends on how you poll. Checking five ships a few times a day with satellite requests could reach about 150 EUR a month in the worst case (researcher's calculation). Calling it only when you click a ship, only when AISStream has nothing newer than 1-2 hours, and caching the answer for several hours brings it to roughly 14 EUR a month at about 10 satellite lookups a week. The real cost is the 330 EUR minimum pack, which would last over a year at that rate. BarentsWatch (free, Norway only) helps only for Norwegian cruises ([BarentsWatch](https://developer.barentswatch.no/docs/AIS/live-ais-api)).

## Ranked recommendation

1. **Routes:** AeroAPI Personal, only when a plane's card is open, cached about 10 minutes (what build 67.8 already does). Keep adsbdb as the free first pass for airlines, with a position check.
2. **Speed and wind:** Show adsb.fi's `tas`, `mach`, `wd`, `ws`, `oat` when present; skip the local receiver unless you want it for other reasons.
3. **Ships, step one (free):** Name-to-IMO/MMSI table, persistent AISStream last-seen cache, and a labelled itinerary estimate.
4. **Ships, step two (optional spend):** VesselFinder on click with satellite requested, cached for hours, after using the free trial to test a real cruise ship.
5. **Compare:** Datalastic 14-day trial if VesselFinder's trial disappoints.
6. **Skip:** Aviation Edge, MarineTraffic/Spire/Kpler quotes, CruiseMapper scraping, FAA SWIM.

## What could not be verified

- AeroAPI: exact response fields and `ident_type` values (official docs were unreadable), Breeze and GA coverage, caching and display terms in the licence PDF, and whether the free credit needs a card at signup.
- Whether adsbdb, hexdb.io, AISStream and VesselFinder permit a personal app's use and caching; no terms were read for adsbdb, hexdb.io, AirLabs, AviationStack, AeroDataBox or Aviation Edge. Compliance questions need review by the appropriate owner.
- Whether VesselFinder or Datalastic returns satellite fixes for cruise ships mid-ocean in practice, how fresh they are, Datalastic's prices, and whether Datalastic searches by name.
- AISStream's coverage source and whether it includes any satellite data.
- The readsb version and flags needed for wind and temperature, the current PiAware port and path, and which fields airplanes.live exposes.
- FAA SWIM contents for GA flights; adsb.lol's route endpoint request format; OpenFlights and flightplandatabase.com.
- The MXY1606 and adsb.fi results come from the researcher's own one-off tests, not documentation, and may change.
