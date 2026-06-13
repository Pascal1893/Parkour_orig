# Parkour Spiel — Projektdokumentation

## Überblick

Endlos-Runner-Spiel mit Canvas-Rendering, Node.js-Backend, Login/Shop-System, mehreren Charakteren und Leaderboard.  
Zwei Repos im selben Verzeichnis:

| Pfad | GitHub Repo | Zweck |
|---|---|---|
| `c:\ich\Parkour` | `Pascal1893/Parkour_orig` | Originale / ältere Version |
| `c:\ich\Parkour\Parkourapp` | `Pascal1893/Parkour_app` | **Aktive Version — hier wird gearbeitet** |

**Immer im `Parkourapp`-Ordner arbeiten.**

---

## Git-Workflow (PFLICHT nach jeder Änderung)

```
cd c:\ich\Parkour\Parkourapp
git add .
git commit -m "<kurze sinnvolle Beschreibung>"
git push
```

Branch: `main` | Remote: `https://github.com/Pascal1893/Parkour_app`

---

## Dateistruktur

```
Parkourapp/
├── public/
│   ├── app.js          ← HAUPTDATEI: ganzes Spiel + UI (3500+ Zeilen)
│   ├── index.html      ← HTML-Struktur, Modals, HUD
│   ├── styles.css      ← Styling
│   └── config.js       ← API-URL, credentials mode
├── server.py           ← Flask-Backend: Auth, Shop, Leaderboard, Score
├── create_admin.py     ← Admin-User anlegen
├── data.sqlite3        ← SQLite-Datenbank
├── start.cmd / start.ps1 ← Server starten
└── capacitor-app/      ← Mobile-App-Wrapper (Capacitor)
```

---

## Canvas / Spielkoordinaten

```
W = canvas.width  (~900px)
H = canvas.height (~600px)
GROUND_Y = H - 86          // Bodenlinie (y-Wert der Bodenoberfläche)
PLAYER_W = 34
PLAYER_H = 54
PLAYER_CROUCH_H = 38
```

- **y wächst nach unten** (0 = oben, H = unten)
- Spieler-Füße = `p.y + p.h`
- Spieler-Mitte = `p.y + p.h/2`
- Spieler-Kopf = `p.y`
- Spieler-x ist **fix bei ~170px** — die Welt scrollt nach links

---

## Spielarchitektur (Endless Runner)

- Die Welt scrollt nach links: `plat.x -= worldSpeed * dt * 60`
- Spieler-x bleibt auf ~170px fest; p.x darf sich nur während Grapple verschieben, wird danach zurückgesetzt
- `physics(dt)` — Physik, Kollision, Grapple, Plattform-Bewegung
- `draw()` — Canvas-Rendering (Background, Plattformen, Obstacles, Spieler, HUD, Grapple)
- `loop(now)` — requestAnimationFrame-Loop: dt berechnen, `physics()` → `draw()` aufrufen
- `spawnChunk(x0)` — neue Plattform + Obstacles generieren wenn Welt nach links scrollt
- `game.t` — Spielzeit in Sekunden (steigt immer, auch bei Freeze)

---

## Schwierigkeitsgrad-Konfiguration (spawnChunk)

| Schwierigkeit | Plattformbreite | y-Delta | Gap | Deadly-Rate |
|---|---|---|---|---|
| easy | 290–460px | ±10 | 12–44 | 5% |
| normal | 190–340px | ±42 | 30–70 | 46% |
| hard | 160–270px | ±80 | 55–130 | 78% |

**Micro-Ledge-Snap:** `if (Math.abs(y - prevY) < 24) y = prevY;`  
Verhindert unausweichliche Mini-Absätze.

---

## Obstacle-Typen

| Typ | Verhalten | Tödlich? | Landbar? |
|---|---|---|---|
| `saw` | dreht sich, kreisförmig | **ja, immer** | nein |
| `spike` | dreieckig | **ja, immer** | nein |
| `lava` | flach (h=10), bündig mit Plattform | **ja** | nein |
| `block` | rechteckig, stationär | nein | **ja** |
| `crate` | quadratisch, stationär | nein | **ja** |
| `beam` | schwebender Balken, bewegt sich auf/ab | nein | **ja** |
| `pillar` | Wand (nur bei Wallie) | nein | **ja** |
| `bounce` | Trampolin | nein | springt 3.8× |
| `booster` | Ring, gibt Geschwindigkeit | nein | — |

