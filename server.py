from __future__ import annotations

import json
import math
import os
import argparse
import html
import re
import urllib.parse
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from pc_caddie_adapter import PcCaddieAdapter


ROOT = Path(__file__).resolve().parent
HOST = os.getenv("GOLF_DASHBOARD_HOST", "127.0.0.1")
PORT = int(os.getenv("GOLF_DASHBOARD_PORT", "4173"))

CLUB = {
    "name": "Golf Club Gut Apeld\u00f6r",
    "displayName": "Gut Apeld\u00f6r",
    "locationLabel": "Hennstedt, Dithmarschen",
    "coordinates": {
        "latitude": 54.287,
        "longitude": 9.141,
    },
    "urls": {
        "website": "https://apeldoer.de/",
        "teeTimes": "https://apeldoer.de/startzeiten/",
        "scorecard": "https://apeldoer.de/golfanlage/scorecard/",
        "pcCaddieAccount": "https://www.pccaddie.net/clubs/0492321/app.php?cat=user_account",
        "updates": "https://apeldoer.de/apeldoer-updates/",
    },
}


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/dashboard":
            self.send_json(build_dashboard_payload())
            return
        if path == "/api/override":
            self.send_json(read_override())
            return
        if path == "/health":
            self.send_json({"ok": True})
            return
        super().do_GET()

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/override":
            self.save_override()
            return
        if path == "/api/drive-time":
            self.send_drive_time()
            return
        self.send_json({"error": "Not found"}, status=404)

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length).decode("utf-8")
        return json.loads(raw_body) if raw_body else {}

    def send_drive_time(self):
        try:
            payload = self.read_json_body()
            origin = {
                "latitude": float(payload["latitude"]),
                "longitude": float(payload["longitude"]),
            }
            self.send_json(fetch_drive_time(origin, CLUB))
        except Exception as error:
            self.send_json({"ok": False, "error": str(error)}, status=400)

    def save_override(self):
        try:
            payload = self.read_json_body()
            write_override(payload)
            self.send_json({"ok": True, "override": payload})
        except Exception as error:
            self.send_json({"ok": False, "error": str(error)}, status=400)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def build_dashboard_payload():
    pc_caddie = PcCaddieAdapter(CLUB)
    tee_time_data = pc_caddie.fetch_tee_times()
    round_data = pc_caddie.fetch_next_round()
    handicap_data = pc_caddie.fetch_handicap()
    scorecard_data = pc_caddie.fetch_scorecard()
    scorecard_list = pc_caddie.fetch_scorecard_list()
    tournament_data = pc_caddie.fetch_tournament_results()
    scorecard_data["list"] = scorecard_list["entries"]
    scorecard_data["latest"] = scorecard_list["latest"]
    scorecard_data["best"] = best_scorecard(scorecard_list["entries"])
    dream_round = build_dream_round(scorecard_list["entries"], tournament_data)
    if scorecard_list["latest"]:
        latest_detail = scorecard_list["latest"].get("detail") or {}
        score_label = latest_detail.get("scoreLabel")
        scorecard_summary = scorecard_list["summary"]
        if score_label:
            scorecard_summary = f"{scorecard_summary} · {score_label}"

        scorecard_data["summary"] = f"Letzte Scorekarte: {scorecard_summary}"
        scorecard_data["status"] = "Scorekartenliste live"
        scorecard_data["source"] = scorecard_list["source"]
        handicap_data["lastRound"] = scorecard_list["latest"].get("summary") or scorecard_list["summary"]
        if score_label:
            handicap_data["lastRound"] = score_label
        else:
            handicap_data["lastRound"] = f"{scorecard_list['summary']} · Score noch nicht abrufbar"
        if scorecard_data["best"]:
            handicap_data["bestRound"] = scorecard_data["best"]["detail"]["scoreLabel"]
        if handicap_data.get("bestRound") == "PC CADDIE":
            handicap_data["bestRound"] = "noch offen"

    return {
        "club": CLUB,
        "weather": fetch_weather(CLUB),
        "clubUpdate": fetch_club_update(CLUB),
        "teeTimes": tee_time_data["teeTimes"],
        "teeTimeGroups": tee_time_data.get("teeTimeGroups", []),
        "teeTimeDate": tee_time_data.get("teeTimeDate"),
        "teeTimeDateLabel": tee_time_data.get("teeTimeDateLabel"),
        "occupancy": tee_time_data["occupancy"],
        "occupancyDetails": tee_time_data.get("occupancyDetails"),
        "nextRound": round_data,
        "handicap": handicap_data,
        "scorecard": scorecard_data,
        "tournament": tournament_data,
        "dreamRound": dream_round,
        "sources": {
            "weather": "Open-Meteo live",
            "teeTimes": tee_time_data["source"],
            "nextRound": round_data["source"],
            "handicap": handicap_data["source"],
            "scorecard": scorecard_list["source"] if scorecard_list["latest"] else scorecard_data["source"],
            "tournament": tournament_data["source"],
        },
    }


