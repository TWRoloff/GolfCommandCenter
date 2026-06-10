window.GOLF_CLUBS = [
  {
    id: "gut-apeldoer",
    name: "Golf Club Gut Apeld\u00f6r",
    displayName: "Gut Apeld\u00f6r",
    locationLabel: "Hennstedt, Schleswig-Holstein",
    coordinates: { latitude: 54.287, longitude: 9.141 },
    urls: {
      website: "https://apeldoer.de/",
      teeTimes: "https://apeldoer.de/startzeiten/",
      scorecard: "https://apeldoer.de/golfanlage/scorecard/",
      pcCaddie: "https://apeldoer.de/startzeiten/",
      updates: "https://apeldoer.de/apeldoer-updates/",
    },
  },
  {
    id: "hamburger-golf-club",
    name: "Hamburger Golf-Club e.V.",
    displayName: "Hamburger Golf-Club Falkenstein",
    locationLabel: "Hamburg",
    coordinates: { latitude: 53.5667, longitude: 9.7619 },
    urls: {
      website: "https://www.hamburger-golf-club.de/",
      teeTimes: "https://www.hamburger-golf-club.de/",
      scorecard: "https://www.hamburger-golf-club.de/",
      updates: "https://www.hamburger-golf-club.de/",
    },
  },
  {
    id: "golf-club-st-leon-rot",
    name: "Golf Club St. Leon-Rot",
    displayName: "Golf Club St. Leon-Rot",
    locationLabel: "St. Leon-Rot, Baden-W\u00fcrttemberg",
    coordinates: { latitude: 49.2596, longitude: 8.6164 },
    urls: {
      website: "https://www.gc-slr.de/",
      teeTimes: "https://www.gc-slr.de/",
      scorecard: "https://www.gc-slr.de/",
      updates: "https://www.gc-slr.de/",
    },
  },
  {
    id: "golfclub-muenchen-eichenried",
    name: "Golfclub M\u00fcnchen Eichenried",
    displayName: "Golfclub M\u00fcnchen Eichenried",
    locationLabel: "Moosinning, Bayern",
    coordinates: { latitude: 48.2778, longitude: 11.7956 },
    urls: {
      website: "https://www.golf-eichenried.de/",
      teeTimes: "https://www.golf-eichenried.de/",
      scorecard: "https://www.golf-eichenried.de/",
      updates: "https://www.golf-eichenried.de/",
    },
  },
  {
    id: "winstongolf",
    name: "WINSTONgolf",
    displayName: "WINSTONgolf",
    locationLabel: "Vorbeck, Mecklenburg-Vorpommern",
    coordinates: { latitude: 53.6595, longitude: 11.5523 },
    urls: {
      website: "https://www.winstongolf.de/",
      teeTimes: "https://www.winstongolf.de/",
      scorecard: "https://www.winstongolf.de/",
      updates: "https://www.winstongolf.de/",
    },
  },
];

window.CLUB_CONFIG = {
  ...window.GOLF_CLUBS[0],
  refresh: {
    weatherMs: 10 * 60 * 1000,
    visualMs: 15 * 1000,
  },
};
