const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const ROOT = path.join(__dirname, 'resources');
const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_NAMESPACE_ID = process.env.CF_NAMESPACE_ID;

// Cache file to store previous hashes
const CACHE_FILE = '.kv-sync-cache.json';
let cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE)) : {};

function getKVKey(filePath) {
  const rel = path.relative(ROOT, filePath);
  const ext = path.extname(rel).slice(1);
  const base = path.basename(rel, path.extname(rel));
  const parts = rel.split(path.sep);

  if (parts.length === 2) {
    return `${parts[0]}:/${base}`;
  } else {
    return `${ext}:/${base}`;
  }
}

function hashContent(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function uploadToKV(key, value) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: value,
  });

  if (!res.ok) {
    console.error(`❌ Failed to upload ${key}: ${res.statusText}`);
  } else {
    console.log(`✅ Uploaded ${key}`);
  }
}

function walkAndSync(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkAndSync(fullPath);
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = hashContent(content);
      const key = getKVKey(fullPath);

      if (cache[key] !== hash) {
        uploadToKV(key, content);
        cache[key] = hash;
      } else {
        console.log(`⏩ Skipped unchanged ${key}`);
      }
    }
  }
}

walkAndSync(ROOT);

// Save updated cache
fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));