import { test, querySelector, querySelectorAll, getAttribute } from './htmlparser.js'

let testHtml = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="A small, structured HTML file for testing purposes."><title>Test HTML Structure</title><link rel="stylesheet" href="styles.css"></head><body><header><h1 class="title">Welcome to My Test Page</h1><h2 id="sub-heading">Subheading: Testing HTML Structure</h2></header><main><div><h2 id="part1">Part 1</h2><p class="summary body-text">This is a paragraph inside a <code>div</code> element. It demonstrates basic HTML structure.</p><p class="body-text">Here is another paragraph with a <span style="color: blue;">highlighted span</span> for testing inline elements.</p></div><div><h2 id="part2">Part 2</h2><p class="summary body-text">This is a paragraph inside a <code>div</code> element. It demonstrates basic HTML structure.</p><p class="body-text">Here is another paragraph with a <span style="color: blue;">highlighted span</span> for testing inline elements.</p></div></main><footer><h2 id="footer-heading">Footer Section</h2><p class="footer-text">Thank you for visiting this test page.</p></footer></body></html>';

export default {
  async fetch(request, env, ctx) {
    
    const originalResponse = await fetch(request);
    let html = await originalResponse.text();

    const url = new URL(request.url);
    const path = url.pathname + (url.search || '');

    // Determine page type
    let pageClass = 'unknown-page';

    if (path === '/') {
      // get the index page
      pageClass = 'main-page';
      url.pathname = '/p/home.html';
      const response = await fetch(url.toString());
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
  title: ['name', 'title', 'naam'],
  artist: ['creator', 'arties'],
  medium: ['medium'],
  date: ['datum'],
  year: ['jaar'],
  period: ['periode'],
  series: ['serie']
};

const renderOrder = Object.keys(synonyms);
const prettify = s => s.charAt(0).toUpperCase() + s.slice(1);

// 1️⃣ Extract post-body <div> content
const bodyHTML = await querySelector(html, 'div.post-body', { returnInnerHtml: true });

// 2️⃣ Parse individual field lines
let parsed = {};
let parsedRawKeys = {};
let leftoverLines = [];

// Step 1: Normalize HTML into clean lines
let cleanHTML = bodyHTML
  .replace(/\r\n|\r/g, '\n')                // Normalize CRLF to LF
  .replace(/<div[^>]*>/gi, '\n')            // Line break on opening <div>
  .replace(/<\/div>/gi, '\n')               // Line break on closing </div>
  .replace(/<br\s*\/?>/gi, '\n')            // Line break on <br>
  .replace(/&nbsp;(?=\s*[:=])/gi, ' ')      // Replace nbsp before : or = with a real space
  .replace(/(?<=[:=]\s*)&nbsp;/gi, '')      // Remove nbsp after :
  .replace(/^(&nbsp;)+|(&nbsp;)+$/gi, '')   // Trim leading/trailing nbsp
  .replace(/<[^>]+>/g, '')                  // Strip all other tags
  .replace(/[ \t]+/g, ' ')                  // Normalize spacing
  .replace(/\s{2,}/g, ' ');                 // Collapse excess whitespace to single spaces

const lines = cleanHTML
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean); // Remove empty lines

// Step 2: Parse structured lines using synonyms
for (const line of lines) {
  let matched = false;
  for (const [canonicalKey, variants] of Object.entries(synonyms)) {
    for (const variant of variants) {
      const fieldRegex = new RegExp(`^${variant}\\s*[:=]\\s*(.+)$`, 'i');
      const fieldMatch = line.match(fieldRegex);
      if (fieldMatch) {
        parsed[canonicalKey] = fieldMatch[1].trim();
        parsedRawKeys[canonicalKey] = variant;
        matched = true;
        break;
      }
    }
    if (matched) break;
  }
  if (!matched) leftoverLines.push(line);
}

// 3️⃣ Extract labels
let labels = await querySelectorAll(html, "span.post-labels a", {
  returnInnerHtml: true,
  stripTags: true
});

// 4️⃣ Extract title
const objectTitle = await querySelector(html, "div.post h3.post-title",{returnInnerHtml: true, stripTags: true});

// 5️⃣ Extract image & link
const imageLink = await getAttribute(html,"div.post-body div.separator a", "href");
const imageUrl = await getAttribute(html,"div.post-body div.separator a img", "src");

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

let notesHTML = '<div class="notes">\n';/*
for (const line of leftoverLines) {
  notesHTML += `  <p>${line}</p>\n`;
}
notesHTML += '</div>\n';
*/ 
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
  imageHTML += `<div class="object-image">\n`;
  imageHTML += `  <a href="${imageLink}">\n`;
  imageHTML += `    <img src="${imageUrl}" alt="${objectTitle}"/>\n`;
  imageHTML += `  </a>\n`;
  imageHTML += `</div>\n`;
}

