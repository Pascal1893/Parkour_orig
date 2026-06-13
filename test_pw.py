import sqlite3, hashlib

conn = sqlite3.connect('c:/ich/Parkour/Parkourapp/data.sqlite3')
conn.row_factory = sqlite3.Row
row = conn.execute('SELECT id, pw_salt, pw_hash FROM users WHERE username="admin-pwo"').fetchone()

salt = bytes(row['pw_salt'])
expected = bytes(row['pw_hash'])
actual = hashlib.pbkdf2_hmac('sha256', '1893!wopi007'.encode('utf-8'), salt, 200_000)

print(f'salt:     {salt.hex()}')
print(f'expected: {expected.hex()}')
print(f'actual:   {actual.hex()}')
print(f'match:    {expected == actual}')
