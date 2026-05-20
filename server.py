import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
DB_PATH = ROOT / "data.sqlite3"

HOST = os.environ.get("PARKOUR_HOST", "0.0.0.0")
PORT = int(os.environ.get("PARKOUR_PORT", "1893"))
SESSION_TTL_SECONDS = 60 * 60 * 24 * 7  # 7 days

_DEFAULT_SECRET = "dev-secret-change-me"
SESSION_SECRET = os.environ.get("PARKOUR_SESSION_SECRET", _DEFAULT_SECRET).encode("utf-8")


CHARACTERS = [
    {
        "id": 0,
        "name": "Runner",
        "ability": "Balanced",
        "desc": "Ausgewogen: normales Tempo & Sprung.",
        "cost": 0,
    },
    {
        "id": 1,
        "name": "Sprinter",
        "ability": "Speed",
        "desc": "Schnelleres Tempo, dafür etwas weniger Kontrolle in der Luft.",
        "cost": None,
    },
    {
        "id": 2,
        "name": "Hopper",
        "ability": "High Jump",
        "desc": "Höherer Sprung für weite Lücken.",
        "cost": None,
    },
    {
        "id": 3,
        "name": "Doubler",
        "ability": "Double Jump",
        "desc": "Ein zusätzlicher Sprung in der Luft.",
        "cost": None,
    },
    {
        "id": 4,
        "name": "Dasher",
        "ability": "Dash",
        "desc": "Kurzer Dash nach vorne (Shift).",
        "cost": None,
    },
    {
        "id": 5,
        "name": "Magnet",
        "ability": "Coin Magnet",
        "desc": "Zieht Münzen leicht an (größerer Sammelradius).",
        "cost": None,
    },
    {
        "id": 6,
        "name": "Guardian",
        "ability": "Shield",
        "desc": "Ein Treffer wird ignoriert (1x pro Run).",
        "cost": None,
    },
    {
        "id": 7,
        "name": "Glider",
        "ability": "Glide",
        "desc": "Langsameres Fallen beim Gedrückthalten von Space.",
        "cost": None,
    },
    {
        "id": 8,
        "name": "Wallie",
        "ability": "Wall Jump",
        "desc": "Wandsprung an hohen Säulen.",
        "cost": None,
    },
    {
        "id": 9,
        "name": "Chrono",
        "ability": "Slow-mo",
        "desc": "Kurze Zeitlupe (E) mit Cooldown.",
        "cost": None,
    },
    {
        "id": 10,
        "name": "Blaze",
        "ability": "Grapple",
        "desc": "Schiesst ein Kunai-Seil zum nächsten Hindernis und zieht sich heran (E/Shift). Hinterlässt Feuerspur.",
        "cost": None,
    },
]

RARITY_ORDER = ["Bronze", "Silber", "Gold", "Platin", "Mythic"]

PASS_MAX_LEVEL = 50
PASS_GEMS_PER_LEVEL = 10  # 10 gems -> next level (total 490 gems to reach level 50)


