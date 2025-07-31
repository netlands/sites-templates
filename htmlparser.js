// htmlparser.js

/* 
available functions: 
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
 * Collector handler that records matched element content.
 * It can be configured via options to return innerHTML and/or strip tags.
 */
class Collector {
    /**
     * @param {object} options - Configuration options for the collector.
     * @param {boolean} [options.returnInnerHtml=false] - If true, returns innerHTML instead of outerHTML.
     * @param {boolean} [options.stripTags=false] - If true, strips HTML tags from the content. Only applies if returnInnerHtml is true.
     * @param {string} [options.attributeName=null] - If provided, the collector will attempt to extract this attribute's value.
     */
    constructor(options = {}) {
        this.results = [];
        this._currentElementBuffer = null; // Buffer for the currently matched element's outerHTML content
        this._currentElementTagName = null; // Tag name of the element currently being buffered

        // Set options with defaults
        this.options = {
            returnInnerHtml: options.returnInnerHtml === true,
            stripTags: options.stripTags === true,
            attributeName: options.attributeName || null // New option for attribute extraction
        };
        console.log("Collector: Constructor called with options:", this.options);
    }

    /**
     * Handler for when an element matching the selector is encountered.
     * @param {Element} el The HTMLRewriter Element object.
     */
    element(el) {
        console.log("Collector: Element entered:", el.tagName);

        // If an attributeName is specified, try to get it directly from the element
        if (this.options.attributeName) {
            const attributeValue = el.getAttribute(this.options.attributeName);
            console.log(`Collector: Found attribute '${this.options.attributeName}' with value: ${attributeValue}`);
            this.results.push(attributeValue !== null ? attributeValue : ""); // Push empty string if attribute not found
            // For attribute extraction, we don't need to buffer content or wait for endTag
            return;
        }

        // Check if the element is a void (self-closing) element
        if (VOID_ELEMENTS.has(el.tagName.toLowerCase())) {
            let finalContent = this._openTag(el); // Default: outerHTML

            if (this.options.returnInnerHtml) {
                finalContent = ""; // InnerHTML of a void element is always empty
            }
            // If stripTags is true, it remains empty, so no further action needed here

            this.results.push(finalContent);
            console.log("Collector: Void element finalized immediately:", el.tagName, "Content:", JSON.stringify(finalContent));
        } else {
            // For non-void elements, start buffering the opening tag
            this._currentElementBuffer = this._openTag(el);
            this._currentElementTagName = el.tagName;
            console.log("Collector: Buffer started for:", el.tagName, "Content:", JSON.stringify(this._currentElementBuffer));

            // Use el.onEndTag to capture the closing tag and finalize the buffer for this specific element.
            el.onEndTag(endTag => {
                console.log("Collector: Raw onEndTag object:", endTag); // Log the raw object for debugging
                console.log("Collector: onEndTag triggered for:", endTag.tagName); // This might still log undefined

                // Check if we are currently buffering for an element.
                if (this._currentElementBuffer !== null) {
                    let finalContent = this._currentElementBuffer; // This holds the opening tag + inner text

                    // Append the closing tag to get full outerHTML
                    finalContent += `</${this._currentElementTagName}>`;

                    // --- Apply options based on flags ---
                    // 1. If returnInnerHtml is true, extract inner HTML
                    if (this.options.returnInnerHtml) {
                        // Find the first occurrence of '>' after the opening tag
                        const openTagEndIndex = finalContent.indexOf('>');
                        // Find the last occurrence of '<' before the closing tag (start of closing tag)
                        const closeTagStartIndex = finalContent.lastIndexOf('<');

                        if (openTagEndIndex !== -1 && closeTagStartIndex !== -1 && openTagEndIndex < closeTagStartIndex) {
                            finalContent = finalContent.substring(openTagEndIndex + 1, closeTagStartIndex);
                        } else {
                            // This case should ideally not happen for valid HTML elements with content
                            // or self-closing tags (which are handled separately).
                            finalContent = ""; // No inner content found or malformed structure
                        }
                    }

                    // 2. If stripTags is true (and applies to innerHTML if that was selected)
                    if (this.options.stripTags) {
                        // Use a simple regex to remove all HTML tags.
                        // NOTE: This regex is basic and might not handle all edge cases of malformed HTML
                        // or script tags with content that looks like HTML.
                        finalContent = finalContent.replace(/<[^>]*>/g, '');
                    }
                    // --- End Apply options ---

                    this.results.push(finalContent); // Push the processed content
                    console.log("Collector: Finalized buffer for:", this._currentElementTagName, "Content:", JSON.stringify(finalContent));
                    console.log("Collector: Results count after push:", this.results.length);
                    // Reset for the next potential match (important for querySelectorAll)
                    this._currentElementBuffer = null;
                    this._currentElementTagName = null;
                } else {
                    console.warn(`WARN: onEndTag triggered but no element was being buffered.`);
                }
            });
        }
    }

    /**
     * Handler for text chunks within the currently matched element.
     * @param {TextChunk} textChunk The HTMLRewriter TextChunk object.
     */
    text(textChunk) {
        // Only append text if we are currently buffering for a non-void matched element
        console.log("Collector: Text chunk:", JSON.stringify(textChunk.text), "Current buffered tag:", this._currentElementTagName);
        // Ensure we are not in attribute extraction mode
        if (this._currentElementBuffer !== null && !this.options.attributeName) {
            this._currentElementBuffer += textChunk.text;
            console.log("Collector: Buffer after text:", JSON.stringify(this._currentElementBuffer));
        }
    }

    /**
     * The top-level 'end' method of the Collector is for elements that match the selector.
     * This method is less reliable for text-only elements as observed previously;
     * `el.onEndTag` is the primary mechanism for completing the buffer.
     * @param {Element} el The HTMLRewriter Element object representing the closing tag.
     */
    end(el) {
        console.log("Collector: Top-level end handler called for:", el.tagName);
        // This handler is now largely a fallback/debug point, as el.onEndTag manages the primary buffer finalization.
    }

    /**
     * Helper to construct the opening tag string with attributes.
     * @param {Element} el The HTMLRewriter Element object.
     * @returns {string} The opening HTML tag string.
     */
    _openTag(el) {
        let tag = `<${el.tagName}`;
        for (const [name, value] of el.attributes) {
            tag += ` ${name}="${value}"`;
        }
        return tag + '>';
    }
}

/**
 * Internal helper: Runs HTMLRewriter once with the given selector and returns the Collector instance.
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

    // Apply the HTMLRewriter transformation
    const rewriterResponse = new HTMLRewriter()
        .on(selector, collector) // Register the collector for the specified selector
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
    return collector.results.length ? collector.results[0] : null;
}
