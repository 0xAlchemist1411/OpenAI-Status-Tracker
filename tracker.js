const Parser = require("rss-parser");
const parser = new Parser();

const FEED_URL = "https://status.openai.com/history.atom";
const POLL_INTERVAL = 5 * 1000; // every 5 sec

const seenIds = new Set();
let hasPrintedInitialMessage = false;

function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, "").trim();
}

function extractStatus(description = "") {
  const match = description.match(/Status:\s*(.*)/i);
  return match ? match[1].trim() : "Unknown";
}

function formatTime(date) {
  return new Date(date).toISOString().replace("T", " ").slice(0, 19);
}

async function checkFeed() {
  try {
    const feed = await parser.parseURL(FEED_URL);
    const items = [...feed.items].reverse();

    let foundNewIncident = false;

    for (const item of items) {
      const id = item.guid || item.link;
      if (!id || seenIds.has(id)) continue;

      seenIds.add(id);
      foundNewIncident = true;
      hasPrintedInitialMessage = false;

      const product = item.title;
      const description = stripHtml(
        item.content || item.contentSnippet || item.description
      );
      const status = extractStatus(description);

      console.log(
        `[${formatTime(item.pubDate)}] Product: ${product}\n` +
        `Status: ${status}\n`
      );
    }

    if (!foundNewIncident && !hasPrintedInitialMessage) {
      console.log(
        `[${formatTime(new Date())}] No new OpenAI incidents. Monitoring...\n`
      );
      hasPrintedInitialMessage = true;
    }
  } catch (err) {
    console.error("Error fetching feed:", err.message);
  }
}

async function init() {
  console.log("🔍 Watching OpenAI Status Page...\n");

  const feed = await parser.parseURL(FEED_URL);
  feed.items.forEach(item => {
    const id = item.guid || item.link;
    if (id) seenIds.add(id);
  });

  await checkFeed();

  setInterval(checkFeed, POLL_INTERVAL);
}

init();
