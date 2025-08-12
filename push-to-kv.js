const fs = require('fs');
const path = require('path');
// fetch is now a native function in Node.js v18+, so we no longer need to require 'node-fetch'.
require('dotenv').config();

// --- Configuration ---
// IMPORTANT: Replace with your actual Cloudflare credentials
const API_TOKEN = process.env.API_TOKEN;;
const ACCOUNT_ID = process.env.ACCOUNT_ID;
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID; // Your KV namespace ID
const BASE_DIR = path.join(__dirname, 'resources');
const TYPES = ['js', 'css', 'html'];
const isDryRun = process.argv.includes('--dry-run');

// Check if credentials are set
if (API_TOKEN === 'YOUR_API_TOKEN_HERE' || ACCOUNT_ID === 'YOUR_ACCOUNT_ID_HERE') {
    console.error('❌ Please set your Cloudflare API Token and Account ID in the script before running.');
    process.exit(1);
}

/**
 * Uploads a single file to the specified KV namespace using the Cloudflare API.
 * This function uses a direct HTTP request, bypassing the wrangler CLI.
 * @param {string} kvKey - The key to store the file under in KV.
 * @param {string} filePath - The local path to the file to upload.
 */
async function uploadToKV(kvKey, filePath) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(kvKey)}`;

    if (isDryRun) {
        console.log(`🧪 [Dry Run] Would upload ${filePath} to KV key "${kvKey}" via API.`);
        return;
    }

    console.log(`🔄 Uploading ${filePath} to KV key "${kvKey}" via API...`);

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'text/plain',
                'Authorization': `Bearer ${API_TOKEN}`,
            },
            body: fileContent,
        });

        const result = await response.json();

        if (response.ok) {
            console.log(`✅ Successfully uploaded ${kvKey}`);
        } else {
            console.error(`❌ Failed to upload ${kvKey}. API responded with status ${response.status}.`);
            console.error('   API Error:', result.errors ? result.errors[0].message : 'Unknown error');
        }
    } catch (error) {
        console.error(`❌ An unexpected error occurred while uploading ${kvKey}: ${error.message}`);
    }
}

/**
 * Reads a directory for files of a specific type and uploads them.
 * @param {string} type - The subdirectory name and file extension (e.g., 'js', 'css').
 */
async function syncFolder(type) {
    const folderPath = path.join(BASE_DIR, type);
    if (!fs.existsSync(folderPath)) {
        console.warn(`⚠️ Directory not found, skipping: ${folderPath}`);
        return;
    }

    const files = fs.readdirSync(folderPath);
    for (const file of files) {
        const fullPath = path.join(folderPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) continue;

        const ext = path.extname(file).slice(1);
        const name = path.basename(file, `.${ext}`);

        if (ext !== type) continue;

        const kvKey = `${type}:/${name}`;
        await uploadToKV(kvKey, fullPath);
    }
}

/**
 * Syncs files located in the root of the BASE_DIR.
 */
async function syncRootFolder() {
    if (!fs.existsSync(BASE_DIR)) {
        console.error(`❌ Base directory not found, exiting: ${BASE_DIR}`);
        process.exit(1);
    }
    const files = fs.readdirSync(BASE_DIR);
    for (const file of files) {
        const fullPath = path.join(BASE_DIR, file);
        if (fs.statSync(fullPath).isDirectory()) continue;

        const ext = path.extname(file).slice(1);
        if (!TYPES.includes(ext)) continue;

        const name = path.basename(file, `.${ext}`);
        const kvKey = `${ext}:/${name}`;
        await uploadToKV(kvKey, fullPath);
    }
}

// --- Main Execution ---
async function main() {
    console.log(`🚀 Starting KV sync for environment: "production" via Cloudflare API...`);

    // Sync subfolders (e.g., resources/js, resources/css)
    for (const type of TYPES) {
        await syncFolder(type);
    }

    // Sync root-level files (e.g., files directly in resources/)
    await syncRootFolder();

    console.log(isDryRun ? '✅ Dry run complete.' : '✅ KV sync complete.');
}

main().catch(err => {
    console.error('An unhandled error occurred:', err);
    process.exit(1);
});
