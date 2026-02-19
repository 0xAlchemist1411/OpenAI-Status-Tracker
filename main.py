import asyncio
import re
import os
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from html.parser import HTMLParser

import httpx
import feedparser
from fastapi import FastAPI
from fastapi.responses import PlainTextResponse


FEED_URL = "https://status.openai.com/feed.atom"
POLL_INTERVAL = 30  # seconds

latest_incident: dict | None = None
last_checked_at: str | None = None


class _HTMLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def get_text(self) -> str:
        return " ".join(self._parts).strip()


def strip_html(html: str = "") -> str:
    stripper = _HTMLStripper()
    stripper.feed(html)
    raw = stripper.get_text()
    return re.sub(r"\s+", " ", raw).strip()


def extract_status(text: str = "") -> str:
    match = re.search(r"Status:\s*([^\n]+)", text, re.IGNORECASE)
    return match.group(1).strip() if match else "Unknown"


def format_time(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S")


async def poll_feed() -> None:
    global latest_incident, last_checked_at

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(FEED_URL)
            response.raise_for_status()

        feed = feedparser.parse(response.text)

        if not feed.entries:
            return

        latest = feed.entries[0]

        raw_content = (
            latest.get("content", [{}])[0].get("value", "")
            or latest.get("summary", "")
            or latest.get("title", "")
        )
        clean_text = strip_html(raw_content)

        published = latest.get("published_parsed") or latest.get("updated_parsed")
        if published:
            dt = datetime(*published[:6], tzinfo=timezone.utc)
        else:
            dt = datetime.now(timezone.utc)

        latest_incident = {
            "product": latest.get("title", "Unknown"),
            "status": extract_status(clean_text),
            "time": format_time(dt),
            "link": latest.get("link", ""),
        }

        print(
            f"[{latest_incident['time']}] Product: {latest_incident['product']}\n"
            f"Status: {latest_incident['status']}\n"
        )

    except Exception as exc:
        print(f"Polling error: {exc}")


async def _polling_loop() -> None:
    await poll_feed()
    while True:
        await asyncio.sleep(POLL_INTERVAL)
        await poll_feed()

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_polling_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="OpenAI Status Tracker", lifespan=lifespan)

@app.get("/status", response_class=PlainTextResponse)
async def get_status() -> str:
    if latest_incident is None:
        return "No incidents detected yet."
    return (
        f"[{latest_incident['time']}] Product: {latest_incident['product']}\n"
        f"Status: {latest_incident['status']}\n"
        f"Last checked: {last_checked_at}"
    )


@app.get("/health", response_class=PlainTextResponse)
async def health() -> str:
    return "OK"

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    print(f"Server running on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
