document.addEventListener("DOMContentLoaded", () => {
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