document.addEventListener('DOMContentLoaded', () => {

    const overlayHTML = `
      <div id="image-overlay">
        <button id="close-overlay">✕</button>
        <div id="zoom-container">
          <img id="zoomed-image" src="" alt="Artwork" draggable="false" />
        </div>
        <div id="image-caption"></div>
        <div id="zoom-preview">Zoom: 100%</div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', overlayHTML);


  // Initialize zoom functionality  // This code handles zooming and panning of images in the overlay.
  // It allows users to view images in detail by zooming in and out, panning around, and resetting the view.
  // The overlay is displayed when an image with the class 'view-original' is clicked.
  const overlay = document.getElementById('image-overlay');
  const zoomedImage = document.getElementById('zoomed-image');
  const closeBtn = document.getElementById('close-overlay');
  const zoomContainer = document.getElementById('zoom-container');
  const zoomPreview = document.getElementById('zoom-preview');

  let scale = 1;
  let originX = 0;
  let originY = 0;
  let isDragging = false;
  let startX, startY;
  let naturalWidth = 0;
  let naturalHeight = 0;
  let maxZoomScale = 2.5; // Default max zoom

function fitAndCenterImage() {
  const containerRect = zoomContainer.getBoundingClientRect();
  const containerW = containerRect.width;
  const containerH = containerRect.height;

  const imgRatio = naturalWidth / naturalHeight;
  const containerRatio = containerW / containerH;

  if (imgRatio > containerRatio) {
    scale = containerW / naturalWidth;
    originX = 0;
    originY = (containerH - naturalHeight * scale) / 2;
  } else {
    scale = containerH / naturalHeight;
    originX = (containerW - naturalWidth * scale) / 2;
    originY = 0;
  }

  applyTransform();
  zoomPreview.textContent = `Zoom: ${Math.round(scale * 100)}%`;
}

  function applyTransform() {
    zoomedImage.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
  }

  document.querySelectorAll('img.view-original').forEach(img => {
    img.addEventListener('click', e => {
      e.preventDefault();
      const originalSrc = img.getAttribute('data-original-src') || img.src;
      zoomedImage.src = originalSrc;
      overlay.style.display = 'flex';

      zoomedImage.onload = () => {
        naturalWidth = zoomedImage.naturalWidth;
        naturalHeight = zoomedImage.naturalHeight;

        // Set max zoom based on longest side
        const longestSide = Math.max(naturalWidth, naturalHeight);
        maxZoomScale = longestSide > 2048 ? 2.5 : 5;

        fitAndCenterImage();
      };
    });

const caption = img.getAttribute('alt') || '';
document.getElementById('image-caption').textContent = caption;

// Toggle caption visibility based on CSS class
if (img.classList.contains('show-caption')) {
  overlay.classList.add('show-caption');
} else {
  overlay.classList.remove('show-caption');
}


    const preloadSrc = img.getAttribute('data-original-src');
    if (preloadSrc) {
      const preload = new Image();
      preload.src = preloadSrc;
    }
  });

  closeBtn.addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  // Esc key to close
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      overlay.style.display = 'none';
    }
  });

  // Zoom with scroll (toward cursor)
zoomContainer.addEventListener('wheel', e => {
  e.preventDefault();

  const containerRect = zoomContainer.getBoundingClientRect();
  const mouseX = e.clientX - containerRect.left;
  const mouseY = e.clientY - containerRect.top;

  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const newScale = Math.min(Math.max(scale + delta, 0.5), maxZoomScale);

  // Calculate mouse position in image space
  const imgX = (mouseX - originX) / scale;
  const imgY = (mouseY - originY) / scale;

  // Adjust origin to keep mouse position stable
  originX = mouseX - imgX * newScale;
  originY = mouseY - imgY * newScale;

  scale = newScale;
  applyTransform();
  zoomPreview.textContent = `Zoom: ${Math.round(scale * 100)}%`;
});

  // Drag to pan
  zoomContainer.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX - originX;
    startY = e.clientY - originY;
    zoomContainer.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    zoomContainer.style.cursor = 'grab';
    document.body.style.userSelect = '';
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    originX = e.clientX - startX;
    originY = e.clientY - startY;
    requestAnimationFrame(applyTransform);
  });

  // Double-click to reset
zoomContainer.addEventListener('dblclick', () => {
  const containerRect = zoomContainer.getBoundingClientRect();
  const containerW = containerRect.width;
  const containerH = containerRect.height;

  const fittedScaleW = containerW / naturalWidth;
  const fittedScaleH = containerH / naturalHeight;
  const fittedScale = Math.min(fittedScaleW, fittedScaleH);

  const isFitted = Math.abs(scale - fittedScale) < 0.01;

  if (isFitted) {
    // Zoom to 100%
    scale = 1;
    originX = (containerW - naturalWidth) / 2;
    originY = (containerH - naturalHeight) / 2;
  } else {
    // Fit to window
    scale = fittedScale;
    const imgRatio = naturalWidth / naturalHeight;
    const containerRatio = containerW / containerH;

    if (imgRatio > containerRatio) {
      originX = 0;
      originY = (containerH - naturalHeight * scale) / 2;
    } else {
      originX = (containerW - naturalWidth * scale) / 2;
      originY = 0;
    }
  }

  applyTransform();
  zoomPreview.textContent = `Zoom: ${Math.round(scale * 100)}%`;
});

/* --------------------- Lazy Loading Images --------------------- */

  
  // Select all images that have the data-original-src attribute.
  const images = document.querySelectorAll("img[data-original-src]");

  // Use IntersectionObserver for more efficient lazy loading.
  const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const originalSrc = img.getAttribute("data-original-src");
        const imgWidth = img.getBoundingClientRect().width;
        
        // Calculate the optimal image size based on the rendered width.
        // We use Math.ceil to round up, ensuring we don't request a smaller
        // image than the space it occupies.
        const targetWidth = Math.ceil(imgWidth);

        // Construct the new, optimized Blogger URL.
        const newOptimizedSrc = originalSrc.replace(
          /\/s\d+(-c)?\//,
          `/s${targetWidth}/`
        );
        console.log(`Loading optimized image: ${newOptimizedSrc}`);

        // Load the new high-quality image in the background.
        const hiResImage = new Image();
        hiResImage.src = newOptimizedSrc;

        hiResImage.onload = () => {
          // Once the high-res image is loaded, replace the placeholder.
          img.src = newOptimizedSrc;
          // Clean up the data attribute and stop observing.
          img.removeAttribute("data-original-src");
          observer.unobserve(img);
        };

        // Add an error handler in case the image fails to load.
        hiResImage.onerror = () => {
          console.error("Failed to load high-res image:", newOptimizedSrc);
          img.removeAttribute("data-original-src");
          observer.unobserve(img);
        };
      }
    });
  }, { rootMargin: "0px 0px 100px 0px" }); // Start loading when the image is 100px from the viewport

  // Start observing all the images.
  images.forEach((img) => observer.observe(img));

  
});
