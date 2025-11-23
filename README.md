# Weather & Location Dashboard

A minimal example of a Node.js API server plus browser UI. The Node server proxies the
[Open-Meteo](https://open-meteo.com) Geocoding and Forecast APIs and serves a static
frontend that lets you search for locations and view current conditions plus daily
forecast.

## Running locally

1. Install dependencies (none required beyond a recent Node.js with built-in `fetch`).
2. Start the server:

   ```bash
   npm start
   ```

3. Open the app at [http://localhost:3000](http://localhost:3000) and search for a city.

## API routes

- `GET /api/search?query=<text>` — returns up to 5 matching locations from the Open-Meteo
  geocoding service.
- `GET /api/weather?lat=<latitude>&lon=<longitude>` — returns current weather and daily
  forecast data for the provided coordinates.

Both routes keep API keys out of the browser by letting the Node server call the external
APIs.