**Beam-Schutz:** Wenn Spieler auf einem Beam steht (`p.onBeam = true`), ist er immun gegen alle Obstacles **ausser** Saws.

---

## Charaktere (charParams — app.js:1657)

| ID | Name | Fähigkeit | Besonderheit |
|---|---|---|---|
| 0 | Runner | Balanced, bestes Air-Control | speed=5.7, airControl=0.90 |
| 1 | Sprinter | Extrem schnell | speed=9.5, airControl=0.58 |
| 2 | Hopper | Riesiger Sprung + Coyote Time | jump=14.5, coyoteTime=0.14s |
| 3 | Doubler | Doppelsprung | doubleJump=true |
| 4 | Dasher | Dash (kurze Unverwundbarkeit) | dash=true |
| 5 | Magnet | Münzen-Magnet + leichte Beschleunigung | magnet=true, speed=5.7 |
| 6 | Guardian | 3 Schild-Ladungen | shield=true, shieldBase=3 |
| 7 | Glider | Gleiten (gedrückt halten in Luft) | glide=true, jump=10.5 |
| 8 | Wallie | Wandsprung | wallJump=true |
| 9 | Chrono | Extrem Zeitlupe | slowmo=true |
| 10 | Blaze | Feuerspur + Kunai-Grapple (Shift/E) | grapple=true, speed=5.5 |

---

## Blaze — Grapple-System (komplett)

### Ablauf
1. **Shift drücken** → `game.aiming = true`, Lichtbogen beginnt zu schwenken, **Welt friert ein**
2. **Shift nochmals** → `doGrappleAction()` berechnet Ziel per `grappleRaycast(angle)`, feuert Kunai wenn Oberfläche in Reichweite
3. **Flying-Phase** → Kunai fliegt zum Ziel, Welt bleibt eingefroren, Spieler fällt nicht
4. **Hooked-Phase** → Spieler wird zu Ankerpunkt gezogen (x + y), Welt bleibt eingefroren
5. **Release** → Spieler snappt auf x=170, Welt scrollt um den Diff, kleiner Aufwärtskick wenn Anker oben war
6. **E drücken** → Abbruch zu jedem Zeitpunkt

### Wichtige Werte
- Max. Reichweite: **450px**
- Kunai-Geschwindigkeit: **22px/Frame**
- Grapple-Cooldown: **1700ms** (setTimeout)
- Anchor-Berechnung: `pl.y - p.h` → Spieler-Füsse landen exakt auf Plattformoberfläche
- Death-Zone Blaze: `H + 220` (normal: `H + 80`) — mehr Platz zum Herunterfallen und zurückgrapplen

### Schlüsselfunktionen
- `doGrappleAction()` — app.js:2232 — Aim/Fire-Toggle
- `grappleRaycast(angle)` — app.js:2248 — Ray vs. Plattformen/Obstacles
- `fireGrappleAt(tx, ty)` — app.js:2267 — Kunai initialisieren
- Flying-Phase — app.js:2302 — Kunai bewegt sich, `return` friert Welt ein
- Hooked-Phase — app.js:2315 — Spieler wird gezogen, `return` friert Welt ein

### Regeln für Raycast
- Ziele: alle Plattformen + landbare Obstacles (`block`, `pillar`, `crate`, `beam`)
- Ignoriert: `saw`, `spike`, `lava`
- Kein Schuss wenn kein Ziel in Reichweite

---

## Physik-Details