let titleHTML = '';
if (objectTitle) {
  titleHTML = `<h3 class="object-title">${objectTitle}</h3>\n`;
}

let objectHTML = titleHTML + imageHTML + cardHTML + notesHTML + labelHTML;   

objectHTML = objectHTML + "<br/>==========================================<br/><br/>" + bodyHTML + "<br/>==========================================<br/><br/>" + cleanHTML + "<br/>==========================================<br/><br/>";
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
        const feedRes = await fetch(feedUrl, {
          headers: {
            'Accept': format === 'json' ? 'application/json' : '*/*'
          }
        });
    
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
    } else if (path === '/json') {
      const feedUrl = 'https://' + url.hostname + '/feeds/posts/default?alt=json';
    
      try {
        const feedRes = await fetch(feedUrl, {
          headers: { 'Accept': 'application/json' }
        });
    
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
    const githubResponse = await fetch(githubUrl);
    const htmlSnippet = await githubResponse.text();

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

const { tags, recent } = await getMetaDataWithTimeout(url);  


// Rebuild the body
html = html
  .replace('</head>', `${extraHeadContent}\n</head>`)
  .replace(bodyMatch[0], `<body>\n${newBodyContent}\n</body>`);


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
      const res = await fetch(styleUrl);
      if (res.ok) {
        inlineCSS = await res.text();
      } else {
        console.warn(`Could not fetch CSS for: ${sitename}`);
      }
    } catch (err) {
      console.error(`CSS fetch failed: ${err}`);
    }

    let LOGO_URL = 'https://raw.githubusercontent.com/netlands/sites-templates/main/' + sanitizedName + '-logo.svg';
    const logoExists = await checkLogoExists(LOGO_URL);
   
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
          el.setAttribute('class', `theme-${sanitizedName}`);
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
              tags.map(tag => `  <li>${tag}</li>`).join('\n') +
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
      })
      .on('div.post', {
        element(el) {
          el.setAttribute('style', 'display:none'); // el.remove();
        }
      });
    
    
    
      
    // Cleanup uneeded elements when styling is added
    // Remove the <div id="searchSection">
    html = html.replace(/<div[^>]*id=["']searchSection["'][^>]*>[\s\S]*?<\/div>/i, '');
    html = html.replace(/<div[^>]*class=["']blogger["'][^>]*>[\s\S]*?<\/div>/i, '');
    html = html.replace(/<div[^>]*class=["']blog-feeds["'][^>]*>[\s\S]*?<\/div>/i, '');

    return rewriter.transform(new Response(html, {
      headers: { 'Content-Type': 'text/html' }
    }));

    /* return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    }); */
  }
};

async function getParsedJson(url) {
  const res = await fetch('https://' + url.hostname + '/feeds/posts/default?alt=json');
  const raw = await res.json();
  return {
    entries: raw.feed.entry || []
  };
}

async function getMetaDataWithTimeout(url, timeout = 2000) {
  const metaPromise = (async () => {
    const feed = await getParsedJson(url);
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
    .sort((a, b) => new Date(b.published) - new Date(a.published))
    .slice(0, 5);
  
    return { tags, recent };
  })();

  const timeoutPromise = new Promise(resolve =>
    setTimeout(() => resolve({ tags: [], recent: [] }), timeout)
  );

  return Promise.race([metaPromise, timeoutPromise]);
}

// Check if the logo file exists
async function checkLogoExists(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch (err) {
    return false;
  }
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
