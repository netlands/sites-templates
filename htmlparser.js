// htmlparser.js

/* available functions: 
 querySelector(html, selector, options = {})
 querySelectorAll(html, selector, options = {})
 getElementById(html, id, options = {})
 getElementsByClassName(html, className, options = {})
 getElementsByTagName(html, tagName, options = {})
 getElementsByName(html, name, options = {}) 
 getAttribute(html, selector, attributeName)
 deleteElements(html, selector, options = {})
 replaceElements(html, selector, newHtml, options = {})
 setAttributes(html, selector, attributes, options = {})
 insertHtml(html, selector, position, newHtml, options = {})

Example use:
 import { querySelector, querySelectorAll, deleteElements, replaceElements, setAttributes, insertHtml } from './htmlparser.js'

 default: const outerHtmlContent = await querySelector(html, 'div'); // No options, or { returnInnerHtml: false }
 return innerHTML: const innerHtmlContent = await querySelector(html, 'div', { returnInnerHtml: true });
 strip all tags: const plainTextContent = await querySelector(html, 'div', { returnInnerHtml: true, stripTags: true });
 delete first element: const newHtml = await deleteElements(html, '.ad', { firstOnly: true });
 replace all elements: const updatedHtml = await replaceElements(html, 'span.old', '<div>New Content</div>');
 set attributes: const finalHtml = await setAttributes(html, 'img', { class: 'responsive', 'data-loaded': 'true' });
 insert at end of head: const newHtml = await insertHtml(html, 'head', 'beforeend', '<style>body { color: blue; }</style>');
*/

const debug = true;

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
    // Ensure attribute values are properly escaped if they contain quotes
    const escapedValue = value.replace(/"/g, '&quot;');
    tag += ` ${name}="${escapedValue}"`;
  }
  return tag + '>';
}

/**
 * Collector class that captures the full outer HTML of matched elements.
 * It acts as a state machine, toggled by the specific selector handler.
 */
class Collector {
  /**
   * @param {object} options - Configuration options for the collector.
   * @param {string} [options.attributeName=null] - If provided, the collector will extract this attribute's value.
   */
  constructor(options = {}) {
    this.results = [];
    this.options = {
      attributeName: options.attributeName || null
    };

    // State machine properties for capturing full HTML content
    this.isCapturing = false;
    this.captureBuffer = '';
    this.currentTagName = ''; // Store the tag name of the element currently being captured

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
      // Push the attribute value directly, or an empty string if null
      this.results.push(attributeValue !== null ? attributeValue : "");
      return;
    }

    // If we are already capturing, it means we have a nested match.
    // We reset the buffer for a new capture.
    console.log("Collector: Main selector matched:", el.tagName);
    this.isCapturing = true;
    this.captureBuffer = ''; // Reset buffer for each new match.
    this.currentTagName = el.tagName; // Store the tag name for later use

    // Start capturing the opening tag of the matched element
    this.captureBuffer += _openTag(el);

    // The wildcard handler will build the content. We just need to know when the element ends.
    el.onEndTag(() => {
      console.log("Collector: Main selector ended:", this.currentTagName);
      // Append the closing tag for non-void elements
      if (!VOID_ELEMENTS.has(this.currentTagName.toLowerCase())) {
        this.captureBuffer += `</${this.currentTagName}>`;
      }
      
      // The captureBuffer should now contain the full outerHTML of the element.
      this.results.push(this.captureBuffer);
      console.log("Collector: Finalized content (raw outerHTML):", JSON.stringify(this.captureBuffer));
      
      this.isCapturing = false; // Turn off capture
      this.captureBuffer = ''; // Clean up
      this.currentTagName = ''; // Clear current tag name
    });
  }
}

/**
 * A generic handler for deleting or replacing elements.
 */
class ElementHandler {
    constructor(newHtml = '', options = {}) {
        this.newHtml = newHtml;
        this.firstOnly = options.firstOnly || false;
        this.alreadyActed = false; // to track if the action has been performed for firstOnly
    }

    element(element) {
        if (this.firstOnly && this.alreadyActed) {
            return; // Do nothing if we only act on the first and have already done so.
        }

        if (this.newHtml === null) { // Deletion
            element.remove();
        } else { // Replacement
            element.replace(this.newHtml, { html: true });
        }
        
        this.alreadyActed = true;
    }
}

/**
 * A handler for setting or removing attributes on an element.
 */
