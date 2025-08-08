// This file exports a single class that handles all content rewriting
// to avoid conflicts with the HTMLRewriter's text token lifecycle.

export class templateTagParser {
    // A set to store classes to add to the body.
    // It's part of the class instance to persist state across different text chunks.
    constructor() {
      this.classesToAdd = new Set();
    }
  
    // --- Unified Handler for Text Nodes ---
    // This single method now handles both layout tag parsing and
    // content variable/block replacements. It's a synchronous method.
    text(textChunk) {
      let content = textChunk.text;
      let replaced = false;
  
      // --- Step 1: Parse layout tags like {%test%} ---
      const layoutTagRegex = /{%(.*?)%}/g;
      const matches = [...content.matchAll(layoutTagRegex)];
  
      if (matches.length > 0) {
        replaced = true;
        for (const [, tag] of matches) {
          // Add the found class to our internal set.
          this.classesToAdd.add(`custom-layout-${tag}`);
        }
        // Remove the tags from the content string itself.
        content = content.replace(layoutTagRegex, '');
      }
  
      // --- Step 2: Parse template tags like {{...}} ---
      // Pattern for {{BLOCK}}...{{/BLOCK}}
      const blockTagPattern = /\{\{([A-Z]+)((?:\s+[a-zA-Z0-9_-]+="[^"]*")*)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
      // Pattern for {{SELF_CLOSING/}}
      const selfClosingPattern = /\{\{([A-Z]+)((?:\s+[a-zA-Z0-9_-]+="[^"]*")*)\s*\/\}\}/g;
      // Pattern for {{variable}}
      const varPattern = /{{\s*([a-z$%#!?][^}]*?)\s*}}/g;
  
      // Replace block and self-closing tags with HTML
      content = content.replace(blockTagPattern, (_, tagName, attrs, innerContent) => {
        replaced = true;
        const tag = tagName.toLowerCase();
        return `<${tag}${attrs}>${innerContent}</${tag}>`;
      });
  
      content = content.replace(selfClosingPattern, (_, tagName, attrs) => {
        replaced = true;
        const tag = tagName.toLowerCase();
        return `<${tag}${attrs}/>`;
      });
  
      // Replace simple variable tags
      content = content.replace(varPattern, (match, tag) => {
        replaced = true;
        switch (tag.trim()) {
          case 'sitename':
            return 'Netlands';
          case 'email':
            return 'info@example.com';
          case 'date':
            return new Date().toLocaleDateString();
          case 'deleteMe':
            return '';
          default:
            return match; // Keep unknown tags
        }
      });
  
      // --- Step 3: Replace the text chunk ONCE if any changes were made ---
      // We now replace all chunks if changed, which is the safest approach.
      if (replaced) {
        textChunk.replace(content, { html: true });
      }
    }
  
    // --- Unified Handler for Elements ---
    // This method handles both <body> class injection and <meta> tag cleaning.
    element(element) {
  
      // --- Meta Tag Cleaning ---
      if (element.tagName === 'meta') {
        for (const [name, value] of element.attributes) {
          const cleaned = value
            .replace(/{{.*?}}/g, '')       // Remove {{ ... }}
            .replace(/{%[a-z]+%}/g, '');    // Remove {%word%}      
          if (cleaned !== value) {
            element.setAttribute(name, cleaned);
          }
        }
      }
    }  
      
  }
  

  /**
 * Injects CSS classes into the <body> tag based on {%tag%} tokens in the HTML string.
 * This function is designed to be called on the raw HTML content before
 * it is passed to a streaming parser like HTMLRewriter.
 * * @param {string} html The raw HTML content as a string.
 * @returns {string} The modified HTML string with classes injected and tokens removed.
 */
export function injectLayoutClasses(html) {
    // Use a temporary variable for the modified content
    let modifiedHtml = html;
    
    // 1. Find all {%tag%} tokens and collect the class names
    const layoutTags = [
    ...new Set(
        [...modifiedHtml.matchAll(/{%([a-z]+)%}/g)].map(([, tag]) => `custom-layout-${tag}`)
      )
    ];
    
    // Remove the tokens from the HTML stream
    modifiedHtml = modifiedHtml.replace(/{%[a-z]+%}/g, '');
    
    // Update the <body> tag if unique tags are found
    if (layoutTags.length > 0) {
       
      modifiedHtml = modifiedHtml.replace(
        // The regex needs to handle cases with or without attributes
        /<body([^>]*)>/i,
        (match, attrs) => {
          const hasClassAttr = /\bclass\s*=\s*["'][^"']*["']/.test(attrs);
          const newClasses = layoutTags.join(' ');
          if (hasClassAttr) {
            // If a class attribute already exists, append the new classes
            return match.replace(
              /\bclass\s*=\s*["']([^"']*)["']/,
              (_, existing) => `class="${existing} ${newClasses}"`
            );
          } else {
            // If no class attribute exists, add a new one
            return `<body${attrs} class="${newClasses}">`;
          }
        }
      );
    }
  
    return modifiedHtml;
  }
  

  export function cleanTitle(htmlString) {
    return htmlString.replace(
      /<title>([\s\S]*?)<\/title>/i,
      (_, content) => {
        const cleaned = content
          .replace(/{{.*?}}/g, '')
          .replace(/{%[a-z]+%}/g, '')
          .trim();
        return `<title>${cleaned}</title>`;
      }
    );
  }

  
  export class FinalCleanupHandler {
    text(text) {
      const cleaned = text.text
        .replace(/{{.*?}}/g, '')
        .replace(/{%[a-z]+%}/g, '');
      text.replace(cleaned);
    }
  }
  
  
  
  
