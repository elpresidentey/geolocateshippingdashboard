# Orbital Freight

An installable personal Earth operations monitor for vessel traffic, saved-place
weather, and satellite fire detections.

## What is real

Every number on the page is sourced. Anything that cannot be sourced is displayed
as `--` or "unavailable" rather than filled with a plausible value.

| Data | Source | Key needed |
| --- | --- | --- |
| ISS position, altitude, velocity | [wheretheiss.at](https://wheretheiss.at) · TLE/SGP4 propagation (NORAD 25544) | no |
| Moon geocentric position and velocity | [NASA/JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html), refreshed every minute through `api/moon.js` | no |
| Mercury through Pluto heliocentric positions | [NASA/JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html), Sun-centered state vectors through `api/planets.js`, refreshed every five minutes | no |
| Port weather (Lagos, Rotterdam) | Open-Meteo model analysis (nowcast) | no |
| Saved-place weather and 6-hour precipitation outlook | Open-Meteo forecast API | no |
| Global cloud cover, precipitation, and wind | Open-Meteo current model fields sampled on a 15° grid | no |
| Sea state / wave height | Open-Meteo marine model · offshore North Sea gridpoint | no |
| Day/night terminator | computed from UTC (solar longitude, exact declination, equation of time) | no |
| Earth textures | NASA Blue Marble & "Earth at Night" composites via third-party mirrors | no |
| Vessel positions | AIS provider, via `api/vessels.js` | **yes** |
| Active-fire detections | NASA FIRMS VIIRS near-real-time feed, via `api/fires.js` | **yes** |

Route distances are true great-circle calculations. Route ETAs divide that
distance by a stated 17-knot service speed (17 × 1.852 × 24 ≈ 756 km/day) — a
planning figure, not a booking. There is no composite maritime risk score;
weather and fire notices are source-specific screening cues, not official
warnings or a substitute for local authorities.

## Known simplifications

- Earth and Moon use near-true relative size and geocentric distance. The Moon
  position follows JPL Horizons vectors, with velocity carried between minute
  updates. Its dashed orbit line is an instantaneous two-body osculating ellipse,
  so it is a local path approximation rather than a multi-week prediction.
- The Solar System view uses current JPL heliocentric vectors and preserves each
  body's ecliptic direction. Radial distance is logarithmically compressed so
  the full system fits on screen; the displayed AU values remain real. Planet
  bodies can be selected from the focus menu or by clicking them in the model;
  the menu also opens dedicated Earth, Moon, and Sun close-ups. A single-planet
  view includes its live AU and ecliptic position readout. Sizes
  are enlarged and are not to scale. Velocity carries each position
  forward between feed refreshes; stale positions remain labeled if JPL is
  temporarily unavailable.
- The background starfield is synthetic, not a star catalog.
- The planet map textures are visual references, not scientific imagery
  products. The Pluto map is NASA New Horizons data; other maps are from Solar
  System Scope and distributed under CC BY 4.0.
- Global weather fields are sampled at 15° intervals and interpolated for
  display. They are model output, not satellite imagery or station observations.
- Saved weather places use point forecasts. Advisory thresholds are screening
  cues from model output, not official warnings or safety guidance.
- FIRMS points are satellite thermal detections, not fire incident perimeters
  or verified incident counts. When the global map exceeds 2,500 points, only
  the highest FRP detections are plotted; nearby-fire cues can then be incomplete.
  Confirm nearby conditions with local authorities.
- City-lights texture is the pre-VIIRS NASA composite, not Black Marble.
- ISS position is propagated client-side (satellite.js SGP4, element set
  refreshed every 6 h from a third-party TLE service); without the TLE feed the
  app falls back to wheretheiss.at SGP4 anchors with orbital-mechanics
  extrapolation between 15-second fixes — not live radar tracking.

## Enabling live vessel positions

Live AIS comes from [aisstream.io](https://aisstream.io), which is WebSocket-only and explicitly does not allow browser connections from its docs — that is exactly why the key cannot live in the page. Get a free key from their dashboard, then set it in the Vercel environment for `geolocateshippingdashboard`:

```
AISSTREAM_API_KEY=your-key-here
```

Optional tuning:

```
AIS_BBOX=103.4,1.0,104.4,1.9   # "minLon,minLat,maxLon,maxLat" — one region to cover
AIS_LIMIT=120                  # cap vessels returned
```

By default `api/vessels.js` keeps one long-lived WebSocket to the stream service and covers the six busy corridors the globe draws. The key stays server-side; the browser only ever sees the normalized vessel list. Without a key it returns `{ configured: false }` and the UI states that the live feed is unavailable instead of plotting invented markers.

## Enabling satellite fire detections

Request a free NASA FIRMS MAP_KEY from [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/), then set it in the Vercel environment:

```
FIRMS_MAP_KEY=your-map-key-here
```

The server-side `/api/fires` endpoint requests a global one-day VIIRS near-real-time feed every 15 minutes. The key never reaches the browser. The default source is `VIIRS_NOAA20_NRT`; `FIRMS_SOURCE` may be set to `VIIRS_NOAA21_NRT` or `VIIRS_SNPP_NRT`. FIRMS detection timing varies by satellite and location. A detection is not a confirmed fire perimeter.

## Personal weather watch

Search for a place or explicitly choose **Use my location** in the Monitor panel. Place names and forecast coordinates are sent to Open-Meteo; up to five saved places are kept in this browser's local storage and are not written to this project's server. The app shows current model conditions and the maximum precipitation probability over the next six hourly steps. Browser location is not requested until the button is pressed.

## Personal camera feeds

Camera feeds are optional and configured in the browser's Monitor panel. Up to
eight HTTPS sources are saved on that device only and connect only when opened.
Supported sources are HLS playlists (`.m3u8`), MJPEG streams, MP4/WebM, and
YouTube live/video links. HLS sources must permit browser cross-origin playback.
RTSP cameras need a secure HLS or browser-ready bridge; the app does not include
or discover private ship/port cameras. These video feeds are supplemental views,
not a substitute for bridge instruments or navigational charts.

To go live locally:

```
npm install
vercel dev
```

Tests for the proxy's response mapping, junk-row filtering, and error paths:

```
node test/vessels.test.mjs
```

## Running without Vercel

The globe and all free telemetry work from any static server:

```
python -m http.server 8000
```

The AIS and FIRMS panels require the serverless endpoints and their respective keys. Use `vercel dev` for those locally; the free weather feeds also work from a static server.

## Structure

- `index.html` — the whole application: styles, markup, and the three.js module
- `sw.js` — service worker. Caches the shell, never caches `/api/` or live data
- `manifest.webmanifest` — PWA manifest with maskable icons and shortcuts
- `api/vessels.js` — server-side AIS proxy
- `api/fires.js` — server-side NASA FIRMS proxy
- `api/moon.js` — server-side NASA/JPL Horizons lunar state-vector proxy
- `api/planets.js` — server-side NASA/JPL Horizons heliocentric planet-vector proxy
- `test/vessels.test.mjs` — proxy tests (no key required)
- `icons/` — 192, 512, and maskable icons
