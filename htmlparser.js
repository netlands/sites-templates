// htmlparser.js

/* available functions: 
 querySelector(html, selector, options = {})
 querySelectorAll(html, selector, options = {})
 getElementById(html, id, options = {})
 getElementsByClassName(html, className, options = {})
 getElementsByTagName(html, tagName, options = {})
 getElementsByName(html, name, options = {}) 
 getAttribute(html, selector, attributeName)

Example use:
 import { querySelector, querySelectorAll } from './htmlparser.js'

 default: const outerHtmlContent = await querySelector(html, 'div'); // No options, or { returnInnerHtml: false }
 return innerHTML: const innerHtmlContent = await querySelector(html, 'div', { returnInnerHtml: true });
 strip all tags: const plainTextContent = await querySelector(html, 'div', { returnInnerHtml: true, stripTags: true });
*/

const debug = false;

if (!debug) {
  console.log = () => {};
}

/**
 * A simple test function to verify imports.
 * @returns {string} A greeting string.
 */
export function test() {
  return "Hello World!";
}

// List of HTML void elements (self-closing tags)
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"
]);

/**
 * Helper to construct the opening tag string with attributes.
 * @param {Element} el The HTMLRewriter Element object.
 * @returns {string} The opening HTML tag string.
 */
function _openTag(el) {
  let tag = `<${el.tagName}`;
  for (const [name, value] of el.attributes) {
    tag += ` ${name}="${value}"`;
  }
  return tag + '>';
}

/**
 * Collector class that now works with a wildcard handler to capture full inner HTML.
 * It acts as a state machine, toggled by the specific selector handler.
 */
class Collector {
  /**
   * @param {object} options - Configuration options for the collector.
   * @param {boolean} [options.returnInnerHtml=false] - If true, returns innerHTML instead of outerHTML.
   * @param {boolean} [options.stripTags=false] - If true, strips HTML tags from the content. Only applies if returnInnerHtml is true.
   * @param {string} [options.attributeName=null] - If provided, the collector will extract this attribute's value.
   */
  constructor(options = {}) {
    this.results = [];
    this.options = {
      returnInnerHtml: options.returnInnerHtml === true,
      stripTags: options.stripTags === true,
      attributeName: options.attributeName || null
    };

    // State machine properties for capturing full HTML content
    this.isCapturing = false;
    this.captureBuffer = '';
    
    console.log("Collector: Constructor called with options:", this.options);
  }

  /**
   * This handler is for the main selector. It acts as a switch to start and stop capturing.
   * @param {Element} el The HTMLRewriter Element object.
   */
  element(el) {
    // Fast path for attribute extraction, which doesn't need complex buffering.
    if (this.options.attributeName) {
      const attributeValue = el.getAttribute(this.options.attributeName);
      console.log(`Collector: Found attribute '${this.options.attributeName}' with value: ${attributeValue}`);
      this.results.push(attributeValue !== null ? attributeValue : "");
      return;
    }

    // If we are already capturing, it means we have a nested match.
    // The current logic handles this by starting a new capture.
    console.log("Collector: Main selector matched:", el.tagName);
    this.isCapturing = true;
    this.captureBuffer = ''; // Reset buffer for each new match.

    // FIX: Capture tagName before the onEndTag callback to avoid using an invalid token.
    const tagName = el.tagName;

    // The wildcard handler will build the content. We just need to know when the element ends.
    el.onEndTag(() => {
      console.log("Collector: Main selector ended:", tagName);
      // The captureBuffer should now contain the full outerHTML of the element.
      let finalContent = this.captureBuffer;

      // --- Apply options based on flags ---
      // 1. If returnInnerHtml is true, extract inner HTML
      if (this.options.returnInnerHtml) {
        // Find the first occurrence of '>' after the opening tag
        const openTagEndIndex = finalContent.indexOf('>');
        // Find the last occurrence of '</' which marks the start of the closing tag
        const closeTagStartIndex = finalContent.lastIndexOf(`</${tagName}>`);

        if (openTagEndIndex !== -1 && closeTagStartIndex !== -1 && openTagEndIndex < closeTagStartIndex) {
          finalContent = finalContent.substring(openTagEndIndex + 1, closeTagStartIndex);
        } else {
          // This handles void elements or elements with no inner content.
          finalContent = "";
        }
      }

      // 2. If stripTags is true (and applies to innerHTML if that was selected)
      if (this.options.stripTags && this.options.returnInnerHtml) {
        finalContent = finalContent.replace(/<[^>]*>/g, '');
      }
      // --- End Apply options ---

      this.results.push(finalContent);
      console.log("Collector: Finalized content:", JSON.stringify(finalContent));
      
      this.isCapturing = false; // Turn off capture
      this.captureBuffer = ''; // Clean up
    });
  }
}

