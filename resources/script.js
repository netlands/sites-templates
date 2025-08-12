
  document.addEventListener("DOMContentLoaded", function () {
          const searchToggles = document.querySelectorAll(".search-toggle");
        
          searchToggles.forEach(toggle => {
            toggle.addEventListener("click", function (e) {
              e.preventDefault();
              document.body.classList.toggle("show-search-box");
            });
          });


    const menuToggleBtn = document.getElementById('menu-toggle');
    const menuIcon = menuToggleBtn.querySelector('.material-symbols-outlined');
    const collapsibleMenu = document.querySelector('.collapsible-menu');
    const topSearchToggle = document.querySelector('.menu-toggle-container .search-toggle');

    function openMenu() {
      collapsibleMenu.classList.add('open');
      menuIcon.textContent = 'close';
      if (topSearchToggle) topSearchToggle.style.display = 'none';
    }

    function closeMenu() {
      collapsibleMenu.classList.remove('open');
      menuIcon.textContent = 'menu';
      if (topSearchToggle) topSearchToggle.style.display = '';
    }

    menuToggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (collapsibleMenu.classList.contains('open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    document.addEventListener('click', function (e) {
      if (
        collapsibleMenu.classList.contains('open') &&
        !collapsibleMenu.contains(e.target) &&
        !menuToggleBtn.contains(e.target)
      ) {
        closeMenu();
      }
    });

    const currentUrl = window.location.href.split("#")[0]; // Ignore hash
    const links = document.querySelectorAll("a[href]");

    links.forEach(link => {
      const linkUrl = new URL(link.href, document.baseURI).href.split("#")[0];
      if (linkUrl === currentUrl) {
        link.classList.add("active-link");
      }
    });

    const activeLink = document.querySelector(".nav-section .active-link");

    if (activeLink) {
      const container = activeLink.parentElement;
      activeLink.classList.add("title-link");
      container.insertBefore(activeLink, container.firstElementChild);
    }





    const magic = document.querySelector('.made-with-magic');
    const blogger = document.querySelector('.powered-by-blogger');
    let showingMagic = true;

    setInterval(() => {
      if (showingMagic) {
        magic.style.display = 'none';
        blogger.style.display = 'flex';
      } else {
        blogger.style.display = 'none';
        magic.style.display = 'flex';
      }
      showingMagic = !showingMagic;
    }, 12000); // Swaps every 12 seconds    
          
  });
       
window.addEventListener('scroll', () => {
  const isScrolled = window.scrollY > 10;
  document.body.classList.toggle('scrolled', isScrolled);
});


  // Toggle layout order (example switch)
  function toggleHeaderOrder() {
    document.body.classList.toggle('normal-order');
    document.body.classList.toggle('reversed-order');
  }


