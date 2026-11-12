/* Refresh the attributed metadata snapshot; never downloads media files. */
const { writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const Memes = require("./dist/memes.js");
(async () => {
  const data = await Memes.catalog();
  if (!data.items.length) throw Error("No media returned; keeping the previous snapshot.");
  // Keep a small but representative opening collection, including clips.
  const counts = new Map();
  data.items = data.items.filter(i => {
    const key = i.sourceId + "|" + i.category;
    const count = counts.get(key) || 0;
    counts.set(key, count + 1);
    return count < (i.category === "Videos" ? 8 : 10);
  });
  data.live = false;
  data.next = null;
  data.note = "Starter snapshot · " + new Date(data.collectedAt).toLocaleDateString("en-US", { timeZone: "America/Chicago" }) + ". Live feeds refresh when connected. Media is source-hosted.";
  await writeFile(join(__dirname, "dist/memes.json"), JSON.stringify(data, null, 2) + "\n");
  console.log(JSON.stringify({ items: data.items.length, videos: data.items.filter(i => i.tags.includes("Videos")).length, sources: data.sources }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
