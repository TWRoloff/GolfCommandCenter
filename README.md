# Golf Command Center

Lokales Golf-Dashboard fuer Gut Apeldoer. Der Python-Server liest Wetter, PC-CADDIE/GolfCloud-Daten, Scorecards und Club-Updates und stellt sie als lokale Dashboard-Seite bereit.

## Datenquellen und so

- Wetter: Open-Meteo ueber die Club-Koordinaten
- Golfplatzsuche: lokal gebuendelter OpenStreetMap-Datenstand mit allen dort innerhalb Deutschlands als `leisure=golf_course` erfassten und benannten Anlagen
- Club-News: neueste Meldung von `https://apeldoer.de/apeldoer-updates/`
- Fahrzeit: lokale Browser-Standortfreigabe plus serverseitiges Routing ueber Google Routes oder OSRM
- Startzeiten: PC CADDIE/GolfCloud, gruppiert nach 9 und 18 Loechern
- Platzbelegung: aus den sichtbaren PC-CADDIE-Startzeiten berechnet
- Naechste Runde: PC CADDIE/GolfCloud Reservierungen
- Handicap: PC CADDIE/GolfCloud
- Scorecard: gespeicherte PC-CADDIE-Scorekarten inklusive Score, Par, letzte und beste Runde

PC CADDIE hilft sehr, weil dort Startzeiten, Buchungen und Score-/Rundendaten liegen. Wichtig ist nur: Falls PC CADDIE keinen offiziell dokumentierten API-Zugang fuer deinen Club bereitstellt, sollten wir nicht blind Login-Seiten scrapen. Sauber waeren ein offizieller Export, ein API-Token, ein Club-Backend oder ein kleiner manueller Sync.

## Lokal starten

Optional: lokale Zugangsdaten in `.env` ablegen. `.env` ist in `.gitignore` und wird nicht mitversioniert. Vorlage:

```powershell
Copy-Item .env.example .env
notepad .env
```

Direkt per PowerShell:

```powershell
$env:PCCADDIE_CLUB_ID="0492321"
$env:PCCADDIE_USERNAME="dein-benutzer"
$env:PCCADDIE_PASSWORD="dein-passwort"
$env:ROUTING_PROVIDER="auto"
$env:GOOGLE_MAPS_API_KEY=""
python server.py
```

Oder unter Windows mit `.env`:

```powershell
.\start_server.ps1
```

Danach im Browser oeffnen:

```text
http://127.0.0.1:4173/
```

Der alte Static-Start mit `python -m http.server` ist nicht mehr empfohlen, weil dann die serverseitigen PC-CADDIE- und News-Anschluesse fehlen.

## Fahrzeit zum Club

Die kleine Fahrzeit-Anzeige nutzt den aktuellen Browser-Standort nur nach Freigabe. Der Standort wird an den lokalen Python-Server geschickt und dort geroutet, damit ein Google-API-Key nicht im Frontend sichtbar wird.

Optionen:

- `GOOGLE_MAPS_API_KEY` gesetzt: nutzt Google Routes API mit Fahrstrecke und Fahrzeit.
- Kein Google-Key: versucht OSRM/OpenStreetMap-Routing ohne Key.
- Routing nicht erreichbar: zeigt eine grobe Schaetzung und markiert sie als geschaetzt.

Fuer Google Maps Platform muss im Google-Cloud-Projekt die Routes API aktiviert sein. Setze ausserdem ein Tageslimit/Budget, damit ein Fehler im Kiosk nicht unbemerkt Kosten erzeugt.

## PC CADDIE anbinden

Dein Link zeigt auf den Benutzerbereich:

```text
https://www.pccaddie.net/clubs/0492321/app.php?cat=user_account
```

Damit echte Daten fuer freie Startzeiten, naechste Runde, Handicap und Scorecard sauber laufen, brauchen wir einen der folgenden Wege:

- Offizieller PC-CADDIE API-/Export-Zugang fuer Club `0492321`
- Einen regelmaessigen Export aus PC CADDIE, den `pc_caddie_adapter.py` lesen darf
- Einen separaten Club-/Benutzer-Token, falls PC CADDIE den fuer Online-Services bereitstellt
- Als letzte Option: ein genehmigter serverseitiger Login-Adapter, aber nur wenn Nutzungsbedingungen und Club das erlauben

Lokale Zugangsdaten werden nicht in JavaScript gespeichert. Fuer die Server-Seite sind diese Umgebungsvariablen vorbereitet:

