/**
 * Fetches a resource from cache or network, and caches the response.
 * @param {string} url - The URL of the resource to fetch.
 * @param {ExecutionContext} ctx - The execution context for waitUntil.
 * @param {number} cacheDurationSeconds - The duration to cache the resource in seconds.
 * @returns {Promise<Response>}
 */
async function fetchAndCache(url, ctx, cacheDurationSeconds = 3600) {
  const cache = caches.default;
  let response = await cache.match(url);

  if (!response) {
    console.log(`Cache miss for ${url}. Fetching from origin.`);
    const originResponse = await fetch(url);

    if (originResponse.ok) {
      // Create a new headers object to avoid modifying the original response headers.
      const headers = new Headers(originResponse.headers);
      headers.set('Cache-Control', `max-age=${cacheDurationSeconds}`);

      // Create a new response to cache, as the body can only be read once.
      response = new Response(originResponse.body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: headers // Use the new headers object
      });
      
      // Use waitUntil to ensure caching completes even after the response is sent.
      // We clone the response because it needs to be returned and cached simultaneously.
      ctx.waitUntil(cache.put(url, response.clone()));
    } else {
        // Return the error response directly if the fetch failed.
        return originResponse;
    }
  }
  
  return response;
}

/** * Checks if a resource exists using a HEAD request. This is faster than GET. 
 * @param {string} url - The URL to check. 
 * @returns {Promise<boolean>} 
 */ 
async function checkResourceExists(url) { 
  try { 
    const res = await fetch(url, { method: 'HEAD' }); 
    return res.ok; 
  } catch (err) { 
    console.error(`Failed to check resource existence for ${url}:`, err); 
    return false; 
  } 
}

/**
 * Fetches and caches the main HTML template.
 * @param {string} url The URL of the HTML file.
 * @param {ExecutionContext} ctx The execution context.
 * @returns {Promise<string>} The HTML content.
 */
async function cacheContent(url, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url);
  const cacheDurationSeconds = 7200; // 2 hours

  let response = await cache.match(cacheKey);

  if (!response) {
    console.log(`HTML cache miss for ${url}. Fetching from origin.`);
    const originResponse = await fetch(url);

    if (originResponse.ok) {
      const headers = new Headers(originResponse.headers);
      headers.set('Cache-Control', `max-age=${cacheDurationSeconds}, public`);
      response = new Response(originResponse.body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: headers
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    } else {
      // Return an empty string or a default template on failure
      return '<html><body><h1>Error Loading Template</h1></body></html>';
    }
  }

  return response.text();
}

/**
 * Fetches and caches domain-specific CSS.
 * @param {string} url The URL of the CSS file.
 * @param {ExecutionContext} ctx The execution context.
 * @returns {Promise<string>} The CSS content.
 */
async function cacheStyling(url, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url);
  const cacheDurationSeconds = 86400; // 24 hours

  let response = await cache.match(cacheKey);

  if (!response) {
    console.log(`CSS cache miss for ${url}. Fetching from origin.`);
    const originResponse = await fetch(url);

    if (originResponse.ok) {
      const headers = new Headers(originResponse.headers);
      headers.set('Cache-Control', `max-age=${cacheDurationSeconds}, public`);
      response = new Response(originResponse.body, {
        status: originResponse.status,
        statusText: originResponse.statusText,
        headers: headers
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    } else {
      // Fallback to empty string if fetching fails
      return '';
    }
  }

  return response.text();
}

/**
 * Checks for the existence of a logo with a long-lived cache.
 * @param {string} url The URL of the logo image.
 * @param {ExecutionContext} ctx The execution context.
 * @returns {Promise<boolean>} True if the logo exists, false otherwise.
 */
async function checkLogoExistsAndCache(url, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(url + '-exists');
  const cacheDurationSeconds = 86400; // 24 hours

  let cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return JSON.parse(await cachedResponse.text());
  }

  const exists = await checkResourceExists(url);
  
  const newResponse = new Response(JSON.stringify(exists), {
    headers: {
      'Cache-Control': `max-age=${cacheDurationSeconds}`,
      'Content-Type': 'application/json'
    }
  });

  ctx.waitUntil(cache.put(cacheKey, newResponse));

  return exists;
}


import { test, querySelector, querySelectorAll, getAttribute } from './htmlparser.js'
import { templateTagParser, injectLayoutClasses, cleanTitle, FinalCleanupHandler } from './templatehelper.js';


