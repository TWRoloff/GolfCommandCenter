const dashboardState = {
  club: window.CLUB_CONFIG,
  weather: {
    temperature: 21,
    summary: "Sonnig",
    windKmh: 12,
    windDirection: "variabel",
    rainChance: 5,
    greenSpeed: "mittel-schnell",
    playFacts: [],
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
  tournament: {
    status: "Turnierergebnisse laden",
    summary: "Mittwochsergebnisse werden geladen",
    latest: null,
    history: [],
    averageNet: null,
    bestNet: null,
    trend: "Noch keine Auswertung",
  },
  dreamRound: {
    summary: "Traumrunde wird geladen",
    totalScore: null,
    totalPar: null,
    scoreDiff: null,
    holesPlayed: 0,
    bestHole: null,
    holes: [],
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
    tournament: "PC CADDIE offen",
  },
};

const defaultClubId = window.CLUB_CONFIG.id;
let selectedClubId = defaultClubId;
let availableGolfClubs = [...window.GOLF_CLUBS];

const els = {
  currentDate: document.querySelector("#currentDate"),
  clock: document.querySelector("#clock"),
  syncStatus: document.querySelector("#syncStatus"),
  clubSelect: document.querySelector("#clubSelect"),
  clubSearch: document.querySelector("#clubSearch"),
  clubSearchCount: document.querySelector("#clubSearchCount"),
  clubName: document.querySelector("#clubName"),
  sourceLine: document.querySelector("#sourceLine"),
  temperature: document.querySelector("#temperature"),
  weatherSummary: document.querySelector("#weatherSummary"),
  wind: document.querySelector("#wind"),
  rain: document.querySelector("#rain"),
  greenSpeed: document.querySelector("#greenSpeed"),
  golfFacts: document.querySelector("#golfFacts"),
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
  tournamentEvent: document.querySelector("#tournamentEvent"),
  tournamentNet: document.querySelector("#tournamentNet"),
  tournamentResult: document.querySelector("#tournamentResult"),
  tournamentLatest: document.querySelector("#tournamentLatest"),
  tournamentTrend: document.querySelector("#tournamentTrend"),
  formCurve: document.querySelector("#formCurve"),
  tournamentChart: document.querySelector("#tournamentChart"),
  dreamScore: document.querySelector("#dreamScore"),
  dreamMeta: document.querySelector("#dreamMeta"),
  bestHole: document.querySelector("#bestHole"),
  bestHoleMeta: document.querySelector("#bestHoleMeta"),
  clubCardName: document.querySelector("#clubCardName"),
  clubCardLocation: document.querySelector("#clubCardLocation"),
  courseStatus: document.querySelector("#courseStatus"),
  driveTimePanel: document.querySelector("#driveTimePanel"),
  driveTimeValue: document.querySelector("#driveTimeValue"),
  driveTimeMeta: document.querySelector("#driveTimeMeta"),
  clubLink: document.querySelector("#clubLink"),
  clubNewsLink: document.querySelector("#clubNewsLink"),
  clubNewsLabel: document.querySelector("#clubNewsLabel"),
  clubNewsTitle: document.querySelector("#clubNewsTitle"),
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
  els.currentDate.textContent = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date());
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
    if (selectedClubId !== defaultClubId) {
      await applySelectedClubWeather();
    }
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
  dashboardState.sourceStatus.tournament = "PC CADDIE offen";
  dashboardState.scorecard = scorecardData;
  dashboardState.clubInfo = [];

  render();
  setSyncStatus("Synchronisiert");
}

async function selectClub(clubId) {
  selectedClubId = clubId;
  setSyncStatus("Lade Platzwetter");
  await applySelectedClubWeather();
  renderDriveTime(null, "Standort erneut berechnen");
  render();
  setSyncStatus("Synchronisiert");
}

async function applySelectedClubWeather() {
  const selectedClub = availableGolfClubs.find((club) => club.id === selectedClubId) || window.CLUB_CONFIG;
  dashboardState.club = normalizeClub(selectedClub);
  dashboardState.clubUpdate = {
    title: `${selectedClub.displayName} öffnen`,
    url: selectedClub.urls.updates || selectedClub.urls.website,
  };
  const weather = await window.DashboardServices.fetchWeather(dashboardState.club);
  if (weather) {
    dashboardState.weather = weather;
    dashboardState.sourceStatus.weather = "Open-Meteo live";
  } else {
    dashboardState.sourceStatus.weather = "Wetter nicht erreichbar";
  }
}

