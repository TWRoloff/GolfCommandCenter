from __future__ import annotations

import html
import http.cookiejar
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


class PcCaddieAdapter:
    """Server-side boundary for PC CADDIE/GolfCloud Online."""

    def __init__(self, club):
        self.club = club
        self.username = os.getenv("PCCADDIE_USERNAME")
        self.password = os.getenv("PCCADDIE_PASSWORD")
        self.club_id = os.getenv("PCCADDIE_CLUB_ID", "0492321")
        self.override_path = Path(os.getenv("GOLF_DASHBOARD_OVERRIDE", "data/dashboard_override.json"))
        self.override = self._load_override()
        self.base_url = f"https://www.golfcloud.com/clubs/{self.club_id}/app.php"
        self._opener = None
        self._logged_in = False

    @property
    def configured(self):
        return bool(self.username and self.password)

    def fetch_tee_times(self):
        if self.configured:
            live = self._fetch_live_tee_times()
            if live:
                return live
            return self._no_visible_tee_times()

        override = self._override_tee_times()
        if override:
            return override

        return {
            "source": "PC CADDIE Zugang fehlt",
            "occupancy": 60,
            "occupancyDetails": self._fallback_occupancy_details(60),
            "teeTimes": ["09:20", "09:30", "10:10", "10:20"],
        }

    def _no_visible_tee_times(self):
        return {
            "source": "PC CADDIE verbunden",
            "occupancy": 0,
            "occupancyDetails": {
                "bookedSlots": 0,
                "freeSlots": 0,
                "totalSlots": 0,
                "occupancy": 0,
                "label": "Keine Restplätze sichtbar",
                "freeLabel": "Der buchbare Tageszeitraum ist vermutlich beendet",
                "scope": "heute noch sichtbarer PC-CADDIE-Zeitraum",
                "freeTimes": [],
                "groups": [],
            },
            "teeTimes": ["--:--"],
            "teeTimeGroups": [],
        }

    def fetch_next_round(self):
        if self.configured:
            live = self._fetch_live_next_round()
            if live:
                return live

        override = self._override_next_round()
        if override:
            return override

        return {
            "date": "Naechste Runde",
            "time": "Login fehlt",
            "countdown": "PCCADDIE_USERNAME und PCCADDIE_PASSWORD auf dem Server setzen",
            "source": "PC CADDIE Zugang fehlt",
        }

    def fetch_handicap(self):
        if self.configured:
            live = self._fetch_live_handicap()
            if live:
                return live

        override = self._override_handicap()
        if override:
            return override

        return {
            "index": 18.3,
            "lastRound": "91 Schlaege",
            "bestRound": "84 Schlaege",
            "source": "Demo",
        }

    def fetch_scorecard(self):
        if self.configured:
            live = self._fetch_live_scorecard()
            if live:
                return live

        return {
            "source": "Apeldoer Link",
            "status": "Online-Link bereit",
            "url": self.club.get("urls", {}).get("scorecard", ""),
            "summary": "Scorecard noch nicht live gelesen",
        }

    def fetch_scorecard_list(self):
        if self.configured:
            live = self._fetch_live_scorecard_list()
            if live:
                return live

        return {
            "source": "Nicht verbunden",
            "entries": [],
            "latest": None,
            "summary": "Keine Scorekartenliste verfuegbar",
        }

    def fetch_tournament_results(self):
        player_name = os.getenv("PCCADDIE_TOURNAMENT_PLAYER", "Werner Roloff")
        if self.configured:
            live = self._fetch_live_tournament_results(player_name)
            if live:
                return live

        return {
            "source": "PC CADDIE Zugang fehlt",
            "status": "Keine Turnierergebnisse geladen",
            "player": player_name,
            "summary": "Turnierauswertung wartet auf PC CADDIE",
            "latest": None,
            "history": [],
            "averageNet": None,
            "bestNet": None,
            "trend": "Noch keine Auswertung",
        }

    def _fetch_live_tee_times(self):
        booking_page = self._fetch_cat("tt_timetable_course_alias")
        if not booking_page:
            return None

        payload = self._build_tee_time_payload(booking_page)
        if payload:
            return payload

        for date_info in self._extract_timetable_dates(booking_page):
            dated_page = self._fetch_timetable_date(date_info["value"])
            if not dated_page:
                continue
            payload = self._build_tee_time_payload(
                dated_page,
                date_info["date"],
                date_info["label"],
            )
            if payload:
                return payload

        return None

    def _build_tee_time_payload(self, page, tee_time_date=None, tee_time_date_label=None):
        tee_time_groups = self._parse_tee_time_groups(page)
        visible_free_slots = self._flatten_group_slots(tee_time_groups) or self._parse_free_slots(page)
        if not visible_free_slots:
            return None

        occupancy_details = self._build_occupancy_details(visible_free_slots, tee_time_groups)
        if tee_time_date_label:
            occupancy_details["scope"] = f"buchbarer PC-CADDIE-Zeitraum am {tee_time_date_label}"
        tee_times = self._next_free_times(visible_free_slots)

        return {
            "source": "PC CADDIE live",
            "occupancy": occupancy_details["occupancy"],
            "occupancyDetails": occupancy_details,
            "teeTimes": tee_times[:4] or ["--:--"],
            "teeTimeGroups": tee_time_groups,
            "teeTimeDate": tee_time_date,
            "teeTimeDateLabel": tee_time_date_label or "Heute",
        }

    def _fetch_timetable_date(self, date_value):
        if not self._login():
            return None
        query = urllib.parse.urlencode(
            {
                "cat": "tt_timetable_course_alias",
                "date": date_value,
            }
        )
        return self._request(f"{self.base_url}?{query}")

    def _extract_timetable_dates(self, page):
        dates = []
        for option in re.findall(r"(<option[^>]+value=\"DAY\|\d{4}-\d{2}-\d{2}\"[^>]*>[\s\S]*?</option>)", page, re.I):
            raw_value = self._extract_attr(option, "value")
            if not raw_value or "selected" in option.lower():
                continue
            match = re.match(r"DAY\|(\d{4}-\d{2}-\d{2})", raw_value)
            if not match:
                continue
            dates.append(
                {
                    "value": raw_value,
                    "date": match.group(1),
                    "label": self._to_text(option),
                }
            )
        return dates[:14]

    def _parse_free_slots(self, page):
        text = self._normalized_text(page)
        rows = re.findall(
            r"(\d{2}:\d{2})(?:(?!\d{2}:\d{2}).){0,180}?([1-4])\s+plaetze?\s+frei",
            text,
            flags=re.IGNORECASE | re.DOTALL,
        )
        return [{"time": time, "free": int(free), "total": 4, "label": "Alle"} for time, free in rows]

    def _parse_tee_time_groups(self, page):
        groups = []
        tables = re.findall(
            r"(<table[^>]+class=\"[^\"]*pcco-tt-areas[^\"]*\"[\s\S]*?</table>)",
            page,
            re.I,
        )
        for table in tables:
            raw_label = self._extract_attr(table, "data-als_name") or "Startzeiten"
            label = self._to_text(raw_label)
            rows = self._parse_group_slots(table, label)
            if not rows:
                continue
            details = self._build_group_occupancy(label, rows)
            groups.append(
                {
                    "label": label,
                    "times": [row["time"] for row in rows if row["free"] > 0][:4],
                    "occupancy": details["occupancy"],
                    "bookedSlots": details["bookedSlots"],
                    "freeSlots": details["freeSlots"],
                    "totalSlots": details["totalSlots"],
                    "freeLabel": details["freeLabel"],
                    "slots": rows,
                }
            )
        return groups

    def _parse_group_slots(self, table, label):
        rows = []
        row_matches = re.findall(r"(<tr[^>]+data-time=\"\d{2}:\d{2}\"[\s\S]*?</tr>)", table, re.I)
        for row in row_matches:
            status = self._extract_attr(row, "data-status") or ""
            if status == "past-time":
                continue
            time = self._extract_attr(row, "data-time")
            if not time:
                continue
            free = self._to_int(self._extract_attr(row, "data-seat_bookable")) or 0
            if "seats-free-" in row and free == 0:
                free_match = re.search(r"seats-free-(\d)", row)
                free = int(free_match.group(1)) if free_match else 0
            rows.append({"time": time, "free": max(0, min(4, free)), "total": 4, "label": label})
        return rows

    def _flatten_group_slots(self, tee_time_groups):
        rows = []
        for group in tee_time_groups:
            rows.extend(group.get("slots", []))
        return rows

    def _build_group_occupancy(self, label, slot_rows):
        total_slots = sum(row.get("total", 4) for row in slot_rows)
        free_slots = sum(row.get("free", 0) for row in slot_rows)
        booked_slots = max(0, total_slots - free_slots)
        occupancy = round((booked_slots / total_slots) * 100) if total_slots else 0
        return {
            "label": label,
            "bookedSlots": booked_slots,
            "freeSlots": free_slots,
            "totalSlots": total_slots,
            "occupancy": max(0, min(100, occupancy)),
            "freeLabel": f"{free_slots} Restplätze frei",
        }

    def _build_occupancy_details(self, free_slot_rows, tee_time_groups=None):
        total_slots = sum(row.get("total", 4) for row in free_slot_rows)
        free_slots = sum(row.get("free", 0) for row in free_slot_rows)
        booked_slots = max(0, total_slots - free_slots)
        occupancy = round((booked_slots / total_slots) * 100) if total_slots else 0
        free_times = self._next_free_times(free_slot_rows, limit=12)

        return {
            "bookedSlots": booked_slots,
            "freeSlots": free_slots,
            "totalSlots": total_slots,
            "occupancy": max(0, min(100, occupancy)),
            "label": f"{booked_slots} von {total_slots} Restplätzen belegt",
            "freeLabel": f"{free_slots} Restplätze frei",
            "scope": "heute noch sichtbarer PC-CADDIE-Zeitraum",
            "freeTimes": free_times,
            "groups": tee_time_groups or [],
        }

    def _next_free_times(self, free_slot_rows, limit=None):
        tee_times = []
        for row in free_slot_rows:
            time = row.get("time")
            if row.get("free", 0) > 0 and time and time not in tee_times:
                tee_times.append(time)
        return tee_times[:limit] if limit else tee_times

    def _fetch_live_next_round(self):
        page = self._fetch_cat("reservations")
        if not page:
            return None

        text = self._to_text(page)
        if "Es wurden keine Reservierungen gefunden" in text:
            return {
                "date": "Naechste Runde",
                "time": "keine Buchung",
                "countdown": "In PC CADDIE wurden keine Reservierungen gefunden",
                "source": "PC CADDIE live",
            }

        match = re.search(r"(\d{2}\.\d{2}\.\d{4}).{0,120}?(\d{2}:\d{2})", text, re.DOTALL)
        if not match:
            return None

        return {
            "date": match.group(1),
            "time": f"{match.group(2)} Uhr",
            "countdown": "Aus PC CADDIE Reservierungen gelesen",
            "source": "PC CADDIE live",
        }

    def _fetch_live_handicap(self):
        page = self._fetch_cat("handicap")
        if not page:
            return None

        text = self._to_text(page)
        match = re.search(r"Handicap Index\s*([-+]?\d{1,2}(?:[,.]\d)?)", text, re.IGNORECASE)
        if not match:
            golf_page = self._fetch_cat("golf")
            if not golf_page:
                return None
            value = self._extract_input_value(golf_page, "handicap")
            if not value:
                return None
            match = re.search(r"([+-]?\d{1,2}(?:[,.]\d)?)", value)

        return {
            "index": float(match.group(1).replace(",", ".")),
            "lastRound": "PC CADDIE",
            "bestRound": "PC CADDIE",
            "source": "PC CADDIE live",
        }

    def _fetch_live_scorecard(self):
        page = self._fetch_cat("scorecard")
        if not page:
            return None

        course = self._extract_selected_option(page, "pcco-tournament-scorecard-course")
        tee = self._extract_selected_option(page, "pcco-tournament-scorecard-eighteen-tee")
        hcp_value = self._extract_input_value(page, "hcp")
        course_handicap = self._extract_scorecard_handicap(page)
        date = self._extract_input_value(page, "date")
        total_par = self._extract_total_par(self._to_text(page))

        if not any([course, tee, course_handicap, total_par]):
            return None

        parts = []
        if course:
            parts.append(course)
        if tee:
            parts.append(tee)
        if hcp_value:
            parts.append(f"HCPI {hcp_value}")
        if course_handicap:
            parts.append(f"CH {course_handicap}")
        if total_par:
            parts.append(f"Par {total_par}")

        return {
            "source": "PC CADDIE live",
            "status": "Scorecard live",
            "url": f"{self.base_url}?cat=scorecard",
            "summary": " · ".join(parts),
            "course": course,
            "tee": tee,
            "hcp": hcp_value,
            "courseHandicap": course_handicap,
            "date": date,
            "totalPar": total_par,
        }

    def _fetch_live_scorecard_list(self):
        if not self._login():
            return None

        payload = urllib.parse.urlencode({"task": "list"}).encode("utf-8")
        page = self._request(f"{self.base_url}?cat=scorecard", data=payload)
        if not page:
            return None

        entries = self._parse_scorecard_list(page)
        for entry in entries[:10]:
            detail = self._fetch_live_scorecard_detail(entry)
            if detail:
                entry["detail"] = detail
        latest = entries[0] if entries else None
        return {
            "source": "PC CADDIE live",
            "entries": entries,
            "latest": latest,
            "summary": self._scorecard_list_summary(latest),
        }

    def _fetch_live_tournament_results(self, player_name):
        page = self._fetch_cat("ts_resultlist")
        if not page:
            return None

        events = self._parse_tournament_events(page)
        results = []
        for event in events[:8]:
            result_page = self._request(event["url"])
            if not result_page:
                continue
            result = self._parse_player_tournament_result(result_page, event, player_name)
            if result:
                results.append(result)
            if len(results) >= 5:
                break

        if not results:
            return {
                "source": "PC CADDIE live",
                "status": "Keine Treffer",
                "player": player_name,
                "summary": f"Keine Mittwoch-Ergebnisse fuer {player_name} gefunden",
                "latest": None,
                "history": [],
                "averageNet": None,
                "bestNet": None,
                "trend": "Noch keine Auswertung",
            }

        latest = results[0]
        net_scores = [result["net"] for result in results if self._is_plausible_stableford_net(result.get("net"))]
        average_net = round(sum(net_scores) / len(net_scores), 1) if net_scores else None
        best_net = max(net_scores) if net_scores else None
        trend = self._tournament_trend(results)

        return {
            "source": "PC CADDIE live",
            "status": "Turnierergebnisse live",
            "player": player_name,
            "summary": self._tournament_summary(latest),
            "latest": latest,
            "history": results,
            "averageNet": average_net,
            "bestNet": best_net,
            "trend": trend,
        }

    def _parse_tournament_events(self, page):
        events = []
        seen = set()
        rows = re.findall(r"(<tr[^>]*>[\s\S]*?</tr>)", page, re.I)
        for row in rows:
            text = self._to_text(row)
            if not re.search(r"\b(Mi\.|Mittwoch|Herrengolf)\b", text, re.I):
                continue

            hrefs = re.findall(r'href="([^"]*cat=ts_resultlist[^"]*sub=resultlist[^"]*)"', row, re.I)
            if not hrefs:
                continue

            href = html.unescape(hrefs[-1])
            event_id = self._query_value(href, "id")
            if event_id in seen:
                continue
            seen.add(event_id)

            date_match = re.search(r"(\d{2}\.\d{2}\.\d{4})", text)
            title_match = re.search(r"(Herrengolf.*?)(?:\s+Mi,|\s+Mi\.|\s+Mittwoch|\s+\d{2}\.\d{2}\.\d{4})", text)
            holes_match = re.search(r"Löcher:\s*(\d+)", text) or re.search(r"(\d+)\s+Löcher", text)
            events.append(
                {
                    "id": event_id,
                    "title": title_match.group(1).strip() if title_match else "Mittwochsturnier",
                    "date": date_match.group(1) if date_match else "",
                    "holes": self._to_int(holes_match.group(1)) if holes_match else None,
                    "url": urllib.parse.urljoin(self.base_url, href),
                }
            )
        return events

    def _parse_player_tournament_result(self, page, event, player_name):
        target_names = self._tournament_target_names(player_name)
        player_rows = []
        for row in re.findall(r"(<tr[^>]*>[\s\S]*?</tr>)", page, re.I):
            row_text = self._to_text(row)
            if any(target.lower() in row_text.lower() for target in target_names):
                player_rows.append((row, row_text))

        if not player_rows:
            return None

        row, _ = next((candidate for candidate in player_rows if self._is_ranked_result_row(candidate[0])), player_rows[0])
        cells = [self._to_text(cell) for cell in re.findall(r"<td[^>]*>([\s\S]*?)</td>", row, re.I)]
        if len(cells) < 8:
            return None

        name = re.sub(r"\s*\([^)]*\)", "", cells[2]).strip()
        result = {
            "event": self._extract_tournament_title(page) or event.get("title") or "Mittwochsturnier",
            "date": self._extract_tournament_date(page) or event.get("date") or "",
            "format": self._extract_tournament_format(page),
            "holes": event.get("holes"),
            "player": name,
            "position": self._to_int(cells[0]),
            "homeClub": cells[3],
            "phcp": self._to_int(cells[4]),
            "gross": self._to_int(cells[5]),
            "net": self._to_int(cells[6]),
            "gbe": self._to_int(cells[7]),
            "hcpi": cells[8] if len(cells) > 8 else "",
            "url": event.get("url"),
        }
        result["label"] = self._tournament_summary(result)
        return result

    def _is_ranked_result_row(self, row):
        cells = re.findall(r"<td[^>]*>[\s\S]*?</td>", row, re.I)
        return bool(cells and re.match(r"\d+", self._to_text(cells[0])))

    def _tournament_target_names(self, player_name):
        parts = player_name.split()
        targets = [player_name]
        if len(parts) >= 2:
            targets.append(f"{parts[-1]}, {' '.join(parts[:-1])}")
        return targets

    def _extract_tournament_title(self, page):
        text = self._to_text(page)
        match = re.search(r"Turnierergebnisse\s+(.+?)\s+Datum", text)
        return match.group(1).strip() if match else None

    def _extract_tournament_date(self, page):
        text = self._to_text(page)
        match = re.search(r"Datum\s+(?:[A-Za-zÄÖÜäöüß]{2,3}\.,?\s*)?(\d{2}\.\d{2}\.\d{4})", text)
        return match.group(1) if match else None

    def _extract_tournament_format(self, page):
        text = self._to_text(page)
        match = re.search(r"Spielform\s+(.+?)\s+Runden", text)
        return match.group(1).strip() if match else ""

    def _tournament_summary(self, result):
        if not result:
            return "Keine Turnierergebnisse"
        parts = []
        if result.get("position"):
            parts.append(f"{result['position']}. Platz")
        if result.get("gross") is not None:
            parts.append(f"Brutto {result['gross']}")
        if result.get("net") is not None:
            parts.append(f"Netto {result['net']}")
        if result.get("gbe") is not None:
            parts.append(f"GBE {result['gbe']}")
        return " · ".join(parts) if parts else result.get("event", "Turnierergebnis")

    def _tournament_trend(self, results):
        net_scores = [result["net"] for result in results if self._is_plausible_stableford_net(result.get("net"))]
        if len(net_scores) < 2:
            return "Noch keine Tendenz"
        latest, previous = net_scores[0], net_scores[1]
        diff = latest - previous
        if diff > 0:
            return f"+{diff} Netto zum letzten Mittwoch"
        if diff < 0:
            return f"{diff} Netto zum letzten Mittwoch"
        return "Netto stabil zum letzten Mittwoch"

    def _is_plausible_stableford_net(self, value):
        return isinstance(value, int) and 0 <= value <= 60

    def _query_value(self, url, key):
        parsed = urllib.parse.urlparse(html.unescape(url))
        values = urllib.parse.parse_qs(parsed.query)
        if key not in values:
            return None
        return values[key][0]

    def _parse_scorecard_list(self, page):
        entries = []
        row_matches = re.findall(r"(<tr[^>]*>[\s\S]*?</tr>)", page, re.I)
        for row_html in row_matches:
            row = re.sub(r"^<tr[^>]*>|</tr>$", "", row_html, flags=re.I)
            cells = re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", row, re.I)
            values = [self._to_text(cell) for cell in cells]
            if len(values) < 5 or values[0] == "#":
                continue
            if not re.match(r"\d+", values[0]) or not re.match(r"\d{2}\.\d{2}\.\d{4}", values[1]):
                continue

            scorecard_id = self._extract_attr(row_html, "data-pcco-tournament-scorecard-id")
            entry = {
                "number": values[0],
                "id": scorecard_id,
                "date": values[1],
                "club": values[2] if len(values) > 2 else "",
                "course": values[3] if len(values) > 3 else "",
                "tee": values[4] if len(values) > 4 else "",
                "note": values[5] if len(values) > 5 else "",
            }
            entry["summary"] = self._scorecard_list_summary(entry)
            entries.append(entry)
        return entries

    def _fetch_live_scorecard_detail(self, entry):
        scorecard_id = entry.get("id") if entry else None
        if not scorecard_id:
            return None

        payload = urllib.parse.urlencode({"task": "load", "id": scorecard_id}).encode("utf-8")
        page = self._request(f"{self.base_url}?cat=scorecard", data=payload)
        if not page:
            return None

        return self._parse_loaded_scorecard(page)

    def _parse_loaded_scorecard(self, page):
        scores = self._extract_saved_scores(page)
        for hole in range(1, 19):
            value = self._extract_input_value(page, f"score_{hole}")
            score = self._to_int(value)
            if score and score > 0 and not any(item["hole"] == hole for item in scores):
                scores.append({"hole": hole, "score": score})

        pars = self._extract_saved_pars(page) or self._extract_hole_pars(page)
        totals = self._extract_score_totals(page)
        played_holes = [score["hole"] for score in scores]
        if not played_holes and totals.get("holesPlayed"):
            played_holes = list(range(1, totals["holesPlayed"] + 1))

        played_pars = [par["par"] for par in pars if par["hole"] in played_holes]
        total_score = sum(score["score"] for score in scores) or totals.get("totalScore")
        total_par = sum(played_pars) if played_pars else None

        if not total_score:
            return None

        score_diff = total_score - total_par if total_par else None
        return {
            "holesPlayed": len(played_holes),
            "totalScore": total_score,
            "totalPar": total_par,
            "scoreDiff": score_diff,
            "scoreLabel": self._score_label(total_score, total_par, len(played_holes)),
            "scores": scores,
            "pars": pars,
        }

    def _extract_saved_scores(self, page):
        match = re.search(r"savedScore:\s*\$\.parseJSON\('([^']*)'\)", page)
        if not match:
            return []
        try:
            values = json.loads(html.unescape(match.group(1)))
        except json.JSONDecodeError:
            return []
        return [
            {"hole": index + 1, "score": int(value)}
            for index, value in enumerate(values[:18])
            if isinstance(value, int) and value > 0
        ]

    def _extract_saved_pars(self, page):
        match = re.search(r"(?:courses|courseScores):\s*\$\.parseJSON\('([^']*)'\)", page)
        if not match:
            match = re.search(r"\$\.parseJSON\('(\[\{[^']*\"pl1\"[^']*\}\])'\)", page)
        if not match:
            return []

        try:
            courses = json.loads(html.unescape(match.group(1)))
        except json.JSONDecodeError:
            return []

        if not courses:
            return []

        course = courses[0]
        pars = []
        for hole in range(1, 19):
            par = self._to_int(course.get(f"pl{hole}"))
            if par and 3 <= par <= 6:
                pars.append({"hole": hole, "par": par})
        return pars

    def _extract_hole_pars(self, page):
        pars = []
        row_matches = re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", page, re.I)
        for row in row_matches:
            cells = re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", row, re.I)
            values = [self._to_text(cell) for cell in cells]
            if len(values) < 2:
                continue
            hole = self._to_int(values[0])
            par = self._to_int(values[1])
            if hole and 1 <= hole <= 18 and par and 3 <= par <= 6:
                pars.append({"hole": hole, "par": par})
        return pars

    def _extract_score_totals(self, page):
        row_matches = re.findall(r"<tr[^>]*>([\s\S]*?)</tr>", page, re.I)
        totals = []
        for row in row_matches:
            cells = re.findall(r"<t[dh][^>]*>([\s\S]*?)</t[dh]>", row, re.I)
            values = [self._to_text(cell) for cell in cells]
            if len(values) < 5:
                continue
            label = values[0].upper()
            if label not in {"OUT", "IN", "1-9", "10-18", "1-18"}:
                continue
            score = self._to_int(values[4])
            if score and score > 0:
                holes = 18 if label == "1-18" else 9
                totals.append({"label": label, "score": score, "holes": holes})

        if not totals:
            return {}

        return {
            "totalScore": sum(total["score"] for total in totals),
            "holesPlayed": sum(total["holes"] for total in totals),
        }

    def _score_label(self, total_score, total_par, holes_played):
        base = f"{total_score} Schläge"
        if holes_played:
            hole_label = "Loch" if holes_played == 1 else "Löcher"
            base = f"{base} ({holes_played} {hole_label})"
        if total_par:
            diff = total_score - total_par
            sign = "+" if diff > 0 else ""
            base = f"{base}, {sign}{diff} zu Par"
        return base

    def _scorecard_list_summary(self, latest):
        if not latest:
            return "Keine gespeicherten Scorekarten gefunden"
        parts = [latest["date"], latest["course"], latest["tee"]]
        if latest.get("note"):
            parts.append(latest["note"])
        return " · ".join(part for part in parts if part)

    def _extract_input_value(self, page, element_id):
        match = re.search(rf'<input[^>]+id="{re.escape(element_id)}"[^>]*>', page, re.I)
        if not match:
            return None
        value_match = re.search(r'value="([^"]*)"', match.group(0), re.I)
        if not value_match:
            return None
        return html.unescape(value_match.group(1)).strip()

    def _extract_attr(self, tag, attr_name):
        match = re.search(rf'{re.escape(attr_name)}="([^"]*)"', tag, re.I)
        if not match:
            return None
        return html.unescape(match.group(1)).strip()

    def _extract_selected_option(self, page, element_id):
        select_match = re.search(
            rf'<select[^>]+id="{re.escape(element_id)}"[^>]*>([\s\S]*?)</select>',
            page,
            re.I,
        )
        if not select_match:
            return None
        selected_match = re.search(r"<option[^>]+selected[^>]*>([\s\S]*?)</option>", select_match.group(1), re.I)
        if not selected_match:
            selected_match = re.search(r"<option[^>]*>([\s\S]*?)</option>", select_match.group(1), re.I)
        if not selected_match:
            return None
        return self._to_text(selected_match.group(1))

    def _extract_scorecard_handicap(self, page):
        text = self._to_text(page)
        match = re.search(r"Handicap\s+([+-]?\d{1,3})\s+Tee Handicaps", text)
        return match.group(1) if match else None

    def _extract_total_par(self, text):
        match = re.search(r"1-9\s+(\d{2})\s+-\s+-", text)
        if match:
            return int(match.group(1))
        pars = [int(value) for value in re.findall(r"\b(?:[1-9]|1[0-8])\s+([345])\s+\d{1,2}\b", text)]
        return sum(pars[:18]) if pars else None

    def _fetch_cat(self, cat):
        if not self._login():
            return None
        return self._request(f"{self.base_url}?cat={urllib.parse.quote(cat)}")

    def _login(self):
        if self._logged_in:
            return True
        if not self.configured:
            return False

        cookie_jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
        login_page = self._request(f"{self.base_url}?cat=user_account", allow_unauthorized=True)
        if not login_page:
            return False

        action = self._find_login_action(login_page) or f"{self.base_url}?cat=user_account"
        payload = urllib.parse.urlencode(
            {
                "service": "login",
                "button_cancel": "1",
                "rq[login]": self.username,
                "rq[password]": self.password,
            }
        ).encode("utf-8")
        response = self._request(action, data=payload, allow_unauthorized=True)
        self._logged_in = bool(response and "login-form" not in response and "Logout" in response)
        return self._logged_in

    def _request(self, url, data=None, allow_unauthorized=False):
        opener = self._opener or urllib.request.build_opener()
        request = urllib.request.Request(
            url,
            data=data,
            headers={
                "User-Agent": "GolfDashboard/0.1",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        try:
            with opener.open(request, timeout=15) as response:
                return response.read().decode("utf-8", "ignore")
        except urllib.error.HTTPError as error:
            if allow_unauthorized and error.code == 401:
                return error.read().decode("utf-8", "ignore")
            return None
        except Exception:
            return None

    def _find_login_action(self, page):
        match = re.search(r'<form[^>]+class="[^"]*login-form[^"]*"[^>]+action="([^"]+)"', page, re.I)
        if not match:
            match = re.search(
                r'<form[^>]+action="([^"]+)"[^>]*>\s*<input[^>]+name="service"[^>]+value="login"',
                page,
                re.I,
            )
        if not match:
            return None
        return urllib.parse.urljoin(self.base_url, html.unescape(match.group(1)))

    def _to_text(self, page):
        without_scripts = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", page, flags=re.I)
        text = re.sub(r"<[^>]+>", " ", without_scripts)
        return html.unescape(re.sub(r"\s+", " ", text)).strip()

    def _to_int(self, value):
        if value is None:
            return None
        match = re.search(r"-?\d+", str(value))
        return int(match.group(0)) if match else None

    def _normalized_text(self, page):
        return (
            self._to_text(page)
            .lower()
            .replace("ä", "ae")
            .replace("ö", "oe")
            .replace("ü", "ue")
            .replace("ß", "ss")
        )

    def _override_tee_times(self):
        if "teeTimes" not in self.override and "occupancy" not in self.override:
            return None

        occupancy = self.override.get("occupancy", 60)
        return {
            "source": "Lokaler Override",
            "occupancy": occupancy,
            "occupancyDetails": self.override.get("occupancyDetails", self._fallback_occupancy_details(occupancy)),
            "teeTimes": self.override.get("teeTimes", ["09:20", "09:30", "10:10", "10:20"]),
        }

    def _fallback_occupancy_details(self, occupancy):
        return {
            "bookedSlots": None,
            "freeSlots": None,
            "totalSlots": None,
            "occupancy": occupancy,
            "label": "Details nicht verf\u00fcgbar",
            "freeLabel": "Quelle liefert nur Prozentwert",
            "scope": "Fallback",
            "freeTimes": self.override.get("teeTimes", []),
        }

    def _override_next_round(self):
        if "nextRound" not in self.override:
            return None
        next_round = dict(self.override["nextRound"])
        next_round["source"] = "Lokaler Override"
        return next_round

    def _override_handicap(self):
        if "handicap" not in self.override:
            return None
        handicap = dict(self.override["handicap"])
        handicap["source"] = "Lokaler Override"
        return handicap

    def _load_override(self):
        if not self.override_path.exists():
            return {}
        with self.override_path.open("r", encoding="utf-8") as file:
            return json.load(file)
