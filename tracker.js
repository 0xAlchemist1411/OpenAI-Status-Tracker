const Parser = require("rss-parser");
const parser = new Parser();

const FEED_URL = "https://status.openai.com/feed.atom";

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

async function run() {
  try {
    const feed = await parser.parseURL(FEED_URL);

    if (!feed.items.length) {
      console.log("No incidents found.");
      return;
    }

    const latest = feed.items[0];

    const cleanText = stripHtml(
      latest.content || latest.contentSnippet || latest.summary || ""
    );

    const status = extractStatus(cleanText);

    console.log(
      `[${formatTime(latest.isoDate)}] Product: ${latest.title}\n` +
      `Status: ${status}\n`
    );
  } catch (err) {
    console.error("Error fetching feed:", err.message);
    process.exit(1);
  }
}

run();