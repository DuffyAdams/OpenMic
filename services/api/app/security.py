"""Credentials.

* Participant (guest/host) tokens and TV device secrets are opaque random strings. Only their
  SHA-256 hash is stored, so a database leak does not leak usable credentials, and revoking is a
  row update.
* Admin tokens and host-invite tokens are short HMAC-signed payloads (itsdangerous), so they can
  expire without any database state.
"""

import hashlib
import hmac
import secrets

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

PARTICIPANT_PREFIX = "p_"
DEVICE_PREFIX = "d_"
ADMIN_PREFIX = "a_"

# No 0/O, 1/I/L: codes are read off a TV across a room.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def new_token(prefix: str) -> str:
    return prefix + secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_code(length: int = 6) -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))


def normalize_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def passwords_match(supplied: str, expected: str) -> bool:
    if not expected:
        return False
    return hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))


class Signer:
    def __init__(self, secret_key: str):
        self._serializer = URLSafeTimedSerializer(secret_key)

    def sign(self, payload: dict, salt: str) -> str:
        return self._serializer.dumps(payload, salt=salt)

    def unsign(self, token: str, salt: str, max_age_seconds: int) -> dict | None:
        try:
            data = self._serializer.loads(token, salt=salt, max_age=max_age_seconds)
        except (BadSignature, SignatureExpired):
            return None
        return data if isinstance(data, dict) else None

    def admin_token(self) -> str:
        return ADMIN_PREFIX + self.sign({"adm": 1}, salt="admin")

    def verify_admin_token(self, token: str, max_age_seconds: int) -> bool:
        if not token.startswith(ADMIN_PREFIX):
            return False
        data = self.unsign(token[len(ADMIN_PREFIX) :], "admin", max_age_seconds)
        return bool(data and data.get("adm") == 1)

    def host_invite(self, party_id: str) -> str:
        return self.sign({"hi": party_id}, salt="host-invite")

    def verify_host_invite(self, token: str, max_age_seconds: int) -> str | None:
        data = self.unsign(token, "host-invite", max_age_seconds)
        return data.get("hi") if data else None
