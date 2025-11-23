const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');
const resultsEl = document.getElementById('results');
const weatherEl = document.getElementById('weather');

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
<<<<<<< ours
=======
    <div class="nearby">
      <h3>Nearby popular cities</h3>
      ${nearbyList}
    </div>
>>>>>>> theirs
  `;
}

async function loadWeather(place) {
  weatherEl.innerHTML = '<p class="placeholder">Loading weather data...</p>';
  try {
    const params = new URLSearchParams({ lat: place.latitude, lon: place.longitude });
    const response = await fetch(`/api/weather?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load weather');
    renderWeather(data);
  } catch (error) {
    weatherEl.innerHTML = `<p class="error">${error.message}</p>`;
  }
}

async function search(query) {
  resultsEl.innerHTML = '<p class="placeholder">Searching...</p>';
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