def pass_level_for_gems(gems_total: int) -> int:
    gems_total = max(0, int(gems_total))
    lvl = 1 + (gems_total // PASS_GEMS_PER_LEVEL)
    return max(1, min(PASS_MAX_LEVEL, lvl))


def pass_reward_for_level(level: int) -> dict:
    # simple reward plan: boxes every 5 levels, gems bonuses every 10 levels, big at 50
    lvl = int(level)
    if lvl == 50:
        return {"kind": "box", "box_id": "gold_box", "qty": 3}
    if lvl == 25:
        return {"kind": "box", "box_id": "gold_box", "qty": 1}
    if lvl % 10 == 0:
        return {"kind": "gems", "qty": 30}
    if lvl % 5 == 0:
        return {"kind": "box", "box_id": "silber_box", "qty": 1}
    return {"kind": "gems", "qty": 5}

ITEMS = [
    # Gear (gameplay)
    {"id": 100, "name": "Leichtschuhe", "type": "gear", "slot": "feet", "rarity": "Bronze", "desc": "+5% Speed", "mods": {"speed_mul": 1.05}},
    {"id": 101, "name": "Greifer-Handschuhe", "type": "gear", "slot": "hands", "rarity": "Bronze", "desc": "+10% Air-Control", "mods": {"air_control_mul": 1.10}},
    {"id": 110, "name": "Sprungfedern", "type": "gear", "slot": "feet", "rarity": "Silber", "desc": "+10% Jump", "mods": {"jump_mul": 1.10}},
    {"id": 111, "name": "Münzbeutel", "type": "gear", "slot": "belt", "rarity": "Silber", "desc": "+25% Magnet-Radius", "mods": {"magnet_mul": 1.25}},
    {"id": 120, "name": "Dash-Kern", "type": "gear", "slot": "core", "rarity": "Gold", "desc": "Dash kürzerer Cooldown", "mods": {"dash_cd_mul": 0.80}},
    {"id": 121, "name": "Schutzmatrix", "type": "gear", "slot": "core", "rarity": "Gold", "desc": "Shield: +1 extra Treffer (pro Run)", "mods": {"shield_charges_add": 1}},
    {"id": 130, "name": "Chrono-Spule", "type": "gear", "slot": "core", "rarity": "Platin", "desc": "Slow-mo länger & schnellerer Cooldown", "mods": {"slow_dur_add": 0.35, "slow_cd_mul": 0.75}},
    {"id": 131, "name": "Schwerkraftbrecher", "type": "gear", "slot": "core", "rarity": "Platin", "desc": "Glide stärker (weniger Fallgeschwindigkeit)", "mods": {"glide_grav_mul": 0.80}},
    {"id": 140, "name": "Mythic: Null-Zeit", "type": "gear", "slot": "mythic", "rarity": "Mythic", "desc": "OP: +12% Speed, +12% Jump, Coin-Magnet", "mods": {"speed_mul": 1.12, "jump_mul": 1.12, "magnet_mul": 1.40}},
    # Cosmetics (profile / background)
    {"id": 200, "name": "Banner: Neon-Violett", "type": "cosmetic", "slot": "banner", "rarity": "Bronze", "desc": "Profil-Banner Neon", "mods": {"banner": "violet"}},
    {"id": 201, "name": "Banner: Mint-Glow", "type": "cosmetic", "slot": "banner", "rarity": "Silber", "desc": "Profil-Banner Mint", "mods": {"banner": "mint"}},
    {"id": 210, "name": "Background: Cyber Grid", "type": "cosmetic", "slot": "background", "rarity": "Gold", "desc": "Profil-Hintergrund", "mods": {"bg": "grid"}},
    {"id": 220, "name": "Frame: Prism", "type": "cosmetic", "slot": "frame", "rarity": "Platin", "desc": "Profil-Rahmen", "mods": {"frame": "prism"}},
    {"id": 230, "name": "Title: Legende", "type": "cosmetic", "slot": "title", "rarity": "Mythic", "desc": "Profil-Titel", "mods": {"title": "Legende"}},
    # Skins (als gear ohne Stats, damit sie über Boxen droppen & via Equipment pro Charakter ausrüstbar sind)
    {"id": 300, "name": "Skin: Classic Runner", "type": "gear", "slot": "skin", "rarity": "Bronze", "desc": "Standard-Look (Runner).", "mods": {"skin_key": "runner_classic", "skin_for_character_id": 0}},
    {"id": 301, "name": "Skin: Samichlaus", "type": "gear", "slot": "skin", "rarity": "Gold", "desc": "Festlicher Look mit Mütze (Runner).", "mods": {"skin_key": "runner_santa", "skin_for_character_id": 0}},
    {"id": 310, "name": "Skin: Track Star", "type": "gear", "slot": "skin", "rarity": "Bronze", "desc": "Sportlicher Look (Sprinter).", "mods": {"skin_key": "sprinter_track", "skin_for_character_id": 1}},
    {"id": 311, "name": "Skin: Neon Bolt", "type": "gear", "slot": "skin", "rarity": "Silber", "desc": "Neon-Effekt (Sprinter).", "mods": {"skin_key": "sprinter_neon", "skin_for_character_id": 1}},
    {"id": 320, "name": "Skin: Kangaroo", "type": "gear", "slot": "skin", "rarity": "Bronze", "desc": "Springer-Look (Hopper).", "mods": {"skin_key": "hopper_kangaroo", "skin_for_character_id": 2}},
    {"id": 321, "name": "Skin: Rocket Boots", "type": "gear", "slot": "skin", "rarity": "Silber", "desc": "Stiefel mit Flammen (Hopper).", "mods": {"skin_key": "hopper_rocket", "skin_for_character_id": 2}},
    {"id": 330, "name": "Skin: Twin Shadows", "type": "gear", "slot": "skin", "rarity": "Gold", "desc": "Dunkler Look (Doubler).", "mods": {"skin_key": "doubler_shadow", "skin_for_character_id": 3}},
    {"id": 340, "name": "Skin: Street Dasher", "type": "gear", "slot": "skin", "rarity": "Gold", "desc": "Hoodie-Look (Dasher).", "mods": {"skin_key": "dasher_hoodie", "skin_for_character_id": 4}},
    {"id": 350, "name": "Skin: Gold Magnet", "type": "gear", "slot": "skin", "rarity": "Silber", "desc": "Goldener Look (Magnet).", "mods": {"skin_key": "magnet_gold", "skin_for_character_id": 5}},
    {"id": 360, "name": "Skin: Paladin", "type": "gear", "slot": "skin", "rarity": "Platin", "desc": "Rüstung-Look (Guardian).", "mods": {"skin_key": "guardian_paladin", "skin_for_character_id": 6}},
    {"id": 370, "name": "Skin: Wingsuit", "type": "gear", "slot": "skin", "rarity": "Silber", "desc": "Anzug mit Flügeln (Glider).", "mods": {"skin_key": "glider_wingsuit", "skin_for_character_id": 7}},
    {"id": 380, "name": "Skin: Builder", "type": "gear", "slot": "skin", "rarity": "Platin", "desc": "Kletter-Gurt & Helm (Wallie).", "mods": {"skin_key": "wallie_builder", "skin_for_character_id": 8}},
    {"id": 390, "name": "Skin: Time Lord", "type": "gear", "slot": "skin", "rarity": "Mythic", "desc": "Zeit-Anzug (Chrono).", "mods": {"skin_key": "chrono_timelord", "skin_for_character_id": 9}},
]

BOXES = [
    {"id": "bronze_box", "name": "Bronze Box", "cost": 120, "currency": "coins", "weights": {"Bronze": 78, "Silber": 19, "Gold": 3, "Platin": 0, "Mythic": 0}},
    {"id": "silber_box", "name": "Silber Box", "cost": 260, "currency": "coins", "weights": {"Bronze": 35, "Silber": 50, "Gold": 13, "Platin": 2, "Mythic": 0}},
    {"id": "gold_box", "name": "Gold Box", "cost": 500, "currency": "coins", "weights": {"Bronze": 10, "Silber": 45, "Gold": 35, "Platin": 9, "Mythic": 1}},
]

CHARACTER_DROP_TABLE = [
    # Einschätzung "Power" der Fähigkeiten:
    # - Bronze: leicht besser, aber nicht gamebreaking
    # - Silber: spürbar hilfreich
    # - Gold: sehr stark
    # - Platin/Mythic: run-verändernd / extrem stark
    {"character_id": 1, "rarity": "Bronze"},  # Speed
    {"character_id": 2, "rarity": "Bronze"},  # High Jump
    {"character_id": 5, "rarity": "Bronze"},  # Coin Magnet (Quality of life)
    {"character_id": 7, "rarity": "Silber"},  # Glide
    {"character_id": 3, "rarity": "Gold"},  # Double Jump
    {"character_id": 4, "rarity": "Gold"},  # Dash
    {"character_id": 6, "rarity": "Platin"},  # Shield
    {"character_id": 8, "rarity": "Platin"},  # Wall Jump
    {"character_id": 9, "rarity": "Mythic"},  # Slow-mo
    {"character_id": 10, "rarity": "Platin"},  # Grapple
]


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    conn = _db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              pw_salt BLOB NOT NULL,
              pw_hash BLOB NOT NULL,
              coins INTEGER NOT NULL DEFAULT 0,
              gems INTEGER NOT NULL DEFAULT 0,
              selected_character INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS scores (
              user_id INTEGER PRIMARY KEY,
              best_score INTEGER NOT NULL DEFAULT 0,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS unlocks (
              user_id INTEGER NOT NULL,
              character_id INTEGER NOT NULL,
              PRIMARY KEY (user_id, character_id),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS user_items (
              user_id INTEGER NOT NULL,
              item_id INTEGER NOT NULL,
              qty INTEGER NOT NULL DEFAULT 0,
              PRIMARY KEY (user_id, item_id),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS equipment (
              user_id INTEGER NOT NULL,
              character_id INTEGER NOT NULL,
              slot TEXT NOT NULL,
              item_id INTEGER NOT NULL,
              PRIMARY KEY (user_id, character_id, slot),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS profile (
              user_id INTEGER PRIMARY KEY,
              banner_item_id INTEGER,
              background_item_id INTEGER,
              frame_item_id INTEGER,
              title_item_id INTEGER,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS pass_progress (
              user_id INTEGER PRIMARY KEY,
              gems_total INTEGER NOT NULL DEFAULT 0,
              level INTEGER NOT NULL DEFAULT 1,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS pass_claims (
              user_id INTEGER NOT NULL,
              level INTEGER NOT NULL,
              claimed_at INTEGER NOT NULL,
              PRIMARY KEY (user_id, level),
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS admin_gifts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              to_user_id INTEGER NOT NULL,
              from_admin_id INTEGER NOT NULL,
              type TEXT NOT NULL,
              amount INTEGER NOT NULL DEFAULT 0,
              box_id TEXT NOT NULL DEFAULT '',
              note TEXT NOT NULL DEFAULT '',
              created_at INTEGER NOT NULL,
              claimed_at INTEGER,
              FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
              FOREIGN KEY (from_admin_id) REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        # lightweight migration for existing DBs
        try:
            conn.execute("ALTER TABLE users ADD COLUMN gems INTEGER NOT NULL DEFAULT 0;")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN is_banned INTEGER NOT NULL DEFAULT 0;")
        except Exception:
            pass
    finally:
        conn.close()


def item_by_id(item_id: int) -> dict | None:
    for it in ITEMS:
        if it["id"] == item_id:
            return it
    return None


def _is_consumable_gear(item: dict) -> bool:
    if not item or item.get("type") != "gear":
        return False
    # Skins are permanent cosmetics (not consumable).
    if str(item.get("slot") or "") == "skin":
        return False
    return True


def _weighted_choice(weights: dict[str, int]) -> str:
    total = sum(max(0, int(v)) for v in weights.values())
    if total <= 0:
        return "Bronze"
    r = secrets.randbelow(total) + 1
    acc = 0
    for k, v in weights.items():
        acc += max(0, int(v))
        if r <= acc:
            return k
    return list(weights.keys())[0]


def _items_of_rarity(rarity: str) -> list[dict]:
    return [it for it in ITEMS if it.get("rarity") == rarity]


def json_response(handler: SimpleHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def _read_json(handler: SimpleHTTPRequestHandler) -> dict | None:
    try:
        length = int(handler.headers.get("Content-Length") or "0")
    except ValueError:
        return None
    if length <= 0 or length > 1024 * 64:
        return None
    try:
        raw = handler.rfile.read(length)
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def _pbkdf(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)


def _sign(data: bytes) -> str:
    sig = hmac.new(SESSION_SECRET, data, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(sig).decode("ascii").rstrip("=")


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64d(data: str) -> bytes:
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + pad).encode("ascii"))


def make_session_cookie(user_id: int) -> str:
    payload = {"uid": user_id, "exp": int(time.time()) + SESSION_TTL_SECONDS, "n": secrets.token_urlsafe(8)}
    data = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    token = _b64(data) + "." + _sign(data)
    return token


def verify_session_cookie(token: str) -> int | None:
    if not token or "." not in token:
        return None
    data_b64, sig = token.split(".", 1)
    try:
        data = _b64d(data_b64)
    except Exception:
        return None
    expected = _sign(data)
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        payload = json.loads(data.decode("utf-8"))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    uid = payload.get("uid")
    if not isinstance(uid, int):
        return None
    return uid


def parse_cookies(handler: SimpleHTTPRequestHandler) -> dict[str, str]:
    raw = handler.headers.get("Cookie")
    if not raw:
        return {}
    cookie = SimpleCookie()
    cookie.load(raw)
    out: dict[str, str] = {}
    for k in cookie.keys():
        out[k] = cookie[k].value
    return out


def character_by_id(cid: int) -> dict | None:
    for c in CHARACTERS:
        if c["id"] == cid:
            return c
    return None


class ParkourHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        # Keep logs compact; useful when debugging routing.
        super().log_message(format, *args)

    def translate_path(self, path: str) -> str:
        rel = path.split("?", 1)[0].split("#", 1)[0]
        if rel == "/":
            rel = "/index.html"
        rel = rel.lstrip("/")
        candidate = (PUBLIC_DIR / rel).resolve()
        try:
            candidate.relative_to(PUBLIC_DIR.resolve())
        except Exception:
            return str((PUBLIC_DIR / "index.html").resolve())
        return str(candidate)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        # Avoid stale frontend assets during development (JS/CSS/HTML).
        try:
            p = urlparse(self.path).path or ""
        except Exception:
            p = ""
        if p.endswith((".js", ".css", ".html")) or p in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        # urlparse behaves oddly if a client sends an absolute URI; normalize to a path.
        parsed = urlparse(self.path)
        path = parsed.path or self.path.split("?", 1)[0].split("#", 1)[0]
        if path.startswith("http://") or path.startswith("https://"):
            path = urlparse(path).path
        # If an /api route is unexpectedly not matched, returning the static 404 is confusing.
        if path == "/api/leaderboard":
            return self._api_leaderboard()
        if path == "/api/characters":
            return self._api_characters()
        if path == "/api/me":
            return self._api_me()
        if path == "/api/shop":
            return self._api_shop()
        if path == "/api/pass":
            return self._api_pass()
        if path == "/api/inventory":
            return self._api_inventory()
        if path == "/api/profile":
            return self._api_profile()
        if path == "/api/admin/users":
            return self._api_admin_users()
        if path == "/api/gifts":
            return self._api_gifts()
        if path.lstrip().startswith("/api/"):
            return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found", "path": path})
        return super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path or self.path.split("?", 1)[0].split("#", 1)[0]
        if path.startswith("http://") or path.startswith("https://"):
            path = urlparse(path).path
        if path == "/api/register":
            return self._api_register()
        if path == "/api/login":
            return self._api_login()
        if path == "/api/logout":
            return self._api_logout()
        if path == "/api/submit_run":
            return self._api_submit_run()
        if path == "/api/consume_loadout":
            return self._api_consume_loadout()
        if path == "/api/claim_pass":
            return self._api_claim_pass()
        if path == "/api/unlock":
            return self._api_unlock()
        if path == "/api/select_character":
            return self._api_select_character()
        if path == "/api/buy_box":
            return self._api_buy_box()
        if path == "/api/equip_item":
            return self._api_equip_item()
        if path == "/api/update_profile":
            return self._api_update_profile()
        if path == "/api/claim_gift":
            return self._api_claim_gift()
        if path.startswith("/api/admin/"):
            return self._api_admin(path)
        return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})

    def _current_user_id(self) -> int | None:
        cookies = parse_cookies(self)
        token = cookies.get("session", "")
        uid = verify_session_cookie(token)
        if uid is None:
            return None
        conn = _db()
        try:
            row = conn.execute("SELECT id, is_banned FROM users WHERE id = ?", (uid,)).fetchone()
            if not row:
                return None
            if int(row["is_banned"] if "is_banned" in row.keys() else 0):
                return None
            return int(row["id"])
        finally:
            conn.close()

    def _require_user(self) -> int | None:
        uid = self._current_user_id()
        if uid is None:
            json_response(self, HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "unauthorized"})
            return None
        return uid

    def _api_characters(self) -> None:
        json_response(self, HTTPStatus.OK, {"ok": True, "characters": CHARACTERS})

    def _api_shop(self) -> None:
        json_response(
            self,
            HTTPStatus.OK,
            {
                "ok": True,
                "boxes": BOXES,
                "rarities": RARITY_ORDER,
                "items": ITEMS,
                "character_drop_chance_percent": 20,
                "character_drop_table": CHARACTER_DROP_TABLE,
            },
        )

    def _api_register(self) -> None:
        data = _read_json(self) or {}
        username = str(data.get("username") or "").strip()
        password = str(data.get("password") or "")
        if not (3 <= len(username) <= 20) or not username.replace("_", "").isalnum():
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_username"})
        if len(password) < 6:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_password"})
        salt = secrets.token_bytes(16)
        pw_hash = _pbkdf(password, salt)
        now = int(time.time())
        conn = _db()
        try:
            cur = conn.execute(
                "INSERT INTO users (username, pw_salt, pw_hash, coins, selected_character, created_at) VALUES (?,?,?,?,?,?)",
                (username, salt, pw_hash, 0, 0, now),
            )
            user_id = int(cur.lastrowid)
            conn.execute("INSERT OR IGNORE INTO unlocks (user_id, character_id) VALUES (?, ?)", (user_id, 0))
            conn.execute("INSERT OR IGNORE INTO scores (user_id, best_score, updated_at) VALUES (?, ?, ?)", (user_id, 0, now))
            conn.execute("INSERT OR IGNORE INTO profile (user_id, banner_item_id, background_item_id, frame_item_id, title_item_id, updated_at) VALUES (?,?,?,?,?,?)", (user_id, None, None, None, None, now))
            conn.commit()
        except sqlite3.IntegrityError:
            return json_response(self, HTTPStatus.CONFLICT, {"ok": False, "error": "username_taken"})
        finally:
            conn.close()

        token = make_session_cookie(user_id)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", f"session={token}; HttpOnly; Path=/; SameSite=Lax; Max-Age={SESSION_TTL_SECONDS}")
        body = json.dumps({"ok": True}).encode("utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _api_login(self) -> None:
        data = _read_json(self) or {}
        username = str(data.get("username") or "").strip()
        password = str(data.get("password") or "")
        if not username or not password:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        conn = _db()
        try:
            row = conn.execute("SELECT id, pw_salt, pw_hash, is_banned FROM users WHERE username = ?", (username,)).fetchone()
        finally:
            conn.close()
        if not row:
            return json_response(self, HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "invalid_login"})
        if int(row["is_banned"] if "is_banned" in row.keys() else 0):
            return json_response(self, HTTPStatus.FORBIDDEN, {"ok": False, "error": "banned"})
        salt = bytes(row["pw_salt"])
        expected = bytes(row["pw_hash"])
        actual = _pbkdf(password, salt)
        if not hmac.compare_digest(expected, actual):
            return json_response(self, HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "invalid_login"})
        user_id = int(row["id"])

        token = make_session_cookie(user_id)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", f"session={token}; HttpOnly; Path=/; SameSite=Lax; Max-Age={SESSION_TTL_SECONDS}")
        body = json.dumps({"ok": True}).encode("utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _api_logout(self) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", "session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0")
        body = json.dumps({"ok": True}).encode("utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _api_me(self) -> None:
        uid = self._current_user_id()
        if uid is None:
            return json_response(self, HTTPStatus.OK, {"ok": True, "user": None})
        conn = _db()
        try:
            user = conn.execute(
                "SELECT id, username, coins, gems, selected_character, is_admin, is_banned FROM users WHERE id = ?",
                (uid,),
            ).fetchone()
            score = conn.execute("SELECT best_score FROM scores WHERE user_id = ?", (uid,)).fetchone()
            unlock_rows = conn.execute("SELECT character_id FROM unlocks WHERE user_id = ? ORDER BY character_id", (uid,)).fetchall()
            equip_rows = conn.execute(
                "SELECT character_id, slot, item_id FROM equipment WHERE user_id = ?",
                (uid,),
            ).fetchall()
            prof = conn.execute(
                "SELECT banner_item_id, background_item_id, frame_item_id, title_item_id FROM profile WHERE user_id = ?",
                (uid,),
            ).fetchone()
        finally:
            conn.close()
        unlocked = [int(r["character_id"]) for r in unlock_rows]
        equipment: dict[str, dict[str, int]] = {}
        for r in equip_rows:
            cid = str(int(r["character_id"]))
            equipment.setdefault(cid, {})[str(r["slot"])] = int(r["item_id"])
        profile = {
            "banner_item_id": int(prof["banner_item_id"]) if prof and prof["banner_item_id"] is not None else None,
            "background_item_id": int(prof["background_item_id"]) if prof and prof["background_item_id"] is not None else None,
            "frame_item_id": int(prof["frame_item_id"]) if prof and prof["frame_item_id"] is not None else None,
            "title_item_id": int(prof["title_item_id"]) if prof and prof["title_item_id"] is not None else None,
        }
        json_response(
            self,
            HTTPStatus.OK,
            {
                "ok": True,
                "user": {
                    "id": int(user["id"]),
                    "username": str(user["username"]),
                    "coins": int(user["coins"]),
                    "gems": int(user["gems"]) if "gems" in user.keys() else 0,
                    "selected_character": int(user["selected_character"]),
                    "best_score": int(score["best_score"] if score else 0),
                    "unlocked": unlocked,
                    "equipment": equipment,
                    "profile": profile,
                    "is_admin": int(user["is_admin"]) if "is_admin" in user.keys() else 0,
                },
            },
        )

    def _api_pass(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        conn = _db()
        now = int(time.time())
        try:
            row = conn.execute("SELECT gems_total, level FROM pass_progress WHERE user_id = ?", (uid,)).fetchone()
            if not row:
                conn.execute(
                    "INSERT OR IGNORE INTO pass_progress (user_id, gems_total, level, updated_at) VALUES (?,?,?,?)",
                    (uid, 0, 1, now),
                )
                conn.commit()
                gems_total = 0
                level = 1
            else:
                gems_total = int(row["gems_total"])
                level = int(row["level"])
            claims = conn.execute("SELECT level FROM pass_claims WHERE user_id = ?", (uid,)).fetchall()
        finally:
            conn.close()
        claimed = {int(r["level"]) for r in claims}
        rewards = []
        for lvl in range(1, PASS_MAX_LEVEL + 1):
            rw = pass_reward_for_level(lvl)
            rewards.append({"level": lvl, "reward": rw, "claimed": (lvl in claimed), "unlocked": lvl <= level})
        json_response(self, HTTPStatus.OK, {"ok": True, "pass": {"level": level, "gems_total": gems_total, "max_level": PASS_MAX_LEVEL, "per_level": PASS_GEMS_PER_LEVEL, "rewards": rewards}})

    def _api_leaderboard(self) -> None:
        conn = _db()
        try:
            rows = conn.execute(
                """
                SELECT u.username AS username, s.best_score AS best_score, u.coins AS coins
                FROM scores s
                JOIN users u ON u.id = s.user_id
                ORDER BY s.best_score DESC, u.username ASC
                LIMIT 20
                """
            ).fetchall()
        finally:
            conn.close()
        leaderboard = [{"username": str(r["username"]), "best_score": int(r["best_score"]), "coins": int(r["coins"])} for r in rows]
        json_response(self, HTTPStatus.OK, {"ok": True, "leaderboard": leaderboard})

    def _api_unlock(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        # Characters are unlocked via lootboxes only (not via coins purchase).
        json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "character_unlock_via_boxes"})

    def _api_select_character(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            cid = int(data.get("character_id"))
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        if not character_by_id(cid):
            return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "character_not_found"})
        conn = _db()
        try:
            ok = conn.execute("SELECT 1 FROM unlocks WHERE user_id = ? AND character_id = ?", (uid, cid)).fetchone()
            if not ok:
                return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "locked"})
            conn.execute("UPDATE users SET selected_character = ? WHERE id = ?", (cid, uid))
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})

    def _api_submit_run(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            score = int(data.get("score", 0))
            earned = int(data.get("coins_earned", 0))
            cid = int(data.get("character_id", 0))
            gems_earned = int(data.get("gems_earned", 0))
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        score = max(0, min(score, 10_000_000))
        earned = max(0, min(earned, 100_000))
        gems_earned = max(0, min(gems_earned, 100_000))
        if not character_by_id(cid):
            cid = 0
        conn = _db()
        now = int(time.time())
        try:
            ok = conn.execute("SELECT 1 FROM unlocks WHERE user_id = ? AND character_id = ?", (uid, cid)).fetchone()
            if not ok:
                cid = 0
            conn.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (earned, uid))
            conn.execute("UPDATE users SET gems = gems + ? WHERE id = ?", (gems_earned, uid))
            # pass progress
            rowp = conn.execute("SELECT gems_total FROM pass_progress WHERE user_id = ?", (uid,)).fetchone()
            prev_gems_total = int(rowp["gems_total"]) if rowp else 0
            new_total = prev_gems_total + gems_earned
            new_level = pass_level_for_gems(new_total)
            conn.execute(
                "INSERT INTO pass_progress (user_id, gems_total, level, updated_at) VALUES (?,?,?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET gems_total=excluded.gems_total, level=excluded.level, updated_at=excluded.updated_at",
                (uid, new_total, new_level, now),
            )
            row = conn.execute("SELECT best_score FROM scores WHERE user_id = ?", (uid,)).fetchone()
            prev = int(row["best_score"]) if row else 0
            if score > prev:
                conn.execute(
                    "INSERT INTO scores (user_id, best_score, updated_at) VALUES (?, ?, ?) "
                    "ON CONFLICT(user_id) DO UPDATE SET best_score=excluded.best_score, updated_at=excluded.updated_at",
                    (uid, score, now),
                )
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})

    def _api_consume_loadout(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            character_id = int(data.get("character_id", 0))
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        if not character_by_id(character_id):
            return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "character_not_found"})

        conn = _db()
        try:
            equip_rows = conn.execute(
                "SELECT slot, item_id FROM equipment WHERE user_id = ? AND character_id = ?",
                (uid, character_id),
            ).fetchall()
            consumed: list[dict] = []
            for r in equip_rows:
                slot = str(r["slot"])
                item_id = int(r["item_id"])
                item = item_by_id(item_id)
                if not item or not _is_consumable_gear(item):
                    continue
                # Clear consumable slot after a run (must re-equip next time).
                conn.execute(
                    "DELETE FROM equipment WHERE user_id = ? AND character_id = ? AND slot = ?",
                    (uid, character_id, slot),
                )
                row = conn.execute(
                    "SELECT qty FROM user_items WHERE user_id = ? AND item_id = ?",
                    (uid, item_id),
                ).fetchone()
                have = int(row["qty"]) if row else 0
                if have <= 0:
                    continue
                new_qty = have - 1
                if new_qty <= 0:
                    conn.execute("DELETE FROM user_items WHERE user_id = ? AND item_id = ?", (uid, item_id))
                else:
                    conn.execute("UPDATE user_items SET qty = ? WHERE user_id = ? AND item_id = ?", (new_qty, uid, item_id))
                consumed.append({"item_id": item_id, "slot": slot})
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "consumed": consumed})

    def _api_claim_pass(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            level = int(data.get("level"))
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        if level < 1 or level > PASS_MAX_LEVEL:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_level"})
        now = int(time.time())
        conn = _db()
        try:
            prog = conn.execute("SELECT level FROM pass_progress WHERE user_id = ?", (uid,)).fetchone()
            cur_level = int(prog["level"]) if prog else 1
            if level > cur_level:
                return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "locked"})
            already = conn.execute("SELECT 1 FROM pass_claims WHERE user_id = ? AND level = ?", (uid, level)).fetchone()
            if already:
                return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "already_claimed"})
            reward = pass_reward_for_level(level)
            conn.execute("INSERT INTO pass_claims (user_id, level, claimed_at) VALUES (?,?,?)", (uid, level, now))
            if reward["kind"] == "gems":
                conn.execute("UPDATE users SET gems = gems + ? WHERE id = ?", (int(reward["qty"]), uid))
            elif reward["kind"] == "box":
                box_id = str(reward.get("box_id") or "")
                qty = int(reward.get("qty") or 1)
                box = next((b for b in BOXES if b["id"] == box_id), None)
                cost = int(box["cost"]) if box else 0
                currency = str(box.get("currency") or "coins") if box else "coins"
                if currency == "gems":
                    conn.execute("UPDATE users SET gems = gems + ? WHERE id = ?", (cost * max(1, qty), uid))
                else:
                    conn.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (cost * max(1, qty), uid))
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "reward": reward})

    def _api_inventory(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        conn = _db()
        try:
            rows = conn.execute("SELECT item_id, qty FROM user_items WHERE user_id = ? AND qty > 0 ORDER BY item_id", (uid,)).fetchall()
        finally:
            conn.close()
        inv = []
        for r in rows:
            item = item_by_id(int(r["item_id"]))
            if not item:
                continue
            inv.append({"item": item, "qty": int(r["qty"])})
        json_response(self, HTTPStatus.OK, {"ok": True, "inventory": inv})

    def _api_buy_box(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        data = _read_json(self) or {}
        box_id = str(data.get("box_id") or "")
        box = next((b for b in BOXES if b["id"] == box_id), None)
        if not box:
            return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "box_not_found"})
        cost = int(box["cost"])
        conn = _db()
        now = int(time.time())
        try:
            currency = str(box.get("currency") or "coins")
            if currency == "gems":
                row = conn.execute("SELECT gems FROM users WHERE id = ?", (uid,)).fetchone()
                balance = int(row["gems"]) if row else 0
                if balance < cost:
                    return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "not_enough_gems", "need": cost})
                balance_field = "gems"
            else:
                row = conn.execute("SELECT coins FROM users WHERE id = ?", (uid,)).fetchone()
                balance = int(row["coins"]) if row else 0
                if balance < cost:
                    return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "not_enough_coins", "need": cost})
                balance_field = "coins"
            rarity = _weighted_choice(box["weights"])
            # 20% chance to drop a character unlock (if any are still locked).
            drop_kind = "item"
            unlocked_rows = conn.execute("SELECT character_id FROM unlocks WHERE user_id = ?", (uid,)).fetchall()
            unlocked = {int(r["character_id"]) for r in unlocked_rows}
            drawn_idx = RARITY_ORDER.index(rarity) if rarity in RARITY_ORDER else 0
            by_rarity: dict[str, list[dict]] = {}
            for entry in CHARACTER_DROP_TABLE:
                cid = int(entry["character_id"])
                if cid in unlocked:
                    continue
                rr = str(entry.get("rarity") or "Bronze")
                if rr not in RARITY_ORDER:
                    rr = "Bronze"
                ch = character_by_id(cid)
                if ch:
                    by_rarity.setdefault(rr, []).append(ch)

            # Prefer the rolled rarity; if none exist, fall back to lower rarities.
            eligible_chars: list[dict] = []
            for i in range(drawn_idx, -1, -1):
                rr = RARITY_ORDER[i]
                pool = by_rarity.get(rr) or []
                if pool:
                    eligible_chars = [{"character": ch, "rarity": rr} for ch in pool]
                    break

            if eligible_chars and secrets.randbelow(100) < 20:
                pick = secrets.choice(eligible_chars)
                drop_kind = "character"
                drop_payload = pick["character"]
                drop_rarity = pick["rarity"]
            else:
                pool = _items_of_rarity(rarity)
                if not pool:
                    rarity = "Bronze"
                    pool = _items_of_rarity(rarity)
                item = secrets.choice(pool)
                drop_payload = item
                drop_rarity = str(item.get("rarity") or rarity)
                item_id = int(item["id"])

            conn.execute(f"UPDATE users SET {balance_field} = {balance_field} - ? WHERE id = ?", (cost, uid))
            if drop_kind == "item":
                conn.execute(
                    "INSERT INTO user_items (user_id, item_id, qty) VALUES (?,?,1) "
                    "ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + 1",
                    (uid, item_id),
                )
            else:
                conn.execute(
                    "INSERT OR IGNORE INTO unlocks (user_id, character_id) VALUES (?, ?)",
                    (uid, int(drop_payload["id"])),
                )
            conn.execute(
                "INSERT OR IGNORE INTO profile (user_id, banner_item_id, background_item_id, frame_item_id, title_item_id, updated_at) VALUES (?,?,?,?,?,?)",
                (uid, None, None, None, None, now),
            )
            conn.execute("UPDATE profile SET updated_at = ? WHERE user_id = ?", (now, uid))
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "drop": drop_payload, "drop_kind": drop_kind, "rarity": drop_rarity, "cost": cost})

    def _api_equip_item(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            character_id = int(data.get("character_id", 0))
            item_id = int(data.get("item_id"))
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        if not character_by_id(character_id):
            return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "character_not_found"})
        item = item_by_id(item_id)
        if not item:
            return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "item_not_found"})
        if item.get("type") != "gear":
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "not_gear"})
        slot = str(item.get("slot") or "")
        if not slot:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_item"})
        conn = _db()
        try:
            have = conn.execute(
                "SELECT qty FROM user_items WHERE user_id = ? AND item_id = ?",
                (uid, item_id),
            ).fetchone()
            if not have or int(have["qty"]) <= 0:
                return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "not_owned"})
            conn.execute(
                "INSERT INTO equipment (user_id, character_id, slot, item_id) VALUES (?,?,?,?) "
                "ON CONFLICT(user_id, character_id, slot) DO UPDATE SET item_id=excluded.item_id",
                (uid, character_id, slot, item_id),
            )
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})

    def _api_profile(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        conn = _db()
        try:
            row = conn.execute(
                "SELECT banner_item_id, background_item_id, frame_item_id, title_item_id FROM profile WHERE user_id = ?",
                (uid,),
            ).fetchone()
        finally:
            conn.close()
        prof = {
            "banner_item_id": int(row["banner_item_id"]) if row and row["banner_item_id"] is not None else None,
            "background_item_id": int(row["background_item_id"]) if row and row["background_item_id"] is not None else None,
            "frame_item_id": int(row["frame_item_id"]) if row and row["frame_item_id"] is not None else None,
            "title_item_id": int(row["title_item_id"]) if row and row["title_item_id"] is not None else None,
        }
        json_response(self, HTTPStatus.OK, {"ok": True, "profile": prof})

    def _api_update_profile(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        data = _read_json(self) or {}
        fields = ["banner_item_id", "background_item_id", "frame_item_id", "title_item_id"]
        updates: dict[str, int | None] = {}
        for f in fields:
            if f not in data:
                continue
            v = data.get(f)
            if v is None:
                updates[f] = None
                continue
            try:
                item_id = int(v)
            except Exception:
                return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
            item = item_by_id(item_id)
            if not item or item.get("type") != "cosmetic":
                return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_item"})
            # must own
            conn = _db()
            try:
                have = conn.execute("SELECT qty FROM user_items WHERE user_id = ? AND item_id = ?", (uid, item_id)).fetchone()
            finally:
                conn.close()
            if not have or int(have["qty"]) <= 0:
                return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "not_owned"})
            updates[f] = item_id
        if not updates:
            return json_response(self, HTTPStatus.OK, {"ok": True})
        now = int(time.time())
        conn = _db()
        try:
            conn.execute(
                "INSERT OR IGNORE INTO profile (user_id, banner_item_id, background_item_id, frame_item_id, title_item_id, updated_at) VALUES (?,?,?,?,?,?)",
                (uid, None, None, None, None, now),
            )
            sets = ", ".join([f"{k} = ?" for k in updates.keys()] + ["updated_at = ?"])
            vals = list(updates.values()) + [now, uid]
            conn.execute(f"UPDATE profile SET {sets} WHERE user_id = ?", vals)
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})


    def _require_admin(self) -> int | None:
        uid = self._require_user()
        if uid is None:
            return None
        conn = _db()
        try:
            row = conn.execute("SELECT is_admin FROM users WHERE id = ?", (uid,)).fetchone()
            if not row or not int(row["is_admin"] if "is_admin" in row.keys() else 0):
                json_response(self, HTTPStatus.FORBIDDEN, {"ok": False, "error": "forbidden"})
                return None
            return uid
        finally:
            conn.close()

    def _api_admin_users(self) -> None:
        uid = self._require_admin()
        if uid is None:
            return
        conn = _db()
        try:
            rows = conn.execute(
                """
                SELECT u.id, u.username, u.coins, u.gems, u.is_admin, u.is_banned, u.created_at,
                       COALESCE(s.best_score, 0) AS best_score
                FROM users u
                LEFT JOIN scores s ON s.user_id = u.id
                ORDER BY u.id ASC
                """
            ).fetchall()
        finally:
            conn.close()
        users = [
            {
                "id": int(r["id"]),
                "username": str(r["username"]),
                "coins": int(r["coins"]),
                "gems": int(r["gems"] if "gems" in r.keys() else 0),
                "is_admin": int(r["is_admin"] if "is_admin" in r.keys() else 0),
                "is_banned": int(r["is_banned"] if "is_banned" in r.keys() else 0),
                "best_score": int(r["best_score"]),
                "created_at": int(r["created_at"]),
            }
            for r in rows
        ]
        json_response(self, HTTPStatus.OK, {"ok": True, "users": users})

    def _api_admin_ban(self) -> None:
        uid = self._require_admin()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            target_id = int(data.get("user_id"))
            ban = bool(data.get("ban", True))
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        conn = _db()
        try:
            row = conn.execute("SELECT id, is_admin FROM users WHERE id = ?", (target_id,)).fetchone()
            if not row:
                return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "user_not_found"})
            if int(row["is_admin"] if "is_admin" in row.keys() else 0):
                return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "cannot_ban_admin"})
            conn.execute("UPDATE users SET is_banned = ? WHERE id = ?", (1 if ban else 0, target_id))
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})

    def _api_admin_reset_password(self) -> None:
        uid = self._require_admin()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            target_id = int(data.get("user_id"))
            new_password = str(data.get("new_password") or "")
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        if len(new_password) < 6:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_password"})
        salt = secrets.token_bytes(16)
        pw_hash = _pbkdf(new_password, salt)
        conn = _db()
        try:
            row = conn.execute("SELECT id FROM users WHERE id = ?", (target_id,)).fetchone()
            if not row:
                return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "user_not_found"})
            conn.execute("UPDATE users SET pw_salt = ?, pw_hash = ? WHERE id = ?", (salt, pw_hash, target_id))
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})

    def _api_admin_gift(self) -> None:
        uid = self._require_admin()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            target_id = int(data.get("user_id"))
            gift_type = str(data.get("type") or "")
            amount = int(data.get("amount", 0))
            box_id = str(data.get("box_id") or "")
            note = str(data.get("note") or "")[:200]
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        if gift_type not in ("coins", "gems", "box", "character"):
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_type"})
        if gift_type == "box" and not any(b["id"] == box_id for b in BOXES):
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_box"})
        if gift_type in ("coins", "gems") and amount <= 0:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_amount"})
        if gift_type == "character" and not character_by_id(amount):
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "character_not_found"})
        now = int(time.time())
        conn = _db()
        try:
            row = conn.execute("SELECT id FROM users WHERE id = ?", (target_id,)).fetchone()
            if not row:
                return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "user_not_found"})
            conn.execute(
                "INSERT INTO admin_gifts (to_user_id, from_admin_id, type, amount, box_id, note, created_at) VALUES (?,?,?,?,?,?,?)",
                (target_id, uid, gift_type, amount, box_id, note, now),
            )
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})

    def _api_admin_delete_user(self) -> None:
        uid = self._require_admin()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            target_id = int(data.get("user_id"))
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        conn = _db()
        try:
            row = conn.execute("SELECT id, is_admin FROM users WHERE id = ?", (target_id,)).fetchone()
            if not row:
                return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "user_not_found"})
            if int(row["is_admin"] if "is_admin" in row.keys() else 0):
                return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "cannot_delete_admin"})
            # ON DELETE CASCADE removes all related rows automatically
            conn.execute("DELETE FROM users WHERE id = ?", (target_id,))
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True})

    def _api_admin(self, path: str) -> None:
        if path == "/api/admin/users":
            return self._api_admin_users()
        if path == "/api/admin/ban":
            return self._api_admin_ban()
        if path == "/api/admin/reset_password":
            return self._api_admin_reset_password()
        if path == "/api/admin/gift":
            return self._api_admin_gift()
        if path == "/api/admin/delete_user":
            return self._api_admin_delete_user()
        return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "not_found"})

    def _api_gifts(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        conn = _db()
        try:
            rows = conn.execute(
                """
                SELECT g.id, g.type, g.amount, g.box_id, g.note, g.created_at,
                       u.username AS from_username
                FROM admin_gifts g
                JOIN users u ON u.id = g.from_admin_id
                WHERE g.to_user_id = ? AND g.claimed_at IS NULL
                ORDER BY g.created_at DESC
                """,
                (uid,),
            ).fetchall()
        finally:
            conn.close()
        gifts = [
            {
                "id": int(r["id"]),
                "type": str(r["type"]),
                "amount": int(r["amount"] or 0),
                "box_id": str(r["box_id"] or ""),
                "note": str(r["note"] or ""),
                "from_username": str(r["from_username"]),
                "created_at": int(r["created_at"]),
            }
            for r in rows
        ]
        json_response(self, HTTPStatus.OK, {"ok": True, "gifts": gifts})

    def _api_claim_gift(self) -> None:
        uid = self._require_user()
        if uid is None:
            return
        data = _read_json(self) or {}
        try:
            gift_id = int(data.get("gift_id"))
        except Exception:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"ok": False, "error": "bad_request"})
        now = int(time.time())
        conn = _db()
        try:
            gift = conn.execute(
                "SELECT id, to_user_id, type, amount, box_id FROM admin_gifts WHERE id = ? AND to_user_id = ? AND claimed_at IS NULL",
                (gift_id, uid),
            ).fetchone()
            if not gift:
                return json_response(self, HTTPStatus.NOT_FOUND, {"ok": False, "error": "gift_not_found"})
            gift_type = str(gift["type"])
            amount = int(gift["amount"] or 0)
            box_id = str(gift["box_id"] or "")

            conn.execute("UPDATE admin_gifts SET claimed_at = ? WHERE id = ?", (now, gift_id))

            drop_result = None
            if gift_type == "coins":
                conn.execute("UPDATE users SET coins = coins + ? WHERE id = ?", (amount, uid))
            elif gift_type == "gems":
                conn.execute("UPDATE users SET gems = gems + ? WHERE id = ?", (amount, uid))
            elif gift_type == "character":
                char = character_by_id(amount)
                if char:
                    conn.execute("INSERT OR IGNORE INTO unlocks (user_id, character_id) VALUES (?,?)", (uid, amount))
            elif gift_type == "box":
                box = next((b for b in BOXES if b["id"] == box_id), None)
                if box:
                    rarity = _weighted_choice(box["weights"])
                    unlocked_rows = conn.execute("SELECT character_id FROM unlocks WHERE user_id = ?", (uid,)).fetchall()
                    unlocked = {int(r["character_id"]) for r in unlocked_rows}
                    drawn_idx = RARITY_ORDER.index(rarity) if rarity in RARITY_ORDER else 0
                    by_rarity: dict[str, list[dict]] = {}
                    for entry in CHARACTER_DROP_TABLE:
                        cid_c = int(entry["character_id"])
                        if cid_c in unlocked:
                            continue
                        rr = str(entry.get("rarity") or "Bronze")
                        ch = character_by_id(cid_c)
                        if ch:
                            by_rarity.setdefault(rr, []).append(ch)
                    eligible_chars: list[dict] = []
                    for i in range(drawn_idx, -1, -1):
                        rr = RARITY_ORDER[i]
                        pool = by_rarity.get(rr) or []
                        if pool:
                            eligible_chars = [{"character": ch, "rarity": rr} for ch in pool]
                            break
                    if eligible_chars and secrets.randbelow(100) < 20:
                        pick = secrets.choice(eligible_chars)
                        drop_kind = "character"
                        drop_payload = pick["character"]
                        drop_rarity = pick["rarity"]
                        conn.execute("INSERT OR IGNORE INTO unlocks (user_id, character_id) VALUES (?,?)", (uid, int(drop_payload["id"])))
                    else:
                        pool = _items_of_rarity(rarity)
                        if not pool:
                            pool = _items_of_rarity("Bronze")
                        item = secrets.choice(pool)
                        drop_payload = item
                        drop_rarity = str(item.get("rarity") or rarity)
                        item_id = int(item["id"])
                        drop_kind = "item"
                        conn.execute(
                            "INSERT INTO user_items (user_id, item_id, qty) VALUES (?,?,1) "
                            "ON CONFLICT(user_id, item_id) DO UPDATE SET qty = qty + 1",
                            (uid, item_id),
                        )
                    drop_result = {"drop": drop_payload, "drop_kind": drop_kind, "rarity": drop_rarity, "box_id": box_id}
            conn.commit()
        finally:
            conn.close()
        json_response(self, HTTPStatus.OK, {"ok": True, "gift_type": gift_type, "drop_result": drop_result})


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    init_db()
    if SESSION_SECRET == _DEFAULT_SECRET.encode("utf-8"):
        print("WARN: PARKOUR_SESSION_SECRET ist nicht gesetzt (nur für lokale Tests ok).")
    httpd = ThreadingHTTPServer((HOST, PORT), ParkourHandler)
    print(f"Parkour läuft auf http://localhost:{PORT}  (Host: {HOST})")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
