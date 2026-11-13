/** Current heliocentric planet state vectors from NASA/JPL Horizons. */
export const config = { runtime: 'nodejs', maxDuration: 60 };

// The docs live on ssd-api.jpl.nasa.gov; the Horizons query endpoint is on ssd.jpl.nasa.gov.
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const BODIES = [
  ['mercury', '199'], ['venus', '299'], ['earth', '399'], ['mars', '499'],
  ['jupiter', '599'], ['saturn', '699'], ['uranus', '799'],
  ['neptune', '899'], ['pluto', '999'],
];
const NUMBER = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[Ee][+-]?\\d+)?)';
const USER_AGENT = 'OrbitalFreight/1.1 (+https://geolocateshippingdashboard.vercel.app)';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function readNumber(block, label) {
  const match = block.match(new RegExp(`(?:^|\\s)${label}\\s*=\\s*${NUMBER}`, 'im'));
  return match ? Number(match[1]) : NaN;
}

function parseVector(result, name) {
  const block = String(result || '').split('$$SOE')[1]?.split('$$EOE')[0];
  if (!block) throw new Error(`JPL returned no ${name} vector.`);
  const vector = {
    xKm: readNumber(block, 'X'), yKm: readNumber(block, 'Y'), zKm: readNumber(block, 'Z'),
    vxKmS: readNumber(block, 'VX'), vyKmS: readNumber(block, 'VY'), vzKmS: readNumber(block, 'VZ'),
  };
  if (!Object.values(vector).every(Number.isFinite)) throw new Error(`JPL returned an incomplete ${name} vector.`);
  vector.distanceAu = Math.hypot(vector.xKm, vector.yKm, vector.zKm) / 149597870.7;
  return vector;
}

async function fetchBody(name, command, tlist, center = '500@10') {
  const params = new URLSearchParams({
    format: 'json', COMMAND: `'${command}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'", CENTER: `'${center}'`, TLIST_TYPE: "'CAL'", TLIST: `'${tlist}'`,
    TIME_TYPE: "'UT'", REF_PLANE: "'ECLIPTIC'", REF_SYSTEM: "'ICRF'", OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'2'", VEC_CORR: "'NONE'", VEC_LABELS: "'YES'", TIME_DIGITS: "'SECONDS'",
  });
  const url = `${API}?${params.toString().replace(/\+/g, '%20')}`;
  let lastError;
  // Horizons can briefly return 503 under load. Retry once with a short,
  // bounded backoff; never fan out concurrent requests to the public service.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': USER_AGENT },
        cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after'));
        lastError = new Error(`JPL returned HTTP ${response.status} for ${name}.`);
        if (attempt === 0) await pause(Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10000) : 1500);
        continue;
      }
      if (!response.ok) throw new Error(`JPL returned HTTP ${response.status} for ${name}.`);
      const data = await response.json();
      if (data.error) throw new Error(`JPL ${name}: ${String(data.error).slice(0, 140)}`);
      return [name, parseVector(data.result, name)];
    } catch (error) {
      lastError = error;
      if (attempt === 0 && (error?.name === 'TimeoutError' || error?.name === 'TypeError')) {
        await pause(1200);
        continue;
      }
      break;
    }
  }
  throw lastError || new Error(`JPL could not provide a ${name} vector.`);
}

export async function GET(request) {
  if (request.method !== 'GET') return Response.json({ error: 'GET only' }, { status: 405 });
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const two = n => String(n).padStart(2, '0');
  const tlist = `${now.getUTCFullYear()}-${months[now.getUTCMonth()]}-${two(now.getUTCDate())} ` +
    `${two(now.getUTCHours())}:${two(now.getUTCMinutes())}:${two(now.getUTCSeconds())}`;
  try {
    // JPL asks API clients to submit one request at a time. Sequential requests
    // avoid triggering service overload; isolated failures still leave the
    // remaining bodies available to the viewer.
    const bodies = {};
    const errors = {};
    let serviceBusy = false;
    for (const [name, id] of BODIES) {
      if (serviceBusy) {
        errors[name] = 'JPL temporarily unavailable; this position will retry on the next refresh.';
        continue;
      }
      try {
        const [bodyName, vector] = await fetchBody(name, id, tlist);
        bodies[bodyName] = vector;
      } catch (error) {
        errors[name] = String(error?.message || 'JPL lookup failed.').slice(0, 180);
        if (/HTTP (?:429|5\d\d)|timeout|fetch failed|network/i.test(errors[name])) serviceBusy = true;
      }
      // Keep a small gap between successive targets in addition to serializing them.
      await pause(350);
    }
    if (serviceBusy) {
      errors.moon = 'JPL temporarily unavailable; this position will retry on the next refresh.';
    } else {
      try {
        const [, moonVector] = await fetchBody('moon', '301', tlist, '500@399');
        bodies.moon = { ...moonVector, distanceKm: Math.hypot(moonVector.xKm, moonVector.yKm, moonVector.zKm) };
      } catch (error) {
        errors.moon = String(error?.message || 'JPL lookup failed.').slice(0, 180);
      }
    }
    return Response.json({ source: 'NASA/JPL Horizons', requestedAt: now.toISOString(),
      frame: 'Sun-centered ecliptic J2000',
      frames: { planets: 'Sun-centered ecliptic J2000', moon: 'Earth-centered geocentric ecliptic J2000' },
      units: 'km, km/s, AU', bodies, errors }, {
      headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=900' },
    });
  } catch (error) {
    return Response.json({ source: 'NASA/JPL Horizons', error: error?.name === 'TimeoutError'
      ? 'JPL Horizons timed out while loading the planet positions.'
      : String(error?.message || 'Could not load JPL planet positions.').slice(0, 220) }, {
      status: 502, headers: { 'cache-control': 'no-store' },
    });
  }
}
