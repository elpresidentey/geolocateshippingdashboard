/**
 * Server-side NASA FIRMS active-fire detections.
 *
 * FIRMS MAP_KEY stays in the deployment environment. The app requests one
 * global, one-day VIIRS near-real-time feed and receives normalized points;
 * these are satellite detections, not incident perimeters or fire counts.
 */
const FIRMS_URL = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';
const DEFAULT_SOURCE = 'VIIRS_NOAA20_NRT';
const SOURCES = new Set(['VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT', 'VIIRS_SNPP_NRT']);
const MAX_POINTS = 2500;

function csvRows(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const keys = lines.shift().split(',').map(s => s.trim());
  return lines.map(line => {
    const values = line.split(',');
    return Object.fromEntries(keys.map((key, i) => [key, (values[i] || '').trim()]));
  });
}

function finite(value) {
  if (value == null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalize(row) {
  const lat = finite(row.latitude), lon = finite(row.longitude);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const rawTime = String(row.acq_time || '').trim();
  const acquiredTime = rawTime ? rawTime.padStart(4, '0').replace(/^(\d{2})(\d{2})$/, '$1:$2') : '';
  return {
    lat, lon,
    frp: finite(row.frp),
    bright: finite(row.bright_ti4),
    confidence: String(row.confidence || '').trim().toLowerCase(),
    acquiredAt: [row.acq_date, acquiredTime].filter(Boolean).join(' '),
    satellite: String(row.satellite || '').trim(),
    daynight: String(row.daynight || '').trim().toUpperCase(),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ configured: false, observations: [], message: 'GET only' });
  }

  const key = process.env.FIRMS_MAP_KEY;
  if (!key) {
    return res.status(200).json({
      configured: false, source: DEFAULT_SOURCE, observations: [],
      message: 'NASA FIRMS is not configured. Set FIRMS_MAP_KEY on the server.',
    });
  }

  const requestedSource = String(process.env.FIRMS_SOURCE || DEFAULT_SOURCE);
  const source = SOURCES.has(requestedSource) ? requestedSource : DEFAULT_SOURCE;
  try {
    const url = `${FIRMS_URL}/${encodeURIComponent(key)}/${source}/world/1`;
    const response = await fetch(url, { headers: { Accept: 'text/csv' }, cache: 'no-store' });
    const body = (await response.text()).replace(/^\uFEFF/, '').trim();
    if (!response.ok) {
      return res.status(502).json({ configured: true, source, observations: [],
        message: `NASA FIRMS returned HTTP ${response.status}.` });
    }
    if (!body.toLowerCase().startsWith('latitude,')) {
      return res.status(502).json({ configured: true, source, observations: [],
        message: 'NASA FIRMS returned an unexpected response. Check the MAP_KEY and source.' });
    }
    const validDetections = csvRows(body).map(normalize).filter(Boolean);
    const observations = validDetections
      .sort((a, b) => (b.frp || 0) - (a.frp || 0)).slice(0, MAX_POINTS);
    return res.status(200).json({
      configured: true, source, detections: validDetections.length,
      returned: observations.length, limit: MAX_POINTS, capped: validDetections.length > MAX_POINTS,
      observations, retrievedAt: new Date().toISOString(),
      message: observations.length ? '' : 'No satellite fire detections in this feed window.',
    });
  } catch {
    return res.status(502).json({ configured: true, source, observations: [],
      message: 'Could not reach NASA FIRMS.' });
  }
}
