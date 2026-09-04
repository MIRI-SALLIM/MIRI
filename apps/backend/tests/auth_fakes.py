"""Test-only storage for exercising services and HTTP routes without MongoDB."""
from datetime import datetime
from uuid import uuid4

from auth.models import Principal
from auth.repository import CHALLENGE_LIFETIME, SESSION_LIFETIME, AuthRepository


class FakeAuthRepository(AuthRepository):
    def __init__(self):
        self.challenges = {}
        self.users = {}
        self.sessions = {}
        self.attempts = {}

    async def ensure_indexes(self):
        pass

    async def create_challenge(self, state_hash, browser_hash, return_to, now):
        self.challenges[state_hash] = {"browserHash": browser_hash, "returnTo": return_to,
                                       "expiresAt": now + CHALLENGE_LIFETIME}

    async def consume_challenge(self, state_hash, browser_hash, now):
        challenge = self.challenges.get(state_hash)
        if not challenge or challenge["browserHash"] != browser_hash or challenge["expiresAt"] <= now:
            return None
        return self.challenges.pop(state_hash)

    async def upsert_user(self, kakao_id, now):
        user_id = self.users.setdefault(kakao_id, str(uuid4()))
        return Principal(user_id, now)

    async def issue_session(self, user_id, token_hash, now):
        self.sessions[token_hash] = {"userId": user_id, "issuedAt": now, "expiresAt": now + SESSION_LIFETIME}

    async def lookup_session(self, token_hash, now):
        session = self.sessions.get(token_hash)
        if not session or session["expiresAt"] <= now or session["userId"] not in self.users.values():
            return None
        return Principal(session["userId"], session["issuedAt"])

    async def revoke_session(self, token_hash):
        self.sessions.pop(token_hash, None)

    async def allow_attempt(self, ip_hash: str, action: str, limit: int, now: datetime) -> bool:
        key = (ip_hash, action, int(now.timestamp()) // 600)
        self.attempts[key] = self.attempts.get(key, 0) + 1
        return self.attempts[key] <= limit