async function loadGolfClubs() {
  try {
    const response = await fetch("data/golf_courses_de.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`Golfplatzdaten HTTP ${response.status}`);
    const osmClubs = (await response.json()).map(normalizeOsmGolfClub);
    availableGolfClubs = mergeGolfClubs(window.GOLF_CLUBS, osmClubs);
  } catch (error) {
    console.warn("Golfplatzdaten nicht verfügbar", error);
  }
  renderClubOptions();
}

function normalizeOsmGolfClub(club) {
  const osmUrl = `https://www.openstreetmap.org/${club.id.replace(/^osm-/, "").replace("-", "/")}`;
  const website = club.website || osmUrl;
  return {
    id: club.id,
    name: club.name,
    displayName: club.name,
    locationLabel: club.locationLabel || "Deutschland",
    coordinates: {
      latitude: club.latitude,
      longitude: club.longitude,
    },
    urls: {
      website,
      teeTimes: website,
      scorecard: website,
      updates: website,
    },
  };
}

function mergeGolfClubs(curated, osmClubs) {
  const clubs = [];
  osmClubs.filter(isUsefulGolfClub).forEach((club) => addUniqueGolfClub(clubs, club, false));
  curated.forEach((club) => addUniqueGolfClub(clubs, club, true));
  return clubs.sort((left, right) => left.displayName.localeCompare(right.displayName, "de"));
}

function addUniqueGolfClub(clubs, candidate, preferCandidate) {
  const duplicateIndex = clubs.findIndex((club) => golfClubsAreDuplicates(club, candidate));
  if (duplicateIndex < 0) {
    clubs.push(candidate);
    return;
  }

  if (preferCandidate || golfClubInformationScore(candidate) > golfClubInformationScore(clubs[duplicateIndex])) {
    clubs[duplicateIndex] = candidate;
  }
}

function golfClubsAreDuplicates(left, right) {
  const distance = distanceKm(
    left.coordinates.latitude,
    left.coordinates.longitude,
    right.coordinates.latitude,
    right.coordinates.longitude,
  );
  const leftWords = golfClubIdentityWords(left.displayName);
  const rightWords = golfClubIdentityWords(right.displayName);
  if (!leftWords.length || !rightWords.length) return false;
  if (leftWords.join(" ") === rightWords.join(" ")) {
    return distance <= 5 || !hasSpecificLocation(left) || !hasSpecificLocation(right);
  }
  if (distance > 5) return false;

  const sharedWords = leftWords.filter((word) => rightWords.includes(word));
  return sharedWords.length >= 2 && sharedWords.length / Math.min(leftWords.length, rightWords.length) >= 0.8;
}

function isUsefulGolfClub(club) {
  const name = normalizeSearchText(club.displayName);
  if (!/[a-z]/.test(name) || /^\d+(?: \d+)*$/.test(name)) return false;

  const excludedTerms = [
    "abenteuer golf", "adventure golf", "bahn ", "bauerngolf", "crossgolf", "disc golf",
    "driving range", "fussball golf", "fussballgolf", "indoor golf", "indoorgolf", "mini golf",
    "minigolf", "pitching", "soccerpark", "swin golf", "swingolf", "ubungsplatz",
  ];
  if (excludedTerms.some((term) => name.includes(term))) return false;

  return !["golf", "golfplatz", "kurzplatz", "old course", "platz", "public course"].includes(name);
}

function hasSpecificLocation(club) {
  return Boolean(club.locationLabel && club.locationLabel !== "Deutschland");
}

function golfClubIdentityWords(value) {
  const ignoredWords = new Set([
    "anlage", "course", "e", "ev", "golf", "golfanlage", "golfclub", "golfplatz",
    "gc", "platz", "resort", "the", "und", "v",
  ]);
  return normalizeSearchText(value)
    .split(" ")
    .filter((word) => word.length > 1 && !ignoredWords.has(word));
}

function golfClubInformationScore(club) {
  let score = 0;
  if (club.locationLabel && club.locationLabel !== "Deutschland") score += 2;
  if (club.urls?.website && !club.urls.website.includes("openstreetmap.org")) score += 2;
  score += Math.min(2, golfClubIdentityWords(club.displayName).length / 4);
  return score;
}

function renderClubOptions() {
  const query = els.clubSearch.value.trim().toLocaleLowerCase("de");
  const matches = availableGolfClubs.filter((club) => clubMatchesQuery(club, query));
  const selectedClub = availableGolfClubs.find((club) => club.id === selectedClubId);
  const visibleClubs = selectedClub && !matches.some((club) => club.id === selectedClubId)
    ? [selectedClub, ...matches]
    : matches;

  els.clubSelect.replaceChildren(
    ...visibleClubs.map((club) => {
      const option = document.createElement("option");
      option.value = club.id;
      option.textContent = `${club.displayName} · ${club.locationLabel}`;
      option.selected = club.id === selectedClubId;
      return option;
    }),
  );
  els.clubSearchCount.textContent = query
    ? `${matches.length} von ${availableGolfClubs.length} Plätzen`
    : `${availableGolfClubs.length} Plätze in Deutschland`;
}

function clubMatchesQuery(club, query) {
  if (!query) return true;
  const queryWords = normalizeSearchText(query).split(" ").filter(Boolean);
  const clubWords = normalizeSearchText(`${club.displayName} ${club.locationLabel}`).split(" ").filter(Boolean);
  return queryWords.every((queryWord) => clubWords.some((clubWord) => clubWord.startsWith(queryWord)));
}

function normalizeSearchText(value) {
  return String(value || "")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  dashboardState.sourceStatus.tournament = data.sources?.tournament || data.tournament?.source || "API";
  dashboardState.scorecard = data.scorecard || dashboardState.scorecard;
  dashboardState.tournament = data.tournament || dashboardState.tournament;
  dashboardState.dreamRound = data.dreamRound || dashboardState.dreamRound;
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

function requestDriveTime() {
  if (!navigator.geolocation) {
    renderDriveTime(null, "Standort nicht verfügbar");
    return;
  }

  renderDriveTime(null, "Standort wird ermittelt");
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const route = await fetchDriveTime(position.coords);
        renderDriveTime(route.durationLabel, `${route.distanceLabel} · ${route.source}`);
      } catch {
        const fallback = estimateDriveTime(position.coords);
        renderDriveTime(fallback.durationLabel, fallback.distanceLabel);
      }
    },
    () => renderDriveTime(null, "Standort freigeben"),
    {
      enableHighAccuracy: false,
      maximumAge: 30 * 60 * 1000,
      timeout: 9000,
    },
  );
}