class AttributeHandler {
    constructor(attributes, options = {}) {
        this.attributes = attributes;
        this.firstOnly = options.firstOnly || false;
        this.alreadyActed = false;
    }

    element(element) {
        if (this.firstOnly && this.alreadyActed) {
            return;
        }

        for (const [key, value] of Object.entries(this.attributes)) {
            if (value === null) {
                // If the value is null, remove the attribute
                element.removeAttribute(key);
            } else {
                // Otherwise, set the attribute
                element.setAttribute(key, value);
            }
        }

        this.alreadyActed = true;
    }
}


/**
 * A handler for inserting HTML relative to an element.
 */
class InsertHandler {
    /**
     * @param {string} position The position to insert the HTML.
     * @param {string} newHtml The HTML string to insert.
     * @param {object} [options={}] - Configuration options.
     */
    constructor(position, newHtml, options = {}) {
        this.position = position;
        this.newHtml = newHtml;
        this.firstOnly = options.firstOnly || false;
        this.alreadyActed = false;
    }

    element(element) {
        if (this.firstOnly && this.alreadyActed) {
            return;
        }

        switch (this.position) {
            case 'beforebegin':
                element.before(this.newHtml, { html: true });
                break;
            case 'afterbegin':
                element.prepend(this.newHtml, { html: true });
                break;
            case 'beforeend':
                element.append(this.newHtml, { html: true });
                break;
            case 'afterend':
                element.after(this.newHtml, { html: true });
                break;
            default:
                console.error(`ERROR: Invalid position '${this.position}'. Use 'beforebegin', 'afterbegin', 'beforeend', or 'afterend'.`);
                break;
        }

        this.alreadyActed = true;
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
        // Capture the tagName of the nested element immediately
        const nestedTagName = el.tagName; 
        // Append the opening tag of nested elements
        collector.captureBuffer += _openTag(el);

        // If it's not a void element, ensure its closing tag is captured
        if (!VOID_ELEMENTS.has(nestedTagName.toLowerCase())) { // Use nestedTagName here
          el.onEndTag(() => {
            collector.captureBuffer += `</${nestedTagName}>`; // Use nestedTagName here
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
        collector.captureBuffer += ``;
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
    .on('*', contentHandler) // The general content handler for all elements/text/comments
    .on(selector, collector) // The specific handler to toggle state and mark the start/end of the main element
    .transform(responseStream);

  console.log("_runRewriter: Awaiting rewriterResponse.text() to drain the stream.");
  // Drain the transformed stream to ensure all handlers are invoked
  await rewriterResponse.text();
  console.log("_runRewriter: rewriterResponse.text() completed. Collector results count:", collector.results.length);
  return collector;
}

/**
 * Internal helper: Processes the raw captured HTML content based on options.
 * @param {string} content The raw HTML string (outer HTML of the matched element).
 * @param {object} options - Configuration options.
 * @param {boolean} [options.returnInnerHtml=false] - If true, returns innerHTML instead of outerHTML.
 * @param {boolean} [options.stripTags=false] - If true, strips HTML tags from the content. Only applies if returnInnerHtml is true.
 * @returns {string} The processed content string.
 */
function _processContent(content, options) {
  let processedContent = content;

  // 1. If returnInnerHtml is true, remove the outermost tag pair
  if (options.returnInnerHtml) {
    // Regex to match the opening tag (non-greedy) and then anything up to the closing tag
    // This assumes `content` is the outerHTML of a single element.
    const match = processedContent.match(/^<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>$/i);
    if (match) {
      // Group 3 contains the inner HTML
      processedContent = match[3];
    } else {
      // Handle void elements or elements without explicit closing tags (e.g., <br>, <img>)
      // If it's a void element, innerHTML is empty.
      // If it's a self-closing XML-style tag (e.g., <div/>), innerHTML is empty.
      // For simplicity, if no opening/closing tag pair is found, assume it's a void element or has no inner content.
      processedContent = "";
    }
  }

  // 2. If stripTags is true (and applies to innerHTML if that was selected)
  if (options.stripTags && options.returnInnerHtml) {
    // This regex removes all HTML tags from the content
    processedContent = processedContent.replace(/<[^>]*>/g, '');
  }

  return processedContent;
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
  
  // Process the captured content if a result was found
  if (collector.results.length) {
    return _processContent(collector.results[0], options);
  }
  return null;
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
  
  // Process all captured results
  return collector.results.map(content => _processContent(content, options));
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

/**
 * Deletes elements from an HTML string based on a CSS selector.
 * @param {string} html The HTML string to parse.
 * @param {string} selector The CSS selector for the elements to delete.
 * @param {object} [options={}] - Configuration options.
 * @param {boolean} [options.firstOnly=false] - If true, deletes only the first matched element.
 * @returns {Promise<string>} The modified HTML string.
 */
export async function deleteElements(html, selector, options = {}) {
    const handler = new ElementHandler(null, options);
    
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(html));
            controller.close();
        }
    });

    const responseStream = new Response(readableStream, {
        headers: { 'content-type': 'text/html' }
    });

    const rewriter = new HTMLRewriter().on(selector, handler);
    const transformedResponse = rewriter.transform(responseStream);

    return await transformedResponse.text();
}

/**
 * Replaces elements in an HTML string with a new HTML string.
 * @param {string} html The HTML string to parse.
 * @param {string} selector The CSS selector for the elements to replace.
 * @param {string} newHtml The HTML string to be used as a replacement.
 * @param {object} [options={}] - Configuration options.
 * @param {boolean} [options.firstOnly=false] - If true, replaces only the first matched element.
 * @returns {Promise<string>} The modified HTML string.
 */
export async function replaceElements(html, selector, newHtml, options = {}) {
    if (typeof newHtml !== 'string') {
        console.error("ERROR: newHtml must be a string for replaceElements.");
        return html; // Return original html if newHtml is invalid
    }
    
    const handler = new ElementHandler(newHtml, options);

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(html));
            controller.close();
        }
    });

    const responseStream = new Response(readableStream, {
        headers: { 'content-type': 'text/html' }
    });

    const rewriter = new HTMLRewriter().on(selector, handler);
    const transformedResponse = rewriter.transform(responseStream);

    return await transformedResponse.text();
}

