const WEATHER_CODES = {
  0: "Klar",
  1: "Meist klar",
  2: "Teilweise bew\u00f6lkt",
  3: "Bew\u00f6lkt",
  45: "Nebel",
  48: "Nebel",
  51: "Leichter Niesel",
  53: "Niesel",
  55: "Starker Niesel",
  61: "Leichter Regen",
  63: "Regen",
  65: "Starker Regen",
  71: "Leichter Schnee",
  73: "Schnee",
  80: "Regenschauer",
  81: "Regenschauer",
  82: "Starke Schauer",
  95: "Gewitter",
};

window.DashboardServices = {
  async fetchDashboard() {
    const endpoints = ["api/dashboard", `data/dashboard.json?v=${Date.now()}`];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) throw new Error(`Dashboard HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        console.warn(`Dashboard source unavailable: ${endpoint}`, error);
      }
    }

    return null;
  },

  async fetchWeather(club) {
    const { latitude, longitude } = club.coordinates;
    const params = new URLSearchParams({
      latitude,
      longitude,
      current: "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation,relative_humidity_2m",
      hourly: "precipitation_probability,wind_speed_10m,relative_humidity_2m",
      forecast_days: "1",
      timezone: "Europe/Berlin",
    });

    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
      const data = await response.json();
      const rainChance = findCurrentRainChance(data);
      const current = data.current;

      return {
        temperature: Math.round(current.temperature_2m),
        summary: WEATHER_CODES[current.weather_code] || "Wetterdaten",
        windKmh: Math.round(current.wind_speed_10m),
        windDirection: windDirectionLabel(current.wind_direction_10m),
        rainChance,
        greenSpeed: estimateGreenSpeed(current.wind_speed_10m, rainChance, current.precipitation),
        playFacts: [
          { label: "Carry", value: carryEffectLabel(current.temperature_2m, current.wind_speed_10m) },
          { label: "Putten", value: puttEffectLabel(rainChance, current.precipitation, current.relative_humidity_2m) },
          { label: "Windrichtung", value: windDirectionLabel(current.wind_direction_10m) },
          { label: "Regenfenster", value: nextRainWindow(data) },
        ],
      };
    } catch (error) {
      console.warn("Weather provider failed", error);
      return null;
    }
  },

  async fetchTeeTimes(club) {
    return {
      source: "PC CADDIE vorbereitet",
      bookingUrl: club.urls.teeTimes,
      occupancy: 60,
      teeTimes: ["09:20", "09:30", "10:10", "10:20"],
      nextRound: {
        date: "N\u00e4chste Runde",
        time: "noch nicht verbunden",
        countdown: "PC CADDIE Login/API wird im n\u00e4chsten Schritt angebunden",
      },
    };
  },

  async fetchScorecard(club) {
    return {
      source: "Apeld\u00f6r Link",
      status: "Online-Link bereit",
      url: club.urls.scorecard,
    };
  },
};

function findCurrentRainChance(data) {
  const currentTime = data.current.time;
  const index = data.hourly.time.findIndex((time) => time === currentTime);
  if (index >= 0) return data.hourly.precipitation_probability[index] ?? 0;
  return data.hourly.precipitation_probability[0] ?? 0;
}

function estimateGreenSpeed(windKmh, rainChance, precipitation) {
  if (precipitation > 0 || rainChance > 50) return "eher langsam";
  if (windKmh > 20 && rainChance < 20) return "schnell";
  return "mittel-schnell";
}

function carryEffectLabel(temperature, windKmh) {
  if (windKmh >= 28) return "deutlich windanf\u00e4llig";
  if (temperature <= 8) return "k\u00fcrzer durch K\u00e4lte";
  if (temperature >= 24 && windKmh < 18) return "etwas l\u00e4nger";
  if (windKmh >= 18) return "Wind beachten";
  return "neutral";
}

function puttEffectLabel(rainChance, precipitation, humidity) {
  if (precipitation > 0 || rainChance >= 60) return "langsamer, feuchter";
  if (humidity >= 85) return "leicht gebremst";
  if (rainChance <= 15) return "rollt sauber";
  return "normal";
}

function nextRainWindow(data) {
  const currentTime = data.current?.time;
  const times = data.hourly?.time || [];
  const rainValues = data.hourly?.precipitation_probability || [];
  const startIndex = Math.max(0, times.indexOf(currentTime));
  for (let index = startIndex; index < Math.min(startIndex + 7, times.length, rainValues.length); index += 1) {
    if (rainValues[index] >= 50) return `ab ${times[index].split("T")[1].slice(0, 5)} m\u00f6glich`;
  }
  return "6h trocken";
}

function windDirectionLabel(degrees) {
  if (!Number.isFinite(degrees)) return "variabel";
  const directions = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  return directions[Math.round((degrees % 360) / 45) % 8];
}