let testHtml = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="A small, structured HTML file for testing purposes."><title>Test HTML Structure</title><link rel="stylesheet" href="styles.css"></head><body><header><h1 class="title">Welcome to My Test Page</h1><h2 id="sub-heading">Subheading: Testing HTML Structure</h2></header><main><div><h2 id="part1">Part 1</h2><p class="summary body-text">This is a paragraph inside a <code>div</code> element. It demonstrates basic HTML structure.</p><p class="body-text">Here is another paragraph with a <span style="color: blue;">highlighted span</span> for testing inline elements.</p></div><div><h2 id="part2">Part 2</h2><p class="summary body-text">This is a paragraph inside a <code>div</code> element. It demonstrates basic HTML structure.</p><p class="body-text">Here is another paragraph with a <span style="color: blue;">highlighted span</span> for testing inline elements.</p></div></main><footer><h2 id="footer-heading">Footer Section</h2><p class="footer-text">Thank you for visiting this test page.</p></footer></body></html>';

export default {
  async fetch(request, env, ctx) {
    
    const originalResponse = await fetch(request);
    let html = await originalResponse.text();

    const url = new URL(request.url);
    const path = url.pathname + (url.search || '');

    const useHardCodedMenu = true;
    const bloggerAPIkey = '';
    const blogId = '';

    let menuHtml = ''
    /* if menu links are not hard-coded use {{menu:n}} tags in page titles to create navigation menu */
    if (!useHardCodedMenu) {
      // get menu items
      const pageListUrl = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages?fetchBodies=false&status=live&key=${bloggerAPIkey}`;
      const pageListRes = await fetchAndCache(pageListUrl, ctx, 3600);

      if (!pageListRes.ok) {
        return new Response(`Feed fetch failed: ${pageListRes.status}`, { status: 502 });
      }

      const pagesJson = await pageListRes.json();    
      const menuArray = getMenuEntries(pagesJson);
      menuHtml = renderMenuLinks(menuArray);
    }


    // Determine page type
    let pageClass = 'unknown-page';

    if (path === '/') {
      // get the index page
      pageClass = 'main-page';
      url.pathname = '/p/home.html';
      const response = await fetchAndCache(url.toString(), ctx, 3600);
      html = await response.text();  

      // main page specific styling
      const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/i;

      const firstImgMatch = html.match(imgRegex);
      const bgImageURL = firstImgMatch?.[1];
      const injectedCSS = bgImageURL
        ? `<style>body { --bg-image: url('${bgImageURL}'); background-image: var(--bg-image); background-size: cover; background-repeat: no-repeat; background-position: center center; background-attachment: fixed; }</style>`
        : '';
      html = html.replace('</head>', `${injectedCSS}</head>`);
      html = html.replace(imgRegex, '');

      
    } else if (/^\/\d{4}\/\d{2}\/.*\.html$/.test(path)) {
      pageClass = 'post-page';
      /* here we parse the post contents */

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
const bodyHTML = await querySelector(html, 'div.post-body', { returnInnerHtml: true });


// 2️⃣ Extract title
const objectTitle = await querySelector(html, "div.post h3.post-title",{returnInnerHtml: true, stripTags: true});


// 3️⃣ Parse individual field lines
let parsed = {};
let parsedRawKeys = {};
let leftoverLines = [];

// Step 1: Normalize HTML into clean lines
let cleanHTML = bodyHTML
  .replace(/\r\n|\r/g, '\n')                     // Normalize CRLF to LF
  .replace(/<div[^>]*>/gi, '¶')                  // Replace opening <div> with pilcrow
  .replace(/<\/div>/gi, '¶')                     // Replace closing </div> with pilcrow
  .replace(/<br\s*\/?>/gi, '¶')                  // Replace <br> with pilcrow
  .replace(/&nbsp;(?=\s*[:=])/gi, ' ')           // Replace nbsp before : or = with space
  .replace(/(?<=[:=]\s*)&nbsp;/gi, '')           // Remove nbsp after :
  .replace(/^(&nbsp;)+|(&nbsp;)+$/gi, '')        // Trim leading/trailing nbsp
  .replace(/<[^>]+>/g, '')                       // Strip all other tags
  .replace(/[ \t]+/g, ' ')                       // Normalize spacing
  .replace(/¶+/g, '¶')                           // Collapse multiple pilcrows
  .replace(/^\s*¶|¶\s*$/g, '');                  // Trim leading/trailing pilcrows
  // .replace(/\s*¶\s*/g, '\n');                    // Convert pilcrow to actual line break


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
const imageLink = await getAttribute(html,"div.post-body div.separator a", "href");
const imageUrl = await getAttribute(html,"div.post-body div.separator a img", "src");

// 6️⃣ Render HTML
let cardHTML = '<div class="card">\n';

renderOrder.forEach(key => {
  if (parsed[key]) {
    const prettyKey = prettify(key);
    cardHTML += `  <div class="field object-${key}">\n    <span class="key">${prettyKey}</span>: <span class="value">${parsed[key]}</span>\n  </div>\n`;
  }
});

Object.entries(parsed).forEach(([key, value]) => {
  if (!renderOrder.includes(key)) {
    const prettyKey = prettify(key);
    cardHTML += `  <div class="field object-${key}">\n    <span class="key">${prettyKey}</span>: <span class="value">${value}</span>\n  </div>\n`;
  }
});

cardHTML += '</div>\n';

let notesHTML = '<div class="notes">\n';
for (const line of leftoverLines) {
  notesHTML += `  <p>${line}</p>\n`;
}
notesHTML += '</div>\n';

let labelHTML = '';
if (labels.length > 0) {
  labelHTML += `<div class="object-labels">\n`;
  for (const label of labels) {
    const safeLabel = encodeURIComponent(label);
    labelHTML += `  <span class="object-label"><a href="/search/label/${safeLabel}">${label}</a></span>\n`;
  }
  labelHTML += `</div>\n`;
}

let imageHTML = '';
if (imageLink && imageUrl) {
  imageHTML += `<div class="object-image"><div class="image-frame">\n`;
  //imageHTML += `  <a href="${imageLink}">\n`;
  imageHTML += `    <img src="${imageUrl}" alt="${objectTitle}" data-original-src="${imageLink}" class="view-original" />\n`;
  // imageHTML += `  </a>\n`;
  imageHTML += `</div></div>\n`;
}

let titleHTML = '';
if (objectTitle) {
  titleHTML = `<h3 class="object-title">${objectTitle}</h3>\n`;
}

let objectHTML = titleHTML + imageHTML + cardHTML + notesHTML + labelHTML;

// uncomment to debug original formatting issues
// objectHTML = objectHTML + "<br/>==========================================<br/><br/>" + cleanHTML + "<br/>--------------------------------------------------------------------------------<br/><br/>" + bodyHTML + "<br/>==========================================<br/><br/>";
html = insertBeforePost(html, objectHTML);



    } else if (/^\/p\/.*\.html$/.test(path)) {
      pageClass = 'static-page';
    } else if (/^\/search\/label\/[^/]+/.test(path)) {
      pageClass = 'label-search';
    } else if (/^\/search\?q=/.test(path)) {
      pageClass = 'full-search';
    } else if (url.pathname === '/atom') {
      const format = url.searchParams.get('alt'); // Checks for ?alt=json
      const feedUrl = format === 'json'
        ? 'https://' + url.hostname + '/feeds/posts/default?alt=json'
        : 'https://' + url.hostname + '/feeds/posts/default';
    
      try {
        const feedRes = await fetchAndCache(feedUrl, ctx, 3600);
    
        if (!feedRes.ok) {
          return new Response(`Feed fetch failed: ${feedRes.status}`, { status: 502 });
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
        return new Response(`Feed error: ${err.message}`, { status: 500 });
      }
    } else if (url.pathname === '/json') {
      const feedUrl = 'https://' + url.hostname + '/feeds/posts/default?alt=json';
    
      try {
        const feedRes = await fetchAndCache(feedUrl, ctx, 3600);
    
        if (!feedRes.ok) {
          return new Response(`Feed fetch failed: ${feedRes.status}`, { status: 502 });
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
        return new Response(`Feed error: ${err.message}`, { status: 500 });
      }
    } else if (url.pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }
    
    const githubUrl = "https://raw.githubusercontent.com/netlands/sites-templates/main/gallery-site.html";
    // Use the new cacheContent function for the HTML template
    const htmlSnippet = await cacheContent(githubUrl, ctx);

    // Extract inner head and body using regex
    const headContent = htmlSnippet.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const bodyContent = htmlSnippet.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    const extraHeadContent = headContent?.[1] || '';
    const extraBodyContent = bodyContent?.[1] || '';

// Extract the original body content
const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
const originalBodyContent = bodyMatch?.[1]?.trim() || '';
const wrappedMain = `<main>\n${originalBodyContent}\n</main>`;

// Inject <main> right after </header> in the template body content
let newBodyContent = extraBodyContent;
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

const { tags, recent } = await getMetaDataWithTimeout(url, ctx);  


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


    // add some personalizatipon based on the title
     let sitename = 'The Gallery'; // default fallback

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
      // Use the new cacheStyling function for the CSS
      inlineCSS = await cacheStyling(styleUrl, ctx);
    } catch (err) {
      console.error(`CSS fetch failed: ${err}`);
    }

    const logotype = "png"; // svg
    let LOGO_URL = 'https://raw.githubusercontent.com/netlands/sites-templates/main/' + sanitizedName + '-logo.' + logotype;
    const logoExists = await checkLogoExistsAndCache(LOGO_URL, ctx);
   
    const rewriter = new HTMLRewriter()
      .on('html', {
        element(el) {
          const existing = el.getAttribute('class');
          el.setAttribute('class', existing ? `${existing} ${pageClass}` : pageClass);
        }
      })
      .on('span.sitename', {
        element(el) {
          el.setInnerContent(sitename, { html: false });
        }
      })      
      .on('div.logo-section', {
        element(el) {
          el.setInnerContent(`<span class="sitename">${sitename}</span>`, { html: true });
        }
      })
      .on('body', {
        element(el) {
          const currentValue = el.getAttribute("class") || "";
          el.setAttribute("class", `${currentValue} theme-${sanitizedName}`); 
        }
      })
      .on('body', {
        element(el) {
          if (inlineCSS.trim()) {
            el.append(`<style>\n${inlineCSS}\n</style>`, { html: true });
          }
        }
      })
      .on('main', {
        element(el) {
          if (Array.isArray(tags) && tags.length > 0) {
            const tagMarkup = `<ul id="all-tags" hidden>\n` +
              tags.map(tag => `  <li>${tag}</li>`).join('\n') +
              `\n</ul>`;
            el.prepend(tagMarkup, { html: true });
          }
        }
      })
      .on('div.logo-section', {
        element(el) {
          if (logoExists) {
            el.setInnerContent(`<img src="${LOGO_URL}" alt="Logo">`, { html: true });
          }
        }
      });

      // Conditionally chage contents
      if (pageClass === 'post-page') {
        rewriter.on('div.post', {
          element(el) {
            el.setAttribute('style', 'display:none'); // or el.remove();
          }
        });
      } 

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
              textChunk.remove();   // remove the chunk
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
    
        // Remove <link> to authorization.css with any attributes
        .replace(/<link\b[^>]*href=['"]https:\/\/www\.blogger\.com\/dyn-css\/authorization\.css\?[^'"]+['"][^>]*>/gi, '')
    
        // Remove <script> to NNNNNNN-widgets.js
        .replace(/<script\b[^>]*src=['"]https:\/\/www\.blogger\.com\/static\/v1\/widgets\/\d+-widgets\.js['"][^>]*><\/script>/gi, '')
    
        // Remove inline <script> blocks containing _WidgetManager
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, match => {
          return /_WidgetManager\./.test(match) ? '' : match;
        })
    
        // Remove the <div id="searchSection">
        .replace(/<div[^>]*id=["']searchSection["'][^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<div[^>]*class=["']blogger["'][^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<div[^>]*class=["']blog-feeds["'][^>]*>[\s\S]*?<\/div>/gi, '');
    }
      
        
    html  = cleanBloggerArtifacts(html);
 
    html = html.replace(/&nbsp;/g, '\u00A0');

    rewriter.on('title', new FinalCleanupHandler());
    rewriter.on('h3', new FinalCleanupHandler());

    return rewriter.transform(new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    }));

    /* return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    }); */
  }
};

/**
 * Asynchronously fetches a JSON feed, handles potential errors, and returns a sanitized list of entries.
 * This function is designed to be resilient to non-existent hostnames, network issues, or malformed JSON.
 * * @param {URL} url The URL object containing the hostname to fetch the feed from.
 * @returns {Promise<{entries: Array<Object>}>} An object containing an array of feed entries.
 * Returns `{ entries: [] }` on any error to ensure a consistent return type.
 */
async function getParsedJson(url, ctx) { // Add ctx as a parameter
  try {
    // Construct the full URL for the API endpoint.
    // The use of try...catch will handle cases where the hostname doesn't exist, leading to a network error.
    const fullUrl = `https://${url.hostname}/feeds/posts/default?alt=json`;
    console.log(`Attempting to fetch from: ${fullUrl}`);

    const res = await fetchAndCache(fullUrl, ctx, 3600); // Use fetchAndCache here

    // Check if the HTTP response status is OK (i.e., in the 200-299 range).
    // If it's not, we throw an error with the status message.
    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status} - ${res.statusText}`);
    }

    // Attempt to parse the response body as JSON.
    // This part is also wrapped in the try...catch block to handle malformed JSON.
    const raw = await res.json();
    
    // Use optional chaining (`?.`) to safely access nested properties.
    // This prevents a 'Cannot read properties of undefined' error if `raw.feed` or `raw.feed.entry` is missing.
    // The `|| []` provides a default empty array if the entries are not found, ensuring a consistent return type.
    return {
      entries: raw?.feed?.entry || []
    };
  } catch (error) {
    // This block catches any errors from the fetch call (network issues) or JSON parsing.
    console.error("An error occurred while fetching the data:", error);
    
    // Return a default value to prevent the calling function from crashing.
    // This ensures that the function always returns a valid object with an `entries` array.
    return {
      entries: []
    };
  }
}

async function getMetaDataWithTimeout(url, ctx, timeout = 2000) { // Add ctx as a parameter
  const metaPromise = (async () => {
    const feed = await getParsedJson(url, ctx); // Pass ctx here
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
    .replace(/&/g, '&amp;')  // Must go first!
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function getMenuEntries(json, maxentries) {
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
