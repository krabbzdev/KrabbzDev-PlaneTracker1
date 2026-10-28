# Krabbz9999 - Look A Plane!

A live dashboard of the planes flying over your house. Runs on any Windows PC as a single `.exe`,
shows a map of everything nearby, and takes over the screen with a close-up and a spoken alert
when a plane passes right overhead.

## Install

1. Download **`Krabbz9999-FlightTracker-Setup.exe`** from the [latest release](../../releases/latest) and run it.
   - Windows may say *"Windows protected your PC"* because the app isn't code-signed.
     Click **More info → Run anyway**.
   - It installs for you only, **without admin rights**, into
     `C:\Users\Public\Apps\Krabbz9999-FlightTracker`, with a Start menu entry. Optional: a desktop
     shortcut, and starting with Windows (in the tray, without opening the browser).
2. Your browser opens the dashboard at `http://localhost:8090`. The first time, it asks for your
   **ZIP code or address**. That's it.

Nothing else to install: no Node.js, no accounts. The dashboard can only be opened on the PC it's
installed on. To stop it, right-click the ✈ tray icon → **Quit**. To uninstall, use Windows
**Settings → Apps** (your settings and log are left in the install folder; delete it to remove them).

The plain `Krabbz9999-FlightTracker.exe` is in each release too: it's what installed copies update
themselves from, and it still runs on its own from any folder.

## Updates

The app checks this repository's releases a minute after it starts and every 6 hours. When there's a
newer build it downloads it, swaps itself and restarts, and open pages reload onto the new version.
You can turn that off, or check now, under **⚙ Settings → Updates**. The build number is shown in the
bottom-right corner.

## Features

