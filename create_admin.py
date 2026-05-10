#!/usr/bin/env python3
"""
Script to create an admin user in the database.
Usage: python create_admin.py
"""
import sqlite3
import hashlib
import secrets
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data.sqlite3"

def _pbkdf(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)

def create_admin():
    username = "admin-pwo"
    password = "1893!wopi007"
    
    salt = secrets.token_bytes(16)
    pw_hash = _pbkdf(password, salt)
    now = int(time.time())
    
    conn = sqlite3.connect(DB_PATH)
    try:
        # Check if user already exists
        existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if existing:
            print(f"❌ Benutzer '{username}' existiert bereits (ID: {existing[0]})")
            return
        
        # Insert new admin user with generous starting resources
        cur = conn.execute(
            "INSERT INTO users (username, pw_salt, pw_hash, coins, gems, selected_character, created_at, is_admin) VALUES (?,?,?,?,?,?,?,?)",
            (username, salt, pw_hash, 10000, 1000, 0, now, 1),
        )
        user_id = int(cur.lastrowid)

        # Insert default character unlock
        conn.execute("INSERT OR IGNORE INTO unlocks (user_id, character_id) VALUES (?, ?)", (user_id, 0))

        # Insert score record
        conn.execute("INSERT OR IGNORE INTO scores (user_id, best_score, updated_at) VALUES (?, ?, ?)", (user_id, 0, now))

        # Insert profile record
        conn.execute("INSERT OR IGNORE INTO profile (user_id, banner_item_id, background_item_id, frame_item_id, title_item_id, updated_at) VALUES (?,?,?,?,?,?)", (user_id, None, None, None, None, now))

        conn.commit()
        print(f"Admin-Benutzer erstellt!")
        print(f"   Username: {username}")
        print(f"   Passwort: {password}")
        print(f"   ID: {user_id}")
        print(f"   is_admin: 1")
        print(f"   Coins: 10000")
        print(f"   Gems: 1000")
        
    except sqlite3.IntegrityError as e:
        print(f"❌ Fehler beim Erstellen des Benutzers: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    create_admin()
