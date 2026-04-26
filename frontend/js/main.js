/* ================================================================
  CORNERSTONE NURSERY AND PRIMARY SCHOOL
  Main Frontend Script
   ================================================================ */

'use strict';

/* ── Navbar ──────────────────────────────────────────────────────── */
const navbar     = document.querySelector('.navbar');
const hamburger  = document.querySelector('.navbar__hamburger');
const mobileMenu = document.querySelector('.mobile-menu');

function updateNavbar() {
  if (window.scrollY > 70) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
}

if (navbar) {
  window.addEventListener('scroll', updateNavbar, { passive: true });
  updateNavbar();
}

if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    const isOpen = hamburger.classList.toggle('open');
    if (isOpen) {
      mobileMenu.style.display = 'flex';
      requestAnimationFrame(() => mobileMenu.classList.add('open'));
    } else {
      mobileMenu.classList.remove('open');
      setTimeout(() => { mobileMenu.style.display = ''; }, 350);
    }
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  document.querySelectorAll('.mobile-menu__link, .mobile-menu__cta').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
      setTimeout(() => { mobileMenu.style.display = ''; }, 350);
      document.body.style.overflow = '';
    });
  });
}

/* ── Active nav link ─────────────────────────────────────────────── */
(function markActiveLink() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === page || (page === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
})();

/* ── Scroll Reveal ───────────────────────────────────────────────── */
(function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
})();

/* ── Donation Amount Selector ────────────────────────────────────── */
(function initDonationAmounts() {
  const amountBtns      = document.querySelectorAll('.amount-btn');
  const customInput     = document.querySelector('#custom-amount');

  amountBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      amountBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (customInput) {
        if (btn.dataset.amount === 'custom') {
          customInput.value = '';
          customInput.focus();
        } else {
          customInput.value = btn.dataset.amount;
        }
      }
    });
  });

  // If user types in custom input, deselect preset buttons
  if (customInput) {
    customInput.addEventListener('input', () => {
      amountBtns.forEach(b => {
        if (b.dataset.amount === 'custom') {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    });
  }
})();

/* ── Form Utility ────────────────────────────────────────────────── */
function showFormMessage(form, type, text) {
  let msg = form.querySelector('.form-message');
  if (!msg) {
    msg = document.createElement('div');
    msg.className = 'form-message';
    form.appendChild(msg);
  }
  msg.className = `form-message form-message--${type}`;
  msg.textContent = text;
  msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setSubmitState(btn, loading, originalText) {
  btn.disabled = loading;
  btn.textContent = loading ? (btn.dataset.loadingText || 'Please wait…') : originalText;
}

/* ── Contact Form ────────────────────────────────────────────────── */
const contactForm = document.querySelector('#contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = contactForm.querySelector('[type="submit"]');
    const orig = btn.textContent;
    setSubmitState(btn, true, orig);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(contactForm))),
      });
      const data = await res.json();

      if (res.ok) {
        showFormMessage(contactForm, 'success', 'Thank you — your message has been sent. We will be in touch within 1–2 business days.');
        contactForm.reset();
      } else {
        showFormMessage(contactForm, 'error', data.message || 'Something went wrong. Please try again.');
      }
    } catch {
      showFormMessage(contactForm, 'error', 'A network error occurred. Please check your connection and try again.');
    } finally {
      setSubmitState(btn, false, orig);
    }
  });
}

/* ── Admissions Form ─────────────────────────────────────────────── */
// const admissionsForm = document.querySelector('#admissions-form');
// if (admissionsForm) {
//   admissionsForm.addEventListener('submit', async (e) => {
//     e.preventDefault();
//     const btn = admissionsForm.querySelector('[type="submit"]');
//     const orig = btn.textContent;
//     setSubmitState(btn, true, orig);

//     try {
//       const res = await fetch('/api/admissions', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(Object.fromEntries(new FormData(admissionsForm))),
//       });
//       const data = await res.json();

//       if (res.ok) {
//         showFormMessage(admissionsForm, 'success', 'Your enquiry has been received. Our admissions team will contact you within 48 hours.');
//         admissionsForm.reset();
//       } else {
//         showFormMessage(admissionsForm, 'error', data.message || 'Something went wrong. Please try again.');
//       }
//     } catch {
//       showFormMessage(admissionsForm, 'error', 'A network error occurred. Please try again.');
//     } finally {
//       setSubmitState(btn, false, orig);
//     }
//   });
// }
/* ── Admissions Form ─────────────────────────────────────────────── */
const admissionsForm = document.querySelector('#admissions-form');
if (admissionsForm) {
  admissionsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = admissionsForm.querySelector('[type="submit"]');
    const orig = btn.textContent;
    setSubmitState(btn, true, orig);

    try {
      // 1. Combine Date of Birth fields into YYYY-MM-DD
      const day = document.getElementById('dob-day').value.padStart(2, '0');
      const month = document.getElementById('dob-month').value.padStart(2, '0');
      const year = document.getElementById('dob-year').value;
      const combinedDate = `${year}-${month}-${day}`;
      
      // 2. Set the hidden input value
      document.getElementById('final-dob').value = combinedDate;

      // 3. Prepare data and send to Port 5000
      const formData = Object.fromEntries(new FormData(admissionsForm));
      const res = await fetch('/api/admissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const data = await res.json();

      if (res.ok) {
        showFormMessage(admissionsForm, 'success', 'Your enquiry has been received. Our admissions team will contact you within 48 hours.');
        admissionsForm.reset();
      } else {
        showFormMessage(admissionsForm, 'error', data.message || 'Something went wrong. Please try again.');
      }
    } catch {
      showFormMessage(admissionsForm, 'error', 'A network error occurred. Please try again.');
    } finally {
      setSubmitState(btn, false, orig);
    }
  });
}