- **Live map** of aircraft around home (default 20 mile radius), with airports, your home and an optional office
- **Weather overlay**: live rain radar on the map (US, NWS NEXRAD via Iowa Environmental Mesonet), switched on with 🌧 Weather
- **Aeronautical charts**: the FAA's VFR Sectional, VFR Terminal Area, IFR Low and IFR High Enroute charts under the map, picked with 🗺 Chart (US, not for navigation)
- **For pilots**: airport weather dots coloured by flying conditions (VFR / MVFR / IFR / LIFR), the FAA's temporary flight restrictions (TFRs) as red areas, a day/night line, a distance and heading tool, the likely runway in use and sunrise/sunset on airport cards, squawk, vertical speed and pressure + GPS altitude on planes, and knots / nautical miles as an option
- **Cruise ships and boats** (optional, free): live ship positions from [AISStream.io](https://aisstream.io), with cruise ships highlighted and listed in a Cruise ships panel. Needs your own free AISStream key (Settings → More)
- **Tray icon**: a ✈ in the Windows system tray while it runs; click to open the dashboard, right-click → Quit to stop it (a tiny helper, tray/Tray.cs, carried inside the .exe and unpacked next to it)
- **Overhead Plane Alert**: inside the overhead circle (1 mile to start, adjustable), a full-screen close-up with the flight path,
  predicted closest approach, where it's from and going, plus a chime and an upbeat spoken alert with the plane type, speed,
  altitude and destination. You can rewrite what it says in Settings → Alerts (🔔 Sound toggle)
- **Airport and helipad details**: click any airport, heliport or seaplane base for its runways or helipads, radio
  frequencies, current weather, planes arriving and leaving right now, a Wikipedia summary and handy links
- **Aircraft details**: photo, maker and model, airline, owner, route, altitude, speed and time tracked
- **Favorite planes**: star any plane (or type its tail number) and the app watches for it worldwide, shows whether
  it's flying now or where it was last seen, and pops up when it flies into range
- **Plane finder**: type a tail number (like N1932K) in the Jump to box to go to the plane, live, or to where the app
  last heard it
- **Tail-number panel**: click any registration for owner and registration details and a flight-path map
- **ADS-B Exchange viewer** for any plane, without leaving the dashboard
- **Military / interesting / emergency** aircraft highlighted, with pop-up alerts
- **Today's log**: aircraft count, by-hour chart and leaderboards (closest, lowest, fastest, highest, airlines, types)
- **FlightAware feeder stats** if you feed FlightAware (add your username in Settings)

## Settings (⚙)

Everything personal is stored in `settings.json` next to the `.exe`, so each installation is its own:
home address, an optional office, your FlightAware username, and an optional contact for photo lookups.

## Data sources and credits

| What | Source |
|---|---|
| Live aircraft | [adsb.fi](https://adsb.fi) open data (free for personal, non-commercial use) |
| Photos | [Planespotters.net](https://www.planespotters.net) (photographer credited), else a stock model photo from [Wikipedia](https://www.wikipedia.org) |
| Aircraft and owner info | [adsbdb](https://www.adsbdb.com), optional FAA registry file |
| Routes | [adsb.lol](https://adsb.lol) route data, adsbdb |
| Airports, runways, radio frequencies | [OurAirports](https://ourairports.com) (public domain) |
| Airport weather | [NOAA Aviation Weather Center](https://aviationweather.gov) (US government, public domain) |
| Airline logos | [sexym0nk3y/airline-logos](https://github.com/sexym0nk3y/airline-logos) via jsDelivr (logos are trademarks of their airlines) |
| Aeronautical charts | [FAA Aeronautical Information Services](https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/) (US government, public domain) |
| Airport weather (METARs) | [NOAA Aviation Weather Center](https://aviationweather.gov) (US government, public domain) |
| Temporary flight restrictions | [FAA TFR list](https://tfr.faa.gov) (US government, public domain) |
| Weather radar | NWS NEXRAD via [Iowa Environmental Mesonet](https://mesonet.agron.iastate.edu) |
| Ships (optional) | [AISStream.io](https://aisstream.io) live AIS data, with your own free API key |
| Kokoro voices (optional) | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) via [kokoro-js](https://github.com/hexgrad/kokoro) (Apache 2.0), downloaded on first use from jsDelivr and Hugging Face; runs in your browser |
| Map | Esri World Dark Gray, [Leaflet](https://leafletjs.com) |
| Address lookup | [OpenStreetMap Nominatim](https://nominatim.org) |

Each service has its own terms; this project is for personal, non-commercial use.

## Optional: full FAA owner records

US registration details (co-owners, city/state, serial number, registration dates) come from the FAA.
The FAA doesn't allow automated downloads, so download
[ReleasableAircraft.zip](https://registry.faa.gov/database/ReleasableAircraft.zip) yourself (about 60 MB),
put it next to the `.exe` and restart. Street addresses are never shown.

## Building from source

Needs [Node.js](https://nodejs.org) 22+ (24 recommended).

```bat
node server.js        rem run from source at http://localhost:8090
build-exe.cmd         rem build Krabbz9999-FlightTracker.exe locally, for testing (and the installer, if Inno Setup 6 is installed)
release.cmd "notes"   rem bump the build number, tag and push; GitHub builds and publishes the release
```

`server.js` is the whole back end (no dependencies) and `index.html` is the whole front end.
Published `.exe` files are always built from this repository by
[GitHub Actions](.github/workflows/release.yml), never on a personal computer.

## Privacy

This program does not collect, store or send personal information to the author, and has no
analytics or tracking. Your settings stay in `settings.json` next to the program. To do its job it
contacts these services directly from your computer:

- **adsb.fi**: your home's map coordinates, to ask which aircraft are nearby; tail numbers you search for, and your favorite planes' codes, to find them
- **OpenStreetMap Nominatim**: an address you type into Settings, to find its coordinates
- **Planespotters.net, adsbdb, adsb.lol, Wikipedia**: aircraft identifiers, callsigns and registrations, to look up photos, owners and routes
- **FlightAware**: the feeder username in Settings, to show its public stats page
- **GitHub**: to check for and download updates
- **aviationweather.gov**: the area the map is showing (for the airport weather dots), and an airport's code or position when you click it
- **tfr.faa.gov**: nothing about you; the app downloads the list of current TFRs
- **Esri** (map tiles), **OurAirports** (airport list), **jsDelivr** (airline logos), **Iowa Environmental Mesonet** (weather radar), **AISStream.io** (only if you add a key: the area around your home, so it can send the ships there), **ADS-B Exchange** (only when you open its viewer), **jsDelivr** and **Hugging Face** (the Kokoro voice files, only if you pick a Kokoro voice; the words spoken never leave your PC)

## License

[MIT](LICENSE) © 2026 Krabbz9999