def best_scorecard(entries):
    scored_entries = [
        entry
        for entry in entries
        if entry.get("detail") and entry["detail"].get("scoreDiff") is not None
    ]
    if not scored_entries:
        return None

    return min(
        scored_entries,
        key=lambda entry: (
            entry["detail"]["scoreDiff"],
            entry["detail"].get("totalScore", 999),
        ),
    )


def build_dream_round(entries, tournament_data=None):
    rounds = [round_data for round_data in (build_round_result(entry) for entry in dream_round_entries(entries, tournament_data)) if round_data]
    best_hole = best_hole_from_rounds(rounds)

    if not rounds:
        return {
            "source": "Keine Scorecards",
            "summary": "Noch keine Lochdaten gefunden",
            "totalScore": None,
            "totalPar": None,
            "scoreDiff": None,
            "holesPlayed": 0,
            "course": "",
            "dateLabel": "",
            "bestHole": best_hole,
            "holes": [],
        }

    best_round = min(rounds, key=round_sort_key)
    best_round["bestHole"] = best_hole
    return best_round


def build_round_result(entry):
    detail = entry.get("detail") or {}
    pars_by_hole = {item["hole"]: item["par"] for item in detail.get("pars", [])}
    holes = []
    for score_item in detail.get("scores", []):
        hole = score_item.get("hole")
        score = score_item.get("score")
        par = pars_by_hole.get(hole)
        if not hole or not score:
            continue
        holes.append(
            {
                "hole": hole,
                "score": score,
                "par": par,
                "diff": score - par if par else None,
                "date": entry.get("date", ""),
                "course": entry.get("course", ""),
                "tee": entry.get("tee", ""),
            }
        )

    if not holes:
        return None
    total_score = sum(item["score"] for item in holes)
    total_par = sum(item["par"] for item in holes if item.get("par"))
    score_diff = total_score - total_par if total_par else None

    return {
        "source": "PC CADDIE live",
        "summary": best_round_summary(total_score, total_par, len(holes)),
        "totalScore": total_score,
        "totalPar": total_par if total_par else None,
        "scoreDiff": score_diff,
        "holesPlayed": len(holes),
        "course": entry.get("course", ""),
        "dateLabel": entry.get("date", ""),
        "tee": entry.get("tee", ""),
        "bestHole": None,
        "holes": holes,
    }


def round_sort_key(round_data):
    return (
        round_data["scoreDiff"] if round_data["scoreDiff"] is not None else 999,
        round_data["totalScore"],
        -round_data["holesPlayed"],
    )


def best_hole_from_rounds(rounds):
    best_hole = None
    for round_data in rounds:
        for hole in round_data.get("holes", []):
            diff = hole.get("diff")
            if diff is None:
                continue
            if (
                not best_hole
                or diff < best_hole["diff"]
                or (diff == best_hole["diff"] and hole["score"] < best_hole["score"])
            ):
                best_hole = hole
    return best_hole


