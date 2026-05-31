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
      current: "temperature_2m,weather_code,wind_speed_10m,precipitation",
      hourly: "precipitation_probability",
      forecast_days: "1",
      timezone: "Europe/Berlin",
    });

    try {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
      const data = await response.json();
      const rainChance = findCurrentRainChance(data);

      return {
        temperature: Math.round(data.current.temperature_2m),
        summary: WEATHER_CODES[data.current.weather_code] || "Wetterdaten",
        windKmh: Math.round(data.current.wind_speed_10m),
        rainChance,
        greenSpeed: estimateGreenSpeed(data.current.wind_speed_10m, rainChance, data.current.precipitation),
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
