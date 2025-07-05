export default {
  async fetch(request, env, ctx) {
    try {
      const githubUrl = "https://raw.githubusercontent.com/netlands/sites-templates/main/sites-styling.html"
      const snippet = await (await fetch(githubUrl)).text()

      const url = new URL(request.url)
      const pathParts = url.pathname.split('/').filter(Boolean)
      const langCode = pathParts[0]
      const restPath = pathParts.slice(1).join('/')
      const supportedLangs = ['ja', 'ru', 'fr', 'pt-br', 'es', 'de', 'nl', 'it', 'ko', 'da', 'fi', 'nb', 'sv', 'pl', 'vi', 'th', 'id', 'zh-hans', 'zh-hant']
      const fallbackLang = 'en'

      const DISABLE_CACHE = url.searchParams.has("disable_cache")
      ? url.searchParams.get("disable_cache") === "true"
      : false;  // ← Set to true to bypass cache

      let isTranslatedLang = supportedLangs.includes(langCode)
      const lang = isTranslatedLang ? langCode : fallbackLang    
   
      let sourceUrl
      let originRes

        // Check if the original URL exists
        try {
          const headCheck = await fetch(request.url, { method: 'HEAD' })
          if (headCheck.ok) {
            isTranslatedLang = false
            sourceUrl = request.url
          }
        } catch (err) {
          // If HEAD fails, continue with fallback logic
        }

         const candidates = []

        if (isTranslatedLang) {
          // candidates.push(`https://www.netlands.com/${lang}/${restPath}`)
          if (lang !== fallbackLang) {
            candidates.push(`https://www.netlands.com/${fallbackLang}/${restPath}`)
          }
          candidates.push(`https://www.netlands.com/${restPath}`)
        } else {
          candidates.push(request.url)
        }
        
        for (const candidate of candidates) {
          try {
            const headRes = await fetch(candidate, { method: 'HEAD' })
            if (headRes.ok) {
              sourceUrl = candidate
              originRes = await fetch(sourceUrl)
              break
            }
          } catch (err) {
            // Try next candidate
          }
        }
        
        if (!originRes || !originRes.ok) {
          return new Response(`Origin fetch failed for ${candidates.join(' → ')}`, { status: 502 })
        }

      let html = await originRes.text()

      const scriptBlocks = [];
      const styleBlocks = [];
      
      html = html.replace(/<script\b[^>]*?>[\s\S]*?<\/script>/gi, (match) => {
        scriptBlocks.push(match);
        return `__SCRIPT_BLOCK_${scriptBlocks.length - 1}__`;
      });
      
      html = html.replace(/<style\b[^>]*?>[\s\S]*?<\/style>/gi, (match) => {
        styleBlocks.push(match);
        return `__STYLE_BLOCK_${styleBlocks.length - 1}__`;
      });

      // Remove %lowercase% patterns from <meta ...> tags
      html = html.replace(/(<meta\b[^>]*?\bcontent=["'])([^"']*)(["'][^>]*>)/gi,
      (_, start, content, end) => {
        const cleaned = content.replace(/%[a-z]+%/g, '')
        return `${start}${cleaned}${end}`
        }
      )

      /*/ Then, safely wrap remaining %lowercase% patterns elsewhere
      html = html.replace(/%([a-z]+)%/g, (_, tag) =>
        `<span translate="no" class="hidden">%${tag}%</span>`
      )*/

      const layoutTags = [...html.matchAll(/%([a-z]+)%/g)].map(([, tag]) => `custom-layout-${tag}`);

      // If we found any, update the <body> tag
      if (layoutTags.length > 0) {
        html = html.replace(
          /<body([^>]*)>/i,
          (match, attrs) => {
            const hasClassAttr = /\bclass\s*=\s*["'][^"']*["']/.test(attrs);
            if (hasClassAttr) {
              return match.replace(
                /\bclass\s*=\s*["']([^"']*)["']/,
                (_, existing) => `class="${existing} ${layoutTags.join(' ')}"`
              );
            } else {
              return `<body${attrs} class="${layoutTags.join(' ')}">`;
            }
          }
        );
      }

      // Optionally: strip the original tokens from the HTML
      html = html.replace(/%[a-z]+%/g, '');

      // 1. Clean placeholders inside <meta> tags
      html = html.replace(/<meta\b[^>]*?content=["'][^"']*?{{(.*?)}}[^"']*?["']/gi, (match) => {
        return match.replace(/{{|}}/g, '');
      });

      // 2. Replace {{text}} with a span, excluding cases already inside <meta>
      html = html.replace(/{{(.*?)}}/g, (_, content) => {
        return `<span translate="no">${content.trim()}</span>`;
      });

      html = html.replace(/&nbsp;/g, '\u00A0');

      scriptBlocks.forEach((block, i) => {
        html = html.replace(`__SCRIPT_BLOCK_${i}__`, block);
      });
      styleBlocks.forEach((block, i) => {
        html = html.replace(`__STYLE_BLOCK_${i}__`, block);
      });
      

      html = html.replace(
        /<head>/,
        `<head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100..900&display=swap" rel="stylesheet">`
      )

      html = html.replace(/<body([^>]*)>/, (match, attrs) => {
        return `<body${attrs.includes('lang=') ? attrs : attrs + ` lang="${lang}"`}>${snippet}`
      })

      const title = lang === "ja" ? "ネットランズ" : "netlands.com"
      html = html.replace(/<title>(.*?)<\/title>/, `<title "translate="no">${title} - $1</title>`)
    
      if (isTranslatedLang) {
        const cache = caches.default
        const cacheKey = new Request(`${request.url}::${langCode}`, request)

        if (!DISABLE_CACHE) {
          const cached = await cache.match(cacheKey)
          if (cached) {
            console.log(`Serving from cache: ${langCode} version of ${request.url}`)
            return cached
          }
        }

      const updateLocalLinks = true;

        try {
          const translatedRes = await env.translate.fetch(
            new Request('http://dummy', {
              method: 'POST',
              headers: {
                'Content-Type': 'text/html',
                'X-Origin-URL': request.url,
                'X-target-lang': langCode,
                'X-update-links': String(updateLocalLinks)
              },
              body: html
            })
          )

          const translatedHtml = await translatedRes.text()
          const finalResponse = new Response(translatedHtml, {
            headers: {
              'Content-Type': 'text/html',
              'Cache-Control': 'public, max-age=86400'
            }
          })

          if (!DISABLE_CACHE) {
            ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()))
            console.log(`Cached translated response: ${langCode} for ${request.url}`)
          } else {
            console.log(`Bypassing cache for ${langCode} version of ${request.url}`)
          }

          return finalResponse
        } catch (err) {
          console.error('Translate worker failed:', err)
          return new Response('Error communicating with translate worker', { status: 500 })
        }
      } else {
        return new Response(html, {
          headers: { "Content-Type": "text/html" }
        })
      }
    } catch (err) {
      console.error('Unexpected error in main worker:', err)
      return new Response('Unexpected error', { status: 500 })
    }
  }
}