def dream_round_entries(scorecard_entries, tournament_data=None):
    entries = list(scorecard_entries or [])
    for result in (tournament_data or {}).get("history", []):
        if not result.get("scores"):
            continue
        entries.append(
            {
                "date": result.get("date", ""),
                "course": result.get("event", ""),
                "tee": "",
                "detail": {
                    "scores": result.get("scores", []),
                    "pars": result.get("pars", []),
                },
            }
        )
    return entries


def best_round_summary(total_score, total_par, holes_count):
    if not holes_count:
        return "Noch keine Lochdaten gefunden"
    label = f"Beste Runde: {total_score} Schläge über {holes_count} Löcher"
    if total_par:
        diff = total_score - total_par
        sign = "+" if diff > 0 else ""
        label = f"{label}, {sign}{diff} zu Par"
    return label



def read_override():
    override_path = ROOT / "data" / "dashboard_override.json"
    if not override_path.exists():
        return {}
    with override_path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_override(payload):
    override_path = ROOT / "data" / "dashboard_override.json"
    override_path.parent.mkdir(parents=True, exist_ok=True)
    with override_path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
        file.write("\n")


def fetch_drive_time(origin, club):
    destination = club["coordinates"]
    provider = os.getenv("ROUTING_PROVIDER", "auto").lower()
    google_key = os.getenv("GOOGLE_MAPS_API_KEY", "").strip()

    if provider in ("auto", "google") and google_key:
        try:
            return fetch_google_drive_time(origin, destination, google_key)
        except Exception as error:
            print(f"Google routing provider failed: {error}")
            if provider == "google":
                raise

    if provider in ("auto", "osrm"):
        try:
            return fetch_osrm_drive_time(origin, destination)
        except Exception as error:
            print(f"OSRM routing provider failed: {error}")
            if provider == "osrm":
                raise

    return estimate_drive_time(origin, destination)


def fetch_google_drive_time(origin, destination, api_key):
    body = {
        "origin": {"location": {"latLng": {"latitude": origin["latitude"], "longitude": origin["longitude"]}}},
        "destination": {
            "location": {
                "latLng": {
                    "latitude": destination["latitude"],
                    "longitude": destination["longitude"],
                }
            }
        },
        "travelMode": "DRIVE",
        "routingPreference": "TRAFFIC_AWARE",
        "languageCode": "de-DE",
        "units": "METRIC",
    }
    request = urllib.request.Request(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=8) as response:
        data = json.loads(response.read().decode("utf-8"))

    route = (data.get("routes") or [None])[0]
    if not route:
        raise ValueError("Keine Google-Route gefunden")

    duration_seconds = parse_google_duration(route.get("duration"))
    distance_meters = route.get("distanceMeters")
    if duration_seconds is None or distance_meters is None:
        raise ValueError("Google-Route ohne Dauer oder Entfernung")

    return route_payload(
        duration_seconds=duration_seconds,
        distance_meters=distance_meters,
        source="Google Routes",
        precise=True,
    )


def parse_google_duration(value):
    if not value:
        return None
    match = re.fullmatch(r"(\d+(?:\.\d+)?)s", str(value))
    if not match:
        return None
    return float(match.group(1))


def fetch_osrm_drive_time(origin, destination):
    coordinates = (
        f"{origin['longitude']},{origin['latitude']};"
        f"{destination['longitude']},{destination['latitude']}"
    )
    url = f"https://router.project-osrm.org/route/v1/driving/{coordinates}?overview=false"
    request = urllib.request.Request(url, headers={"User-Agent": "GolfDashboard/0.1"})
    with urllib.request.urlopen(request, timeout=8) as response:
        data = json.loads(response.read().decode("utf-8"))

    route = (data.get("routes") or [None])[0]
    if not route:
        raise ValueError("Keine OSRM-Route gefunden")

    return route_payload(
        duration_seconds=route["duration"],
        distance_meters=route["distance"],
        source="OSRM Route",
        precise=True,
    )