- Gravitation: `g = 32.0` (normal), `g = 7.5` beim Gleiten (Glider)
- Terminal Velocity: `p.vy = Math.min(p.vy, 26)`
- Jump Cancel: Sprung-Taste loslassen kürzt Sprung (`p.vy *= 0.55^(dt*60)`)
- Fast-Fall: ArrowDown/S → fällt schneller
- Dash: 2.2× Geschwindigkeit für 0.36s, Cooldown 650ms (anpassbar per Gear)
- Coyote Time (Hopper): 0.14s nach Abgang von Kante noch sprungfähig
- Grapple-Release-Kick: 0.4s nach Grapple-Ende wird Jump-Cancel ignoriert (damit der Aufwärtskick erhalten bleibt)
- Booster-Ring: 1.48× Geschwindigkeit für kurze Zeit

---

## Plattform-Visualisierung

- Farbe: `rgba(75,55,155,.62)` mit Rand `rgba(168,138,255,.72)`
- **Oranger Gradient am rechten Rand** → zeigt an wo die Plattform aufhört (Gap-Warnung)
- Bewegende Plattformen: 15% Chance auf normal/hard, bewegen sich ±32px vertikal

---

## Backend (server.py — Flask + SQLite)

- `/api/me` — aktuellen User
- `/api/login`, `/api/register` — Auth
- `/api/leaderboard` — Top-Scores
- `/api/select_character` — aktiven Charakter setzen
- `/api/buy_box` — Lootbox kaufen
- `/api/inventory` — Inventar
- `/api/equip_item` — Gear anlegen
- Score-Submit beim Spielende
- Admin-Panel: Charakter-Geschenke an User

Session: Cookie + Bearer Token (für Capacitor-App)  
Datenbank: `data.sqlite3`

---

## Bekannte fixe Bugs (nicht mehr offen)

| Bug | Fix |
|---|---|
| Grapple feuerte gar nicht | Raycast return null guard fehlte |
| Spieler wurde nicht gezogen | Nur y-Pull, kein x-Pull; jetzt beide Achsen |
| Spieler landete unter Plattform | Anchor war `pl.y`, jetzt `pl.y - p.h` |
| p.x driftete nach rechts | Nach Hooked: `xShift = p.x - 170`, Welt korrigieren, `p.x = 170` |
| Welt lief während Kunai-Flug | `return` in Flying-Phase fehlte → wieder ergänzt |
| Blaze starb beim Fallen + Grapple | Death-Zone auf `H + 220` erweitert |
| Downward-Grapple funktionierte nicht | `diffY > 50`-Check entfernt |
| Spikes waren landbar | Spike aus landable-Liste entfernt |
| Lava-Blöcke ragten hoch | Hurdle → Lava (h=10, bündig mit Plattform) |
| Trampolin zu schwach | 2.8× → 3.8× Sprung-Multiplikator |
| Beam schützte nicht | `p.onBeam`-Flag + Beam-Schutz-Check in Kollision |
| Micro-Ledges | `if (abs(y-prevY) < 24) y = prevY` in spawnChunk |

---

## Gear / Item-Mods

Items aus Lootboxen modifizieren Charakter-Stats:

| Mod-Key | Effekt |
|---|---|
| `speed_mul` | Geschwindigkeits-Multiplikator |
| `jump_mul` | Sprung-Multiplikator |
| `air_control_mul` | Luft-Steuerung |
| `magnet_mul` | Münz-Magnet-Radius |
| `dash_cd_mul` | Dash-Cooldown |
| `slow_cd_mul` | Slowmo-Cooldown |
| `slow_dur_add` | Slowmo-Dauer |
| `shield_charges_add` | Zusatz-Schildladungen |
| `glide_grav_mul` | Gleit-Gravitation |
| `skin_key` | Visueller Skin |

Gear-Mods werden in `charParams()` zur Laufzeit angewandt (app.js:1715).

---

## Seltenheits-System

Reihenfolge (aufsteigend): Bronze → Silber → Gold → Platin → Mythic  
Lootboxen: Bronze-Box, Silber-Box, Gold-Box  
Charakter-Drop-Chance: 20% (konfigurierbar)

---

## Mobile (Capacitor)

- `capacitor-app/` enthält den Wrapper für Android/iOS
- `sync-www.js` kopiert `public/` nach `capacitor-app/www/`
- Config in `capacitor-app/capacitor.config.json`
- Session-Token in `localStorage` (Cookies funktionieren cross-origin nicht)
