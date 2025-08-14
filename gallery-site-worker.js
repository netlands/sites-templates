/**
 * @fileoverview
 * This Cloudflare Worker has been updated with an optimized and more consistent
 * caching strategy. The previous, separate caching functions have been replaced
 * with a single, highly configurable `cacheHelper` function to improve maintainability
 * and performance.
 *
 * This version also removes the redundant `checkResourceExists` and related functions,
 * replacing them with a more efficient and integrated `checkContentExistsAndCache` function.
 */

const config = {
  debug: true, // Set to 'true' to enable detailed logging and disable caching (by setting cache duration to 1 second).
  useGitHub: false, // Use GitHub for templates (slower but easier to edit)
  useHardCodedMenu: false, // Use hardcoded menu links instead of scraping page titles.
  cacheDurationSeconds: 3600, // Duration to cache resources in seconds
  maxMenuEntries: 5,         // Maximum number of menu links to display
  // Add other configurable values here as needed
};



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
async function cacheHelper(request, cacheUrl, cacheDurationSeconds, ctx) {
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
async function checkContentExistsAndCache(url, ctx) {
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


// start of page processing code
import { test, querySelector, querySelectorAll, getAttribute } from './htmlparser.js'
import { templateTagParser, injectLayoutClasses, cleanTitle, FinalCleanupHandler } from './templatehelper.js';

let testHtml = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="A small, structured HTML file for testing purposes."><title>Test HTML Structure</title><link rel="stylesheet" href="styles.css"></head><body><header><h1 class="title">Welcome to My Test Page</h1><h2 id="sub-heading">Subheading: Testing HTML Structure</h2></header><main><div><h2 id="part1">Part 1</h2><p class="summary body-text">This is a paragraph inside a <code>div</code> element. It demonstrates basic HTML structure.</p><p class="body-text">Here is another paragraph with a <span style="color: blue;">highlighted span</span> for testing inline elements.</p></div><div><h2 id="part2">Part 2</h2><p class="summary body-text">This is a paragraph inside a <code>div</code> element. It demonstrates basic HTML structure.</p><p class="body-text">Here is another paragraph with a <span style="color: blue;">highlighted span</span> for testing inline elements.</p></div></main><footer><h2 id="footer-heading">Footer Section</h2><p class="footer-text">Thank you for visiting this test page.</p></footer></body></html>';
let lowResImage, highResImage;
const useGitHub = config.useGitHub; // slower but easier to edit ;)


export default {
  async fetch(request, env, ctx) {

    // ✅ 1. Global debug flag
    // Set to 'true' to enable detailed logging and disable caching (by setting cache duration to 1 second).
    // Set to 'false' for production to suppress logs and use normal cache durations.
    const debug = config.debug;

    // ✅ 2. Conditional console logging
    // If not in debug mode, overwrite console.log with an empty function to suppress all log output.
    if (!debug) {
      console.log = () => {};
    }

    const originalResponse = await fetch(request);
    let html, originalHtml, blogId, menuHtml;
    const useHardCodedMenu = config.useHardCodedMenu;

    const url = new URL(request.url);
    const path = url.pathname + (url.search || '');


if (url.pathname != '/favicon.ico') {

    originalHtml = await originalResponse.text();
    html = originalHtml;

    // Helper function to extract blogId from HTML string
    function extractBlogId(htmlString) {
      const metaMatch = htmlString.match(/<meta[^>]+itemprop=["']blogId["'][^>]*content=["'](\d+)["']/i);
      if (metaMatch) return metaMatch[1];

      const linkMatch = htmlString.match(/<link[^>]+rel=["']service\.post["'][^>]*href=["'][^"']*\/feeds\/(\d+)\/posts\//i);
      if (linkMatch) return linkMatch[1];

      return null;
    }

    let bloggerAPIkey = env.BLOGGER_API_KEY;
    blogId = extractBlogId(html);


    /* if menu links are not hard-coded use {{menu:n}} tags in page titles to create navigation menu */
    if (!useHardCodedMenu && blogId) {
      // get menu items
      const pageListUrl = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages?fetchBodies=false&status=live&key=${bloggerAPIkey}`;
      // ✅ 3. Dynamic cache duration
      const pageListRes = await cacheHelper(request, pageListUrl, debug ? 1 : 3600, ctx);

      if (!pageListRes.ok) {
        return new Response(`Feed fetch failed: ${pageListRes.status}`, { status: 502 });
      }

      const pagesJson = await pageListRes.json();
      const menuArray = getMenuEntries(pagesJson);
      menuHtml = renderMenuLinks(menuArray);
    }
  }

let pageClass = 'unknown-page';
let response = null;

const routes = [
  {
    match: path === '/' || path === '/p/home.html',
    pageClass: 'main-page',
    handler: handleMainPage
  },
  {
    match: /^\/\d{4}\/\d{2}\/.*\.html$/.test(path),
    pageClass: 'post-page',
    handler: handlePostPage
  },
  {
    match: /^\/p\/.*\.html$/.test(path),
    pageClass: 'static-page',
    handler: handleStaticPage
  },
  {
    match: /^\/search\/label\/[^/]+/.test(path),
    pageClass: 'label-search',
    handler: handleLabelSearch
  },
  {
    match: /^\/search\?q=/.test(path),
    pageClass: 'full-search',
    handler: handleFullSearch
  },
  {
    match: url.pathname === '/atom',
    pageClass: 'feed',
    handler: handleAtomFeed
  },
  {
    match: url.pathname === '/json',
    pageClass: 'feed',
    handler: handleJsonFeed
  },
  {
    match: url.pathname === '/favicon.ico',
    pageClass: 'static-file',
    handler: handleFavicon
  },
  {
    match: url.pathname === '/getnews',
    pageClass: 'news-feed',
    handler: handleGetNews
  }
];


for (const route of routes) {
  if (route.match) {
    pageClass = route.pageClass;
    const result = await route.handler(request, url, ctx, debug, html, env, blogId, pageClass);

    if (result instanceof Response) {
      // Handler returned a final Response — terminate routing
      response = result;
      break;
    } else if (typeof result === 'string') {
      // Handler returned modified HTML — continue processing
      html = result;
      break;
    }
  }
}

if (response) { 
  return response;
}
// END OF REVERTED ROUTER LOGIC

    // Placeholder functions for each route handler
    // These will contain the logic previously inside the if/else if blocks
    async function handleMainPage(request, url, ctx, debug, html, env, blogId, pageClass) {
        // Logic for the main page
        if (url.pathname === "/") {
          url.pathname = '/p/home.html';
          const response = await cacheHelper(request, url.toString(), debug ? 1 : 3600, ctx);
          html = await response.text();
        } 
        // main page specific styling
        const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/i;
        const firstImgMatch = html.match(imgRegex);
        const bgImageURL = firstImgMatch?.[1];

        // main-page art related code
        function resizeImage(imageUrl, size) {
            return imageUrl.replace(
                /\/(?:s\d+|w\d+-h\d+(?:-[a-z]+)*)(?=\/)/,
                `/${size}`
            );
        }

        lowResImage = resizeImage(bgImageURL, "s200");
        highResImage = resizeImage(bgImageURL, "s0");

        if (bgImageURL) {
            // Build a regex to match <a> wrapping that specific image
            const anchorImgRegex = new RegExp(
                `<a[^>]*>\\s*(${firstImgMatch[0].replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})\\s*</a>`,
                'i'
            );
            // Replace the <a>...</a> with just the <img>
            html = html.replace(anchorImgRegex, '');
        }
        // html = html.replace(imgRegex, '');
        return html;
    }

    async function handlePostPage(request, url, ctx, debug, html, env, blogId, pageClass) {
        // Logic for the post page
        const synonyms = {
          title: ['title', 'name', 'titel', 'naam'],
          artist: ['artist', 'creator', 'artiest'],
          medium: ['medium'],
          date: ['date', 'datum'],
          year: ['year', 'jaar'],
          period: ['period', 'periode'],
          series: ['series', 'serie']
        };

        const renderOrder = Object.keys(synonyms);
        const prettify = s => s.charAt(0).toUpperCase() + s.slice(1);

        // 1️⃣ Extract post-body <div> content
        const bodyHTML = await querySelector(html, 'div.post-body', {
          returnInnerHtml: true
        });


        // 2️⃣ Extract title
        const objectTitle = await querySelector(html, "div.post h3.post-title", {
          returnInnerHtml: true,
          stripTags: true
        });


        // 3️⃣ Parse individual field lines
        let parsed = {};
        let parsedRawKeys = {};
        let leftoverLines = [];

        // Step 1: Normalize HTML into clean lines
        let cleanHTML = bodyHTML
          .replace(/\r\n|\r/g, '\n') // Normalize CRLF to LF
          .replace(/<div[^>]*>/gi, '¶') // Replace opening <div> with pilcrow
          .replace(/<\/div>/gi, '¶') // Replace closing </div> with pilcrow
          .replace(/<br\s*\/?>/gi, '¶') // Replace <br> with pilcrow
          .replace(/&nbsp;(?=\s*[:=])/gi, ' ') // Replace nbsp before : or = with space
          .replace(/(?<=[:=]\s*)&nbsp;/gi, '') // Remove nbsp after :
          .replace(/^(&nbsp;)+|(&nbsp;)+$/gi, '') // Trim leading/trailing nbsp
          .replace(/<[^>]+>/g, '') // Strip all other tags
          .replace(/[ \t]+/g, ' ') // Normalize spacing
          .replace(/¶+/g, '¶') // Collapse multiple pilcrows
          .replace(/^\s*¶|¶\s*$/g, ''); // Trim leading/trailing pilcrows
        // .replace(/\s*¶\s*/g, '\n');                    // Convert pilcrow to actual line break


        const lines = cleanHTML
          .split('¶') // .split('\n')
          .map(line => line.trim())
          .filter(Boolean); // Remove empty lines

        // Step 2: Parse structured lines using synonyms
        for (const line of lines) {
          let matched = false;

          for (const [canonicalKey, variants] of Object.entries(synonyms)) {
            for (const variant of variants) {
              const fieldRegex = new RegExp(`^${variant}\\s*[:=]\\s*(.*)$`, 'i');
              const fieldMatch = line.match(fieldRegex);

              if (fieldMatch && fieldMatch[1] !== undefined) {
                parsed[canonicalKey] = fieldMatch[1].trim();
                parsedRawKeys[canonicalKey] = variant;
                matched = true;
                break;
              }
            }
            if (matched) break;
          }

          if (!matched) {
            leftoverLines.push(line);
          }
        }

        // Step 3: Inject fallback title if missing
        if (!parsed.title && objectTitle) {
          parsed.title = objectTitle.trim();
        }



        // 4️⃣ Extract labels
        let labels = await querySelectorAll(html, "span.post-labels a", {
          returnInnerHtml: true,
          stripTags: true
        });

        // 5️⃣ Extract image & link
        const imageLink = await getAttribute(html, "div.post-body div.separator a", "href");
        const imageUrl = await getAttribute(html, "div.post-body div.separator a img", "src");

        // 6️⃣ Render HTML
        let cardHTML = '<div class="card">\n';

        renderOrder.forEach(key => {
          if (parsed[key]) {
            const prettyKey = prettify(key);
            cardHTML += `  <div class="field object-${key}">\n    <span class="key">${prettyKey}</span>: <span class="value">${parsed[key]}</span>\n  </div>\n`;
          }
        });

        Object.entries(parsed).forEach(([key, value]) => {
          if (!renderOrder.includes(key)) {
            const prettyKey = prettify(key);
            cardHTML += `  <div class="field object-${key}">\n    <span class="key">${prettyKey}</span>: <span class="value">${value}</span>\n  </div>\n`;
          }
        });

        cardHTML += '</div>\n';

        let notesHTML = '<div class="notes">\n';
        for (const line of leftoverLines) {
          notesHTML += `  <p>${line}</p>\n`;
        }
        notesHTML += '</div>\n';

        let labelHTML = '';
        if (labels.length > 0) {
          labelHTML += `<div class="object-labels">\n`;
          for (const label of labels) {
            const safeLabel = encodeURIComponent(label);
            labelHTML += `  <span class="object-label"><a href="/search/label/${safeLabel}">${label}</a></span>\n`;
          }
          labelHTML += `</div>\n`;
        }

        let imageHTML = '';
        if (imageLink && imageUrl) {
          imageHTML += `<div class="object-image"><div class="image-frame">\n`;
          //imageHTML += `  <a href="${imageLink}">\n`;
          imageHTML += `    <img src="${imageUrl}" alt="${objectTitle}" data-original-src="${imageLink}" class="view-original" />\n`;
          // imageHTML += `  </a>\n`;
          imageHTML += `</div></div>\n`;
        }

        let titleHTML = '';
        if (objectTitle) {
          titleHTML = `<h3 class="object-title">${objectTitle}</h3>\n`;
        }

        let objectHTML = titleHTML + imageHTML + cardHTML + notesHTML + labelHTML;

        // uncomment to debug original formatting issues
        // objectHTML = objectHTML + "<br/>==========================================<br/><br/>" + cleanHTML + "<br/>--------------------------------------------------------------------------------<br/><br/>" + bodyHTML + "<br/>==========================================<br/><br/>";

const insertBeforePost = (html, objectHTML) => {
  const postDivRegex = /<div[^>]*class=["'][^"']*\bpost\b[^"']*["'][^>]*>/i;
  const match = html.match(postDivRegex);

  if (match) {
    const insertIndex = html.indexOf(match[0]);
    const before = html.slice(0, insertIndex);
    const after = html.slice(insertIndex);
    return before + `<div class="object">\n${objectHTML}</div>\n` + after;
  }

  // Fallback if no post div found
  return html;
};

        html = insertBeforePost(html, objectHTML);
        return html;
    }

    async function handleStaticPage(request, url, ctx, debug, html, env, blogId, pageClass) {
        // Logic for the static page
        // The original code has no specific logic for this page type, so we can leave it empty or add a comment.
        // It's here for completeness and to show how a handler would be structured.
        return null; // Return null so the main fetch function can continue processing
    }

    async function handleLabelSearch(request, url, ctx, debug, html, env, blogId, pageClass) {
        // Logic for the label search page
        return null; // Return null so the main fetch function can continue processing
    }

    async function handleFullSearch(request, url, ctx, debug, html, env, blogId, pageClass) {
        // Logic for the full search page
        return null; // Return null so the main fetch function can continue processing
    }

    async function handleAtomFeed(request, url, ctx, debug, html, env, blogId, pageClass) {
        // Logic for the Atom feed
        const format = url.searchParams.get('alt'); // Checks for ?alt=json
        const feedUrl = format === 'json' ?
          'https://' + url.hostname + '/feeds/posts/default?alt=json' :
          'https://' + url.hostname + '/feeds/posts/default';

        try {
          // ✅ 3. Dynamic cache duration
          const feedRes = await cacheHelper(request, feedUrl, debug ? 1 : 3600, ctx);

          if (!feedRes.ok) {
            return new Response(`Feed fetch failed: ${feedRes.status}`, {
              status: 502
            });
          }

          const body = await feedRes.text();
          const contentType = feedRes.headers.get('Content-Type') || (format === 'json' ? 'application/json' : 'application/atom+xml');

          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'no-store'
            }
          });

        } catch (err) {
          return new Response(`Feed error: ${err.message}`, {
            status: 500
          });
        }
    }

    async function handleJsonFeed(request, url, ctx, debug, html, env, blogId, pageClass) {
        // Logic for the JSON feed
        const feedUrl = 'https://' + url.hostname + '/feeds/posts/default?alt=json';

        try {
          // ✅ 3. Dynamic cache duration
          const feedRes = await cacheHelper(request, feedUrl, debug ? 1 : 3600, ctx);

          if (!feedRes.ok) {
            return new Response(`Feed fetch failed: ${feedRes.status}`, {
              status: 502
            });
          }

          const json = await feedRes.text(); // Use text() to stream untouched JSON
          return new Response(json, {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store'
            }
          });
        } catch (err) {
          return new Response(`Feed error: ${err.message}`, {
            status: 500
          });
        }
    }

    async function handleFavicon(request, url, ctx, debug, html, env, blogId, pageClass) {
        // Logic for the favicon
        return new Response(null, { status: 204 });
    }

    async function handleGetNews(request, url, ctx, debug, html, env, blogId, pageClass) {
        // Logic for the news feed
        const feedUrl = `https://www.blogger.com/feeds/${blogId}/posts/default/-/news?alt=json`;
        console.log(feedUrl);
        try {
            const res = await fetch(feedUrl);
            if (!res.ok) throw new Error('Failed to fetch feed');
            const data = await res.json();
            const entries = data.feed.entry || []; // Extract and sort by published date (descending)
            const newsItems = entries
                .map(entry => {
                    const title = entry.title?.['$t'] || 'Untitled';
                    const content = entry.content?.['$t'] || '';
                    const link = entry.link?.find(l => l.rel === 'alternate')?.href || '#';
                    const published = new Date(entry.published?.['$t'] || 0);
                    return {
                        title,
                        content,
                        link,
                        published
                    };
                })
                .sort((a, b) => b.published - a.published);
            // Build HTML response
            const html = `
                <div class="news">
                  ${newsItems.map(item => `
                    <div class="news-item">
                      <a href="${item.link}">
                        <h2 class="news-title">${escapeHtml(item.title)}</h2>
                      </a>
                      <div class="news-content">${item.content}</div>
                    </div>
                  `).join('')}
                </div>
            `;
            return new Response(html, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8'
                }
            });
        } catch (err) {
            return new Response(`Error: ${err.message}`, {
                status: 500
            });
        }
    }

    // Escape HTML to prevent injection in titles
    function escapeHtml(str) {
      return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    



    /*
    // insert JavaScript variable inside page
    class ScriptInjector {
      constructor(variableName, value) {
        this.variableName = variableName;
        this.value = value;
      }
      element(element) {
        const scriptContent = `window.${this.variableName} = ${JSON.stringify(this.value)};`;
        element.append(`<script>${scriptContent}</script>`, { html: true });
      }
    }

    async function handleRequest(request) {
      const response = await fetch(request);
      return new HTMLRewriter()
        .on('head', new ScriptInjector('myVar', 'Hello from Cloudflare'))
        .transform(response);
    }
    // rewriter.on('head', new ScriptInjector('myVar', 'Hello from Cloudflare'))
    */

// Extract the original body content
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const originalBodyContent = bodyMatch?.[1]?.trim() || '';
const wrappedMain = `<main>\n${originalBodyContent}\n</main>`;

let extraHeadContent, newBodyContent = "";

// add default content blocks
if (useGitHub) { 
    const githubUrl = "https://raw.githubusercontent.com/netlands/sites-templates/main/gallery-site.html";
    // ✅ 3. Pass debug flag to cache function
    const response = await cacheHelper(request, githubUrl, debug ? 1 : 7200, ctx);
    const htmlSnippet = await response.text();

    // Extract inner head and body using regex
    const headContent = htmlSnippet.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const bodyContent = htmlSnippet.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    extraHeadContent = headContent?.[1] || '';
    const extraBodyContent = bodyContent?.[1] || '';

    // Inject <main> right after </header> in the template body content
    newBodyContent = extraBodyContent;
    const headerCloseTag = '</header>';
    const headerIndex = extraBodyContent.indexOf(headerCloseTag);
    
    if (headerIndex !== -1) {
      const beforeHeader = extraBodyContent.slice(0, headerIndex + headerCloseTag.length);
      const afterHeader = extraBodyContent.slice(headerIndex + headerCloseTag.length);
      newBodyContent = `${beforeHeader}\n${wrappedMain}\n${afterHeader}`;
    } else {
      // Fallback: just prepend main if header not found
      newBodyContent = `${wrappedMain}\n${extraBodyContent}`;
    }
} else { 

// get head content, and inline default style and scripts
// get header and footer
// build page structure: header main footer

  // Fetch KV entries
  const [head, style, script, header, footer] = await Promise.all([
    env.GALLERY.get(`html:head`),
    env.GALLERY.get(`css:style`),
    env.GALLERY.get(`js:script`),
    env.GALLERY.get(`html:header`),
    env.GALLERY.get(`html:footer`)            
  ]);
  extraHeadContent = head || "";
  let defaultStyle, defaultScript = ""
  if (style) defaultStyle = `\n<style>${style}</style>` || "";
  if (script) defaultScript = `\n<script>${script}</script>` || "";
  const headerElement = header || "";
  const footerElement = footer || "";

  extraHeadContent = `${extraHeadContent}${defaultStyle}${defaultScript}`;
  newBodyContent = `\n\n${headerElement}\n${wrappedMain}\n${footerElement}\n\n`;

}  

// ✅ 3. Pass debug flag to get metadata
const { tags, recent } = await getMetaDataWithTimeout(url, ctx, debug);

// Rebuild the body
html = html
  .replace('</head>', `${extraHeadContent}\n</head>`)
  // A simple check to ensure the match was successful before trying to use it.
  if (bodyMatch && bodyMatch[0]) {
    html = html.replace(bodyMatch[0], `<body>\n${newBodyContent}\n</body>`);
  } else {
    // Handle the case where no match was found.
    console.error("Could not find the <body> tag to replace.");
  }

 
    //* below depend on the header and footer being inserted correctly *//
    // add site personalization based on the title
     let sitename = 'Gallery'; // default fallback
    // Try to extract from data-sitename in the <html> tag
    const htmlTagMatch = html.match(/<html[^>]*?\sdata-sitename=["']([^"']+)["']/i);
    if (htmlTagMatch) {
      sitename = htmlTagMatch[1];
    }
    
    // add site specific style sheet
    const sanitizedName = sitename.replace(/\s+/g, '').toLowerCase();

    const styleUrl = `https://raw.githubusercontent.com/netlands/sites-templates/main/${sanitizedName}.css`;
    let inlineCSS = '';
    try {
      // ✅ 3. Pass debug flag to cache function
      const cssResponse = await cacheHelper(request, styleUrl, debug ? 1 : 86400, ctx);
      inlineCSS = await cssResponse.text();
    } catch (err) {
      console.error(`CSS fetch failed: ${err}`);
    }

    const logotype = "png"; // svg
    let LOGO_URL = 'https://s2.netlands.net/' + sanitizedName + '-logo.' + logotype;
    // 'https://raw.githubusercontent.com/netlands/sites-templates/main/' + sanitizedName + '-logo.' + logotype;
    // ✅ 3. Pass debug flag to cache function
    const logoExists = await checkContentExistsAndCache(new URL(LOGO_URL), ctx);
   
    
    const rewriter = new HTMLRewriter()

      // general page and site content
      .on('html', {
        element(el) {
          const existing = el.getAttribute('class');
          el.setAttribute('class', existing ? `${existing} ${pageClass}` : pageClass);
          if (blogId) {
                el.setAttribute('data-blogid', blogId);
          }
        }
      })

      // theme/site specific content
      .on('span.sitename', {
        element(el) {
          el.setInnerContent(sitename, { html: false });
        }
      })      
      .on('div.logo-section', {
        element(el) {
          el.setInnerContent(`<span class="sitename">${sitename}</span>`, { html: true });
          if (logoExists) {
            el.setInnerContent(`<img src="${LOGO_URL}" alt="Logo">`, { html: true });
          }
        }
      })
      .on('body', {
        element(el) {
          const currentValue = el.getAttribute("class") || "";
          el.setAttribute(
            "class",
            currentValue ? `${currentValue} theme-${sanitizedName}` : `theme-${sanitizedName}`
          );            
          if (inlineCSS.trim()) {
            el.append(`<style>\n${inlineCSS}\n</style>`, { html: true });
          }
        }
      })
      .on('main', {
        element(el) {
          if (Array.isArray(tags) && tags.length > 0) {
            const tagMarkup = `<ul id="all-tags" hidden>\n` +
              tags.map(tag => `  <li>${tag}</li>`).join('\n') +
              `\n</ul>`;
            el.prepend(tagMarkup, { html: true });
          }
        }
      });

      // Page type specific contents
      if (pageClass === 'post-page') {
        rewriter.on('div.post', {
          element(el) {
            el.setAttribute('style', 'display:none'); // or el.remove();
          }
        });
      }

      class HeadPreloadInjector {
        constructor(lowRes, highRes) {
          this.lowRes = lowRes;
          this.highRes = highRes;
        }
      
        element(head) {
          head.append(`
            <link rel="preload" as="image" href="${this.lowRes}" fetchpriority="high" data-name="lowres-image">
            <link rel="preload" as="image" href="${this.highRes}" fetchpriority="low" data-name="highres-image">
          `, { html: true });
        }
      }

      if (pageClass === 'main-page') {  
        rewriter.on("head", new HeadPreloadInjector(lowResImage, highResImage))
      }  


      // menu related 
      class MenuInjector {
        constructor(menuHtml) {
          this.menuHtml = menuHtml;
        }
      
        element(element) {
          element.prepend(this.menuHtml, { html: true });
        }
      }
      
      if (!useHardCodedMenu) { rewriter.on('div.nav-section.collapsible-menu', new MenuInjector(menuHtml)); }
            


        // rewriter.on("a", new HideLinksByText(targets));
         const targets = ["some text", "other text"];

         class HideLinksByText {
          constructor(targets) {
            this.targets = targets.map(t => t.toLowerCase());
          }
        
          // Called when the <a> tag starts
          element(el) {
            el.setAttribute("data-should-remove", "false"); // default flag
            el.tagName = "a"; // ensure it's an <a> tag
          }
        
          // Called for each text chunk inside the <a>
          text(textChunk) {
            const content = textChunk.text.trim().toLowerCase();
            if (this.targets.some(target => content.includes(target))) {
              textChunk.before(""); // optional: blank out the text
              textChunk.remove();   // remove the chunk
              this.shouldRemove = true;
            }
          }
        
          // Called when the tag ends
          end(el) {
            if (this.shouldRemove) {
              el.remove(); // now safely remove the whole <a> tag
            }
          }
        }
        
 
        class ReplaceWordInElement {
          constructor(selector, fromWord, toWord) {
            this.selector = selector;
            this.fromWord = fromWord;
            this.toWord = toWord;
          }
        
          element(el) {
            // Optional: mark the element if needed
            el.setAttribute("data-word-replaced", "true");
          }
        
          text(textChunk) {
            const replaced = textChunk.text.replace(
              new RegExp(`\\b${this.fromWord}\\b`, 'gi'),
              this.toWord
            );
            textChunk.replace(replaced);
          }
        }

        if (pageClass === 'label-search' || pageClass === 'full-search' ) {
          // rewriter.on("a", new HideLinksByText(targets));
          rewriter.on('div.status-msg-body', new ReplaceWordInElement('div.status-msg-body', 'posts', 'works'));
          const tagsToRemove = ['a'];
          class RemoveElement {
            element(el) {
              el.remove();
            }
          }
          // Register each tag inside the target container
          tagsToRemove.forEach(tag => {
            rewriter.on(`div.status-msg-body ${tag}`, new RemoveElement());
          });
        }

        // template related functions
        // Use the single, unified parser for all content transformations
        rewriter.on('*', new templateTagParser());      
        html = injectLayoutClasses(html);     
        //html = cleanTitle(html);

        // remove unused blogger.com stylesheets
        function cleanBloggerArtifacts(html) {
          return html
            // Remove <noscript> blocks
            .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')

            // Remove <link> to widget_css_bundle.css (any attribute order)
            .replace(/<link\b[^>]*href=['"]https:\/\/www\.blogger\.com\/static\/v1\/widgets\/\d+-widget_css_bundle\.css['"][^>]*>/gi, '')

            // Remove <link> to authorization.css with any attributes, matching both 'www' and 'draft' subdomains
            .replace(/<link\b[^>]*href=['"]https:\/\/(?:www|draft)\.blogger\.com\/dyn-css\/authorization\.css\?[^'"]+['"][^>]*>/gi, '')

            // Remove <script> to NNNNNNN-widgets.js
            .replace(/<script\b[^>]*src=['"]https:\/\/www\.blogger\.com\/static\/v1\/widgets\/\d+-widgets\.js[''][^>]*><\/script>/gi, '')

            // Remove inline <script> blocks containing _WidgetManager
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, match => {
              return /_WidgetManager\./.test(match) ? '' : match;
            })

            // Remove the <div id="searchSection">
            .replace(/<div[^>]*id=["']searchSection["'][^>]*>[\s\S]*?<\/div>/gi, '')
            .replace(/<div[^>]*class=["']blogger["'][^>]*>[\s\S]*?<\/div>/gi, '')
            .replace(/<div[^>]*class=["']blog-feeds["'][^>]*>[\s\S]*?<\/div>/gi, '');
        }
      
        
    html  = cleanBloggerArtifacts(html);
 
    html = html.replace(/&nbsp;/g, '\u00A0');

    rewriter.on('title', new FinalCleanupHandler());
    rewriter.on('h3', new FinalCleanupHandler());

    // Conditionally set Cache-Control header for the final response
    const responseHeaders = new Headers({
      'Content-Type': 'text/html'
    });


    class InjectBeforeBodyClose {
      constructor(content) {
        this.content = content;
      }
    
      element(element) {
        element.append(this.content, { html: true });
      }
    }
    
    


    if (debug) {
      // In debug mode, prevent the browser from caching the final HTML at all.
      responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      // add the CSS editor
      const [editor] = await Promise.all([
        env.GALLERY.get(`js:debug`)
      ]);
      if (editor) {
        rewriter.on('body', new InjectBeforeBodyClose(`\n\n<script class="debug" id="css-editor">${editor}</script>`));
      }  
    } else {
      rewriter.on("*", new RemoveIfDebugClass());
      // In production, allow caching for a short period (e.g., 5 minutes) to improve performance
      // for repeat visitors while ensuring content stays relatively fresh.
      responseHeaders.set('Cache-Control', 'public, max-age=300');
    }

  const routeKey = pageClass === '/' ? '/main-page' : `/${pageClass.replace(/^\/+/, '')}`;

  // Fetch KV entries
  const [htm, css, js] = await Promise.all([
    env.GALLERY.get(`html:${routeKey}`),
    env.GALLERY.get(`css:${routeKey}`),
    env.GALLERY.get(`js:${routeKey}`)
  ]);

    if (css) {
      rewriter.on('body', new StyleInjector(css));
    }
    if (js) {
      rewriter.on('body', new ScriptInjector(js));
    }
    if (htm) {
      rewriter.on('body', new HtmlInjector(htm));
    }






    return rewriter.transform(new Response(html, {
      headers: responseHeaders
    }));
  }
};

class RemoveIfDebugClass {
  element(element) {
    const classAttr = element.getAttribute("class");
    if (classAttr && classAttr.split(/\s+/).includes("debug")) {
      element.remove();
    }
  }
}



/**
 * Asynchronously fetches a JSON feed, handles potential errors, and returns a sanitized list of entries.
 * This function is designed to be resilient to non-existent hostnames, network issues, or malformed JSON.
 * @param {URL} url The URL object containing the hostname to fetch the feed from.
 * @param {ExecutionContext} ctx The execution context.
 * @param {boolean} debug - If true, sets a very short cache duration.
 * @returns {Promise<{entries: Array<Object>}>} An object containing an array of feed entries.
 * Returns `{ entries: [] }` on any error to ensure a consistent return type.
 */
async function getParsedJson(url, ctx, debug = false) {
  try {
    const fullUrl = `https://${url.hostname}/feeds/posts/default?alt=json`;
    console.log(`Attempting to fetch from: ${fullUrl}`);

    // Set cache duration based on the debug flag
    const cacheDuration = debug ? 1 : config.cacheDurationSeconds;
    const res = await cacheHelper(new Request(fullUrl), fullUrl, cacheDuration, ctx);

    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status} - ${res.statusText}`);
    }
    
    const raw = await res.json();
    
    return {
      entries: raw?.feed?.entry || []
    };
  } catch (error) {
    console.error("An error occurred while fetching the data:", error);
    return {
      entries: []
    };
  }
}

async function getMetaDataWithTimeout(url, ctx, debug = false, timeout = 2000) {
  const metaPromise = (async () => {
    // Pass the debug flag down to the next function
    const feed = await getParsedJson(url, ctx, debug);
    const tagsSet = new Set();
    const recentPosts = [];

    feed.entries.forEach(entry => {
      entry.category?.forEach(c => tagsSet.add(c.term));
      recentPosts.push({
        title: entry.title?.$t,
        href: entry.link?.find(l => l.rel === "alternate")?.href,
        published: entry.published?.$t
      });
    });

    const tags = Array.from(tagsSet).sort();
    const recent = recentPosts
    .filter(post => post.published) // ensures published exists
    .sort((a, b) => new Date(b.published) - new Date(a.published)) // warning regarding date formatting can be ignored
    .slice(0, 5);
  
    return { tags, recent };
  })();

  const timeoutPromise = new Promise(resolve =>
    setTimeout(() => resolve({ tags: [], recent: [] }), timeout)
  );

  return Promise.race([metaPromise, timeoutPromise]);
}

const insertBeforePost = (html, objectHTML) => {
  const postDivRegex = /<div[^>]*class=["'][^"']*\bpost\b[^"']*["'][^>]*>/i;
  const match = html.match(postDivRegex);

  if (match) {
    const insertIndex = html.indexOf(match[0]);
    const before = html.slice(0, insertIndex);
    const after = html.slice(insertIndex);
    return before + `<div class="object">\n${objectHTML}</div>\n` + after;
  }

  // Fallback if no post div found
  return html;
};

function escapeHTML(htmlString) {
  return htmlString
    .replace(/&/g, '&amp;')  // Must go first!
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function getMenuEntries(json, maxentries = config.maxMenuEntries) {
  const menuRegex = /\{\{menu(?::(\d+))?\}\}/i;
  const entries = [];

  for (const item of json.items || []) {
    const match = item.title.match(menuRegex);
    if (match) {
      const number = match[1] ? parseInt(match[1], 10) : null;
      const cleanedTitle = item.title.replace(menuRegex, '').trim();
      const relativeUrl = item.url.replace(/^https?:\/\/[^/]+/, '');

      entries.push({
        title: cleanedTitle,
        url: relativeUrl,
        order: number !== null ? number : Infinity
      });
    }
  }

  // Sort and slice
  entries.sort((a, b) => a.order - b.order);
  const sliced = typeof maxentries === 'number'
    ? entries.slice(0, maxentries)
    : entries;

  // If no valid entries, return fallback
  if (sliced.length === 0) {
    const fallback = [
      { title: 'About', url: '/p/about.html' },
      { title: 'News', url: '/p/news.html' },
      { title: 'Contact', url: '/p/contact.html' }
    ];
    return typeof maxentries === 'number' ? fallback.slice(0, maxentries) : fallback;
  }

  return sliced.map(({ title, url }) => ({ title, url }));
}

function renderMenuLinks(menuArray) {
  return menuArray
    .map(({ title, url }) => `<a href="${url}" class="top-menu-item">${title}</a>`)
    .join('');
}


class StyleInjector {
  constructor(css) {
    this.css = css;
  }
  element(el) {
    el.append(`<style>${this.css}</style>`, { html: true });
  }
}

class ScriptInjector {
  constructor(js) {
    this.js = js;
  }
  element(el) {
    el.append(`<script>${this.js}</script>`, { html: true });
  }
}

class HtmlInjector {
  constructor(html) {
    this.html = html;
  }
  element(el) {
    el.append(this.html, { html: true });
  }
}

