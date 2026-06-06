const API_KEY = "44b960917776855be3489d8fd0308f5f";  
const BASE    = "https://api.openweathermap.org/data/2.5";
const GEO     = "https://api.openweathermap.org/geo/1.0";

// ── State ─────────────────────────────────────────────────
let unit     = "metric";   // metric = °C, imperial = °F
let recentSearches = JSON.parse(localStorage.getItem("skypulse_recent") || "[]");
let currentLat = null, currentLon = null;

// ── DOM ───────────────────────────────────────────────────
const cityInput    = document.getElementById("cityInput");
const searchBtn    = document.getElementById("searchBtn");
const unitToggle   = document.getElementById("unitToggle");
const loadingOverlay = document.getElementById("loadingOverlay");
const toast        = document.getElementById("toast");

// ── Weather Icons Map ─────────────────────────────────────
function getIcon(code, isNight = false) {
  const id = parseInt(code);
  if (id >= 200 && id < 300) return "⛈️";
  if (id >= 300 && id < 400) return "🌦️";
  if (id >= 500 && id < 510) return isNight ? "🌧️" : "🌧️";
  if (id === 511)             return "🌨️";
  if (id >= 520 && id < 600) return "🌧️";
  if (id >= 600 && id < 700) return "❄️";
  if (id === 701 || id === 741) return "🌫️";
  if (id >= 700 && id < 800) return "🌪️";
  if (id === 800) return isNight ? "🌙" : "☀️";
  if (id === 801) return isNight ? "🌤️" : "🌤️";
  if (id === 802) return "⛅";
  if (id >= 803) return "☁️";
  return "🌡️";
}

// ── Theme Selector ────────────────────────────────────────
function setTheme(weatherId, isNight, temp) {
  const id = parseInt(weatherId);
  let theme = "clear-day";
  if (isNight && id === 800) theme = "clear-night";
  else if (id === 800 && temp > 30) theme = "sunset";
  else if (id === 800) theme = "clear-day";
  else if (id >= 801 && id <= 804) theme = "cloudy";
  else if (id >= 200 && id < 300) theme = "stormy";
  else if (id >= 300 && id < 600) theme = "rainy";
  else if (id >= 600 && id < 700) theme = "snowy";
  else if (id >= 700 && id < 800) theme = "foggy";

  document.body.className = `theme-${theme}`;
}

// ── Temperature Formatting ────────────────────────────────
function fTemp(t) {
  return `${Math.round(t)}°${unit === "metric" ? "C" : "F"}`;
}

// ── Time Formatting ───────────────────────────────────────
function fTime(unix, offset = 0) {
  const d = new Date((unix + offset) * 1000);
  return d.toUTCString().slice(17, 22);
}

function fDay(unix) {
  return new Date(unix * 1000).toLocaleDateString("en-US", { weekday: "short" });
}

function fHour(unix) {
  return new Date(unix * 1000).toLocaleTimeString("en-US", { hour: "numeric", hour12: true });
}

// ── API Calls ─────────────────────────────────────────────
async function fetchWeather(lat, lon) {
  const [current, forecast, aqi] = await Promise.all([
    fetch(`${BASE}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${unit}`).then(r => r.json()),
    fetch(`${BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${unit}&cnt=40`).then(r => r.json()),
    fetch(`http://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`).then(r => r.json()),
  ]);
  return { current, forecast, aqi };
}

async function searchCity(city) {
  const r = await fetch(`${GEO}/direct?q=${encodeURIComponent(city)}&limit=1&appid=${API_KEY}`);
  const data = await r.json();
  if (!data.length) throw new Error("City not found");
  return data[0];
}

// ── Main Load ─────────────────────────────────────────────
async function loadWeather(lat, lon, cityName, country) {
  showLoading(true);
  try {
    const { current, forecast, aqi } = await fetchWeather(lat, lon);
    currentLat = lat; currentLon = lon;

    const isNight = current.dt > current.sys.sunset || current.dt < current.sys.sunrise;
    setTheme(current.weather[0].id, isNight, current.main.temp);

    renderCurrent(current, isNight);
    renderHourly(forecast, current.timezone);
    renderForecast(forecast);
    renderAQI(aqi);
    addRecent(cityName, country, lat, lon);
    renderRecent();
    setTip(current.weather[0].id, current.main.temp, current.wind.speed);

  } catch (e) {
    showToast("⚠ Could not load weather. Check your API key.");
    console.error(e);
  }
  showLoading(false);
}

