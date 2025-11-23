# Weather & Location Dashboard

A minimal example of a Node.js API server plus browser UI. The Node server proxies the
[Open-Meteo](https://open-meteo.com) Geocoding and Forecast APIs for weather and city
lookup, and the Google Maps Places API for nearby-city discovery. After you pick a city
from the map search results, the UI fetches the weather, reveals the same-country nearby
search, and shows other popular cities in that country using Google Maps data.

## Running locally

1. Install dependencies (none required beyond a recent Node.js with built-in `fetch`).
2. Export your Google Maps Places API key (used only for nearby city listings):

   ```bash
   export GOOGLE_MAPS_API_KEY=<your_api_key>
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Open the app at [http://localhost:3000](http://localhost:3000) and search for a city.

## How to get a Google Maps Places API key

1. Sign in to the [Google Cloud Console](https://console.cloud.google.com/), create a
   project (or pick an existing one), and make sure billing is enabled.
2. Go to **APIs & Services → Library**, search for "Places API", and click **Enable**.
3. Navigate to **APIs & Services → Credentials**, choose **Create credentials → API key**,
   and copy the generated key.
4. (Recommended) Under the key's **Application restrictions**, add your localhost dev
   URL or server IP as an allowed HTTP referrer or IP, and under **API restrictions**
   allow only the Places API.
5. Export the key in your shell before running the server:

   ```bash
   export GOOGLE_MAPS_API_KEY=<your_api_key>
   ```

## API routes

- `GET /api/search?query=<text>` — returns up to 5 matching locations from the Open-Meteo
  geocoding service.
- `GET /api/weather?lat=<latitude>&lon=<longitude>` — returns current weather and daily
  forecast data for the provided coordinates, plus nearby popular cities with their
  current conditions (cities are sourced from the Google Maps Places API).
- `GET /api/country-cities?lat=<latitude>&lon=<longitude>` — returns popular nearby cities
  in the same country using the Google Maps Places (map) service, keeping city discovery
  separate from weather lookups.
- `GET /api/nearby-search?lat=<latitude>&lon=<longitude>&country=<country>&query=<text>`
  — finds cities in the same country near the provided coordinates that match the
  search text, sorted by proximity.

Both routes keep API keys out of the browser by letting the Node server call the external
APIs.
