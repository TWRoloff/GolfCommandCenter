const dashboardState = {
  club: window.CLUB_CONFIG,
  weather: {
    temperature: 21,
    summary: "Sonnig",
    windKmh: 12,
    rainChance: 5,
    greenSpeed: "mittel-schnell",
  },
  occupancy: 60,
  occupancyDetails: {
    label: "Details werden geladen",
    freeLabel: "",
    scope: "",
  },
  teeTimes: ["09:20", "09:30", "10:10", "10:20"],
  teeTimeGroups: [],
  teeTimeDateLabel: "Heute",
  handicap: {
    index: 18.3,
    lastRound: "91 Schl\u00e4ge",
    bestRound: "84 Schl\u00e4ge",
  },
  nextRound: {
    date: "Freitag, 23. Mai",
    time: "08:40 Uhr",
    countdown: "Noch 2 Tage und 14 Stunden",
  },
  scorecard: {
    status: "Online-Link bereit",
    summary: "Scorecard wird geladen",
  },
  clubUpdate: {
    title: "Apeld\u00f6r Updates \u00f6ffnen",
    url: "https://apeldoer.de/apeldoer-updates/",
  },
  clubInfo: [],
  sourceStatus: {
    weather: "Demo",
    teeTimes: "PC CADDIE offen",
    nextRound: "PC CADDIE offen",
    handicap: "Demo",
    scorecard: "Link bereit",
  },
};

const els = {
  clock: document.querySelector("#clock"),
  syncStatus: document.querySelector("#syncStatus"),
  clubName: document.querySelector("#clubName"),
  sourceLine: document.querySelector("#sourceLine"),
  temperature: document.querySelector("#temperature"),
  weatherSummary: document.querySelector("#weatherSummary"),
  wind: document.querySelector("#wind"),
  rain: document.querySelector("#rain"),
  greenSpeed: document.querySelector("#greenSpeed"),
  weatherMark: document.querySelector("#weatherMark"),
  occupancy: document.querySelector("#occupancy"),
  occupancyCaption: document.querySelector("#occupancyCaption"),
  occupancyDetail: document.querySelector("#occupancyDetail"),
  occupancyBars: document.querySelector("#occupancyBars"),
  occupancyGroups: document.querySelector("#occupancyGroups"),
  handicap: document.querySelector("#handicap"),
  lastRound: document.querySelector("#lastRound"),
  bestRound: document.querySelector("#bestRound"),
  teeTimes: document.querySelector("#teeTimes"),
  teeDateLabel: document.querySelector("#teeDateLabel"),
  nextRoundDate: document.querySelector("#nextRoundDate"),
  nextRoundMeta: document.querySelector("#nextRoundMeta"),
  golfScore: document.querySelector("#golfScore"),
  scoreReason: document.querySelector("#scoreReason"),
  scorecardSummary: document.querySelector("#scorecardSummary"),
  scorecardGrid: document.querySelector("#scorecardGrid"),
  clubCardName: document.querySelector("#clubCardName"),
  clubCardLocation: document.querySelector("#clubCardLocation"),
  courseStatus: document.querySelector("#courseStatus"),
  clubLink: document.querySelector("#clubLink"),
  clubNewsLink: document.querySelector("#clubNewsLink"),
  clubNewsTitle: document.querySelector("#clubNewsTitle"),
  assistantInput: document.querySelector("#assistantInput"),
  assistantAnswer: document.querySelector("#assistantAnswer"),
  askButton: document.querySelector("#askButton"),
  voiceButton: document.querySelector("#voiceButton"),
  bookingLink: document.querySelector("#bookingLink"),
  scorecardLink: document.querySelector("#scorecardLink"),
};

function calculateGolfScore(state) {
  let score = 10;
  score -= Math.max(0, state.weather.rainChance - 10) / 12;
  score -= Math.max(0, state.weather.windKmh - 15) / 10;
  score -= Math.max(0, state.occupancy - 60) / 16;
  return Math.max(1, Math.min(10, score)).toFixed(1);
}