async function fetchDriveTime(coords) {
  const response = await fetch("/api/drive-time", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      latitude: coords.latitude,
      longitude: coords.longitude,
      destination: dashboardState.club.coordinates,
    }),
  });
  if (!response.ok) {
    throw new Error("Routing nicht verfügbar");
  }
  const route = await response.json();
  if (!route.ok) {
    throw new Error(route.error || "Routing nicht verfügbar");
  }
  return route;
}

function renderDriveTime(value, meta) {
  els.driveTimeValue.textContent = value || "Standort";
  els.driveTimeMeta.textContent = meta;
}

function estimateDriveTime(coords) {
  const airDistance = distanceKm(
    coords.latitude,
    coords.longitude,
    dashboardState.club.coordinates.latitude,
    dashboardState.club.coordinates.longitude,
  );
  const roadDistance = airDistance * 1.28 + 2;
  const averageSpeed = roadDistance < 20 ? 45 : 70;
  const minutes = Math.max(4, Math.round((roadDistance / averageSpeed) * 60 + 4));
  return {
    durationLabel: formatDriveMinutes(minutes),
    distanceLabel: `ca. ${Math.round(roadDistance)} km geschätzt`,
  };
}

function formatDriveMinutes(minutes) {
  if (minutes < 60) return `ca. ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `ca. ${hours} h ${rest} min` : `ca. ${hours} h`;
}

function distanceKm(fromLat, fromLon, toLat, toLon) {
  const radius = 6371;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLon = toRadians(toLon - fromLon);
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
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
  els.golfFacts.replaceChildren(...renderGolfFacts(weather));
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
  renderTournament(dashboardState.tournament);
  renderDreamRound(dashboardState.dreamRound);
  els.teeDateLabel.textContent = teeDateText(dashboardState.teeTimeDateLabel);
  els.bookingLink.href = dashboardState.club.urls.teeTimes;
  els.scorecardLink.href = dashboardState.scorecard.url || dashboardState.club.urls.scorecard;
  els.clubCardName.textContent = dashboardState.club.displayName;
  els.clubCardLocation.textContent = dashboardState.club.locationLabel;
  els.courseStatus.textContent = "Platz offen";
  els.clubLink.href = dashboardState.club.urls.teeTimes;
  els.clubNewsTitle.textContent = dashboardState.clubUpdate.title;
  els.clubNewsLabel.textContent = selectedClubId === defaultClubId ? "Apeldör Update" : "Club-Website";
  els.clubNewsLink.href = dashboardState.clubUpdate.url || dashboardState.club.urls.updates;

  els.occupancyBars.replaceChildren(...renderOccupancyBars(dashboardState.occupancy));
  els.occupancyGroups.replaceChildren(...renderOccupancyGroups(dashboardState.teeTimeGroups));
  const visibleGroups = visibleTeeTimeGroups(dashboardState.teeTimeGroups, dashboardState.teeTimeDateLabel);
  const visibleTimes = visibleTeeTimes(dashboardState.teeTimes, dashboardState.teeTimeDateLabel);
  els.teeTimes.replaceChildren(...renderTeeGroups(visibleGroups, visibleTimes));
  els.scorecardGrid.replaceChildren(...renderScorecardGrid(dashboardState.scorecard.latest?.detail));
}

function renderTournament(tournament) {
  const latest = tournament?.latest;
  els.tournamentEvent.textContent = latest ? `${latest.event} \u00b7 ${latest.date}` : tournament?.summary || "Keine Ergebnisse gefunden";
  els.tournamentNet.textContent = latest?.net ?? "--";
  els.tournamentResult.textContent = latest ? "Netto-Punkte" : "Netto";
  els.tournamentLatest.textContent = latest ? tournament.summary : tournament?.status || "--";
  els.tournamentTrend.textContent = tournamentStatsText(tournament);
  els.formCurve.replaceChildren(renderFormCurve(tournament?.history || []));
  els.tournamentChart.replaceChildren(renderTournamentChart(tournament?.history || []));
}

function renderFormCurve(history) {
  const form = document.createElement("div");
  form.className = "form-pill";

  const values = history
    .filter((item) => Number.isFinite(item.net) && item.net >= 0 && item.net <= 60)
    .slice(0, 5);

  const label = document.createElement("span");
  label.textContent = "Form";

  const value = document.createElement("strong");
  value.textContent = formLabel(values);

  const dots = document.createElement("div");
  dots.className = "form-dots";
  dots.replaceChildren(...values.slice().reverse().map(renderFormDot));

  form.append(label, value, dots);
  return form;
}

function renderFormDot(item) {
  const dot = document.createElement("span");
  dot.className = `form-dot ${formDotClass(item.net)}`;
  dot.title = `${item.date}: Netto ${item.net}`;
  return dot;
}

function formLabel(values) {
  if (values.length < 3) return "zu wenig Daten";
  const latest = values[0].net;
  const restAverage = values.slice(1).reduce((sum, item) => sum + item.net, 0) / (values.length - 1);
  const diff = latest - restAverage;
  if (diff >= 2) return "steigend";
  if (diff <= -2) return "fallend";
  return "stabil";
}

function formDotClass(net) {
  if (net >= 36) return "hot";
  if (net >= 32) return "steady";
  return "low";
}

function renderDreamRound(dreamRound) {
  const totalScore = dreamRound?.totalScore;

  els.dreamScore.textContent = totalScore ?? "--";
  els.dreamMeta.textContent = dreamRoundMeta(dreamRound);

  const bestHole = dreamRound?.bestHole;
  els.bestHole.textContent = bestHole ? `Loch ${bestHole.hole}: ${bestHole.score}` : "--";
  els.bestHoleMeta.textContent = bestHole ? bestHoleText(bestHole) : "Noch keine Lochdaten gefunden";
}

function dreamRoundMeta(dreamRound) {
  if (!dreamRound?.holesPlayed) return "Beste Runde";
  const diff = dreamRound.scoreDiff;
  const diffText = diff === null || diff === undefined ? "" : ` · ${formatDiff(diff)} zu Par`;
  const dateText = dreamRound.dateLabel ? ` · ${dreamRound.dateLabel}` : "";
  return `${dreamRound.holesPlayed} Löcher${diffText}${dateText}`;
}

function bestHoleText(hole) {
  const diff = hole.diff === null || hole.diff === undefined ? "" : `${formatDiff(hole.diff)} zu Par`;
  return [diff, hole.date, hole.course].filter(Boolean).join(" · ");
}

function scoreClass(diff) {
  if (diff === null || diff === undefined) return "";
  if (diff < 0) return "under";
  if (diff === 0) return "par";
  return "over";
}

function renderGolfFacts(weather) {
  const facts = weather.playFacts?.length
    ? weather.playFacts
    : [
        { label: "Carry", value: "neutral" },
        { label: "Putten", value: weather.greenSpeed || "normal" },
        { label: "Windrichtung", value: weather.windDirection || "variabel" },
      ];

  return facts.slice(0, 4).map((fact) => {
    const item = document.createElement("div");
    item.className = `golf-fact ${golfFactClass(fact.label)}`;

    const icon = document.createElement("span");
    icon.className = "golf-fact-icon";
    icon.textContent = golfFactIcon(fact.label);
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("div");
    text.className = "golf-fact-text";

    const label = document.createElement("span");
    label.textContent = fact.label;

    const value = document.createElement("strong");
    value.textContent = fact.value;

    text.append(label, value);
    item.append(icon, text);
    return item;
  });
}

function golfFactIcon(label) {
  const key = String(label || "").toLowerCase();
  if (key.includes("carry")) return "\u2197";
  if (key.includes("putt")) return "\u25cf";
  if (key.includes("wind")) return "\u2192";
  if (key.includes("regen")) return "%";
  return "i";
}

function golfFactClass(label) {
  const key = String(label || "").toLowerCase();
  if (key.includes("carry")) return "is-carry";
  if (key.includes("putt")) return "is-putt";
  if (key.includes("wind")) return "is-wind";
  if (key.includes("regen")) return "is-rain-window";
  return "";
}

function tournamentStatsText(tournament) {
  if (!tournament?.history?.length) return tournament?.trend || "--";
  const parts = [];
  if (tournament.averageNet !== null && tournament.averageNet !== undefined) parts.push(`\u00d8 Netto ${tournament.averageNet}`);
  if (tournament.bestNet !== null && tournament.bestNet !== undefined) parts.push(`Bestes Netto ${tournament.bestNet}`);
  if (tournament.trend) parts.push(tournament.trend);
  return parts.join(" \u00b7 ");
}

function renderTournamentChart(history) {
  const chart = document.createElement("div");
  chart.className = "spark-chart";

  const values = history
    .filter((item) => Number.isFinite(item.net) && item.net >= 0 && item.net <= 60)
    .slice(0, 5)
    .reverse();

  if (values.length < 2) {
    chart.textContent = "Noch nicht genug Daten für einen Verlauf";
    chart.classList.add("empty");
    return chart;
  }

  const width = 240;
  const height = 72;
  const padding = 10;
  const nets = values.map((item) => item.net);
  const min = Math.min(...nets, 30);
  const max = Math.max(...nets, 40);
  const range = Math.max(1, max - min);
  const points = values.map((item, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(1, values.length - 1);
    const y = height - padding - ((item.net - min) / range) * (height - padding * 2);
    return { x, y, item };
  });

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Netto-Verlauf">
      <polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}"></polyline>
      ${points
        .map(
          (point) => `
            <g>
              <circle cx="${point.x}" cy="${point.y}" r="4"></circle>
              <text x="${point.x}" y="${Math.max(12, point.y - 8)}">${point.item.net}</text>
            </g>
          `,
        )
        .join("")}
    </svg>
    <div class="spark-labels">
      ${values.map((item) => `<span>${shortDate(item.date)}</span>`).join("")}
    </div>
  `;
  return chart;
}

