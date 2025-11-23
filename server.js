import { createServer } from 'http';
import { access } from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const PORT = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

async function fetchJson(url) {
  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'node-weather-demo/1.0',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upstream error ${response.status}: ${errorText}`);
  }

  return response.json();
}

function requireGoogleApiKey() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing GOOGLE_MAPS_API_KEY environment variable');
  }

  return apiKey;
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function handleSearch(req, res, query) {
  const searchTerm = query.get('query')?.trim();
  if (!searchTerm) {
    return sendJson(res, 400, { error: 'Missing query parameter "query"' });
  }

  try {
    const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geoUrl.searchParams.set('name', searchTerm);
    geoUrl.searchParams.set('count', '5');
    geoUrl.searchParams.set('language', 'en');

    const data = await fetchJson(geoUrl);
    const results = (data.results || []).map((item) => ({
      name: item.name,
      country: item.country,
      latitude: item.latitude,
      longitude: item.longitude,
      timezone: item.timezone,
    }));

    return sendJson(res, 200, { results });
  } catch (error) {
    console.error('Search error', error);
    return sendJson(res, 502, { error: 'Failed to search locations' });
  }
}

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceKm(a, b) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);

  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadiusKm * c;
}

async function handleWeather(req, res, query) {
  const latitude = normalizeNumber(query.get('lat'));
  const longitude = normalizeNumber(query.get('lon'));

  if (latitude === null || longitude === null) {
    return sendJson(res, 400, { error: 'Missing or invalid lat/lon parameters' });
  }

  try {
    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
    weatherUrl.searchParams.set('latitude', latitude);
    weatherUrl.searchParams.set('longitude', longitude);
    weatherUrl.searchParams.set('timezone', 'auto');
    weatherUrl.searchParams.set('current_weather', 'true');
    weatherUrl.searchParams.set('hourly', 'temperature_2m,relativehumidity_2m');
    weatherUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum');

    const data = await fetchJson(weatherUrl);

    const current = data.current_weather
      ? {
          temperature: data.current_weather.temperature,
          windspeed: data.current_weather.windspeed,
          time: data.current_weather.time,
        }
      : null;

    const daily = (data.daily?.time || []).map((time, idx) => ({
      time,
      temperatureMax: data.daily.temperature_2m_max?.[idx] ?? null,
      temperatureMin: data.daily.temperature_2m_min?.[idx] ?? null,
      precipitationSum: data.daily.precipitation_sum?.[idx] ?? null,
    }));

    const nearby = await loadNearbyCities(latitude, longitude);

    return sendJson(res, 200, {
      latitude,
      longitude,
      timezone: data.timezone,
      current,
      daily,
      nearby,
    });
  } catch (error) {
    console.error('Weather error', error);
    return sendJson(res, 502, { error: 'Failed to load weather data' });
  }
}

function dedupePlaces(list, { latitude, longitude }) {
  const seen = new Set();
  return list.filter((item) => {
    const key = `${item.latitude.toFixed(2)},${item.longitude.toFixed(2)}`;
    const isSameLocation =
      Math.abs(item.latitude - latitude) < 0.01 && Math.abs(item.longitude - longitude) < 0.01;
    if (isSameLocation || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCountryFromComponents(addressComponents = []) {
  const country = addressComponents.find((component) => component.types.includes('country'));
  return country?.long_name || country?.short_name || 'Unknown';
}

async function fetchPlaceDetails(placeId, apiKey) {
  const detailsUrl = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  detailsUrl.searchParams.set('place_id', placeId);
  detailsUrl.searchParams.set('fields', 'address_component,geometry,name,types');
  detailsUrl.searchParams.set('key', apiKey);

  const data = await fetchJson(detailsUrl);
  if (data.status !== 'OK') {
    throw new Error(data.error_message || `Place details failed with status ${data.status}`);
  }

  const details = data.result;

  return {
    name: details.name,
    latitude: details.geometry.location.lat,
    longitude: details.geometry.location.lng,
    country: getCountryFromComponents(details.address_components),
    types: details.types || [],
  };
}

async function findNearbyCities(latitude, longitude, { maxResults = 6 } = {}) {
  const apiKey = requireGoogleApiKey();
  const nearbyUrl = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  nearbyUrl.searchParams.set('location', `${latitude},${longitude}`);
  nearbyUrl.searchParams.set('radius', '50000');
  nearbyUrl.searchParams.set('type', 'locality');
  nearbyUrl.searchParams.set('key', apiKey);

  const data = await fetchJson(nearbyUrl);
  if (data.status === 'ZERO_RESULTS') {
    return [];
  }

  if (data.status !== 'OK') {
    throw new Error(data.error_message || `Nearby search failed with status ${data.status}`);
  }

  const rawResults = data.results || [];
  const limited = rawResults.slice(0, Math.max(maxResults * 2, maxResults));

  const places = await Promise.all(
    limited.map(async (place) => {
      const details = await fetchPlaceDetails(place.place_id, apiKey);
      return {
        ...details,
        distanceKm: haversineDistanceKm(
          { latitude, longitude },
          { latitude: details.latitude, longitude: details.longitude }
        ),
      };
    })
  );

  const cityOnly = places.filter((place) => place.types.includes('locality'));

  cityOnly.sort((a, b) => a.distanceKm - b.distanceKm);

  return cityOnly.slice(0, maxResults);
}

async function loadNearbyCities(latitude, longitude) {
  try {
    const nearbyCities = await findNearbyCities(latitude, longitude, { maxResults: 3 });

    const neighbors = await Promise.all(
      nearbyCities.map(async (place) => {
        const neighborWeatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
        neighborWeatherUrl.searchParams.set('latitude', place.latitude);
        neighborWeatherUrl.searchParams.set('longitude', place.longitude);
        neighborWeatherUrl.searchParams.set('timezone', 'auto');
        neighborWeatherUrl.searchParams.set('current_weather', 'true');

        const neighborData = await fetchJson(neighborWeatherUrl);

        return {
          ...place,
          current: neighborData.current_weather
            ? {
                temperature: neighborData.current_weather.temperature,
                windspeed: neighborData.current_weather.windspeed,
                time: neighborData.current_weather.time,
              }
            : null,
        };
      })
    );

    return neighbors;
  } catch (error) {
    console.error('Nearby lookup failed', error);
    return [];
  }
}

async function handleCountryCities(req, res, query) {
  const latitude = normalizeNumber(query.get('lat'));
  const longitude = normalizeNumber(query.get('lon'));

  if (latitude === null || longitude === null) {
    return sendJson(res, 400, { error: 'Missing or invalid lat/lon parameters' });
  }

  try {
    const results = await findNearbyCities(latitude, longitude, { maxResults: 6 });
    return sendJson(res, 200, { results });
  } catch (error) {
    console.error('Country cities lookup failed', error);
    return sendJson(res, 502, { error: 'Failed to load cities for this country' });
  }
}

async function handleNearbySearch(req, res, query) {
  const latitude = normalizeNumber(query.get('lat'));
  const longitude = normalizeNumber(query.get('lon'));
  const country = query.get('country')?.trim();
  const searchTerm = query.get('query')?.trim();

  if (latitude === null || longitude === null || !country || !searchTerm) {
    return sendJson(res, 400, { error: 'Missing lat, lon, country, or query parameters' });
  }

  try {
    const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geoUrl.searchParams.set('name', searchTerm);
    geoUrl.searchParams.set('count', '10');
    geoUrl.searchParams.set('language', 'en');

    const data = await fetchJson(geoUrl);
    const rawResults = data.results || [];
    const filtered = rawResults.filter((place) => place.country?.toLowerCase() === country.toLowerCase());

    const deduped = dedupePlaces(filtered, { latitude, longitude });
    const withDistance = deduped
      .map((place) => ({
        name: place.name,
        country: place.country,
        latitude: place.latitude,
        longitude: place.longitude,
        timezone: place.timezone,
        distanceKm: haversineDistanceKm(
          { latitude, longitude },
          { latitude: place.latitude, longitude: place.longitude }
        ),
      }))
      .filter((place) => place.distanceKm <= 800);

    withDistance.sort((a, b) => a.distanceKm - b.distanceKm);

    return sendJson(res, 200, { results: withDistance.slice(0, 6) });
  } catch (error) {
    console.error('Nearby search error', error);
    return sendJson(res, 502, { error: 'Failed to search nearby cities' });
  }
}

async function serveStatic(res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(publicDir, safePath);

  try {
    await access(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    createReadStream(fullPath).pipe(res);
  } catch (error) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const { pathname, searchParams } = requestUrl;

  if (pathname === '/api/search' && req.method === 'GET') {
    return handleSearch(req, res, searchParams);
  }

  if (pathname === '/api/weather' && req.method === 'GET') {
    return handleWeather(req, res, searchParams);
  }

  if (pathname === '/api/nearby-search' && req.method === 'GET') {
    return handleNearbySearch(req, res, searchParams);
  }

  if (pathname === '/api/country-cities' && req.method === 'GET') {
    return handleCountryCities(req, res, searchParams);
  }

  return serveStatic(res, pathname);
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

export {
  dedupePlaces,
  findNearbyCities,
  getCountryFromComponents,
  haversineDistanceKm,
  normalizeNumber,
  server,
};
