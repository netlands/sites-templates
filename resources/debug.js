// Live CSS Editor
// Ctrl + Click any element with class "style-editor" to open the editor

(function() {
  // Load Material Symbols font
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);

  document.addEventListener('click', function(e) {
    if (e.ctrlKey && e.target.matches('.style-editor')) {
      e.preventDefault();
      if (document.getElementById('liveStyleEditor')) return;

      // --- STATE VARIABLES ---
      let isMinimized = false;
      let isDocked = false;
      let originalDimensions = {}; // For docking
      let preMinimizeDimensions = {}; // For minimizing
      let dockToLeft = false; // Tracks which side the dialog is docked to
      let lastHighlighted = null; // For the blue highlight on mouseover
      let lastActiveHighlighted = null; // For the red highlight on text input

      // --- CREATE UI ELEMENTS ---

      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.id = 'liveStyleEditor';
      Object.assign(wrapper.style, {
        position: 'fixed',
        top: '40px',
        right: '10px',
        width: '400px',
        height: '350px',
        zIndex: 9999,
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '10px',
        fontFamily: 'monospace',
        resize: 'both',
        overflow: 'hidden',
        boxShadow: '0 5px 15px rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        transition: 'width 0.3s ease, height 0.3s ease, top 0.3s ease, left 0.3s ease, right 0.3s ease, bottom 0.3s ease'
      });

      // Header bar
      const header = document.createElement('div');
      Object.assign(header.style, {
        display: 'flex',
        justifyContent: 'space-between', 
        gap: '8px',
        marginBottom: '4px',
        cursor: 'move',
        userSelect: 'none'
      });
      
      const controlButtons = document.createElement('div');
      Object.assign(controlButtons.style, {
          display: 'flex',
          gap: '8px'
      });

      const logo = document.createElement('div');
      logo.innerText = '{Live Edit CSS}';
      Object.assign(logo.style, {
          fontFamily: 'monospace',
          fontSize: '16px',
          fontWeight: 'bold',
          color: '#333',
          cursor: 'default',
      });
      
      // --- HEADER BUTTONS ---
      const minimizeBtn = document.createElement('span');
      minimizeBtn.className = 'material-symbols-outlined';
      minimizeBtn.innerText = 'minimize';
      minimizeBtn.title = 'Minimize';
      Object.assign(minimizeBtn.style, { fontSize: '20px', cursor: 'pointer', color: '#000' });

      const dockBtn = document.createElement('span');
      dockBtn.className = 'material-symbols-outlined';
      dockBtn.innerText = 'side_navigation';
      dockBtn.title = 'Dock to side';
      Object.assign(dockBtn.style, { fontSize: '20px', cursor: 'pointer', color: '#000', transition: 'transform 0.3s ease' });
      
      const dirIcon = document.createElement('span');
      dirIcon.className = 'material-symbols-outlined';
      dirIcon.innerText = 'dropdown';
      dirIcon.title = 'Move to corner';
      Object.assign(dirIcon.style, { fontSize: '20px', cursor: 'pointer', color: '#000', transition: 'transform 0.3s ease' });
      
      const closeBtn = document.createElement('span');
      closeBtn.className = 'material-symbols-outlined';
      closeBtn.innerText = 'close';
      closeBtn.title = 'Close';
      Object.assign(closeBtn.style, { fontSize: '20px', cursor: 'pointer', color: '#000' });

      // --- OTHER UI ELEMENTS ---
      const textarea = document.createElement('textarea');
      textarea.style.flex = '1';
      textarea.placeholder = 'Type CSS here...';
      Object.assign(textarea.style, { borderRadius: '4px', border: '1px solid #ccc' });

      const controlsRow = document.createElement('div');
      Object.assign(controlsRow.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between' });

      const formatBtn = document.createElement('button');
      formatBtn.innerText = 'Format CSS';
      Object.assign(formatBtn.style, { fontSize: '12px', padding: '4px 8px', cursor: 'pointer', fontFamily: 'monospace', border: '1px solid #ccc', borderRadius: '4px', background: '#f0f0f0' });
      
      const pinCheckbox = document.createElement('input');
      pinCheckbox.type = 'checkbox';
      pinCheckbox.id = 'pinToggle';
      const pinLabel = document.createElement('label');
      pinLabel.htmlFor = 'pinToggle';
      pinLabel.innerText = ' Pin CSS';
      Object.assign(pinLabel.style, { display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', fontSize: '14px', cursor: 'pointer' });
      pinLabel.insertBefore(pinCheckbox, pinLabel.firstChild);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'importantToggle';
      const label = document.createElement('label');
      label.htmlFor = 'importantToggle';
      label.innerText = ' !important';
      Object.assign(label.style, { display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', fontSize: '14px', cursor: 'pointer' });
      label.insertBefore(checkbox, label.firstChild);

      const pathCheckbox = document.createElement('input');
      pathCheckbox.type = 'checkbox';
      pathCheckbox.id = 'pathToggle';
      const pathLabel = document.createElement('label');
      pathLabel.htmlFor = 'pathToggle';
      pathLabel.innerText = ' Show path (Ctrl+Click: insert selector, Ctrl+Alt+Click: insert active style)';
      Object.assign(pathLabel.style, { display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', fontSize: '14px', cursor: 'pointer' });
      pathLabel.insertBefore(pathCheckbox, pathLabel.firstChild);

      const pathDisplay = document.createElement('input');
      pathDisplay.type = 'text';
      pathDisplay.readOnly = true;
      Object.assign(pathDisplay.style, { width: '100%', fontSize: '12px', fontFamily: 'monospace', padding: '4px', border: '1px solid #ccc', background: '#f9f9f9', boxSizing: 'border-box', borderRadius: '4px' });

      const styleTag = document.createElement('style');
      document.head.appendChild(styleTag);
      

      // --- FUNCTIONS ---
      function updateStyles() {
        const css = textarea.value;
        styleTag.innerHTML = checkbox.checked ? addImportant(css) : css;
      }

      function addImportant(css) {
        return css.replace(/([^{}]+){([^}]+)}/g, function(_, selector, rules) {
          var importantRules = rules.split(';').map(rule => {
              if (!rule.trim()) return '';
              return rule.includes('!important') ? rule : rule.trim() + ' !important';
            }).join(';');
          return selector + '{' + importantRules + '}';
        });
      }

      function formatCSS(css) {
        return css.replace(/\s*{\s*/g, ' {\n    ').replace(/;\s*/g, ';\n    ').replace(/\s*}\s*/g, '\n}\n\n').replace(/\n\s*\n/g, '\n').trim();
      }
      
      function getCssPath(el) {
        if (!el || el === document || el.nodeType !== 1) return '';
        const path = [];
        while (el && el.nodeType === 1 && el !== document.body) {
          let selector = el.tagName.toLowerCase();
          if (el.id) { selector += `#${el.id}`; path.unshift(selector); break; }
          if (el.className) {
            const classes = el.className.trim().split(/\s+/).join('.');
            if(classes) selector += `.${classes}`;
          }
          const siblingIndex = Array.from(el.parentNode.children).indexOf(el) + 1;
          selector += `:nth-child(${siblingIndex})`;
          path.unshift(selector);
          el = el.parentNode;
        }
        return path.join(' > ');
      }


/**
 * Generates a CSS string of all explicitly set styles for a given element,
 * including inline styles and styles from linked stylesheets. This function
 * is a more accurate approach as it inspects the source styles, avoiding
 * browser-calculated values.
 *
 * @param {HTMLElement} el The element to get the styles from.
 * @returns {string} The formatted CSS string.
 */
function getActiveCssText(el) {
    // Return an empty string if no element is provided.
    if (!el) {
        console.warn("No element provided to getActiveCssText.");
        return '';
    }

    let cssText = '';
    const uniqueDeclarations = new Set();

    // Helper function to add a declaration to the set, preventing duplicates.
    const addDeclaration = (declaration) => {
        // Normalize whitespace and remove trailing semicolon
        const normalizedDecl = declaration.trim().replace(/;$/, '');
        if (normalizedDecl && !uniqueDeclarations.has(normalizedDecl)) {
            // Also filter out any declarations from the tool's highlighting logic.
            if (!normalizedDecl.startsWith('outline:')) {
                uniqueDeclarations.add(normalizedDecl);
            }
        }
    };

    // 1. Get Inline Styles (the most direct "actively assigned" styles)
    if (el.style.length > 0) {
        cssText += `/* Inline Styles */\n`;
        // Split the inline styles into individual declarations and add them.
        el.style.cssText.trim().split(';').forEach(decl => {
            if (decl.trim() !== '') {
                addDeclaration(decl);
            }
        });
    }

    // 2. Iterate through stylesheets to find matching rules
    for (const sheet of document.styleSheets) {
        try {
            for (const rule of sheet.cssRules) {
                if (rule instanceof CSSStyleRule && el.matches(rule.selectorText)) {
                    // Split the rule's styles into individual declarations and add them.
                    rule.style.cssText.trim().split(';').forEach(decl => {
                        if (decl.trim() !== '') {
                            addDeclaration(decl);
                        }
                    });
                }
            }
        } catch (e) {
            console.warn("Could not access stylesheet:", sheet.href, e);
        }
    }
    
    // Build the final CSS string from the unique declarations.
    if (uniqueDeclarations.size > 0) {
        if (cssText !== '') {
            cssText += '\n';
        }
        cssText += `/* Styles from matching rules */\n`;
        uniqueDeclarations.forEach(decl => {
            cssText += `    ${decl};\n`;
        });
    }

    return cssText;
}


      function simplifySelector(selector) {
          selector = " " + selector; 
          return selector.replace(/:nth-child\(\d+\)/g, '').replace(/\s*>\s*/g, ' ').replace(/\s+/g, ' ').trim();
      }
      
      const highlightColor = "#0077ff"; 

      function highlightElement(el) {
        if (lastHighlighted && lastHighlighted !== el) { lastHighlighted.style.outline = ''; }
        if (el && el !== document.body && el.nodeType === 1 && !wrapper.contains(el)) {
          el.style.outline = `2px dashed ${highlightColor}`;
          lastHighlighted = el;
        }
      }

      function removeHighlight() {
          if (lastHighlighted) { lastHighlighted.style.outline = ''; lastHighlighted = null; }
      }
      
      function highlightActiveSelector() {
          if (!pathCheckbox.checked) {
              removeActiveHighlight();
              return;
          }
          const text = textarea.value;
          const cursorPosition = textarea.selectionStart;
      
          const rulesRegex = /([^{}]+)\s*\{([^}]*)\}/g;
          let match;
          let activeSelector = null;
      
          while ((match = rulesRegex.exec(text)) !== null) {
              const selectorStart = match.index;
              const rulesEnd = match.index + match[0].length;
      
              if (cursorPosition >= selectorStart && cursorPosition <= rulesEnd) {
                  activeSelector = match[1].trim();
                  break;
              }
          }
      
          if (activeSelector) {
              try {
                  const el = document.querySelector(activeSelector);
                  if (el) {
                      if (lastActiveHighlighted && lastActiveHighlighted !== el) {
                          lastActiveHighlighted.style.outline = '';
                      }
                      el.style.outline = '2px dotted red';
                      lastActiveHighlighted = el;
                      return;
                  }
              } catch (e) {
                  // Ignore invalid selectors
              }
          }
          removeActiveHighlight();
      }

      function removeActiveHighlight() {
          if (lastActiveHighlighted) {
              lastActiveHighlighted.style.outline = '';
              lastActiveHighlighted = null;
          }
      }
      
      function setDialogContentVisibility(visible) {
          const children = [formatBtn, textarea, label, pathLabel, pathDisplay, pinLabel];
          children.forEach(child => { child.style.display = visible ? '' : 'none'; });
          logo.style.display = visible ? '' : 'none';
      }

      function updateDockIconOrientation() {
        if (!isDocked && !isMinimized) {
          const rect = wrapper.getBoundingClientRect();
          dockToLeft = rect.left < (window.innerWidth / 2);
          dockBtn.style.transform = dockToLeft ? 'scaleX(-1)' : 'scaleX(1)';
        }
      }

      // --- LOCAL STORAGE FUNCTIONS ---
      function loadPinnedCss() {
          const pinned = localStorage.getItem('liveCssPinned');
          const content = localStorage.getItem('liveCssContent');
          if (pinned === 'true' && content) {
              pinCheckbox.checked = true;
              textarea.value = content;
              updateStyles();
          }
      }

      function togglePinCss() {
          if (pinCheckbox.checked) {
              localStorage.setItem('liveCssPinned', 'true');
              localStorage.setItem('liveCssContent', textarea.value);
          } else {
              localStorage.removeItem('liveCssPinned');
              localStorage.removeItem('liveCssContent');
          }
      }

      function saveCssIfPinned() {
          if (pinCheckbox.checked) {
              localStorage.setItem('liveCssContent', textarea.value);
          }
      }
      
      const pathMouseMoveHandler = e => {
        if (!wrapper.contains(e.target) && pathCheckbox.checked) {
            removeActiveHighlight();
            highlightElement(e.target);
            const path = getCssPath(e.target);
            const simplifiedPath = simplifySelector(path);
            pathDisplay.value = simplifiedPath;
        } else if (wrapper.contains(e.target) && lastHighlighted) {
            removeHighlight();
        } else if (!pathCheckbox.checked) {
            removeHighlight();
            removeActiveHighlight();
            pathDisplay.value = '';
        }
      };

      const pathClickHandler = function insertPathOrStyle(e) {
          if (pathCheckbox.checked && e.ctrlKey && !wrapper.contains(e.target)) {
              e.preventDefault();
                const targetElement = e.target;
              const simplifiedPath = simplifySelector(getCssPath(targetElement));
              
                if (e.altKey) {
                    const activeCss = getActiveCssText(targetElement);
                    const newRule = `${simplifiedPath} {\n${activeCss}}\n\n`;
                    textarea.value += newRule;
                    updateStyles();
                } else {
                    if (!textarea.value.includes(simplifiedPath)) {
                        const newRule = `${simplifiedPath} {\n    \n}\n\n`;
                        textarea.value += newRule;
                        updateStyles();
                    }
                }
          }
      };
      
      const handleMouseOut = (e) => {
          if (e.relatedTarget && wrapper.contains(e.relatedTarget)) { return; }
          if (isDocked) {
              if (dockToLeft) { wrapper.style.left = '-392px'; } 
              else { wrapper.style.right = '-392px'; }
          }
      };
      
      const handleMouseOver = () => {
          if (isDocked) {
              if (dockToLeft) { wrapper.style.left = '0px'; } 
              else { wrapper.style.right = '0px'; }
          }
      };
      
      // --- EVENT LISTENERS (and their removal on close) ---
      closeBtn.addEventListener('click', () => {
        if (!pinCheckbox.checked) {
            localStorage.removeItem('liveCssPinned');
            localStorage.removeItem('liveCssContent');
        }
        removeHighlight();
        removeActiveHighlight();
        wrapper.remove();
        styleTag.remove();
        
        document.removeEventListener('mousemove', pathMouseMoveHandler);
        document.removeEventListener('click', pathClickHandler, { capture: true });
        wrapper.removeEventListener('mouseover', handleMouseOver);
        wrapper.removeEventListener('mouseout', handleMouseOut);
        textarea.removeEventListener('input', highlightActiveSelector);
        textarea.removeEventListener('click', highlightActiveSelector);
        textarea.removeEventListener('blur', removeActiveHighlight);
        pathCheckbox.removeEventListener('change', removeActiveHighlight);
      });
      
      minimizeBtn.addEventListener('click', () => {
          if (!isMinimized) {
              const rect = wrapper.getBoundingClientRect();
              preMinimizeDimensions = { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` };
          }

          isMinimized = !isMinimized;
          
          setDialogContentVisibility(!isMinimized);
          wrapper.style.resize = isMinimized ? 'none' : 'both';
          minimizeBtn.innerText = isMinimized ? 'crop_square' : 'minimize';
          minimizeBtn.title = isMinimized ? 'Maximize' : 'Minimize';

          if (isMinimized) {
              wrapper.style.height = 'auto';
              wrapper.style.width = 'auto';
              wrapper.style.padding = '4px 10px'; 
              
              const rect = { top: parseFloat(preMinimizeDimensions.top), left: parseFloat(preMinimizeDimensions.left), bottom: parseFloat(preMinimizeDimensions.top) + parseFloat(preMinimizeDimensions.height), right: window.innerWidth - (parseFloat(preMinimizeDimensions.left) + parseFloat(preMinimizeDimensions.width)) };
              const dist = { top: rect.top, bottom: window.innerHeight - rect.bottom, left: rect.left, right: rect.right };
              const closestEdge = Object.keys(dist).reduce((a, b) => dist[a] < dist[b] ? a : b);
              wrapper.style.top = wrapper.style.bottom = wrapper.style.left = wrapper.style.right = '';

              switch (closestEdge) {
                  case 'top':     wrapper.style.top = '0px'; wrapper.style.left = preMinimizeDimensions.left; break;
                  case 'bottom':  wrapper.style.bottom = '0px'; wrapper.style.left = preMinimizeDimensions.left; break;
                  case 'left':    wrapper.style.left = '0px'; wrapper.style.top = preMinimizeDimensions.top; break;
                  case 'right':   wrapper.style.right = '0px'; wrapper.style.top = preMinimizeDimensions.top; break;
              }
          } else {
              Object.assign(wrapper.style, { ...preMinimizeDimensions, padding: '10px', right: '', bottom: '' });
          }
      });
      
      dockBtn.addEventListener('click', () => {
        if (isMinimized) { minimizeBtn.click(); }
        isDocked = !isDocked;
        if (isDocked) {
            const rect = wrapper.getBoundingClientRect();
            originalDimensions = { top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` };
            Object.assign(wrapper.style, { top: '0px', left: dockToLeft ? '0px' : '', right: dockToLeft ? '' : '0px', bottom: '0px', width: '400px', height: '100vh', resize: 'none', borderRadius: '0', transition: 'left 0.3s ease, right 0.3s ease' });
            minimizeBtn.style.display = 'none';
            logo.style.display = 'none';
            dockBtn.title = 'Undock';
            dockBtn.style.transform = dockToLeft ? 'scaleX(-1)' : 'scaleX(1)';
            wrapper.addEventListener('mouseover', handleMouseOver);
            wrapper.addEventListener('mouseout', handleMouseOut);
        } else {
            Object.assign(wrapper.style, { ...originalDimensions, resize: 'both', borderRadius: '8px', transition: 'width 0.3s ease, height 0.3s ease, top 0.3s ease, left 0.3s ease, right 0.3s ease, bottom 0.3s ease' });
            minimizeBtn.style.display = '';
            logo.style.display = '';
            dockBtn.title = 'Dock to side';
            updateDockIconOrientation();
            wrapper.removeEventListener('mouseover', handleMouseOver);
            wrapper.removeEventListener('mouseout', handleMouseOut);
        }
      });

      const cornerPositions = {
        'top-right':    { top: '10px', right: '10px', bottom: '',  left: '',  transform: 'rotate(90deg)' },
        'bottom-right': { top: '',    right: '10px', bottom: '10px', left: '',  transform: 'rotate(180deg)' },
        'bottom-left':  { top: '',    right: '',    bottom: '10px', left: '10px', transform: 'rotate(-90deg)' },
        'top-left':     { top: '10px', right: '',    bottom: '',  left: '10px', transform: 'rotate(0deg)' }
      };
      const cornerKeys = Object.keys(cornerPositions);
      let currentCornerIndex = 0;
      dirIcon.style.transform = cornerPositions[cornerKeys[currentCornerIndex]].transform;

      dirIcon.addEventListener('click', () => {
          if (isDocked) { dockBtn.click(); }
          if (isMinimized) { minimizeBtn.click(); }
          currentCornerIndex = (currentCornerIndex + 1) % cornerKeys.length;
          const newPosition = cornerPositions[cornerKeys[currentCornerIndex]];
          Object.assign(wrapper.style, { top: newPosition.top, right: newPosition.right, bottom: newPosition.bottom, left: newPosition.left });
          dirIcon.style.transform = newPosition.transform;
          updateDockIconOrientation();
      });

      textarea.addEventListener('input', () => {
        updateStyles();
        saveCssIfPinned();
        highlightActiveSelector();
      });
      checkbox.addEventListener('change', updateStyles);
      formatBtn.addEventListener('click', () => {
        textarea.value = formatCSS(textarea.value);
        updateStyles();
        saveCssIfPinned();
      });
      pinCheckbox.addEventListener('change', togglePinCss);
      textarea.addEventListener('blur', removeActiveHighlight);
      textarea.addEventListener('click', highlightActiveSelector);
      pathCheckbox.addEventListener('change', () => {
          if (!pathCheckbox.checked) { removeActiveHighlight(); }
      });

      document.addEventListener('mousemove', pathMouseMoveHandler);
      document.addEventListener('click', pathClickHandler, { capture: true });

      header.addEventListener('mousedown', function(e) {
          if (isDocked || isMinimized) return;
          let offsetX = e.clientX - wrapper.getBoundingClientRect().left;
          let offsetY = e.clientY - wrapper.getBoundingClientRect().top;
          
          function mouseMoveHandler(e) {
              wrapper.style.left = `${e.clientX - offsetX}px`;
              wrapper.style.top = `${e.clientY - offsetY}px`;
              wrapper.style.right = '';
              wrapper.style.bottom = '';
              updateDockIconOrientation();
          }

          function mouseUpHandler() {
              document.removeEventListener('mousemove', mouseMoveHandler);
              document.removeEventListener('mouseup', mouseUpHandler);
          }

          document.addEventListener('mousemove', mouseMoveHandler);
          document.addEventListener('mouseup', mouseUpHandler);
      });

      // Assemble editor
      controlButtons.appendChild(minimizeBtn);
      controlButtons.appendChild(dockBtn);
      controlButtons.appendChild(dirIcon);
      controlButtons.appendChild(closeBtn);
      header.appendChild(logo);
      header.appendChild(controlButtons);
      controlsRow.appendChild(formatBtn);
      controlsRow.appendChild(pinLabel);
      wrapper.appendChild(header);
      wrapper.appendChild(controlsRow);
      wrapper.appendChild(textarea);
      wrapper.appendChild(label);
      wrapper.appendChild(pathLabel);
      wrapper.appendChild(pathDisplay);
      document.body.appendChild(wrapper);

      // Initial calls
      updateDockIconOrientation();
      loadPinnedCss();
}
    });
})();