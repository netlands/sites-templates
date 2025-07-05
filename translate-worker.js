const supportedLangs = [
  'ar',      // Arabic
  'bg',      // Bulgarian
  'cs',      // Czech
  'da',      // Danish
  'de',      // German
  'el',      // Greek
  'es',      // Spanish
  'et',      // Estonian
  'fi',      // Finnish
  'fr',      // French
  'hu',      // Hungarian
  'id',      // Indonesian
  'it',      // Italian
  'ja',      // Japanese
  'ko',      // Korean
  'lt',      // Lithuanian
  'lv',      // Latvian
  'nb',      // Norwegian Bokmål
  'nl',      // Dutch
  'pl',      // Polish
  'pt-br',   // Portuguese (Brazilian)
  'pt-pt',   // Portuguese (Portugal)
  'ro',      // Romanian
  'ru',      // Russian
  'sk',      // Slovak
  'sl',      // Slovenian
  'sv',      // Swedish
  'tr',      // Turkish
  'uk',      // Ukrainian
  'zh-hans', // Chinese (Simplified)
  'zh-hant', // Chinese (Traditional)
  'vi',      // Vietnamese
  'th',      // Thai
  'id',      // Indonesian
  'ms',      // Malaysian
  'my'       // Burmese
]; 
//'en', 'en-us', 'en-gb'

