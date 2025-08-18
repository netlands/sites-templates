import { config, inMemoryCache } from './worker.js';
// --- New, optimized caching functions ---

/**
 * Handles caching for a given request and URL. Tries to return a cached response first;
 * if not found, fetches from the network and updates the cache. Falls back to stale cache on error.
 *
 * @param {Request} request The incoming request.
 * @param {string} cacheUrl The URL to fetch and cache.
 * @param {number} cacheDurationSeconds The time-to-live for the cached asset in seconds.
 * @param {ExecutionContext} ctx The Cloudflare Worker's context object (to use `waitUntil`).
 * @returns {Promise<Response>} The response from the cache or the network.
 */
export async function cacheHelper(request, cacheUrl, cacheDurationSeconds, ctx) {
    const cache = caches.default;
    const cacheKey = new Request(cacheUrl, request); // Use the URL to be fetched as the key.
    
    // Try to find a cached response first.
    let response = await cache.match(cacheKey);
  
    if (!response) {
      // Cache miss, or no-store, so fetch from the network.
      try {
        const originResponse = await fetch(cacheUrl);
        
        // Check if the response is valid before caching
        if (originResponse.ok) {
          // We create a new response to cache, as the body can only be read once.
          const headers = new Headers(originResponse.headers);
          headers.set('Cache-Control', `max-age=${config.cacheDurationSeconds}, public, immutable`);
          response = new Response(originResponse.body, {
            status: originResponse.status,
            statusText: originResponse.statusText,
            headers: headers
          });
          
          // Use waitUntil to ensure the cache is updated asynchronously
          ctx.waitUntil(cache.put(cacheKey, response.clone()));
        } else {
          // Network fetch failed, throw an error to trigger the catch block.
          throw new Error(`Failed to fetch from origin: ${originResponse.statusText}`);
        }
      } catch (error) {
        console.error(`Fetch error for ${cacheUrl}: ${error.message}`);
        
        // Fallback: If network failed, try to return a stale cached response if one exists.
        const staleResponse = await cache.match(cacheKey);
        if (staleResponse) {
          console.log(`Returning stale cache for ${cacheUrl} due to network error.`);
          return staleResponse;
        }
        
        // If all else fails, return a generic error response.
        return new Response('An error occurred while fetching the resource.', { status: 503 });
      }
    }
  
    return response;
  }
  
  /**
   * Performs a HEAD request to check if a resource exists and caches the boolean result.
   * This is more efficient than a full GET request and is useful for checking assets like logos.
   *
   * @param {URL} url The URL to check.
   * @param {ExecutionContext} ctx The Cloudflare Worker's context object.
   * @returns {Promise<boolean>} True if the resource exists, false otherwise.
   */
  export async function checkContentExistsAndCache(url, ctx) {
    // Use a distinct cache key to avoid collisions with the full content cache.
    const cacheKey = new Request(url.toString() + '-exists');
    const cache = caches.default;
    let response = await cache.match(cacheKey);
  
    if (!response) {
      try {
        const headResponse = await fetch(new Request(url, { method: 'HEAD' }));
        const exists = headResponse.ok;
        
        const existsResponse = new Response(exists.toString(), {
          headers: { 'Cache-Control': 'public, max-age=86400, immutable' }, // Cache for 1 day
        });
        
        ctx.waitUntil(cache.put(cacheKey, existsResponse));
        return exists;
      } catch (error) {
        console.error(`HEAD request failed for ${url}: ${error.message}`);
        // Default to true to prevent breaking the site if the check fails.
        return true;
      }
    }
  
    // Await the text() to get the boolean value
    const existsText = await response.text();
    return existsText === 'true';
  }

  /**
   * Retrieves a value from KV storage with in-memory caching for the specified duration.
   * Returns the cached value if available and valid, otherwise fetches from KV and updates the cache.
   *
   * @param {any} env The environment object containing KV namespaces.
   * @param {string} key The key to retrieve from KV.
   * @param {number} [cacheSeconds=3600] The cache duration in seconds.
   * @returns {Promise<any>} The value from cache or KV.
   */
  export async function getCachedKV(env, key, cacheSeconds = 3600) {
    const now = Date.now();
    if (inMemoryCache[key] && (now - inMemoryCache[key].ts < cacheSeconds * 1000)) {
      console.log(`[CACHE HIT] ${key}`);
      return inMemoryCache[key].value;
    }
    console.log(`[CACHE MISS] ${key}`);
    const value = await env.GALLERY.get(key);
    inMemoryCache[key] = { value, ts: now };
    return value;
  }