/**
 * Internal helper: Runs HTMLRewriter with a dual-handler setup.
 * @param {string} html The HTML string to parse.
 * @param {string} selector The CSS selector for elements to collect.
 * @param {object} [options={}] - Configuration options for the collector.
 * @returns {Promise<Collector>} A promise that resolves with the Collector instance.
 */
async function _runRewriter(html, selector, options = {}) {
  console.log("_runRewriter: Starting for selector:", selector, "with options:", options);
  const collector = new Collector(options);

  // Create a ReadableStream from the HTML string
  const encoder = new TextEncoder();
  const readableStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(html));
      controller.close();
    }
  });

  // Create a Response object from the ReadableStream
  const responseStream = new Response(readableStream, {
    headers: { 'content-type': 'text/html' }
  });

  // The wildcard handler captures all content when the collector's `isCapturing` flag is true.
  const contentHandler = {
    element(el) {
      if (collector.isCapturing) {
        // FIX: Capture tagName before the onEndTag callback to avoid using an invalid token.
        const tagName = el.tagName;
        console.log("ContentHandler: capturing element", tagName);
        collector.captureBuffer += _openTag(el);

        if (!VOID_ELEMENTS.has(tagName.toLowerCase())) {
          el.onEndTag(() => {
            // Use the captured `tagName` variable which is a valid string.
            collector.captureBuffer += `</${tagName}>`;
          });
        }
      }
    },
    text(chunk) {
      if (collector.isCapturing) {
        console.log("ContentHandler: capturing text", JSON.stringify(chunk.text));
        collector.captureBuffer += chunk.text;
      }
    },
    comments(comment) {
      if (collector.isCapturing) {
        console.log("ContentHandler: capturing comment");
        collector.captureBuffer += `<!--${comment.text}-->`;
      }
    }
  };
  
  // If we are only getting an attribute, we can use a much simpler setup.
  if (options.attributeName) {
      const rewriterResponse = new HTMLRewriter()
        .on(selector, collector) // The collector's element handler has a fast path for attributes
        .transform(responseStream);
      await rewriterResponse.text(); // Drain the stream
      return collector;
  }

  // Apply the dual HTMLRewriter transformation for full content capture
  const rewriterResponse = new HTMLRewriter()
    .on('*', contentHandler) // The general content handler
    .on(selector, collector) // The specific handler to toggle state
    .transform(responseStream);

  console.log("_runRewriter: Awaiting rewriterResponse.text() to drain the stream.");
  // Drain the transformed stream to ensure all handlers are invoked
  await rewriterResponse.text();
  console.log("_runRewriter: rewriterResponse.text() completed. Collector results count:", collector.results.length);
  return collector;
}

/**
 * Returns the content of the first node matching `selector`.
 * @param {string} html The HTML string to parse.
 * @param {string} selector The CSS selector for the desired element.
 * @param {object} [options={}] - Configuration options.
 * @param {boolean} [options.returnInnerHtml=false] - If true, returns innerHTML instead of outerHTML.
 * @param {boolean} [options.stripTags=false] - If true, strips HTML tags from the content. Only applies if returnInnerHtml is true.
 * @returns {Promise<string|null>} The content string of the first match, or null if not found.
 */
export async function querySelector(html, selector, options = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    console.error("ERROR: No valid HTML string provided.");
    return "ERROR: No valid HTML string provided.";
  }

  const collector = await _runRewriter(html, selector, options);
  // Return the first result if available, otherwise null
  return collector.results.length ? collector.results[0] : null;
}

/**
 * Returns an array of content strings for all nodes matching `selector`.
 * @param {string} html The HTML string to parse.
 * @param {string} selector The CSS selector for the desired elements.
 * @param {object} [options={}] - Configuration options.
 * @param {boolean} [options.returnInnerHtml=false] - If true, returns innerHTML instead of outerHTML.
 * @param {boolean} [options.stripTags=false] - If true, strips HTML tags from the content. Only applies if returnInnerHtml is true.
 * @returns {Promise<string[]>} An array of content strings for all matches.
 */
