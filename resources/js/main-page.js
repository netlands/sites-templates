  document.addEventListener("DOMContentLoaded", function () {
   if (document.documentElement.classList.contains('main-page')) {

          const bgCanvasElement = document.createElement('canvas');
          bgCanvasElement.id = 'bgCanvas';
        
          Object.assign(bgCanvasElement.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: '0',
          });

          const pixelCanvasElement = document.createElement('canvas');
          pixelCanvasElement.id = 'pixelCanvas';
        
          Object.assign(pixelCanvasElement.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            zIndex: '10',
            pointerEvents: 'none',
            opacity: '1',
            transition: 'opacity 1s ease-out'
          });

          document.body.insertBefore(pixelCanvasElement, document.body.firstChild);           
          document.body.insertBefore(bgCanvasElement, document.body.firstChild);

      const fallbackImage = "https://i.pinimg.com/1200x/fd/11/35/fd11358a8c21e6ac3ff30ba9e86a9c9f.jpg"
      const inputImage = document.querySelector('meta[property="og:image"]')?.content || fallbackImage;

        function resizeImage(imageUrl, size) {
          return imageUrl.replace(
            /\/(?:s\d+|w\d+-h\d+(?:-[a-z]+)*)(?=\/)/,
            `/${size}`
          );
        }
           
        // Try to get preload links from the DOM
        const preloadHigh = document.querySelector('link[rel="preload"][as="image"][data-name="highres-image"]');
        const preloadLow = document.querySelector('link[rel="preload"][as="image"][data-name="lowres-image"]');
        
        // Use preload hrefs if available, otherwise fall back to resized inputImage
        const highResUrl = preloadHigh?.href || resizeImage(inputImage, "s0");
        const lowResUrl = preloadLow?.href || resizeImage(inputImage, "s200");
  
    // Get both canvas elements and their contexts
    const pixelCanvas = document.getElementById('pixelCanvas');
    const pixelCtx = pixelCanvas.getContext('2d');
    const bgCanvas = document.getElementById('bgCanvas');
    const bgCtx = bgCanvas.getContext('2d');

    // Create image objects for both the high-res background and the low-res pixelation
    const highResImage = new Image();
    const pixelSourceImage = new Image();



    let pixelSize = 64; // Start with large pixels
    const duration = 2000; // Total animation time in ms
    const steps = 32;
    const interval = duration / steps;
    let animationId = null;

    /**
     * Calculates the correct source (image) and destination (canvas)
     * dimensions to replicate the CSS 'background-size: cover' behavior.
     */
    function calculateCoverDimensions(image, canvas) {
      const canvasAspectRatio = canvas.width / canvas.height;
      const imageAspectRatio = image.naturalWidth / image.naturalHeight;
      let sourceX, sourceY, sourceWidth, sourceHeight;

      if (imageAspectRatio > canvasAspectRatio) {
        // Image is wider than canvas, so we need to crop the sides
        sourceWidth = image.naturalHeight * canvasAspectRatio;
        sourceHeight = image.naturalHeight;
        sourceX = (image.naturalWidth - sourceWidth) / 2;
        sourceY = 0;
      } else {
        // Image is taller than canvas, so we need to crop the top and bottom
        sourceWidth = image.naturalWidth;
        sourceHeight = image.naturalWidth / canvasAspectRatio;
        sourceX = 0;
        sourceY = (image.naturalHeight - sourceHeight) / 2;
      }
      return { sourceX, sourceY, sourceWidth, sourceHeight };
    }
    
    /**
     * Draws the high-resolution image to the background canvas.
     * This function is called on load and on resize.
     */
    function drawBgImage() {
      bgCanvas.width = window.innerWidth;
      bgCanvas.height = window.innerHeight;
      
      if (highResImage.complete) {
        const { sourceX, sourceY, sourceWidth, sourceHeight } = calculateCoverDimensions(highResImage, bgCanvas);
        bgCtx.drawImage(highResImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, bgCanvas.width, bgCanvas.height);
      }
    }

    /**
     * The main animation loop.
     * It draws the low-res image pixelated onto the pixelation canvas.
     */
    function animate() {
      // Clear the pixelation canvas
      pixelCtx.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height);

      const offscreenCanvas = document.createElement('canvas');
      const offscreenCtx = offscreenCanvas.getContext('2d');

      // Get the correct cropped dimensions based on the low-res source image
      const { sourceX, sourceY, sourceWidth, sourceHeight } = calculateCoverDimensions(pixelSourceImage, pixelCanvas);

      // Check for valid dimensions before proceeding
      if (sourceWidth > 0 && sourceHeight > 0 && pixelSourceImage.complete) {
        // Calculate the size of the pixelated grid
        const scaledW = Math.floor(sourceWidth / pixelSize);
        const scaledH = Math.floor(sourceHeight / pixelSize);

        // Ensure the offscreen canvas has valid dimensions before drawing
        if (scaledW > 0 && scaledH > 0) {
          // Resize the offscreen canvas to the pixelated grid size
          offscreenCanvas.width = scaledW;
          offscreenCanvas.height = scaledH;

          // Ensure anti-aliasing is disabled for pixelation
          offscreenCtx.imageSmoothingEnabled = false;

          // Draw the cropped section of the source image to the small, offscreen canvas
          offscreenCtx.drawImage(
            pixelSourceImage,
            sourceX, sourceY, sourceWidth, sourceHeight,
            0, 0, scaledW, scaledH
          );

          // Now, draw the small, pixelated offscreen canvas onto the main canvas,
          // scaling it back up to fill the space.
          pixelCtx.imageSmoothingEnabled = false;
          pixelCtx.drawImage(offscreenCanvas, 0, 0, pixelCanvas.width, pixelCanvas.height);
        }
      }

      // Gradually reduce the pixel size
      if (pixelSize > 1) {
        pixelSize = Math.max(1, pixelSize - 2);
        animationId = setTimeout(animate, interval);
      } else {
        // Once the animation is complete, clear the timeout and hide the canvas abruptly
        clearTimeout(animationId);
        pixelCanvas.style.display = 'none';

        // Set a flag in sessionStorage so the animation doesn't play again this session
        sessionStorage.setItem('pixelationPlayed', 'true');
      }
    }

    /**
     * This function handles resizing and starts the pixelation animation.
     */
    function setupPixelCanvas() {
      // Check if the animation has already been played in this session
      if (sessionStorage.getItem('pixelationPlayed')) {
        pixelCanvas.style.display = 'none';
        return;
      }

      pixelCanvas.width = window.innerWidth;
      pixelCanvas.height = window.innerHeight;

      // Reset opacity and pixel size
      pixelCanvas.style.opacity = '1';
      pixelSize = 64;

      if (animationId) {
        clearTimeout(animationId);
      }
      animate();
    }
    
    // Load the images and set up the canvases
    // The high-res image will load and be drawn as soon as it's ready.
    highResImage.onload = () => {
      drawBgImage();
      window.addEventListener('resize', drawBgImage);
    };
    highResImage.src = highResUrl;

    // The pixelation animation will start as soon as the low-res image is ready,
    // independent of the high-res image loading.
    pixelSourceImage.onload = () => {
      setupPixelCanvas();
      window.addEventListener('resize', setupPixelCanvas);
    };
    pixelSourceImage.src = lowResUrl;
    
  }
});