/**
 * Escapes HTML special characters to prevent injection in titles and other content.
 *
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


/**
 * Resizes a Blogger image URL to the specified size.
 *
 * @param {string} imageUrl The original image URL.
 * @param {string} size The size string (e.g., "s200", "s0").
 * @returns {string} The resized image URL.
 */
export function resizeImage(imageUrl, size) {
  return imageUrl.replace(
    /\/(?:s\d+|w\d+-h\d+(?:-[a-z]+)*)(?=\/)/,
    `/${size}`
  );
}

/**
 * Extracts the Blogger blogId from HTML content.
 *
 * @param {string} htmlString The HTML string to search.
 * @returns {string|null} The extracted blogId, or null if not found.
 */
export function extractBlogId(htmlString) {
  const metaMatch = htmlString.match(/<meta[^>]+itemprop=["']blogId["'][^>]*content=["'](\d+)["']/i);
  if (metaMatch) return metaMatch[1];

  const linkMatch = htmlString.match(/<link[^>]+rel=["']service\.post["'][^>]*href=["'][^"']*\/feeds\/(\d+)\/posts\//i);
  if (linkMatch) return linkMatch[1];

  return null;
}
  
/**
 * Cleans Blogger-specific artifacts from raw HTML.
 * Removes noscript blocks, widget CSS/JS, authorization CSS, inline scripts with _WidgetManager,
 * and various Blogger-specific divs.
 *
 * @param {string} html The raw HTML string to clean.
 * @returns {string} The cleaned HTML string.
 */
export function cleanBloggerArtifacts(html) {
  return html
    // Remove <noscript> blocks
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')

    // Remove <link> to widget_css_bundle.css (any attribute order)
    .replace(/<link\b[^>]*href=['"]https:\/\/www\.blogger\.com\/static\/v1\/widgets\/\d+-widget_css_bundle\.css['"][^>]*>/gi, '')

    // Remove <link> to authorization.css with any attributes, matching both 'www' and 'draft' subdomains
    .replace(/<link\b[^>]*href=['"]https:\/\/(?:www|draft)\.blogger\.com\/dyn-css\/authorization\.css\?[^'"]+['"][^>]*>/gi, '')

    // Remove <script> to NNNNNNN-widgets.js
    .replace(/<script\b[^>]*src=['"]https:\/\/www\.blogger\.com\/static\/v1\/widgets\/\d+-widgets\.js['"][^>]*>\s*<\/script>/gi, '')

    // Remove inline <script> blocks containing _WidgetManager
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, match => {
      return /_WidgetManager\./.test(match) ? '' : match;
    })

    // Remove <div class="clear"></div> and <div style="clear: both;"></div>
    .replace(/<div[^>]*\s(?:class="clear"|style="clear:\s*both;")[^>]*>[\s\S]*?<\/div>/gi, '')

    // Remove <div id="searchSection">
    .replace(/<div[^>]*id=["']searchSection["'][^>]*>[\s\S]*?<\/div>/gi, '')

    // Remove <div class="blogger"> and <div class="blog-feeds">
    .replace(/<div[^>]*class=["']blogger["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class=["']blog-feeds["'][^>]*>[\s\S]*?<\/div>/gi, '');
}


