import time
from collections import defaultdict, deque

from app.errors import AppError


class RateLimiter:
    """In-memory sliding-window limiter. The API runs as a single process, so this is exact."""

    def __init__(self, limit: int, window_seconds: float, name: str):
        self.limit = limit
        self.window = window_seconds
        self.name = name
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            retry_after = max(1, int(self.window - (now - hits[0])) + 1)
            raise AppError(
                429,
                "rate_limited",
                "Slow down a little and try again in a moment.",
                retry_after=retry_after,
                limit=self.name,
            )
        hits.append(now)
        if len(self._hits) > 10_000:  # keep memory bounded
            self._prune(now)

    def _prune(self, now: float) -> None:
        for key in [k for k, v in self._hits.items() if not v or now - v[-1] > self.window]:
            del self._hits[key]

    def reset(self) -> None:
        self._hits.clear()


class Limits:
    def __init__(self):
        # Per IP. A whole party usually shares one home IP (NAT), so these allow a crowd joining
        # at once while still making join-code guessing hopeless.
        self.join = RateLimiter(60, 60, "join")
        self.lookup = RateLimiter(120, 60, "lookup")
        self.search = RateLimiter(15, 60, "search")
        self.resolve = RateLimiter(30, 60, "resolve")
        self.enqueue = RateLimiter(12, 60, "enqueue")
        self.admin_login = RateLimiter(6, 60, "admin_login")
        self.register = RateLimiter(10, 60, "register")

    def reset(self) -> None:
        for limiter in vars(self).values():
            limiter.reset()