// ── Render: Current ───────────────────────────────────────
function renderCurrent(d, isNight) {
  document.getElementById("cityName").textContent    = d.name;
  document.getElementById("countryName").textContent = `${d.sys.country} · ${new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}`;
  document.getElementById("currentIcon").textContent = getIcon(d.weather[0].id, isNight);
  document.getElementById("currentTemp").textContent = fTemp(d.main.temp);
  document.getElementById("feelsLike").textContent   = `Feels like ${fTemp(d.main.feels_like)}`;
  document.getElementById("condition").textContent   = d.weather[0].description;
  document.getElementById("humidity").textContent    = `${d.main.humidity}%`;
  document.getElementById("windSpeed").textContent   = unit === "metric" ? `${Math.round(d.wind.speed * 3.6)} km/h` : `${Math.round(d.wind.speed)} mph`;
  document.getElementById("visibility").textContent  = `${(d.visibility / 1000).toFixed(1)} km`;
  document.getElementById("pressure").textContent    = `${d.main.pressure} hPa`;
  document.getElementById("sunrise").textContent     = fTime(d.sys.sunrise, d.timezone);
  document.getElementById("sunset").textContent      = fTime(d.sys.sunset, d.timezone);
}

// ── Render: Hourly ────────────────────────────────────────
function renderHourly(forecast, tzOffset) {
  const wrap = document.getElementById("hourlyScroll");
  const items = forecast.list.slice(0, 12);
  wrap.innerHTML = items.map((h, i) => `
    <div class="hour-card ${i === 0 ? "current-hour" : ""}">
      <div class="hour-time">${i === 0 ? "Now" : fHour(h.dt)}</div>
      <div class="hour-icon">${getIcon(h.weather[0].id)}</div>
      <div class="hour-temp">${fTemp(h.main.temp)}</div>
      ${h.pop > 0.1 ? `<div class="hour-rain">💧${Math.round(h.pop * 100)}%</div>` : ""}
    </div>
  `).join("");
}

// ── Render: 5-Day Forecast ────────────────────────────────
function renderForecast(forecast) {
  // Group by day, pick midday reading
  const days = {};
  forecast.list.forEach(item => {
    const day = new Date(item.dt * 1000).toDateString();
    if (!days[day]) days[day] = [];
    days[day].push(item);
  });

  const dayKeys = Object.keys(days).slice(0, 5);
  const wrap = document.getElementById("forecastList");
  wrap.innerHTML = dayKeys.map((day, i) => {
    const items = days[day];
    const midday = items.find(it => new Date(it.dt*1000).getHours() >= 11) || items[Math.floor(items.length/2)];
    const temps  = items.map(it => it.main.temp);
    const high   = Math.max(...temps);
    const low    = Math.min(...temps);
    const rain   = Math.max(...items.map(it => it.pop));
    return `
      <div class="forecast-row">
        <div class="forecast-day">${i === 0 ? "Today" : fDay(midday.dt)}</div>
        <div class="forecast-icon">${getIcon(midday.weather[0].id)}</div>
        <div class="forecast-desc">${midday.weather[0].description}${rain > 0.2 ? ` · 💧${Math.round(rain*100)}%` : ""}</div>
        <div class="forecast-temps">
          <span class="temp-high">${fTemp(high)}</span>
          <span class="temp-low">${fTemp(low)}</span>
        </div>
      </div>
    `;
  }).join("");
}

// ── Render: AQI ───────────────────────────────────────────
function renderAQI(data) {
  const aqi  = data.list?.[0]?.main?.aqi;
  const comp = data.list?.[0]?.components || {};
  const labels = ["", "Good 🟢", "Fair 🟡", "Moderate 🟠", "Poor 🔴", "Very Poor 🟣"];
  const tips   = ["", "Air is clean. Enjoy outdoors!", "Acceptable quality.", "Sensitive groups take care.", "Avoid prolonged outdoor activity.", "Stay indoors if possible."];
  const pct    = ((aqi - 1) / 4) * 100;

  document.getElementById("aqiContent").innerHTML = `
    <div class="aqi-number">${aqi}</div>
    <div class="aqi-info">
      <h4>${labels[aqi] || "—"}</h4>
      <p>${tips[aqi] || ""}</p>
      <p style="font-size:0.72rem;margin-top:4px;opacity:0.6">PM2.5: ${comp.pm2_5?.toFixed(1)||"—"} · PM10: ${comp.pm10?.toFixed(1)||"—"}</p>
    </div>
    <div style="flex:1;position:relative;">
      <div class="aqi-bar"><div class="aqi-dot" style="left:${pct}%"></div></div>
    </div>
  `;
}