function updateClock() {
  els.clock.textContent = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

async function refreshDashboard() {
  setSyncStatus("Aktualisiere");

  const dashboardData = await window.DashboardServices.fetchDashboard();
  if (dashboardData) {
    applyDashboardData(dashboardData);
    render();
    setSyncStatus("Synchronisiert");
    return;
  }

  const [weather, teeTimeData, scorecardData] = await Promise.all([
    window.DashboardServices.fetchWeather(dashboardState.club),
    window.DashboardServices.fetchTeeTimes(dashboardState.club),
    window.DashboardServices.fetchScorecard(dashboardState.club),
  ]);

  if (weather) {
    dashboardState.weather = weather;
    dashboardState.sourceStatus.weather = "Open-Meteo live";
  } else {
    dashboardState.sourceStatus.weather = "Demo";
  }

  dashboardState.teeTimes = teeTimeData.teeTimes;
  dashboardState.teeTimeGroups = teeTimeData.teeTimeGroups || [];
  dashboardState.teeTimeDateLabel = teeTimeData.teeTimeDateLabel || "Heute";
  dashboardState.occupancy = teeTimeData.occupancy;
  dashboardState.nextRound = teeTimeData.nextRound;
  dashboardState.sourceStatus.teeTimes = teeTimeData.source;
  dashboardState.sourceStatus.scorecard = scorecardData.source;
  dashboardState.scorecard = scorecardData;
  dashboardState.clubInfo = [];

  render();
  setSyncStatus("Synchronisiert");
}

function applyDashboardData(data) {
  dashboardState.club = normalizeClub(data.club || dashboardState.club);
  dashboardState.weather = data.weather || dashboardState.weather;
  dashboardState.teeTimes = data.teeTimes || dashboardState.teeTimes;
  dashboardState.teeTimeGroups = data.teeTimeGroups || [];
  dashboardState.teeTimeDateLabel = data.teeTimeDateLabel || "Heute";
  dashboardState.occupancy = data.occupancy ?? dashboardState.occupancy;
  dashboardState.occupancyDetails = data.occupancyDetails || dashboardState.occupancyDetails;
  dashboardState.nextRound = data.nextRound || dashboardState.nextRound;
  dashboardState.handicap = data.handicap || dashboardState.handicap;
  dashboardState.clubUpdate = data.clubUpdate || dashboardState.clubUpdate;
  dashboardState.sourceStatus.weather = data.sources?.weather || "API";
  dashboardState.sourceStatus.teeTimes = data.sources?.teeTimes || "API";
  dashboardState.sourceStatus.nextRound = data.sources?.nextRound || "API";
  dashboardState.sourceStatus.handicap = data.sources?.handicap || "API";
  dashboardState.sourceStatus.scorecard = data.scorecard?.source || "API";
  dashboardState.scorecard = data.scorecard || dashboardState.scorecard;
  dashboardState.clubInfo = [];
}

function normalizeClub(club) {
  return {
    ...dashboardState.club,
    ...club,
    displayName: club.displayName || dashboardState.club.displayName,
    coordinates: club.coordinates || dashboardState.club.coordinates,
    urls: {
      ...dashboardState.club.urls,
      ...(club.urls || {}),
    },
    refresh: dashboardState.club.refresh,
  };
}

function setSyncStatus(text) {
  els.syncStatus.textContent = text;
}

function simulateLiveData() {
  if (dashboardState.sourceStatus.teeTimes === "PC CADDIE live") {
    return;
  }

  const drift = Math.random() > 0.5 ? 1 : -1;
  dashboardState.occupancy = clamp(dashboardState.occupancy + drift * randomInt(0, 4), 35, 92);
  setSyncStatus("Aktualisiert");
  setTimeout(() => setSyncStatus("Synchronisiert"), 1200);
}

function render() {
  const { weather, handicap, nextRound } = dashboardState;
  const score = calculateGolfScore(dashboardState);

  els.clubName.textContent = dashboardState.club.displayName;
  els.sourceLine.replaceChildren(...renderSourceStatus());
  els.temperature.textContent = `${weather.temperature}\u00b0C`;
  els.weatherSummary.textContent = weather.summary;
  els.weatherMark.className = `weather-mark ${weatherIconClass(weather.summary)}`;
  els.wind.textContent = `${weather.windKmh} km/h`;
  els.rain.textContent = `${weather.rainChance}%`;
  els.greenSpeed.textContent = weather.greenSpeed;
  els.occupancy.textContent = `${dashboardState.occupancy}%`;
  els.occupancyCaption.textContent = occupancyCaption(dashboardState.occupancyDetails);
  els.occupancyDetail.textContent = formatOccupancyDetail(dashboardState.occupancyDetails);
  els.handicap.textContent = handicap.index.toLocaleString("de-DE");
  els.lastRound.textContent = handicap.lastRound;
  els.bestRound.textContent = handicap.bestRound;
  els.nextRoundDate.textContent = `${nextRound.date} \u00b7 ${nextRound.time}`;
  els.nextRoundMeta.textContent = nextRound.countdown;
  els.golfScore.textContent = score;
  els.scoreReason.textContent = Number(score) >= 8 ? "Perfekter Golftag" : "Spielbar, aber Bedingungen pr\u00fcfen";
  els.scorecardSummary.textContent = dashboardState.scorecard.summary || dashboardState.scorecard.status || "Scorecard bereit";
  els.teeDateLabel.textContent = teeDateText(dashboardState.teeTimeDateLabel);
  els.bookingLink.href = dashboardState.club.urls.teeTimes;
  els.scorecardLink.href = dashboardState.scorecard.url || dashboardState.club.urls.scorecard;
  els.clubCardName.textContent = dashboardState.club.displayName;
  els.clubCardLocation.textContent = dashboardState.club.locationLabel;
  els.courseStatus.textContent = "Platz offen";
  els.clubLink.href = dashboardState.club.urls.teeTimes;
  els.clubNewsTitle.textContent = dashboardState.clubUpdate.title;
  els.clubNewsLink.href = dashboardState.clubUpdate.url || dashboardState.club.urls.updates;

  els.occupancyBars.replaceChildren(...renderOccupancyBars(dashboardState.occupancy));
  els.occupancyGroups.replaceChildren(...renderOccupancyGroups(dashboardState.teeTimeGroups));
  els.teeTimes.replaceChildren(...renderTeeGroups(dashboardState.teeTimeGroups, dashboardState.teeTimes));
  els.scorecardGrid.replaceChildren(...renderScorecardGrid(dashboardState.scorecard.latest?.detail));
}

function renderOccupancyBars(occupancy) {
  const activeBars = Math.round(occupancy / 10);
  return Array.from({ length: 10 }, (_, index) => {
    const bar = document.createElement("span");
    bar.className = index < activeBars ? "active" : "";
    return bar;
  });
}

function formatOccupancyDetail(details) {
  if (!details) return "Details werden geladen";
  const parts = [details.label, details.freeLabel, details.scope].filter(Boolean);
  return parts.join(" · ");
}

function occupancyCaption(details) {
  if (!details) return "Noch buchbare Slots";
  if (details.scope === "Fallback") return "Fallback-Wert";
  return "Restlicher Buchungszeitraum";
}

function teeDateText(label) {
  if (!label || label === "Heute") return "Heute";
  return `Nächster buchbarer Tag: ${label}`;
}

function renderTeeTime(time) {
  const item = document.createElement("div");
  item.className = "tee-time";
  item.textContent = time;
  return item;
}

function renderTeeGroups(groups, fallbackTimes) {
  if (!groups?.length) {
    return fallbackTimes.map(renderTeeTime);
  }

  return groups.map((group) => {
    const section = document.createElement("section");
    section.className = "tee-group";

    const header = document.createElement("div");
    header.className = "tee-group-header";

    const title = document.createElement("strong");
    title.textContent = group.label;

    const meta = document.createElement("span");
    meta.textContent = `${group.freeSlots} frei · ${group.occupancy}% belegt`;

    const times = document.createElement("div");
    times.className = "tee-time-row";
    times.replaceChildren(...(group.times?.length ? group.times : ["--:--"]).map(renderTeeTime));

    header.append(title, meta);
    section.append(header, times);
    return section;
  });
}

function renderOccupancyGroups(groups) {
  if (!groups?.length) return [];

  return groups.map((group) => {
    const item = document.createElement("div");
    item.className = "occupancy-group";

    const label = document.createElement("span");
    label.textContent = group.label;

    const value = document.createElement("strong");
    value.textContent = `${group.occupancy}%`;

    const detail = document.createElement("small");
    detail.textContent = `${group.bookedSlots}/${group.totalSlots} Restplätze belegt`;

    item.append(label, value, detail);
    return item;
  });
}

function renderScorecardGrid(detail) {
  if (!detail?.scores?.length) {
    return [];
  }

  const parsByHole = new Map((detail.pars || []).map((item) => [item.hole, item.par]));
  const rows = [
    ["Loch", "Par", "Score", "+/-"],
    ...detail.scores.map((item) => {
      const par = parsByHole.get(item.hole);
      const diff = par ? item.score - par : null;
      return [
        String(item.hole),
        par ? String(par) : "-",
        String(item.score),
        diff === null ? "-" : formatDiff(diff),
      ];
    }),
  ];

  return rows.flatMap((row, rowIndex) =>
    row.map((value, colIndex) => {
      const cell = document.createElement("span");
      cell.className = rowIndex === 0 ? "scorecard-head" : "scorecard-cell";
      if (colIndex === 3 && rowIndex > 0) {
        const diffValue = Number(value.replace("+", ""));
        if (diffValue < 0) cell.classList.add("under");
        if (diffValue > 0) cell.classList.add("over");
      }
      cell.textContent = value;
      return cell;
    }),
  );
}

function formatDiff(value) {
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
}

function weatherIconClass(summary) {
  const text = String(summary || "").toLowerCase();
  if (text.includes("regen") || text.includes("niesel") || text.includes("schauer")) return "is-rain";
  if (text.includes("bewölkt") || text.includes("wölkt")) return "is-cloud";
  if (text.includes("nebel")) return "is-fog";
  return "is-sun";
}

function renderSourceStatus() {
  return [
    ["Wetter", dashboardState.sourceStatus.weather],
    ["Startzeiten", dashboardState.sourceStatus.teeTimes],
    ["Runde", dashboardState.sourceStatus.nextRound],
    ["Handicap", dashboardState.sourceStatus.handicap],
  ].map(([label, status]) => {
    const chip = document.createElement("span");
    chip.className = isLiveSource(status) ? "source-chip live" : "source-chip offline";
    chip.title = `${label}: ${status}`;

    const dot = document.createElement("span");
    dot.className = "source-dot";
    dot.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = label;

    chip.append(dot, text);
    return chip;
  });
}

function isLiveSource(status) {
  const text = String(status || "").toLowerCase();
  return text.includes("live") || text.includes("verbunden");
}

function answerQuestion(question) {
  const normalized = question.toLowerCase();
  const score = calculateGolfScore(dashboardState);

  if (normalized.includes("startzeit") || normalized.includes("tee")) {
    return `Die n\u00e4chste freie Startzeit ist ${dashboardState.teeTimes[0]} Uhr. Buchen geht \u00fcber PC CADDIE Online.`;
  }
  if (normalized.includes("scorecard") || normalized.includes("karte")) {
    return `Die Scorecard ist ${dashboardState.scorecard.status}. ${dashboardState.scorecard.summary || ""}`;
  }
  if (normalized.includes("wetter") || normalized.includes("regen") || normalized.includes("wind")) {
    return `Aktuell ${dashboardState.weather.summary.toLowerCase()}, ${dashboardState.weather.temperature}\u00b0C, Wind ${dashboardState.weather.windKmh} km/h und ${dashboardState.weather.rainChance}% Regenchance.`;
  }
  if (normalized.includes("handicap") || normalized.includes("runde")) {
    return `Dein Handicap liegt bei ${dashboardState.handicap.index.toLocaleString("de-DE")}. Die n\u00e4chste Runde ist ${dashboardState.nextRound.date} um ${dashboardState.nextRound.time}.`;
  }
  if (normalized.includes("platz") || normalized.includes("belegung")) {
    return `Im aktuell sichtbaren restlichen Buchungszeitraum sind ${dashboardState.occupancy}% der Slots belegt.`;
  }
  if (normalized.includes("golf") || normalized.includes("score")) {
    return `Der Golf-Score liegt heute bei ${score} von 10.`;
  }
  return "Ich kann dir aktuell Wetter, Startzeiten, Platzbelegung, Handicap, Runde, Scorecard und Tages-Score beantworten.";
}

function askAssistant() {
  const question = els.assistantInput.value.trim();
  if (!question) return;
  els.assistantAnswer.textContent = answerQuestion(question);
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.assistantAnswer.textContent = "Spracheingabe ist in diesem Browser nicht verf\u00fcgbar. Texteingabe funktioniert.";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "de-DE";
  recognition.interimResults = false;
  recognition.addEventListener("result", (event) => {
    const transcript = event.results[0][0].transcript;
    els.assistantInput.value = transcript;
    els.assistantAnswer.textContent = answerQuestion(transcript);
  });
  recognition.start();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

els.askButton.addEventListener("click", askAssistant);
els.assistantInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") askAssistant();
});
els.voiceButton.addEventListener("click", startVoiceInput);

updateClock();
render();
refreshDashboard();
setInterval(updateClock, 1000);
setInterval(refreshDashboard, dashboardState.club.refresh.weatherMs);
setInterval(() => {
  simulateLiveData();
  render();
}, dashboardState.club.refresh.visualMs);