```powershell
$env:PCCADDIE_CLUB_ID="0492321"
$env:PCCADDIE_USERNAME="dein-benutzer"
$env:PCCADDIE_PASSWORD="dein-passwort"
python server.py
```

Der aktuelle Adapter in `pc_caddie_adapter.py` erkennt, ob Zugangsdaten gesetzt sind, loggt sich serverseitig ein und liest sichtbare Werte aus PC CADDIE/GolfCloud. Werte, die PC CADDIE nicht liefert, fallen auf `data/dashboard_override.json` zurueck.

Aktueller Adapterstand:

- Startzeiten: werden nach Login aus `tt_timetable_course_alias` gelesen und nach `18 Loecher` / `9 Loecher` gruppiert
- Platzbelegung: wird gesamt und je 9-/18-Loch-Gruppe berechnet
- Naechste Runde: wird aus `reservations` gelesen; wenn nichts gebucht ist, steht dort "keine Buchung"
- Handicap: wird zuerst aus `handicap` und danach aus `Mein Golf` gelesen
- Scorecard: liest Platz, Tee, HCPI, Course-Handicap und Datum, sofern diese Werte im HTML sichtbar sind
- Scorekartenliste: liest ueber "Meine Liste" gespeicherte Scorekarten, laedt die gespeicherten Scores und berechnet letzte/beste Runde
- Club-Updates: liest die neueste Meldung von der Apeldoer-Updates-Seite
- Lokale Override-Datei: `data/dashboard_override.json` bleibt als Fallback fuer Werte, die PC CADDIE noch nicht liefert

## Aktualisierung

Die Seite laedt beim Start sofort `/api/dashboard` und danach automatisch alle 10 Minuten neue Daten. Die Uhr laeuft jede Sekunde. Eine kleine visuelle Aktualisierung rendert alle 15 Sekunden neu, ohne PC-CADDIE unnoetig oft abzufragen.

Die wichtigsten Intervalle stehen in `config.js`:

```js
refresh: {
  weatherMs: 10 * 60 * 1000,
  visualMs: 15 * 1000,
}
```

## GitHub Pages Betrieb

Fuer ein iPad in einem anderen Netzwerk kann das Dashboard auch statisch ueber GitHub Pages laufen. Dabei laeuft kein dauerhafter Server: GitHub Actions loggt sich regelmaessig serverseitig bei PC CADDIE ein, erzeugt `data/dashboard.json` und veroeffentlicht die fertige Anzeige auf GitHub Pages.

Wichtig: GitHub Pages ist dann die Anzeige, GitHub Actions ist der Datensammler. Die PC-CADDIE-Zugangsdaten gehoeren nur in GitHub Secrets, nie in Dateien im Repo.

Hinweis zur Privatsphaere: Je nach GitHub-Plan ist die Pages-Seite oeffentlich erreichbar, auch wenn das Repo privat ist. Die Action veroeffentlicht deshalb nur fertige Dashboard-Daten, aber keine Passwoerter, Cookies oder Session-IDs.

1. In GitHub unter `Settings > Secrets and variables > Actions` diese Repository Secrets anlegen:

```text
PCCADDIE_CLUB_ID=0492321
PCCADDIE_USERNAME=dein-benutzer
PCCADDIE_PASSWORD=dein-passwort
ROUTING_PROVIDER=auto
GOOGLE_MAPS_API_KEY=
```

2. Unter `Settings > Pages` als Source `GitHub Actions` auswaehlen.

3. Code nach `main` pushen. Der Workflow `.github/workflows/pages.yml` baut danach automatisch die statische Version und deployed sie auf Pages.

4. Der Workflow laeuft ausserdem alle 10 Minuten:

```yaml
schedule:
  - cron: "*/10 * * * *"
```

GitHub kann geplante Workflows etwas verzoegert starten. Fuer ein Vater-iPad-Dashboard ist das normalerweise okay: Die Anzeige ist nicht sekundengenau live, aber regelmaessig frisch. Lokal mit `python server.py` bleibt weiterhin der Live-Modus ueber `/api/dashboard` aktiv.

Manuell testen:

```bash
PCCADDIE_CLUB_ID=0492321 PCCADDIE_USERNAME=dein-benutzer PCCADDIE_PASSWORD=dein-passwort python scripts/export_static_dashboard.py
python -m http.server 4174 -d dist
```

Dann oeffnen:

```text
http://127.0.0.1:4174/
```

## Raspberry Pi Betrieb