// ── Weather Tips ──────────────────────────────────────────
function setTip(id, temp, wind) {
  const tips = [];
  const wid = parseInt(id);
  if (wid >= 200 && wid < 300) tips.push("⛈ Thunderstorm alert! Stay indoors and avoid open areas.");
  else if (wid >= 300 && wid < 600) tips.push("🌂 Carry an umbrella — rain expected today.");
  else if (wid >= 600 && wid < 700) tips.push("❄ Snowy conditions. Drive carefully and dress warmly.");
  else if (wid >= 700 && wid < 800) tips.push("🌫 Low visibility due to fog. Slow down while driving.");
  else if (wid === 800) tips.push("☀️ Clear skies! Great day for outdoor activities.");
  else tips.push("⛅ Partly cloudy — still a decent day outside.");

  if (temp > 35) tips.push("🥵 Extreme heat! Stay hydrated and avoid midday sun.");
  else if (temp > 28) tips.push("😎 Warm weather — wear light clothing and sunscreen.");
  else if (temp < 5) tips.push("🧥 Very cold! Bundle up with warm layers.");
  else if (temp < 15) tips.push("🧣 Cool weather — a light jacket is recommended.");

  if (wind > 10) tips.push("💨 Strong winds today. Secure loose outdoor items.");

  document.getElementById("tipContent").innerHTML = tips.map(t => `<p style="margin-bottom:8px">${t}</p>`).join("");
}

// ── Recent Searches ───────────────────────────────────────
function addRecent(name, country, lat, lon) {
  recentSearches = recentSearches.filter(r => r.name !== name);
  recentSearches.unshift({ name, country, lat, lon });
  if (recentSearches.length > 8) recentSearches.pop();
  localStorage.setItem("skypulse_recent", JSON.stringify(recentSearches));
}

function renderRecent() {
  const wrap = document.getElementById("recentList");
  if (!recentSearches.length) {
    wrap.innerHTML = `<div class="placeholder-msg">No recent searches</div>`;
    return;
  }
  wrap.innerHTML = recentSearches.map(r => `
    <button class="recent-chip" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${r.name}" data-country="${r.country}">
      ${r.name}${r.country ? `, ${r.country}` : ""}
    </button>
  `).join("");
  wrap.querySelectorAll(".recent-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      loadWeather(btn.dataset.lat, btn.dataset.lon, btn.dataset.name, btn.dataset.country);
    });
  });
}

// ── Search ────────────────────────────────────────────────
async function doSearch() {
  const city = cityInput.value.trim();
  if (!city) { showToast("Please enter a city name"); return; }
  showLoading(true);
  try {
    const geo = await searchCity(city);
    await loadWeather(geo.lat, geo.lon, geo.name, geo.country);
    cityInput.value = "";
  } catch(e) {
    showToast("⚠ City not found. Try another name.");
    showLoading(false);
  }
}

// ── Unit Toggle ───────────────────────────────────────────
unitToggle.addEventListener("click", () => {
  unit = unit === "metric" ? "imperial" : "metric";
  unitToggle.textContent = unit === "metric" ? "°C / °F" : "°F / °C";
  if (currentLat) loadWeather(currentLat, currentLon, document.getElementById("cityName").textContent, "");
  else showToast(`Switched to ${unit === "metric" ? "Celsius" : "Fahrenheit"}`);
});

// ── Event Listeners ───────────────────────────────────────
searchBtn.addEventListener("click", doSearch);
cityInput.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

// ── Helpers ───────────────────────────────────────────────
function showLoading(v) { loadingOverlay.classList.toggle("show", v); }
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

// ── Geolocation on load ───────────────────────────────────
function tryGeolocation() {
  if (!navigator.geolocation) { loadWeather(27.7172, 85.3240, "Kathmandu", "NP"); return; }
  navigator.geolocation.getCurrentPosition(
    pos => loadWeather(pos.coords.latitude, pos.coords.longitude, "Your Location", ""),
    ()  => loadWeather(27.7172, 85.3240, "Kathmandu", "NP")  // Default: Kathmandu
  );
}

// ── Init ──────────────────────────────────────────────────
renderRecent();
tryGeolocation();
