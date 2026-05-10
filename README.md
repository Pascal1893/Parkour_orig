# Parkour (Port 1893)

Ein kleines Browser-Parkour-Spiel mit:
- Login/Registrierung (eigener Account)
- globalem Highscore (Top 20)
- 10 Charakteren mit unterschiedlichen Fähigkeiten + Unlock-System
- Lootbox-Shop: Items & Kosmetik (Bronze/Silber/Gold/Platin/Mythic)
- Inventar + Ausrüsten pro Charakter
- Profil anpassbar (Banner/Background/Frame/Title)

## Starten

In `c:\\ich`:

```powershell
python server.py
```

Dann im Browser öffnen:
- `http://localhost:1893`

## Hinweise

- Die Daten liegen in `data.sqlite3`.
- Coins werden bei **Game Over** gutgeschrieben; bei **Restart mitten im Run** werden sie jetzt ebenfalls gebankt.
- Charaktere werden **nur über Lootbox-Drops** freigeschaltet (nicht mit Coins gekauft).
- Für mehr Sicherheit im LAN/Internet: `PARKOUR_SESSION_SECRET` setzen, z.B.

```powershell
$env:PARKOUR_SESSION_SECRET="eine-lange-zufallszeichenkette"; python server.py
```