/* ── Donate Form ─────────────────────────────────────────────────── */
const donateForm = document.querySelector('#donate-form');
if (donateForm) {
  donateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = donateForm.querySelector('[type="submit"]');
    const orig = btn.textContent;
    setSubmitState(btn, true, orig);

    // Resolve amount: custom input or selected preset
    const formData = Object.fromEntries(new FormData(donateForm));
    const customAmt = document.querySelector('#custom-amount');
    if (customAmt && customAmt.value) formData.amount = customAmt.value;

    if (!formData.amount || Number(formData.amount) <= 0) {
      showFormMessage(donateForm, 'error', 'Please select or enter a donation amount.');
      setSubmitState(btn, false, orig);
      return;
    }

    try {
      const res = await fetch('https://spotty-camels-happen.loca.lt/api/donate', {
      // const res = await fetch('/api/donate', {
        method: 'POST',
        // headers: { 'Content-Type': 'application/json' },
        headers: {
        'Content-Type': 'application/json',
        'Bypass-Tunnel-Reminder': 'true' // <--- Add this to stop localtunnel's "friendly" warning
        },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (res.ok && data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else if (res.ok) {
        showFormMessage(donateForm, 'success', 'Thank you for your generous support. A confirmation will be sent to your email.');
      } else {
        showFormMessage(donateForm, 'error', data.message || 'Payment setup failed. Please try again.');
      }
    } catch {
      showFormMessage(donateForm, 'error', 'A network error occurred. Please try again.');
    } finally {
      setSubmitState(btn, false, orig);
    }
  });
}

/* Check for redirect back from payment gateway */
(function checkDonationStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const status = urlParams.get('status');
  const form = document.querySelector('#donate-form');
  if (form && status === 'success') {
    showFormMessage(form, 'success', 'Thank you — your donation has been processed. A receipt will be sent to your email.');
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

/* ── Gallery Lightbox ────────────────────────────────────────────── */
(function initLightbox() {
  const galleryItems = document.querySelectorAll('.gallery-item');
  if (!galleryItems.length) return;

  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Image viewer');
  lightbox.innerHTML = `
    <button class="lb-btn lb-close" aria-label="Close (Escape)">✕</button>
    <button class="lb-btn lb-prev" aria-label="Previous image">‹</button>
    <button class="lb-btn lb-next" aria-label="Next image">›</button>
    <div class="lightbox__body">
      <img class="lightbox__img" src="" alt="" />
    </div>
  `;
  document.body.appendChild(lightbox);

  const lbImg = lightbox.querySelector('.lightbox__img');
  const images = [...galleryItems].map(item => ({
    src: item.querySelector('img').src,
    alt: item.querySelector('img').alt || '',
  }));
  let current = 0;

  function open(index) {
    current = index;
    lbImg.src = images[index].src;
    lbImg.alt = images[index].alt;
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    lightbox.querySelector('.lb-close').focus();
  }

  function close() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
  }

  function prev() { current = (current - 1 + images.length) % images.length; lbImg.src = images[current].src; }
  function next() { current = (current + 1) % images.length; lbImg.src = images[current].src; }

  galleryItems.forEach((item, i) => item.addEventListener('click', () => open(i)));
  lightbox.querySelector('.lb-close').addEventListener('click', close);
  lightbox.querySelector('.lb-prev').addEventListener('click', prev);
  lightbox.querySelector('.lb-next').addEventListener('click', next);

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target.classList.contains('lightbox__body')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape')      close();
    if (e.key === 'ArrowLeft')   prev();
    if (e.key === 'ArrowRight')  next();
  });
})();

/* ── Smooth anchor scrolling ─────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// Regulation logic to prevent invalid values
// ['dob-day', 'dob-month', 'dob-year'].forEach(id => {
//   const el = document.getElementById(id);
//   if (el) {
//     el.addEventListener('input', () => {
//       const val = parseInt(el.value);
//       const max = parseInt(el.max);
//       const min = parseInt(el.min);
      
//       if (val > max) el.value = max;
//       if (val < min && el.value.length >= el.getAttribute('placeholder').length) el.value = min;
//     });
//   }
// });
/* --- Date Input Regulation --- */
const dateInputs = [
  { id: 'dob-day', max: 31 },
  { id: 'dob-month', max: 12 },
  { id: 'dob-year', max: 2026 }
];

dateInputs.forEach(input => {
  const el = document.getElementById(input.id);
  if (el) {
    el.addEventListener('input', (e) => {
      // Prevent typing more than 2 digits for day/month, 4 for year
      const maxChars = input.id === 'dob-year' ? 4 : 2;
      if (el.value.length > maxChars) {
        el.value = el.value.slice(0, maxChars);
      }
      
      // Auto-correct if value exceeds logic (e.g., 13 becomes 12)
      if (parseInt(el.value) > input.max) {
        el.value = input.max;
      }
    });
  }
});