def estimate_drive_time(origin, destination):
    air_distance = distance_km(
        origin["latitude"],
        origin["longitude"],
        destination["latitude"],
        destination["longitude"],
    )
    road_distance = air_distance * 1.28 + 2
    average_speed = 45 if road_distance < 20 else 70
    duration_minutes = max(4, round((road_distance / average_speed) * 60 + 4))
    return {
        "ok": True,
        "source": "Schätzung",
        "precise": False,
        "durationMinutes": duration_minutes,
        "durationLabel": format_drive_minutes(duration_minutes),
        "distanceKm": round(road_distance),
        "distanceLabel": f"ca. {round(road_distance)} km geschätzt",
    }


def route_payload(duration_seconds, distance_meters, source, precise):
    duration_minutes = max(1, round(duration_seconds / 60))
    distance_km_value = distance_meters / 1000
    return {
        "ok": True,
        "source": source,
        "precise": precise,
        "durationMinutes": duration_minutes,
        "durationLabel": format_drive_minutes(duration_minutes),
        "distanceKm": round(distance_km_value, 1),
        "distanceLabel": format_drive_distance(distance_km_value),
    }


def format_drive_minutes(minutes):
    if minutes < 60:
        return f"ca. {minutes} min"
    hours = minutes // 60
    rest = minutes % 60
    return f"ca. {hours} h {rest} min" if rest else f"ca. {hours} h"


def format_drive_distance(distance_km_value):
    if distance_km_value < 10:
        return f"{distance_km_value:.1f} km".replace(".", ",")
    return f"{round(distance_km_value)} km"


def distance_km(from_lat, from_lon, to_lat, to_lon):
    radius = 6371
    delta_lat = to_radians(to_lat - from_lat)
    delta_lon = to_radians(to_lon - from_lon)
    lat1 = to_radians(from_lat)
    lat2 = to_radians(to_lat)
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def to_radians(value):
    return (value * math.pi) / 180


def fetch_weather(club):
    latitude = club["coordinates"]["latitude"]
    longitude = club["coordinates"]["longitude"]
    query = urllib.parse.urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation,relative_humidity_2m",
            "hourly": "precipitation_probability,wind_speed_10m,relative_humidity_2m",
            "forecast_days": "1",
            "timezone": "Europe/Berlin",
        }
    )
    url = f"https://api.open-meteo.com/v1/forecast?{query}"

    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            data = json.loads(response.read().decode("utf-8"))

        rain_chance = find_current_rain_chance(data)
        current = data["current"]
        golf_facts = estimate_golf_weather_facts(current, rain_chance, data)
        return {
            "temperature": round(current["temperature_2m"]),
            "summary": weather_summary(current["weather_code"]),
            "windKmh": round(current["wind_speed_10m"]),
            "windDirection": wind_direction_label(current.get("wind_direction_10m")),
            "rainChance": rain_chance,
            "greenSpeed": estimate_green_speed(
                current["wind_speed_10m"],
                rain_chance,
                current["precipitation"],
            ),
            "playFacts": golf_facts,
        }
    except Exception as error:
        print(f"Weather provider failed: {error}")
        return {
            "temperature": 21,
            "summary": "Wetter offline",
            "windKmh": 12,
            "windDirection": "variabel",
            "rainChance": 5,
            "greenSpeed": "mittel-schnell",
            "playFacts": [
                {"label": "Carry", "value": "neutral"},
                {"label": "Putten", "value": "normale Geschwindigkeit"},
                {"label": "Regenfenster", "value": "nicht verfügbar"},
            ],
        }


