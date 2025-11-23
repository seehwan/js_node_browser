const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const resultsEl = document.getElementById('results');
const countryCitiesContainer = document.getElementById('country-cities');
const countryCitiesContent = document.getElementById('country-cities-content');
const weatherEl = document.getElementById('weather');
const nearbySearchSection = document.getElementById('nearby-search');
const nearbyHelp = document.getElementById('nearby-help');
const nearbySearchForm = document.getElementById('nearby-search-form');
const nearbySearchInput = document.getElementById('nearby-search-input');
const nearbySearchResults = document.getElementById('nearby-search-results');

let currentPlace = null;

function resetCountryCities(message = 'Select a city to see more places from the same country.') {
  if (!countryCitiesContent) return;
  countryCitiesContent.innerHTML = `<p class="placeholder">${message}</p>`;
}

function createResultItem(place) {
  const button = document.createElement('button');
  button.className = 'result';
  button.type = 'button';
  button.innerHTML = `<strong>${place.name}</strong> <span>${place.country}</span>`;
  button.addEventListener('click', () => loadWeather(place));
  return button;
}

function renderResults(list) {
  resultsEl.innerHTML = '';
  if (!list.length) {
    resultsEl.innerHTML = '<p class="placeholder">No matches found. Try another city name.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((place) => fragment.appendChild(createResultItem(place)));
  resultsEl.appendChild(fragment);
}

function renderNearby(nearby) {
  if (!nearby?.length) {
    return '<p class="placeholder">No nearby cities with popular population found.</p>';
  }

  return nearby
    .map((place) => {
      const currentTemp = place.current ? `${place.current.temperature} °C` : 'N/A';
      const time = place.current ? new Date(place.current.time).toLocaleTimeString() : '—';
      return `<div class="nearby-card">
        <div>
          <p class="value">${place.name}</p>
          <p class="label">${place.country}</p>
        </div>
        <div class="nearby-meta">
          <span>${currentTemp}</span>
          <span class="muted">${time}</span>
        </div>
      </div>`;
    })
    .join('');
}

function renderCountryCities(list, countryName) {
  if (!countryCitiesContent) return;

  countryCitiesContent.innerHTML = '';

  if (!list?.length) {
    countryCitiesContent.innerHTML = `<p class="placeholder">No other popular cities found in ${countryName}.</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((place) => {
    const button = document.createElement('button');
    button.className = 'result';
    button.type = 'button';
    button.innerHTML = `<strong>${place.name}</strong> <span>${place.country}</span>`;
    button.addEventListener('click', () => {
      currentPlace = place;
      searchInput.value = place.name;
      loadWeather(place);
    });
    fragment.appendChild(button);
  });

  countryCitiesContent.appendChild(fragment);
  countryCitiesContainer?.classList.remove('hidden');
}

function renderWeather(data) {
  if (!data.current) {
    weatherEl.innerHTML = '<p class="placeholder">Weather data unavailable for this location.</p>';
    return;
  }

  const dailyRows = (data.daily || []).slice(0, 5)
    .map((day) => `<div class="daily-row">
        <div>${new Date(day.time).toLocaleDateString()}</div>
        <div>${day.temperatureMin?.toFixed?.(1) ?? '-'} / ${day.temperatureMax?.toFixed?.(1) ?? '-'} °C</div>
        <div>${day.precipitationSum?.toFixed?.(1) ?? '-'} mm</div>
      </div>`)
    .join('');

  const nearbyList = renderNearby(data.nearby);

  weatherEl.innerHTML = `
    <div class="current">
      <div>
        <p class="label">Current temperature</p>
        <p class="value">${data.current.temperature} °C</p>
      </div>
      <div>
        <p class="label">Wind speed</p>
        <p class="value">${data.current.windspeed} km/h</p>
      </div>
      <div>
        <p class="label">Time</p>
        <p class="value">${new Date(data.current.time).toLocaleString()}</p>
      </div>
    </div>
    <div class="daily">
      <h3>Daily forecast</h3>
      ${dailyRows}
    </div>
    <div class="nearby">
      <h3>Nearby popular cities</h3>
      ${nearbyList}
    </div>
  `;

  if (currentPlace) {
    showNearbySearch(currentPlace);
  }
}

async function loadWeather(place) {
  weatherEl.innerHTML = '<p class="placeholder">Loading weather data...</p>';
  resetCountryCities('Loading same-country cities from the Google Maps service...');
  resultsEl.innerHTML = '<p class="placeholder">City selected. Submit a new search to explore other places.</p>';
  currentPlace = place;
  showNearbySearch(place);
  try {
    const params = new URLSearchParams({ lat: place.latitude, lon: place.longitude });
    const response = await fetch(`/api/weather?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load weather');
    renderWeather(data);
    loadCountryCities(place);
  } catch (error) {
    weatherEl.innerHTML = `<p class="error">${error.message}</p>`;
    resetCountryCities('Unable to load additional cities for this selection.');
  }
}

async function loadCountryCities(place) {
  if (!place) return;
  try {
    const params = new URLSearchParams({ lat: place.latitude, lon: place.longitude });
    const response = await fetch(`/api/country-cities?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load nearby cities');
    renderCountryCities(data.results || [], place.country);
  } catch (error) {
    if (!countryCitiesContent) return;
    countryCitiesContent.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

function showNearbySearch(place) {
  if (!nearbySearchSection) return;
  nearbyHelp.textContent = `Find other cities in ${place.country} near ${place.name}.`;
  nearbySearchSection.classList.remove('hidden');
  nearbySearchResults.innerHTML = '<p class="placeholder">Enter a city name to search nearby.</p>';
}

function renderNearbySearchResults(list) {
  nearbySearchResults.innerHTML = '';
  if (!list.length) {
    nearbySearchResults.innerHTML = '<p class="placeholder">No nearby matches found.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach((place) => {
    const button = document.createElement('button');
    button.className = 'result';
    button.type = 'button';
    const distance = place.distanceKm?.toFixed?.(1) ?? '—';
    button.innerHTML = `<div><strong>${place.name}</strong> <span>${place.country}</span></div><div class="muted">${distance} km away</div>`;
    button.addEventListener('click', () => {
      currentPlace = place;
      loadWeather(place);
      searchInput.value = place.name;
    });
    fragment.appendChild(button);
  });

  nearbySearchResults.appendChild(fragment);
}

async function searchNearby(query) {
  if (!currentPlace) return;
  nearbySearchResults.innerHTML = '<p class="placeholder">Searching nearby cities...</p>';
  try {
    const params = new URLSearchParams({
      query,
      lat: currentPlace.latitude,
      lon: currentPlace.longitude,
      country: currentPlace.country,
    });
    const response = await fetch(`/api/nearby-search?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Nearby search failed');
    renderNearbySearchResults(data.results || []);
  } catch (error) {
    nearbySearchResults.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

async function search(query) {
  resultsEl.innerHTML = '<p class="placeholder">Searching map data...</p>';
  resetCountryCities();
  try {
    const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Search failed');
    renderResults(data.results || []);
  } catch (error) {
    resultsEl.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (query) {
    search(query);
  }
});

nearbySearchForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = nearbySearchInput.value.trim();
  if (query && currentPlace) {
    searchNearby(query);
  }
});
