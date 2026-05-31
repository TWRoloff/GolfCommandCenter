from __future__ import annotations

import json
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
        self.send_json({"error": "Not found"}, status=404)

    def save_override(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length).decode("utf-8")
        try:
            payload = json.loads(raw_body)
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


def fetch_weather(club):
    latitude = club["coordinates"]["latitude"]
    longitude = club["coordinates"]["longitude"]
    query = urllib.parse.urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,weather_code,wind_speed_10m,precipitation",
            "hourly": "precipitation_probability",
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
        return {
            "temperature": round(current["temperature_2m"]),
            "summary": weather_summary(current["weather_code"]),
            "windKmh": round(current["wind_speed_10m"]),
            "rainChance": rain_chance,
            "greenSpeed": estimate_green_speed(
                current["wind_speed_10m"],
                rain_chance,
                current["precipitation"],
            ),
        }
    except Exception as error:
        print(f"Weather provider failed: {error}")
        return {
            "temperature": 21,
            "summary": "Wetter offline",
            "windKmh": 12,
            "rainChance": 5,
            "greenSpeed": "mittel-schnell",
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