def find_current_rain_chance(data):
    current_time = data["current"]["time"]
    hourly_times = data["hourly"]["time"]
    rain_values = data["hourly"]["precipitation_probability"]
    if current_time in hourly_times:
        return rain_values[hourly_times.index(current_time)]
    return rain_values[0] if rain_values else 0


def weather_summary(code):
    return {
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
    }.get(code, "Wetterdaten")


def estimate_green_speed(wind_kmh, rain_chance, precipitation):
    if precipitation > 0 or rain_chance > 50:
        return "eher langsam"
    if wind_kmh > 20 and rain_chance < 20:
        return "schnell"
    return "mittel-schnell"


def estimate_golf_weather_facts(current, rain_chance, data):
    temperature = current.get("temperature_2m", 20)
    wind_kmh = current.get("wind_speed_10m", 0)
    humidity = current.get("relative_humidity_2m")
    precipitation = current.get("precipitation", 0)
    next_rain = next_rain_window(data)

    return [
        {"label": "Carry", "value": carry_effect_label(temperature, wind_kmh)},
        {"label": "Putten", "value": putt_effect_label(rain_chance, precipitation, humidity)},
        {"label": "Windrichtung", "value": wind_direction_label(current.get("wind_direction_10m"))},
        {"label": "Regenfenster", "value": next_rain},
    ]


def carry_effect_label(temperature, wind_kmh):
    if wind_kmh >= 28:
        return "deutlich windanfällig"
    if temperature <= 8:
        return "kürzer durch Kälte"
    if temperature >= 24 and wind_kmh < 18:
        return "etwas länger"
    if wind_kmh >= 18:
        return "Wind beachten"
    return "neutral"


def putt_effect_label(rain_chance, precipitation, humidity):
    if precipitation > 0 or rain_chance >= 60:
        return "langsamer, feuchter"
    if humidity is not None and humidity >= 85:
        return "leicht gebremst"
    if rain_chance <= 15:
        return "rollt sauber"
    return "normal"


def next_rain_window(data):
    current_time = data.get("current", {}).get("time")
    hourly = data.get("hourly", {})
    times = hourly.get("time", [])
    rain_values = hourly.get("precipitation_probability", [])
    if not current_time or not times or not rain_values:
        return "nicht verfügbar"

    start_index = times.index(current_time) if current_time in times else 0
    for index in range(start_index, min(start_index + 7, len(times), len(rain_values))):
        if rain_values[index] >= 50:
            hour = times[index].split("T")[-1][:5]
            return f"ab {hour} möglich"
    return "6h trocken"


def wind_direction_label(degrees):
    if degrees is None:
        return "variabel"
    directions = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"]
    index = round((degrees % 360) / 45) % 8
    return directions[index]


def fetch_club_update(club):
    url = club["urls"]["updates"]
    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "GolfDashboard/0.1"},
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            page = response.read().decode("utf-8", "ignore")

        for match in re.finditer(r"<h3[^>]*>\s*<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>([\s\S]*?)</a>", page, re.I):
            title = html_to_text(match.group(2))
            href = urllib.parse.urljoin(url, match.group(1))
            if title and "golfxtra" not in title.lower():
                return {
                    "title": title,
                    "url": href,
                    "source": "Apeldör Updates",
                }
    except Exception as error:
        print(f"Club update provider failed: {error}")

    return {
        "title": "Apeldör Updates öffnen",
        "url": url,
        "source": "Apeldör Updates",
    }


def html_to_text(markup):
    text = re.sub(r"<[^>]+>", " ", markup)
    return html.unescape(re.sub(r"\s+", " ", text)).strip()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Golf Dashboard server")
    parser.add_argument("--host", default=HOST)
    parser.add_argument("--port", default=PORT, type=int)
    args = parser.parse_args()

    print(f"Golf Dashboard: http://{args.host}:{args.port}/")
    ThreadingHTTPServer((args.host, args.port), DashboardHandler).serve_forever()
