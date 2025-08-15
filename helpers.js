import { config } from './worker.js';
// --- New, optimized caching functions ---

/**
 * A highly configurable helper function to handle caching.
 * It first tries to find a cached response. If not found, it fetches the resource
 * from the network. On a successful fetch, it updates the cache. In case of a
 * network error, it will return a stale cache entry if available,
 * improving resilience and user experience.
 *
 * @param {Request} request The incoming request.
 * @param {string} cacheUrl The URL to fetch and cache.
 * @param {number} cacheDurationSeconds The time-to-live for the cached asset.
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