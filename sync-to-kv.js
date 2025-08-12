import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, 'resources');

const CF_API_TOKEN = process.env.CF_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_NAMESPACE_ID = process.env.CF_NAMESPACE_ID;

const CACHE_FILE = '.kv-sync-cache.json';
let cache = fs.existsSync(CACHE_FILE)
  ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
  : {};

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
    console.error(`❌ Failed to upload ${key}: ${res.status} ${res.statusText}`);
  } else {
    console.log(`✅ Uploaded ${key}`);
  }
}

async function walkAndSync(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAndSync(fullPath);
    } else {
      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = hashContent(content);
      const key = getKVKey(fullPath);

      if (cache[key] !== hash) {
        await uploadToKV(key, content);
        cache[key] = hash;
      } else {
        console.log(`⏩ Skipped unchanged ${key}`);
      }
    }
  }
}

try {
  await walkAndSync(ROOT);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log('✅ KV sync completed successfully.');
} catch (err) {
  console.error('❌ KV sync failed:', err.message);
  process.exit(1);
}