function shortDate(date) {
  const match = String(date || "").match(/^(\d{2})\.(\d{2})\./);
  return match ? `${match[1]}.${match[2]}.` : "";
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
    if (fallbackTimes?.length) return fallbackTimes.map(renderTeeTime);
    const empty = document.createElement("p");
    empty.className = "tee-empty";
    empty.textContent = "Heute sind ab jetzt keine freien Startzeiten mehr sichtbar.";
    return [empty];
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

function visibleTeeTimeGroups(groups, dateLabel) {
  if (!isTodayLabel(dateLabel)) return groups || [];
  return (groups || [])
    .map((group) => ({ ...group, times: visibleTeeTimes(group.times, dateLabel) }))
    .filter((group) => group.times.length);
}

function visibleTeeTimes(times, dateLabel) {
  if (!isTodayLabel(dateLabel)) return times || [];
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return (times || []).filter((time) => timeToMinutes(time) >= currentMinutes);
}

function isTodayLabel(label) {
  return !label || label === "Heute";
}

function timeToMinutes(time) {
  const match = String(time || "").match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
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
    ["Turnier", dashboardState.sourceStatus.tournament],
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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

updateClock();
renderClubOptions();
loadGolfClubs();
render();
refreshDashboard();
setInterval(updateClock, 1000);
setInterval(refreshDashboard, dashboardState.club.refresh.weatherMs);
setInterval(() => {
  simulateLiveData();
  render();
}, dashboardState.club.refresh.visualMs);

els.driveTimePanel.addEventListener("click", requestDriveTime);
els.clubSelect.addEventListener("change", (event) => selectClub(event.target.value));
els.clubSearch.addEventListener("input", renderClubOptions);
els.driveTimePanel.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") requestDriveTime();
});
requestDriveTime();
