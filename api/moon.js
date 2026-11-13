/**
 * Current geocentric Moon state from NASA/JPL Horizons.
 *
 * Horizons does not allow direct browser embedding under NASA's CORS policy,
 * so this small server function keeps the request same-origin for the app.
 */
export const config = { runtime: 'nodejs', maxDuration: 15 };

// The docs live on ssd-api.jpl.nasa.gov; the Horizons query endpoint is on ssd.jpl.nasa.gov.
const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const NUMBER = '([+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[Ee][+-]?\\d+)?)';

function fail(message, status = 502) {
  return new Response(JSON.stringify({ source: 'NASA/JPL Horizons', error: message }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function readLabeledNumber(block, label) {
  const match = block.match(new RegExp(`(?:^|\\s)${label}\\s*=\\s*${NUMBER}`, 'im'));
  return match ? Number(match[1]) : NaN;
}

function parseStateVector(result) {
  const block = String(result || '').split('$$SOE')[1]?.split('$$EOE')[0];
  if (!block) throw new Error('JPL did not return an ephemeris vector.');
  const state = {
    xKm: readLabeledNumber(block, 'X'),
    yKm: readLabeledNumber(block, 'Y'),
    zKm: readLabeledNumber(block, 'Z'),
    vxKmS: readLabeledNumber(block, 'VX'),
    vyKmS: readLabeledNumber(block, 'VY'),
    vzKmS: readLabeledNumber(block, 'VZ'),
  };
  if (!Object.values(state).every(Number.isFinite)) {
    throw new Error('JPL returned an incomplete Moon state vector.');
  }
  state.distanceKm = Math.hypot(state.xKm, state.yKm, state.zKm);
  return state;
}

export async function GET(request) {
  if (request.method !== 'GET') {
    return fail('GET only', 405);
  }

  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const two = n => String(n).padStart(2, '0');
  const tlist = `${now.getUTCFullYear()}-${months[now.getUTCMonth()]}-${two(now.getUTCDate())} ` +
    `${two(now.getUTCHours())}:${two(now.getUTCMinutes())}:${two(now.getUTCSeconds())}.` +
    String(now.getUTCMilliseconds()).padStart(3, '0');

  const params = new URLSearchParams({
    format: 'json',
    COMMAND: "'301'",            // Moon
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@399'",         // Earth geocenter
    TLIST_TYPE: "'CAL'",
    TLIST: `'${tlist}'`,
    TIME_TYPE: "'UT'",
    REF_PLANE: "'ECLIPTIC'",
    REF_SYSTEM: "'ICRF'",
    OUT_UNITS: "'KM-S'",
    VEC_TABLE: "'2'",            // position and velocity
    VEC_CORR: "'NONE'",          // geometric geocentric state
    VEC_LABELS: "'YES'",
    TIME_DIGITS: "'SECONDS'",
  });
  // Horizons accepts encoded spaces as %20. URLSearchParams uses '+'.
  const url = `${HORIZONS_URL}?${params.toString().replace(/\+/g, '%20')}`;

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return fail(`JPL Horizons returned HTTP ${response.status}.`);
    const data = await response.json();
    if (data.error) return fail(`JPL Horizons: ${String(data.error).slice(0, 180)}`);
    const state = parseStateVector(data.result);
    return new Response(JSON.stringify({
      source: 'NASA/JPL Horizons',
      requestedAt: now.toISOString(),
      frame: 'geocentric ecliptic',
      ...state,
    }), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, s-maxage=30, stale-while-revalidate=30',
      },
    });
  } catch (error) {
    return fail(error?.name === 'TimeoutError'
      ? 'JPL Horizons did not respond within 10 seconds.'
      : 'Could not reach JPL Horizons.');
  }
}
