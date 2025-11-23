# Project Overview

This document summarizes the Weather & Location Dashboard repository to help you quickly orient yourself before making changes.

## Purpose & User Flow
- Users search for a city, choose one of the geocoding matches, and view the current weather plus a 5-day forecast.
- After a city is selected, the UI also shows nearby popular cities (from Google Maps) with their current temperature and offers a same-country search to jump to another nearby city.

## Server (Node.js, `server.js`)
- **Static hosting:** Serves files from `public/` with basic content-type detection.
- **API proxy routes:**
  - `GET /api/search` — Geocodes city names via Open-Meteo Geocoding (max 5 results), returning name, country, coordinates, and timezone.
  - `GET /api/weather` — Fetches Open-Meteo forecast for coordinates; augments with nearby popular cities and their current weather (Google Maps Places + Open-Meteo). Normalizes numeric query params with `normalizeNumber`.
  - `GET /api/country-cities` — Lists popular cities in the same country (Google Maps Places nearby search + place details), limited to six deduplicated results.
  - `GET /api/nearby-search` — Combines Open-Meteo geocoding with haversine distance filtering to find user-entered cities within ~800 km in the same country.
- **Supporting helpers:**
  - `fetchJson` wraps upstream fetch with a UA string and error handling.
  - `requireGoogleApiKey` throws if `GOOGLE_MAPS_API_KEY` is missing.
  - `haversineDistanceKm` and `dedupePlaces` filter/score nearby city candidates; `getCountryFromComponents` extracts country names from Google address components.
- **Environment expectations:** Needs `GOOGLE_MAPS_API_KEY` at runtime; otherwise routes relying on Google Places will fail. The server auto-starts on `PORT` (default 3000) unless `NODE_ENV=test`.

## Frontend (`public/`)
- **`index.html`** lays out the search form, weather display, same-country list, and nearby-search section. It pulls `styles.css` and `main.js` and uses semantic sections/cards.
- **`main.js`** orchestrates UI behavior:
  - Binds forms and buttons; `search()` hits `/api/search`, renders results, and resets country lists.
  - `loadWeather()` fetches `/api/weather`, renders current + daily forecast with nearby cities, and then triggers same-country city loading.
  - `loadCountryCities()` calls `/api/country-cities` to populate quick-pick buttons.
  - `searchNearby()` calls `/api/nearby-search` scoped to the selected country and coordinates.
  - Rendering helpers generate list buttons, nearby cards, and placeholder/error states while tracking the current selection.
- **`styles.css`** provides the card layout, buttons, and placeholder styling for the dashboard.

## Tests (`test/server.test.js`)
- Uses Node's built-in test runner to validate helper utilities (`normalizeNumber`, `haversineDistanceKm`, `dedupePlaces`, `getCountryFromComponents`).
- External API calls are not exercised; tests are safe to run offline.

## How to run locally
1. `export GOOGLE_MAPS_API_KEY=<your_api_key>` (required for Google Places lookups).
2. `npm start` to launch the Node server on port 3000.
3. Open `http://localhost:3000`, search for a city, and pick a result to load weather + nearby city tooling.

This overview should give you the core flow, dependencies, and responsibilities so you can dive deeper where needed.