/**
 * Sets or removes attributes on elements matching a CSS selector.
 * @param {string} html The HTML string to parse.
 * @param {string} selector The CSS selector for the elements to modify.
 * @param {object} attributes An object of attributes to set. The key is the attribute name and the value is the attribute value. A value of `null` will remove the attribute.
 * @param {object} [options={}] - Configuration options.
 * @param {boolean} [options.firstOnly=false] - If true, modifies only the first matched element.
 * @returns {Promise<string>} The modified HTML string.
 */
export async function setAttributes(html, selector, attributes, options = {}) {
    if (typeof attributes !== 'object' || attributes === null) {
        console.error("ERROR: attributes must be an object for setAttributes.");
        return html;
    }

    const handler = new AttributeHandler(attributes, options);

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(html));
            controller.close();
        }
    });

    const responseStream = new Response(readableStream, {
        headers: { 'content-type': 'text/html' }
    });
    
    const rewriter = new HTMLRewriter().on(selector, handler);
    const transformedResponse = rewriter.transform(responseStream);

    return await transformedResponse.text();
}

/**
 * Inserts new HTML content relative to an element.
 * The positions correspond to the standard browser `insertAdjacentHTML` method.
 * @param {string} html The HTML string to parse.
 * @param {string} selector The CSS selector for the target element.
 * @param {string} position The position to insert the HTML. Must be one of 'beforebegin', 'afterbegin', 'beforeend', 'afterend'.
 * @param {string} newHtml The HTML string to insert.
 * @param {object} [options={}] - Configuration options.
 * @param {boolean} [options.firstOnly=false] - If true, modifies only the first matched element.
 * @returns {Promise<string>} The modified HTML string.
 */
export async function insertHtml(html, selector, position, newHtml, options = {}) {
    if (typeof newHtml !== 'string') {
        console.error("ERROR: newHtml must be a string for insertHtml.");
        return html;
    }
    if (!['beforebegin', 'afterbegin', 'beforeend', 'afterend'].includes(position)) {
        console.error(`ERROR: Invalid position '${position}'. Use 'beforebegin', 'afterbegin', 'beforeend', or 'afterend'.`);
        return html;
    }

    const handler = new InsertHandler(position, newHtml, options);
    
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
        start(controller) {
            controller.enqueue(encoder.encode(html));
            controller.close();
        }
    });

    const responseStream = new Response(readableStream, {
        headers: { 'content-type': 'text/html' }
    });
    
    const rewriter = new HTMLRewriter().on(selector, handler);
    const transformedResponse = rewriter.transform(responseStream);

    return await transformedResponse.text();
}