export async function querySelectorAll(html, selector, options = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    console.error("ERROR: No valid HTML string provided.");
    return ["ERROR: No valid HTML string provided."];
  }

  const collector = await _runRewriter(html, selector, options);
  return collector.results;
}

/**
 * Returns the content of the element with the specified ID.
 * Alias for querySelector(html, `#${id}`, options).
 * @param {string} html The HTML string to parse.
 * @param {string} id The ID of the element.
 * @param {object} [options={}] - Configuration options (same as querySelector).
 * @returns {Promise<string|null>} The content string of the element, or null if not found.
 */
export async function getElementById(html, id, options = {}) {
  if (typeof id !== 'string' || !id.trim()) {
    console.error("ERROR: No valid ID provided for getElementById.");
    return null;
  }
  return querySelector(html, `#${id}`, options);
}

/**
 * Returns an array of contents for all elements with the specified class name.
 * Alias for querySelectorAll(html, `.${className}`, options).
 * @param {string} html The HTML string to parse.
 * @param {string} className The class name of the elements.
 * @param {object} [options={}] - Configuration options (same as querySelectorAll).
 * @returns {Promise<string[]>} An array of content strings for the elements.
 */
export async function getElementsByClassName(html, className, options = {}) {
  if (typeof className !== 'string' || !className.trim()) {
    console.error("ERROR: No valid class name provided for getElementsByClassName.");
    return [];
  }
  return querySelectorAll(html, `.${className}`, options);
}

/**
 * Returns an array of contents for all elements with the specified tag name.
 * Alias for querySelectorAll(html, `${tagName}`, options).
 * @param {string} html The HTML string to parse.
 * @param {string} tagName The tag name of the elements (e.g., 'div', 'p', 'a').
 * @param {object} [options={}] - Configuration options (same as querySelectorAll).
 * @returns {Promise<string[]>} An array of content strings for the elements.
 */
export async function getElementsByTagName(html, tagName, options = {}) {
  if (typeof tagName !== 'string' || !tagName.trim()) {
    console.error("ERROR: No valid tag name provided for getElementsByTagName.");
    return [];
  }
  return querySelectorAll(html, tagName, options);
}

/**
 * Returns an array of contents for all elements with the specified 'name' attribute.
 * Alias for querySelectorAll(html, `[name="${name}"]`, options).
 * @param {string} html The HTML string to parse.
 * @param {string} name The value of the 'name' attribute.
 * @param {object} [options={}] - Configuration options (same as querySelectorAll).
 * @returns {Promise<string[]>} An array of content strings for the elements.
 */
export async function getElementsByName(html, name, options = {}) {
  if (typeof name !== 'string' || !name.trim()) {
    console.error("ERROR: No valid name attribute value provided for getElementsByName.");
    return [];
  }
  // Escape the name attribute value to prevent issues with complex values in selector
  const escapedName = name.replace(/"/g, '\\"');
  return querySelectorAll(html, `[name="${escapedName}"]`, options);
}

/**
 * Returns the value of a specific attribute for the first element matching the selector.
 * @param {string} html The HTML string to parse.
 * @param {string} selector The CSS selector for the desired element.
 * @param {string} attributeName The name of the attribute to retrieve (e.g., 'href', 'src', 'alt').
 * @returns {Promise<string|null>} The attribute value, or null if the element or attribute is not found.
 */
export async function getAttribute(html, selector, attributeName) {
  if (typeof html !== 'string' || !html.trim()) {
    console.error("ERROR: No valid HTML string provided for getAttribute.");
    return null;
  }
  if (typeof selector !== 'string' || !selector.trim()) {
    console.error("ERROR: No valid selector provided for getAttribute.");
    return null;
  }
  if (typeof attributeName !== 'string' || !attributeName.trim()) {
    console.error("ERROR: No valid attribute name provided for getAttribute.");
    return null;
  }

  // Use a special option in Collector to signal attribute extraction
  const collector = await _runRewriter(html, selector, { attributeName: attributeName });
  // querySelector logic returns the first item or null
  return collector.results.length ? collector.results[0] : null;
}