function buildRewriter(targetLang) {
  return new HTMLRewriter()
  .on('html', {
    element(el) {
      const existing = el.getAttribute('class');
      el.setAttribute('class', existing ? `${existing} translated` : 'translated');
      el.setAttribute('lang', targetLang);
      el.setAttribute('data-provider', provider);
    }
  })
  .on('a[href^="/en/"]', {
    element(el) {
      const href = el.getAttribute('href');
      if (href) {
        el.setAttribute('href', href.replace(/^\/en\//, `/${targetLang}/`));
      }
    }
  });
}

function protectTags(html, protectedTags) {
  const blocks = [];
  const tagPattern = new RegExp(
    `<(${protectedTags.join('|')})([^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'gi'
  );

  const protectedHtml = html.replace(tagPattern, (match) => {
    const index = blocks.length;
    blocks.push(match);
    return `<!--PROTECTED_BLOCK_${index}-->`;
  });

  return { protectedHtml, blocks };
}

function restoreTags(html, blocks) {
  return html.replace(/<!--PROTECTED_BLOCK_(\d+)-->/g, (_, i) => blocks[i]);
}

let provider = 'NONE';

export default {
  async fetch(request, env, ctx) {
    try {
      const originUrl = request.headers.get('X-Origin-URL');
      const targetLang = request.headers.get('X-target-lang');
      const updateLocalLinks = request.headers.get('X-update-links');
      // const provider = env.TRANSLATION_PROVIDER || 'AZURE'; // 'DEEPL' or 'AZURE'

      const urlObj = new URL(originUrl);
      const forcedProvider = urlObj.searchParams.get('provider');
      const validProviders = ['DEEPL', 'AZURE']; // Add others like 'YANDEX', 'ALIBABA' if available
      
      if (forcedProvider && validProviders.includes(forcedProvider.toUpperCase())) {
        provider = forcedProvider.toUpperCase();
        console.log(`Forced provider via query string: ${provider}`);
      } else {
        provider = await chooseAvailableProvider(env);
      }

      async function canUseDeepL(apiKey) {
        const res = await fetch('https://api-free.deepl.com/v2/usage', {
          headers: {
            'Authorization': `DeepL-Auth-Key ${apiKey}`
          }
        });
      
        if (!res.ok) {
          console.log('DeepL check failed: HTTP', res.status);
          return false;
        }
      
        const data = await res.json();
        const available = (data.character_limit - data.character_count) > 25000;
        console.log(`DeepL usage: ${data.character_count}/${data.character_limit} → Available: ${available}`);
        return available;
      }
      
      async function canUseAzure(apiKey, region) {
        const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'Ocp-Apim-Subscription-Region': region,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ Text: "ping" }])
        });
      
        const available = res.status !== 429;
        console.log(`Azure response status: ${res.status} → Available: ${available}`);
        return available;
      }
      
      async function chooseAvailableProvider(env) {
        if (await canUseDeepL(env.DEEPL_API_KEY)) return 'DEEPL';
        if (await canUseAzure(env.AZURE_API_KEY, env.AZURE_REGION)) return 'AZURE';
        console.log('No available translation provider at the moment.');
        return null;
      }
      
      // Usage provider = await chooseAvailableProvider(env);

      if (!originUrl || !targetLang) {
        return new Response('Missing required headers: X-Origin-URL and/or X-target-lang', { status: 400 });
      }

      const htmlContent = await request.text();
      const protectedTags = ['style', 'script', 'code', 'pre'];
      const { protectedHtml, blocks } = protectTags(htmlContent, protectedTags);

      let translatedHtml = '';

      if (provider === 'DEEPL') {
        const res = await fetch('https://api-free.deepl.com/v2/translate', {
          method: 'POST',
          headers: {
            'Authorization': `DeepL-Auth-Key ${env.DEEPL_API_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            text: protectedHtml,
            target_lang: targetLang.toUpperCase(),
            tag_handling: 'html'
          })
        });

        if (!res.ok) {
          const errorText = await res.text();
          return new Response('Translation failed: ' + errorText, { status: 502 });
        }

        const data = await res.json();
        translatedHtml = data?.translations?.[0]?.text;

        if (!translatedHtml) {
          return new Response('Translation failed: No content', { status: 502 });
        }

      } else if (provider === 'AZURE') {
        const endpoint = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${encodeURIComponent(targetLang)}&textType=html`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': env.AZURE_TRANSLATOR_KEY,
            'Ocp-Apim-Subscription-Region': env.AZURE_REGION,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{ Text: protectedHtml }])
        });

        if (!res.ok) {
          const errorText = await res.text();
          return new Response('Translation failed: ' + errorText, { status: 502 });
        }

        const data = await res.json();
        translatedHtml = data?.[0]?.translations?.[0]?.text;

        if (!translatedHtml) {
          return new Response('Translation failed: No content', { status: 502 });
        }

      } else {
        return new Response(`Unsupported translation provider: ${provider}`, { status: 400 });
      }

      translatedHtml = restoreTags(translatedHtml, blocks);

      translatedHtml = translatedHtml.replace(
        /<html(?![^>]*\btranslate=)/i,
        '<html translate="no"'
      );
  
      if (!translatedHtml.includes('<meta name="google" content="notranslate">')) {
        translatedHtml = translatedHtml.replace(
          /<head([^>]*)>/i,
          `<head$1>\n  <meta name="google" content="notranslate">`
        );
      }


      if (updateLocalLinks === "true") {
        const url = new URL(originUrl); // Gets the full request URL
        const siteBase = `${url.protocol}//${url.host}`; // Builds dynamic site base
        
        translatedHtml = translatedHtml.replace(/<a\s+([^>]*?)href="([^"]+)"([^>]*)>/gi, (match, beforeHref, href, afterHref) => {
          const linkUrl = new URL(href, siteBase);
          const segments = linkUrl.pathname.split("/").filter(Boolean);
          const currentLang = segments[0];
        
          if (currentLang === targetLang) return match; // Already has correct language
          if (supportedLangs.includes(currentLang)) return match; // Known language code present
        
          // Insert missing language code
          segments.unshift(targetLang);
          const updatedPath = "/" + segments.join("/");
        
          // Apply updates
          const updatedAbsoluteHref = `href="${siteBase + updatedPath}"`;
          const updatedRelativeDataUrl = afterHref.includes('data-url="')
            ? afterHref.replace(/data-url="[^"]+"/i, `data-url="${updatedPath}"`)
            : afterHref;
        
          return `<a ${beforeHref}${updatedAbsoluteHref}${updatedRelativeDataUrl}>`;
        });
      }
      
      const response = new Response(translatedHtml, {
        headers: { 'Content-Type': 'text/html' }
      });

      return buildRewriter(targetLang).transform(response);
    } catch (err) {
      console.error('Fatal error in translate worker:', err);
      return new Response('Internal error in translate worker - ' + err.message, { status: 500 });
    }
  }
};
