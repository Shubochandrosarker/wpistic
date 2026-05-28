/* WPistic theme — minimal nav interactivity (no dependencies). */
(function () {
  'use strict';

  var nav = document.getElementById('wpistic-nav');
  var toggle = nav && nav.querySelector('.wpistic-nav__toggle');
  var menu = nav && nav.querySelector('.wpistic-nav__menu');

  // Mobile menu toggle.
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Subtle shrink-on-scroll for the sticky header.
  if (nav) {
    var onScroll = function () {
      if (window.scrollY > 8) {
        nav.classList.add('is-scrolled');
      } else {
        nav.classList.remove('is-scrolled');
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
