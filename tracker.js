const express = require("express");
const axios = require("axios");
const Parser = require("rss-parser");

const app = express();
const parser = new Parser();

const FEED_URL = "https://status.openai.com/feed.atom";
const POLL_INTERVAL = 30 * 1000; // 30 seconds

let latestIncident = null;
let lastCheckedAt = null;

function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function extractStatus(text = "") {
  const match = text.match(/Status:\s*([^\n]+)/i);
  return match ? match[1].trim() : "Unknown";
}

function formatTime(date) {
  return new Date(date).toISOString().replace("T", " ").slice(0, 19);
}

async function pollFeed() {
  try {
    const response = await axios.get(FEED_URL, { timeout: 10000 });
    const feed = await parser.parseString(response.data);

    if (!feed.items || !feed.items.length) return;

    const latest = feed.items[0];

    const cleanText = stripHtml(
      latest.content || latest.contentSnippet || latest.summary || ""
    );

    latestIncident = {
      product: latest.title,
      status: extractStatus(cleanText),
      time: formatTime(latest.isoDate),
      link: latest.link,
    };

    lastCheckedAt = formatTime(new Date());

    console.log(
      `[${latestIncident.time}] Product: ${latestIncident.product}\n` +
      `Status: ${latestIncident.status}\n`
    );
  } catch (err) {
    console.error("Polling error:", err.message);
  }
}

app.get("/", (_, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");

  if (!latestIncident) {
    return res.send("No incidents detected yet.");
  }

  res.send(
    `[${latestIncident.time}] Product: ${latestIncident.product}\n` +
    `Status: ${latestIncident.status}`
  );
});

app.get("/health", (_, res) => {
  res.send("OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  pollFeed();
  setInterval(pollFeed, POLL_INTERVAL);
});
