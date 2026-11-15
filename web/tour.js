// Interactive guided tutorial ("Quick Guide" / samouczek) for Lunar Landing Site Navigator
// Industrial mission-control design, keyboard navigable, responsive (375px mobile to 1920px desktop).
'use strict';

(() => {
  const exploreSteps = [
    {
      title: '1. 3D Moon & Landing Sites',
      body: 'Click surface markers or use the Site dropdown to switch between Artemis III/IV candidate zones and historical sites. Top-right link opens the full 3D Globe.',
      targets: ['#moon3d-panel', '#moon3d-mount', '#pano-panel', 'main']
    },
    {
      title: '2. 360° LOLA Horizon & Sky',
      body: 'Inspect the ray-marched 40 m/px terrain horizon vs. Sun (amber) and Earth (cyan) elevation curves. Hover across azimuths for exact ridge clearance angles.',
      targets: ['.sky-wrap', '#pano-panel', 'main']
    },
    {
      title: '3. Visibility Timeline & Windows',
      body: 'Monitor real-time landing window readiness (green/red tag) at the selected epoch. The 30-day scrubber strip displays simultaneous SUN, Earth DTE, and WIN windows.',
      targets: [
        () => {
          const tlWrap = document.querySelector('.tl-wrap');
          if (tlWrap && tlWrap.offsetParent) return tlWrap;
          const nowWin = document.getElementById('now-win');
          if (nowWin && nowWin.offsetParent) return nowWin;
          const epochBar = document.querySelector('.epoch-bar');
          if (epochBar && epochBar.offsetParent) return epochBar;
          return document.getElementById('timeline-panel');
        },
        '#timeline-panel'
      ]
    },
    {
      title: '4. NASA SPLICE 500 m Divert',
      body: 'Click "Run 500 m scan" to simulate TRN → NDL → HDL → DQG descent phases and find a nearby micro-site with safer terrain and higher sunlit percentage.',
      targets: ['#splice-workflow', '.splice-panel', 'main']
    },
    {
      title: '5. Multi-Site Compare & Launch Slips',
      body: 'Benchmark 3 candidate sites at identical epochs and inspect +1, +7, and +30 day launch-slip deltas in the Launch-Slip Impact panel.',
      targets: ['#tabs [data-tab="compare"]', '.tabs [data-tab="compare"]', '[data-tab="compare"]']
    },
    {
      title: '6. 3D Solar System & Ephemeris',
      body: 'Explore true-scale planetary orbits, interplanetary body trajectories, planet hover telemetry, and per-site landing statistics in 3D view.',
      targets: ['a.nav-link[href="solar.html"]', 'a[href^="solar.html"]', 'a.nav-link']
    }
  ];

  const solarSteps = [
    {
      title: '1. Camera Presets',
      body: 'Switch camera vantage between Moon surface landing sites, Earth–Moon orbital system, Inner planets, and the complete Solar System.',
      targets: ['#cam-presets', '.chips', '[data-cam]', 'aside#left']
    },
    {
      title: '2. Visual Layers',
      body: 'Toggle historical and Artemis landing zones, planetary orbit paths, motion trails, labels, and real-time day/night terminator shading.',
      targets: ['#layers', '#left .group:nth-child(2)', 'aside#left']
    },
    {
      title: '3. Ephemeris & Time Control',
      body: 'Scrub mission dates or play continuous time, propagating high-precision JPL DE440 celestial body positions.',
      targets: ['#time', '#picker', '#top', '#bar']
    },
    {
      title: '4. Interactive 3D Spacecraft View',
      body: 'Drag to orbit, scroll to zoom, and hover any celestial body to view live coordinates, distance telemetry, and landing window metrics.',
      targets: ['#canvas', 'main#view canvas', '#view']
    }
  ];

  let isOpen = false;
  let currentStep = 0;
  let card = null;
  let currentTarget = null;

  function isSolarPage() {
    const hasMoonPanel = !!document.getElementById('moon3d-panel') || !!document.getElementById('moon3d-mount');
    if (hasMoonPanel) return false;
    return !!document.getElementById('cam-presets') ||
           (!hasMoonPanel && (!!document.querySelector('[data-cam]') || !!document.getElementById('view'))) ||
           window.location.pathname.endsWith('solar.html');
  }

  function getSteps() {
    return isSolarPage() ? solarSteps : exploreSteps;
  }

  function getVisibleElement(selectors) {
    if (!selectors) return null;
    for (const s of selectors) {
      if (typeof s === 'function') {
        try {
          const el = s();
          if (el && (el.offsetParent !== null || el.getClientRects().length > 0 || el.tagName === 'BODY')) {
            return el;
          }
        } catch (_) {}
      } else if (typeof s === 'string') {
        const el = document.querySelector(s);
        if (el && (el.offsetParent !== null || el.getClientRects().length > 0)) {
          return el;
        }
      }
    }
    return null;
  }

  function positionCard(cardEl, targetEl) {
    if (!cardEl) return;
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Small mobile viewport clamp (<= 480px)
    if (vw <= 480) {
      cardEl.style.left = `${pad}px`;
      cardEl.style.right = `${pad}px`;
      cardEl.style.width = 'auto';
      cardEl.style.maxWidth = `calc(100vw - ${pad * 2}px)`;

      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        if (rect.bottom > vh * 0.55) {
          cardEl.style.top = '60px';
          cardEl.style.bottom = 'auto';
        } else {
          cardEl.style.bottom = `${pad}px`;
          cardEl.style.top = 'auto';
        }
      } else {
        cardEl.style.bottom = `${pad}px`;
        cardEl.style.top = 'auto';
      }
      return;
    }

    // Desktop / Tablet layout
    const cardWidth = Math.min(380, vw - pad * 2);
    cardEl.style.width = `${cardWidth}px`;
    cardEl.style.right = 'auto';
    cardEl.style.bottom = 'auto';

    if (!targetEl) {
      cardEl.style.left = `${Math.round((vw - cardWidth) / 2)}px`;
      cardEl.style.top = `${Math.round(vh - 200)}px`;
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const cardHeight = cardEl.offsetHeight || 160;

    let top;
    let left = rect.left;

    if (targetEl.closest('header')) {
      // Elements in header: place directly below sticky bar
      top = rect.bottom + 10;
    } else {
      // Try placing below target
      top = rect.bottom + 10;

      // If bottom edge clips out of viewport, place above target
      if (top + cardHeight > vh - pad) {
        if (rect.top - cardHeight - 10 >= pad) {
          top = rect.top - cardHeight - 10;
        } else {
          top = vh - cardHeight - pad;
        }
      }
    }

    // Clamp horizontally and vertically
    left = Math.max(pad, Math.min(left, vw - cardWidth - pad));
    top = Math.max(pad, Math.min(top, vh - cardHeight - pad));

    cardEl.style.left = `${Math.round(left)}px`;
    cardEl.style.top = `${Math.round(top)}px`;
  }

  function renderCard() {
    const steps = getSteps();
    const step = steps[currentStep];
    const isLast = currentStep === steps.length - 1;

    if (!card) {
      card = document.createElement('div');
      card.id = 'tour-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'false');
      card.setAttribute('aria-live', 'polite');
      card.setAttribute('aria-label', 'Mission Quick Guide');
      card.addEventListener('click', onCardClick);
      document.body.appendChild(card);
    }

    card.innerHTML = `
      <div class="tour-header">
        <span class="tour-step-tag">STEP ${currentStep + 1} / ${steps.length}</span>
        <button type="button" class="tour-close" aria-label="Close tour" title="Close (Esc)">×</button>
      </div>
      <h3 class="tour-title">${step.title}</h3>
      <p class="tour-body">${step.body}</p>
      <div class="tour-footer">
        <div class="tour-dots" aria-hidden="true">
          ${steps.map((_, i) => `<span class="tour-dot${i === currentStep ? ' active' : ''}"></span>`).join('')}
        </div>
        <div class="tour-nav">
          <button type="button" class="tour-nav-btn" data-action="prev"${currentStep === 0 ? ' disabled' : ''}>Back</button>
          <button type="button" class="tour-nav-btn primary" data-action="next">${isLast ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    `;

    const nextBtn = card.querySelector('[data-action="next"]');
    if (nextBtn) nextBtn.focus();
  }

  function onCardClick(e) {
    const closeBtn = e.target.closest('.tour-close');
    if (closeBtn) {
      e.preventDefault();
      closeTour();
      return;
    }
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.preventDefault();
      const action = actionBtn.dataset.action;
      if (action === 'prev') {
        prevStep();
      } else if (action === 'next') {
        nextStep();
      }
    }
  }

  function highlightStep(index) {
    const steps = getSteps();
    if (index < 0 || index >= steps.length) return;
    currentStep = index;

    if (currentTarget) {
      currentTarget.classList.remove('tour-focus');
      currentTarget = null;
    }

    const step = steps[index];
    const target = getVisibleElement(step.targets);
    currentTarget = target;

    if (target) {
      target.classList.add('tour-focus');
      if (!target.closest('header')) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }

    renderCard();
    positionCard(card, target);

    setTimeout(() => {
      if (isOpen && card) positionCard(card, currentTarget);
    }, 120);
    setTimeout(() => {
      if (isOpen && card) positionCard(card, currentTarget);
    }, 320);
  }

  function nextStep() {
    const steps = getSteps();
    if (currentStep < steps.length - 1) {
      highlightStep(currentStep + 1);
    } else {
      finishTour();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      highlightStep(currentStep - 1);
    }
  }

  function finishTour() {
    try {
      localStorage.setItem('luna_tour_done', 'true');
    } catch (_) {}
    closeTour();
  }

  function closeTour() {
    isOpen = false;
    if (currentTarget) {
      currentTarget.classList.remove('tour-focus');
      currentTarget = null;
    }
    if (card) {
      card.remove();
      card = null;
    }
    const tourBtn = document.getElementById('tour-btn');
    if (tourBtn) {
      tourBtn.classList.remove('active');
      tourBtn.setAttribute('aria-expanded', 'false');
      tourBtn.focus();
    }
  }

  function startTour(fromStep = 0) {
    isOpen = true;
    const tourBtn = document.getElementById('tour-btn');
    if (tourBtn) {
      tourBtn.classList.add('active');
      tourBtn.setAttribute('aria-expanded', 'true');
    }
    highlightStep(fromStep);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        closeTour();
      }
      return;
    }
    if (isOpen) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStep();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
        return;
      }
    } else {
      if (e.key === 'h' || e.key === 'H') {
        const active = document.activeElement;
        if (active && (
          active.tagName === 'INPUT' ||
          active.tagName === 'SELECT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable
        )) {
          return;
        }
        e.preventDefault();
        startTour();
      }
    }
  }

  function onReposition() {
    if (!isOpen || !card) return;
    positionCard(card, currentTarget);
  }

  function init() {
    const tourBtn = document.getElementById('tour-btn');
    if (tourBtn) {
      tourBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (isOpen) {
          closeTour();
        } else {
          startTour();
        }
      });
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition, { passive: true });
    window.addEventListener('scroll', onReposition, { passive: true });

    // Auto-open ONLY when ?tour=1 is explicitly requested
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tour') === '1' || params.get('tour') === 'true') {
        setTimeout(() => startTour(0), 120);
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
