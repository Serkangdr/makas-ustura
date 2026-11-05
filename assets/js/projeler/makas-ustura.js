// Makas & Ustura — açılış perdesi, Lenis kaydırma, menü, berber seçimi,
// haftalık randevu tablosu ve WhatsApp ile onay. GSAP yüklenemezse ya da
// azaltılmış hareket istenirse randevu akışı animasyonsuz ama eksiksiz çalışır.
(function () {
  'use strict';

  // --- AYARLAR ---
  const BUSINESS_PHONE = '900000000000'; // Başında + olmadan
  const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const START_HOUR = 9;
  const END_HOUR = 21;
  const STORAGE_KEY = 'bookedAppointments';
  const RESET_KEY = 'lastResetDate';

  const root = document.documentElement;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const MOTION = hasGsap && !REDUCED;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const esc = (s) =>
    s.replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );

  root.classList.add('is-js');
  if (hasGsap) {
    root.classList.add('has-gsap');
    gsap.registerPlugin(ScrollTrigger);
  }

  // --- LENIS ---
  let lenis = null;
  if (MOTION && typeof window.Lenis !== 'undefined') {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollToEl = (el, offset = -80) => {
    if (lenis) lenis.scrollTo(el, { offset, duration: 1.5 });
    else el.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
  };

  // --- NAVBAR: kaydırınca koyulaşır, aşağı inerken gizlenir ---
  const navbar = $('.navbar');
  const hamburger = $('.hamburger');
  const navLinks = $('.nav-links');
  const setMenu = (open) => {
    hamburger.classList.toggle('active', open);
    navLinks.classList.toggle('active', open);
    navbar.classList.toggle('menu-open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    hamburger.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
    if (lenis) open ? lenis.stop() : lenis.start();
  };
  hamburger.addEventListener('click', () => setMenu(!navLinks.classList.contains('active')));

  let lastY = 0;
  const onScroll = () => {
    const y = window.scrollY;
    navbar.classList.toggle('is-scrolled', y > 40);
    navbar.classList.toggle(
      'is-hidden',
      y > lastY && y > 400 && !navLinks.classList.contains('active'),
    );
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // --- SAYFA İÇİ BAĞLANTILAR ---
  $$('a[href^="#"]:not(.skip)').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id === '#') {
        e.preventDefault();
        return;
      }
      const target = $(id);
      if (!target) return;
      e.preventDefault();
      setMenu(false);
      if (id === '#top') {
        if (lenis) lenis.scrollTo(0, { duration: 1.5 });
        else window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
      } else scrollToEl(target);
    });
  });

  // =========================================================
  // RANDEVU
  // =========================================================
  const selection = { staff: '', day: '', time: '', slotId: '' };

  const scheduleSection = document.getElementById('schedule-section');
  const scheduleTitle = document.getElementById('selected-staff-name');
  const scheduleGrid = document.getElementById('schedule-grid');
  const modal = document.getElementById('appointment-modal');
  const modalBox = $('.modal-content', modal);
  const modalDetails = document.getElementById('modal-details');
  const form = document.getElementById('appointment-form');
  const nameInput = document.getElementById('customer-name');
  const phoneInput = document.getElementById('customer-phone');

  function readBookings() {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  }

  // --- HAFTALIK SIFIRLAMA ---
  // Her yeni haftanın ilk açılışında (Pazartesi bazlı) kayıtlı randevular temizlenir.
  function resetIfNewWeek() {
    const now = new Date();
    const dayOfWeek = now.getDay() || 7; // Pazar 0 yerine 7 kabul edilir
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek - 1));

    const mondayKey = monday.toISOString().split('T')[0];
    if (localStorage.getItem(RESET_KEY) !== mondayKey) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(RESET_KEY, mondayKey);
    }
  }

  // --- PERSONEL SEÇİMİ ---
  function openSchedule(staffName, card) {
    const firstOpen = scheduleSection.classList.contains('hidden');
    scheduleSection.classList.remove('hidden');
    scheduleTitle.innerHTML =
      `<span class="schedule-title__label">Berber:</span> ${esc(staffName)} <br>` +
      `<span class="schedule-title__sub">için Randevu Tablosu</span>`;

    $$('.staff-card').forEach((c) => c.classList.toggle('is-selected', c === card));
    selection.staff = staffName;
    renderSchedule();

    if (hasGsap) ScrollTrigger.refresh();
    if (MOTION) {
      gsap.fromTo(
        scheduleSection.querySelector('.schedule-container'),
        { y: firstOpen ? 50 : 16, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 1, ease: 'expo.out' },
      );
    }
    scrollToEl(scheduleSection, -70);
  }

  // --- RANDEVU TABLOSU ---
  function createCell(className, text) {
    const cell = document.createElement('div');
    cell.className = className;
    cell.innerText = text;
    return cell;
  }
  const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#${id}" /></svg>`;

  function renderSchedule() {
    const bookings = readBookings();
    scheduleGrid.innerHTML = '';

    scheduleGrid.appendChild(createCell('header-cell', 'Saat'));
    DAYS.forEach((day) => scheduleGrid.appendChild(createCell('header-cell', day)));

    for (let hour = START_HOUR; hour < END_HOUR; hour++) {
      const time = `${String(hour).padStart(2, '0')}:00`;
      scheduleGrid.appendChild(createCell('time-label', time));

      DAYS.forEach((day) => {
        const slotId = `${selection.staff}-${day}-${time}`;
        let slot;
        if (bookings[slotId] === 'Dolu') {
          slot = document.createElement('div');
          slot.className = 'slot booked';
          slot.setAttribute('aria-label', `${day} ${time} — dolu`);
          slot.innerHTML = `${icon('i-cal-x')}<span>DOLU</span>`;
        } else {
          slot = document.createElement('button');
          slot.type = 'button';
          slot.className = 'slot';
          slot.setAttribute('aria-label', `${day} ${time} — boş, randevu al`);
          slot.innerHTML = `${icon('i-cal-plus')}<span>Boş</span>`;
          slot.addEventListener('click', () => openModal(day, time, slotId, slot));
        }
        scheduleGrid.appendChild(slot);
      });
    }
  }

  // --- MODAL ---
  let lastFocus = null;
  function openModal(day, time, slotId, trigger) {
    selection.day = day;
    selection.time = time;
    selection.slotId = slotId;

    modalDetails.innerText = `✂️ ${selection.staff} \n 📅 ${day} \n ⏰ ${time}`;
    lastFocus = trigger || document.activeElement;
    modal.hidden = false;
    if (lenis) lenis.stop();
    if (MOTION) {
      gsap.fromTo(modal, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 });
      gsap.fromTo(
        modalBox,
        { y: 40, autoAlpha: 0 },
        { y: 0, autoAlpha: 1, duration: 0.8, ease: 'expo.out' },
      );
    }
    nameInput.focus();
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    if (hasGsap) gsap.set([modal, modalBox], { clearProps: 'all' });
    if (lenis) lenis.start();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }

  // --- WHATSAPP & KAYIT ---
  function sendToWhatsapp(event) {
    event.preventDefault();

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    if (!name || !phone) {
      alert('Lütfen tüm alanları geçerli bir şekilde doldurun.');
      return;
    }

    const bookings = readBookings();
    bookings[selection.slotId] = 'Dolu';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookings));

    const message = [
      'Merhaba, randevu almak istiyorum.',
      '',
      `✂️ *Personel:* ${selection.staff}`,
      `📅 *Gün:* ${selection.day}`,
      `⏰ *Saat:* ${selection.time}`,
      `👤 *Müşteri:* ${name}`,
      `📞 *İletişim:* ${phone}`,
    ].join('\n');

    window.open(
      `https://wa.me/${BUSINESS_PHONE}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener',
    );

    lastFocus = null;
    closeModal();
    form.reset();
    renderSchedule();
    const first = $('button.slot', scheduleGrid);
    if (first) first.focus({ preventScroll: true });
  }

  // --- BAŞLAT ---
  resetIfNewWeek();

  $$('.btn-book').forEach((button) => {
    button.addEventListener('click', () =>
      openSchedule(button.dataset.staff, button.closest('.staff-card')),
    );
  });

  modal.querySelector('.close-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  form.addEventListener('submit', sendToWhatsapp);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      if (navLinks.classList.contains('active')) setMenu(false);
    }
    // odak pencerenin içinde döner
    if (e.key === 'Tab' && !modal.hidden) {
      const f = $$('button, input', modal);
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // =========================================================
  // HAREKET
  // =========================================================
  function cursor() {
    const c = $('.cursor');
    if (!c || !FINE) return;
    gsap.set(c, { xPercent: -50, yPercent: -50 });
    const xTo = gsap.quickTo(c, 'x', { duration: 0.5, ease: 'power3' });
    const yTo = gsap.quickTo(c, 'y', { duration: 0.5, ease: 'power3' });
    window.addEventListener(
      'mousemove',
      (e) => {
        xTo(e.clientX);
        yTo(e.clientY);
        c.classList.add('is-visible');
      },
      { passive: true },
    );
    document.addEventListener('mouseleave', () => c.classList.remove('is-visible'));
    document.addEventListener('mouseover', (e) => {
      c.classList.toggle(
        'is-hover',
        !!e.target.closest('a, button, input, .showcase-item, .staff-card .card-img'),
      );
    });

    $$('[data-magnetic]').forEach((el) => {
      const mx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
      const my = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * 0.25);
        my((e.clientY - r.top - r.height / 2) * 0.35);
      });
      el.addEventListener('pointerleave', () => {
        mx(0);
        my(0);
      });
    });
  }

  function scrollFx() {
    gsap.to('[data-hero-media]', {
      yPercent: 14,
      ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
    });

    $$('[data-reveal-words]').forEach((el) => {
      const text = el.textContent.trim().replace(/\s+/g, ' ');
      el.setAttribute('aria-label', text);
      el.innerHTML = text
        .split(' ')
        .map((w) => `<span class="w" aria-hidden="true"><span>${esc(w)}</span></span>`)
        .join(' ');
      gsap.from($$('.w > span', el), {
        yPercent: 115,
        duration: 1.3,
        stagger: 0.08,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 86%', once: true },
      });
    });

    ScrollTrigger.batch('[data-reveal-card]', {
      start: 'top 90%',
      once: true,
      onEnter: (els) =>
        gsap.from(els, {
          y: 80,
          autoAlpha: 0,
          duration: 1.4,
          stagger: 0.1,
          ease: 'expo.out',
          clearProps: 'transform,opacity,visibility',
        }),
    });

    const mark = $('[data-footer-mark]');
    if (mark) {
      gsap.from(mark, {
        yPercent: 40,
        autoAlpha: 0,
        duration: 1.5,
        ease: 'expo.out',
        scrollTrigger: { trigger: mark, start: 'top 95%', once: true },
      });
    }
  }

  // --- AÇILIŞ ---
  function intro() {
    const curtain = $('.curtain');
    const late = performance.now() > 2600; // CSS yedeği perdeyi çoktan kaldırdıysa
    if (curtain) curtain.style.animation = 'none';
    if (!curtain || !MOTION || late) {
      if (curtain) curtain.remove();
      return;
    }
    const lines = $$('.hero__title .line > span');
    const fades = $$('[data-hero-fade]');
    if (lenis) lenis.stop();
    gsap.set(lines, { yPercent: 115 });
    gsap.set(fades, { autoAlpha: 0, y: 20 });
    gsap.set('.navbar', { autoAlpha: 0, y: -20 });
    gsap
      .timeline({ defaults: { ease: 'expo.out' } })
      .from('.curtain__mark', { autoAlpha: 0, scale: 0.9, duration: 1 })
      .to('.curtain__mark', { autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, '+=0.2')
      .to('.curtain__panel--top', { yPercent: -100, duration: 1.2, ease: 'expo.inOut' }, '-=0.1')
      .to('.curtain__panel--bottom', { yPercent: 100, duration: 1.2, ease: 'expo.inOut' }, '<')
      .fromTo(
        '[data-hero-media]',
        { scale: 1.18 },
        { scale: 1, duration: 2.2, ease: 'expo.out' },
        '<0.2',
      )
      .to(lines, { yPercent: 0, duration: 1.4, stagger: 0.12 }, '<0.35')
      .to(fades, { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.1 }, '<0.3')
      .to('.navbar', { autoAlpha: 1, y: 0, duration: 1 }, '<')
      .add(() => {
        curtain.remove();
        if (lenis) lenis.start();
        gsap.set('.navbar', { clearProps: 'transform,opacity,visibility' });
      });
  }

  if (hasGsap) {
    if (MOTION) {
      scrollFx();
      cursor();
    }
    window.addEventListener('load', () => ScrollTrigger.refresh());
  }
  intro();
})();
