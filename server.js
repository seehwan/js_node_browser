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

async function loadNearbyCities(latitude, longitude) {
  try {
    const reverseUrl = new URL('https://geocoding-api.open-meteo.com/v1/reverse');
    reverseUrl.searchParams.set('latitude', latitude);
    reverseUrl.searchParams.set('longitude', longitude);
    reverseUrl.searchParams.set('count', '6');
    reverseUrl.searchParams.set('language', 'en');

    const data = await fetchJson(reverseUrl);
    const rawPlaces = data.results || [];

    const filtered = dedupePlaces(rawPlaces, { latitude, longitude })
      .filter((place) => (place.population ?? 0) >= 50000)
      .slice(0, 3);

    const neighbors = await Promise.all(
      filtered.map(async (place) => {
        const neighborWeatherUrl = new URL('https://api.open-meteo.com/v1/forecast');
        neighborWeatherUrl.searchParams.set('latitude', place.latitude);
        neighborWeatherUrl.searchParams.set('longitude', place.longitude);
        neighborWeatherUrl.searchParams.set('timezone', 'auto');
        neighborWeatherUrl.searchParams.set('current_weather', 'true');

        const neighborData = await fetchJson(neighborWeatherUrl);

        return {
          name: place.name,
          country: place.country,
          latitude: place.latitude,
          longitude: place.longitude,
          timezone: place.timezone,
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

  return serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
