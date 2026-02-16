import express from "express";
import multer from "multer";
import { fileURLToPath } from "url";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import fs from "fs";

const app = express();
const upload = multer();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const txt = fs.readFileSync(envPath, "utf8");
  txt.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([^#\s=]+)\s*=\s*(.*)\s*$/);
    if (!m) return;
    const k = m[1];
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  });
}
const CONVEX_URL = (process.env.CONVEX_URL || "https://striped-weasel-716.convex.cloud").trim();
if (!CONVEX_URL.startsWith("http")) {
  throw new Error(`CONVEX_URL is missing/invalid: "${CONVEX_URL}"`);
}
const client = new ConvexHttpClient(CONVEX_URL);
app.use(express.json({ limit: "10mb" }));

const webRoot = path.resolve(__dirname, "..");
app.use(express.static(webRoot));

app.get("/api/list", async (req, res) => {
  try {
    const { date } = req.query;
    const rows = await client.query("entries:listByDate", { date: String(date || "") });
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: "list_failed" });
  }
});

app.post("/api/entry", async (req, res) => {
  try {
    const { date, taskKey, completed, description, imageStorageId, imageStorageIds, clearImage } = req.body || {};
    const r = await client.mutation("entries:save", {
      date: String(date || ""),
      taskKey: String(taskKey || ""),
      completed: !!completed,
      description: String(description || ""),
      imageStorageId: imageStorageId || null,
      imageStorageIds: Array.isArray(imageStorageIds) ? imageStorageIds : undefined,
      clearImage: !!clearImage
    });
    res.json({ ok: true, result: r });
  } catch (e) {
    res.status(500).json({ ok: false, error: "save_failed" });
  }
});

app.post("/api/upload_multi", upload.array("images", 5), async (req, res) => {
  try {
    const { date, taskKey, completed, description } = req.body || {};
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ ok: false, error: "no_files" });
    const storageIds = [];
    for (const image of files) {
      const up = await client.mutation("images:getUploadUrl", { contentType: image.mimetype || "image/jpeg" });
      const r = await fetch(up.url, {
        method: "POST",
        headers: { "Content-Type": image.mimetype || "image/jpeg" },
        body: image.buffer
      });
      const json = await r.json();
      const storageId = json.storageId || json.storage_id || null;
      if (storageId) storageIds.push(storageId);
    }
    await client.mutation("entries:save", {
      date: String(date || ""),
      taskKey: String(taskKey || ""),
      completed: !!completed,
      description: String(description || ""),
      imageStorageIds: storageIds
    });
    const urls = [];
    for (const sid of storageIds) {
      const u = await client.query("images:getUrl", { storageId: sid });
      urls.push(u);
    }
    res.json({ ok: true, storageIds, imageUrls: urls });
  } catch (e) {
    res.status(500).json({ ok: false, error: "upload_multi_failed" });
  }
});

app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    const { date, taskKey, completed, description } = req.body || {};
    const image = req.file;
    if (!image) return res.status(400).json({ ok: false, error: "no_file" });
    const up = await client.mutation("images:getUploadUrl", { contentType: image.mimetype || "image/jpeg" });
    const r = await fetch(up.url, {
      method: "POST",
      headers: { "Content-Type": image.mimetype || "image/jpeg" },
      body: image.buffer
    });
    const json = await r.json();
    const storageId = json.storageId || json.storage_id || null;
    await client.mutation("entries:save", {
      date: String(date || ""),
      taskKey: String(taskKey || ""),
      completed: !!completed,
      description: String(description || ""),
      imageStorageId: storageId
    });
    const imageUrl = await client.query("images:getUrl", { storageId });
    res.json({ ok: true, storageId, imageUrl });
  } catch (e) {
    res.status(500).json({ ok: false, error: "upload_failed" });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
