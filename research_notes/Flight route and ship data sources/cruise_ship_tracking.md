# Cruise ship tracking beyond AISStream (worldwide / mid-ocean)

## Which sources can give mid-ocean positions for a named ship (by MMSI/IMO), cost, and terms?

### Takeaway
Only paid APIs sell satellite (S-AIS) positions. VesselFinder API is the only one with published prices (10 credits per satellite position vs 1 terrestrial; 10,000 credits = 330 EUR, so about 3.30 EUR per satellite fix). MarineTraffic, Spire, Datalastic satellite and ORBCOMM/exactEarth are quote-based or unverified. Free feeds (AISStream, AISHub, national feeds) are terrestrial or regional.

### Cited Findings
- AISStream: 3 subscribed connections per account, 3 per IP, 1 subscription update/sec, 200 MMSI filters per subscription; bounding boxes required; from Sept 2026 uncompressed connections get per-user bandwidth limits. The docs page does not state coverage source, satellite data, free tier or terms. — [AISStream docs](https://aisstream.io/documentation)
- AISHub: free access requires sharing raw NMEA from your own receiver (no synthetic/scraped/public-service data). API key needs >=10 vessels, >=90% uptime, <=60s downsampling, <=10s delay. API limit 1 request/minute. Use in apps allowed (even commercial) with credit "Data: AISHub contributors"; raw redistribution banned; not for navigation. — [AISHub join-us](https://www.aishub.net/join-us) (full terms at https://www.aishub.net/terms, not read)
- VesselFinder API: credit packs 10,000 = 330 EUR, 20,000 = 625 EUR, 50,000 = 1,470 EUR; credits expire after 12 months; excl. VAT. Terrestrial position 1 credit, satellite position 10 credits. LiveData/VesselsList are flat-fee subscriptions. Free trial on request via Contact Us (credit amount unstated). Position data "refreshed every few seconds". — [VesselFinder API docs](https://api.vesselfinder.com/docs/), [FAQ](https://api.vesselfinder.com/docs/faq.html)
- Datalastic: plans Starter (20,000 credits/mo), Growth (80,000), Developer Pro (unlimited); 14-day trial with money-back guarantee; 1 credit basic vessel lookup, 3 Pro; failed/empty responses not charged; a "SAT-E Satellite Estimator" add-on exists only on All Data plans. Monthly prices not visible in fetched text. — [Datalastic pricing](https://datalastic.com/pricing/); docs at https://docs.datalastic.com/
- MarineTraffic API (Kpler): credit-metered, satellite access paywalled and quoted via sales. One April 2026 comparison lists Basic 10 GBP/mo (10 vessels, terrestrial) and Essential 100 GBP/mo (50 vessels), unconfirmed against MarineTraffic's own page. One forum anecdote: ~200 EUR/mo for 20 boats, satellite "much higher". — [maritimepage.com comparison](https://maritimepage.com/marinetraffic-vs-vesselfinder/), [G2](https://g2.com/products/kpler-marinetraffic/pricing)
- Spire Maritime: no public price list found; quote-based; free sample for historical data; personal-use terms not found. — [Spire Historical AIS](https://spire.com/?p=7420), [Spire Maritime](https://maritime.spire.com)
- MyShipTracking API: lookup by MMSI or IMO, 1 credit simple / 3 extended per vessel; third-party review lists entry tier EUR 90/mo with 50,000 credits (unconfirmed); described as terrestrial, satellite not mentioned. — [API listing](https://github.com/api-evangelist/myshiptracking), [fitgap](https://us.fitgap.com/products/046226/myshiptracking)
- BarentsWatch (Norway): open AIS from Kystverket coastal stations, Equinor offshore and Norwegian satellites, but only Norway EEZ plus Svalbard/Jan Mayen zones, excludes fishing <15 m and leisure <45 m, 14-day retention. NLOD license, free, attribution "Data levert av BarentsWatch", self-register an API client. Useful only for ships near Norway. — [BarentsWatch live AIS API](https://developer.barentswatch.no/docs/AIS/live-ais-api), [API terms](https://www.barentswatch.no/en/articles/api-terms-and-conditions/), [Kystverket](https://www.kystverket.no/en/sea-transport-and-ports/ais/access-to-ais-data/)
- Digitraffic (Finland): described as an "open data API" for AIS; coverage, rate limits, license not confirmed. — [Digitraffic marine](https://www.digitraffic.fi/en/marine-traffic/)
- Global Fishing Watch API: non-commercial only, attribution required, internal-business use not licensed publicly; AIS-based aggregate products (4Wings), not a live named-ship feed; passenger-vessel coverage unverified. — [GFW API doc](https://api-doc.globalfishingwatch.org/)
- CruiseMapper: no official API found; terms allow viewing/caching/printing for own personal use only; only third-party scrapers exist (not to be used). — [CruiseMapper terms](https://cruisemapper.com/terms-of-use)
- Terrestrial AIS reaches roughly 40 nm (up to ~80 nm) from shore, so mid-ocean is a blind spot; satellite AIS fills it. — [Spire D-AIS whitepaper](https://spire.com/wp-content/uploads/2020/02/spire_maritime_d-ais_whitepaper.pdf), [Kpler blog](https://www.kpler.com/blog/from-shorelines-to-the-open-oceans-full-visibility-with-ais-vessel-tracking)

### Inferences
- Cheapest satellite for a handful of ships: VesselFinder credits. 5 ships polled every 6 h = 20 fixes/day x 10 credits = 200 credits/day, about 6,000/month (~200 EUR/month at the 330 EUR/10k rate). Every 12 h halves that. Assumes each call returns a satellite fix, unconfirmed.
- Datalastic Starter may be the cheapest flat monthly option with a trial, but whether its positions are satellite is unverified.
- AISStream stays the best free live feed near coast. AISHub needs your own receiver (a cheap RTL-SDR near Tampa Bay would qualify but only adds local coverage).

### Gaps
- AISStream coverage source, ToS, any satellite data: not on its docs page. Ask support.
- Datalastic monthly prices, rate limits, satellite coverage: not visible.
- VesselFinder API personal-use terms and MMSI/IMO lookup support: not found.
- MarineTraffic official pricing, Spire, ORBCOMM, exactEarth (now part of Spire), Kpler: no official pricing found.
- NOAA MarineCadastre (believed historical only), ShipXplorer, aprs.fi AIS, BelugaProject, chaos-consulting, thecruiseglobe, pavlus.com, cruisesheet, VesselFinder website terms: not researched (tool budget).

## Is combining a free source with itinerary data to estimate position feasible?

### Takeaway
Yes, as a schedule-based dead-reckoning estimate, but I found no verified machine-readable cruise itinerary API, so itineraries would be maintained by hand or from licensed sources.

### Cited Findings
- Datalastic sells a satellite "estimator" add-on, showing this is a recognized approach. — [Datalastic pricing](https://datalastic.com/pricing/)
- VesselFinder API has PortCalls and ExpectedArrivals methods (1-5 credits). — [VesselFinder API docs](https://api.vesselfinder.com/docs/)
- MyShipTracking API has port-call and ETA endpoints. — [API listing](https://github.com/api-evangelist/myshiptracking)
- Open-ocean AIS gaps can be routine, not suspicious. — [AXS Marine](https://public.axsmarine.com/blog/ais-for-shipping)

### Inferences
- Keep last AIS fix from AISStream. When stale (over 1-2 h) and the ship was heading out to sea, interpolate along a sea route from last known port to the next scheduled port using cruise speed (~18-20 kn) and the scheduled arrival, and label it "estimated". Error is likely tens of nm, fine for a hobby map.
- Itinerary data: cruise-line official pages (check each line's terms, no scraping) or hand-entered table; Wikipedia/Wikidata only give static ship data.

### Gaps
- No verified free licensed itinerary API. Wikidata schedule data not researched. CruiseMapper has no API and personal-use-only terms.

## Ranked recommendation (inference from above)
1. Keep AISStream (free) and add itinerary-based dead-reckoning for mid-ocean.
2. For real satellite fixes on a few ships: VesselFinder API prepaid credits (only published S-AIS price, trial on request), polled every 6-12 h only when AISStream is stale.
3. Datalastic 14-day trial to compare.
4. MarineTraffic/Spire/Kpler: quote-only, likely overkill.
5. Optional: AISHub via own receiver; BarentsWatch for Norway cruises.
Licensing/ToS questions for any provider should go to the appropriate owner for review.

## Coordinator focus: type a ship name, get last reported position and timestamp anywhere (main lens)

### Takeaway
Name-to-position needs two steps: resolve name to IMO/MMSI once (keep a local table of cruise ships), then query by ID. VesselFinder API is the cheapest verified route to satellite last positions: lookup by IMO/MMSI, returns TIMESTAMP/LAT/LON and a SRC flag (TER or SAT), 10 credits per satellite fix. A handful of ships a few times a day costs roughly 5-15 EUR/month in credits.

### Cited Findings
- VesselFinder Vessels method: takes imo and/or mmsi (comma lists, mixable); a name parameter is NOT supported. Optional interval (max position age in minutes) and sat=1 to request satellite; satellite positions only returned if newer than the last terrestrial one. Response has TIMESTAMP, LATITUDE, LONGITUDE and SRC (TER/SAT). 1 credit terrestrial, 10 credits satellite. — [VesselFinder Vessels docs](https://api.vesselfinder.com/docs/vessels.html), [pricing](https://api.vesselfinder.com/docs/)
- VesselFinder credits: 10,000 for 330 EUR (about 0.033 EUR/credit), free trial on request. — [VesselFinder API docs](https://api.vesselfinder.com/docs/)
- MyShipTracking API: lookup by MMSI or IMO, credits per vessel; satellite not documented. — [API listing](https://github.com/api-evangelist/myshiptracking)
- Datalastic: credit-based vessel lookups, 14-day trial; name search endpoint, timestamp field and satellite coverage not verified (docs page fetch returned only a redirect/summary). — [Datalastic pricing](https://datalastic.com/pricing/)
- AISStream: subscription by MMSI filter (up to 200) and bounding box, push-only stream; no last-known-position query documented, so a ship is only seen while it is transmitting within terrestrial range and your connection is open. — [AISStream docs](https://aisstream.io/documentation)
- AISHub: API returns positions for vessels in its network (coverage = volunteer receivers, terrestrial), 1 request/min, requires sharing own receiver data. — [AISHub join-us](https://www.aishub.net/join-us)
- MarineTraffic/Spire/Kpler: satellite quote-based, no verified public per-lookup price. — [G2](https://g2.com/products/kpler-marinetraffic/pricing)

### Inferences
- Cost for one user, 5 ships, checked on demand ~3x/day with sat=1: 15 lookups/day x up to 10 credits = 150 credits/day, ~4,500/month, ~150 EUR/month worst case. Cheaper: only call VesselFinder when the user clicks a ship and AISStream has nothing newer than ~1-2 h; cache the result for several hours. At ~10 satellite lookups/week the cost is about 100 credits/week, or roughly 14 EUR/month. Prepaid packs expire after 12 months, so one 10,000-credit pack (330 EUR) covers well over a year at that light usage, though the minimum buy is the real cost.
- Expected freshness: satellite AIS fixes for a ship are typically tens of minutes to hours old; the SRC and TIMESTAMP fields let the UI show age honestly (unverified for cruise ships specifically).
- Free approximation: persist the last AISStream fix per MMSI to disk (a "last seen" cache), and when stale compute an estimate from itinerary (last port departure, next port arrival, route, speed). Feasible and free, label as "estimated, last AIS fix X h ago". No free/open source found that gives true satellite last positions by name.
- Ranked for this use case: (1) local name-to-IMO/MMSI table + AISStream last-seen cache + itinerary estimate (free); (2) VesselFinder API on demand with sat=1 and a cache (cheapest verified satellite); (3) Datalastic trial/Starter as alternative (verify name search and satellite first); (4) MarineTraffic/Spire only if quotes are acceptable.

### Gaps
- Datalastic name search, timestamp, satellite behavior; VesselFinder personal-use terms; whether VesselFinder return satellite fixes for cruise ships mid-ocean in practice; trial credit amount. Not verified.
