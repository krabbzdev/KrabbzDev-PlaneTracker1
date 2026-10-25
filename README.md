# Krabbz9999 - FlightTracker

A live dashboard of the planes flying over your house. Runs on any Windows PC as a single `.exe`,
shows a map of everything nearby, and takes over the screen with a close-up and a spoken alert
when a plane passes right overhead.

## Install

1. Download **`Krabbz9999-FlightTracker.exe`** from the [latest release](../../releases/latest).
2. Put it in its own folder, for example `C:\FlightTracker\`, and double-click it.
   - Windows may say *"Windows protected your PC"* because the app isn't code-signed.
     Click **More info → Run anyway**.
   - If Windows Firewall asks, allow **Private networks** so other devices at home can open it.
3. Your browser opens the dashboard at `http://localhost:8090`. The first time, it asks for your
   **home address**. That's it.

Nothing else to install: no Node.js, no accounts. Other devices on your network can open
`http://<that-PC's-name>:8090`. Close the black console window to stop it.

## Updates

The app checks this repository's releases a minute after it starts and every 6 hours. When there's a
newer build it downloads it, swaps itself and restarts, and open pages reload onto the new version.
You can turn that off, or check now, under **⚙ Settings → Updates**. The build number is shown in the
bottom-right corner.

## Features

- **Live map** of aircraft around home (default 20 mile radius), with airports, your home and an optional office
- **Weather overlay**: live rain radar on the map (US, NWS NEXRAD via Iowa Environmental Mesonet), switched on with 🌧 Weather
- **Overhead takeover**: within 1 mile, a full-screen close-up with the flight path, predicted closest
  approach, where it's from and going, plus a chime and a spoken "Overhead now!" alert (🔔 Sound toggle)
- **Aircraft details**: photo, maker and model, airline, owner, route, altitude, speed and time tracked
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
| Airports | [OurAirports](https://ourairports.com) (public domain) |
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
build-exe.cmd         rem build Krabbz9999-FlightTracker.exe locally, for testing
release.cmd "notes"   rem bump the build number, tag and push; GitHub builds and publishes the release
```

`server.js` is the whole back end (no dependencies) and `index.html` is the whole front end.
Published `.exe` files are always built from this repository by
[GitHub Actions](.github/workflows/release.yml), never on a personal computer.

## Code signing policy

Free code signing for this project will be provided by [SignPath.io](https://about.signpath.io),
with a certificate by [SignPath Foundation](https://signpath.org) (application in progress).

- **Author, reviewer and release approver:** [@showtechclove1](https://github.com/showtechclove1) (Krabbz9999)
- Every release is built by GitHub Actions from the tagged source in this repository.
- Only the maintainer above can push release tags, and each signing request is approved by them.

## Privacy

This program does not collect, store or send personal information to the author, and has no
analytics or tracking. Your settings stay in `settings.json` next to the program. To do its job it
contacts these services directly from your computer:

- **adsb.fi**: your home's map coordinates, to ask which aircraft are nearby
- **OpenStreetMap Nominatim**: an address you type into Settings, to find its coordinates
- **Planespotters.net, adsbdb, adsb.lol, Wikipedia**: aircraft identifiers, callsigns and registrations, to look up photos, owners and routes
- **FlightAware**: the feeder username in Settings, to show its public stats page
- **GitHub**: to check for and download updates
- **Esri** (map tiles), **OurAirports** (airport list), **ADS-B Exchange** (only when you open its viewer)

## License

[MIT](LICENSE) © 2026 Krabbz9999