Empfohlen fuer ein dauerhaftes LCD-Dashboard: Raspberry Pi 4 oder Raspberry Pi 5 mit Raspberry Pi OS Desktop und Chromium im Kiosk-Modus. Ein Pi Zero 2 W kann funktionieren, ist fuer Chromium aber deutlich knapper.

1. Raspberry Pi OS Desktop installieren.
2. Projekt auf den Pi kopieren, z. B. nach `/home/pi/golf-dashboard`.
3. Zugangsdaten in eine lokale Environment-Datei schreiben:

```bash
sudo install -m 600 /dev/null /etc/golf-dashboard.env
sudo nano /etc/golf-dashboard.env
```

Inhalt:

```bash
GOLF_DASHBOARD_HOST=127.0.0.1
GOLF_DASHBOARD_PORT=4173
PCCADDIE_CLUB_ID=0492321
PCCADDIE_USERNAME=dein-benutzer
PCCADDIE_PASSWORD=dein-passwort
ROUTING_PROVIDER=auto
GOOGLE_MAPS_API_KEY=
```

4. Lokalen Webserver testweise starten:

```bash
cd /home/pi/golf-dashboard
set -a
. /etc/golf-dashboard.env
set +a
python3 server.py
```

5. Chromium im Kiosk-Modus starten:

```bash
chromium-browser --kiosk --disable-infobars --noerrdialogs --disable-session-crashed-bubble http://127.0.0.1:4173/
```

6. Fuer Autostart zwei systemd-Services anlegen: einen fuer den Webserver und einen fuer Chromium. Das Dashboard aktualisiert Wetterdaten selbst alle 10 Minuten und die Anzeige alle 15 Sekunden.

Beispiel fuer `/etc/systemd/system/golf-dashboard.service`:

```ini
[Unit]
Description=Golf Dashboard Server
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/home/pi/golf-dashboard
EnvironmentFile=/etc/golf-dashboard.env
ExecStart=/usr/bin/python3 /home/pi/golf-dashboard/server.py
Restart=always
RestartSec=5
User=pi

[Install]
WantedBy=multi-user.target
```

Aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now golf-dashboard.service
```

Beispiel fuer `/etc/systemd/system/golf-dashboard-kiosk.service` auf Raspberry Pi OS Desktop:

```ini
[Unit]
Description=Golf Dashboard Kiosk
After=graphical.target golf-dashboard.service network-online.target
Wants=golf-dashboard.service

[Service]
User=pi
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/pi/.Xauthority
ExecStartPre=/bin/sleep 8
ExecStart=/usr/bin/chromium-browser --kiosk --disable-infobars --noerrdialogs --disable-session-crashed-bubble --check-for-update-interval=31536000 http://127.0.0.1:4173/
Restart=always
RestartSec=5

[Install]
WantedBy=graphical.target
```

Aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now golf-dashboard-kiosk.service
```

Pruefen und Logs ansehen:

```bash
systemctl status golf-dashboard.service
systemctl status golf-dashboard-kiosk.service
journalctl -u golf-dashboard.service -f
```

Falls Raspberry Pi OS Bookworm mit Wayland/Wayfire laeuft und `DISPLAY=:0` nicht greift, ist der einfachste Weg meist, in `raspi-config` auf X11 umzuschalten oder den Kiosk ueber den Desktop-Autostart zu starten. Das machen wir dann passend zu deinem konkreten Pi-Image.

LCD-Tipp: Fuer den Start ist ein HDMI-LCD am einfachsten, weil Chromium ohne Spezialtreiber laeuft. Kleine SPI-Displays gehen auch, brauchen aber meist eigene Treiber und sind fuer ein komplettes Web-Dashboard enger.

## ESP32 Betrieb

Ein ESP32 ist gut fuer Sensoren, LEDs, kleine E-Paper/TFT-Anzeigen oder Statusanzeigen. Fuer dieses vollwertige HTML-Dashboard mit Browser, CSS und API-Fetches ist ein Raspberry Pi deutlich besser.

Sinnvolle ESP-Rolle:

- ESP32 misst Temperatur, Helligkeit, Gehaeusetaster oder Akku/Power-Status.
- ESP32 sendet Daten per WLAN an den Pi, z. B. per HTTP oder MQTT.
- Das Dashboard zeigt diese Werte dann als weitere Kacheln an.

Wenn das Display sehr klein ist, bauen wir spaeter eine separate ESP32-Ansicht mit stark reduzierten Daten: Uhrzeit, Wetter, naechste Startzeit, Tages-Score.
