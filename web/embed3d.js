// 3D Moon panel on the analysis page: embeds solar.html?embed=1 in an iframe (lazy-loaded so the
// WebGL scene only starts when the panel scrolls into view). Clicking "Analyse this site" in a 3D site
// card posts the site here; we put it into the analysis form and run it. No changes to app.js needed.
'use strict';

(() => {
  const V = '20261115k';

  function build() {
    const css = document.createElement('style');
    css.textContent = `
      #moon3d-panel { margin-top: 8px; }
      #moon3d-panel .m3-link { font-family: var(--mono); font-size: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--accent, #38bdf8); text-decoration: none; border: 1px solid rgba(56, 189, 248, 0.3); padding: 3px 8px; border-radius: 2px; background: rgba(56, 189, 248, 0.06); }
      #moon3d-panel .m3-link:hover { background: rgba(56, 189, 248, 0.14); }
      #moon3d-panel iframe { display: block; width: 100%; height: min(480px, 65vh); border: 1px solid var(--border, #1b2436); border-radius: 2px; background: #02030a; }`;
    document.head.append(css);
    const sec = document.createElement('section');
    sec.className = 'panel'; sec.id = 'moon3d-panel';
    sec.innerHTML = `
      <div class="inst-bar">
        <div class="inst-title">
          <span class="inst-code">INST-3D</span>
          <h2>3D Lunar Orbital &amp; Surface View</h2>
          <span class="inst-readout">LROC + LOLA RELIEF · REAL-TIME SUN/EARTH GEOMETRY</span>
        </div>
        <a class="m3-link" href="solar.html" target="_blank" rel="noopener">Full 3D Console ↗</a>
      </div>
      <iframe title="3D Moon with landing sites" loading="lazy" src="solar.html?embed=1&v=${V}"></iframe>`;
    const mount = document.getElementById('moon3d-mount') || document.getElementById('explore') || document.querySelector('main');
    const before = mount.querySelector('#slips');
    if (before && before.parentElement === mount) mount.insertBefore(sec, before); else mount.append(sec);
  }

  function applySite({ lat, lon, name }) {
    if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return;
    // Make sure the Explore view is active.
    const exploreTab = document.querySelector('.tabs [data-tab="explore"]');
    if (exploreTab && exploreTab.getAttribute('aria-selected') !== 'true') exploreTab.click();
    const sel = document.getElementById('site');
    const opt = sel && [...sel.options].find(o => o.value !== '' && o.text.replace(/^(\u2744\s*|\[[^\]]*\]\s*)/, '').toLowerCase()
      .startsWith(String(name || '').replace(/\s*\(candidate region\)$/i, '').toLowerCase()));
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change')); // app.js sets lat/lon and runs
    } else {
      document.getElementById('lat').value = lat;
      document.getElementById('lon').value = lon;
      if (sel) sel.value = '';
      document.getElementById('f')?.requestSubmit();
    }
    (document.getElementById('pano-panel') || document.body).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'lunar-nav:site') return;
    applySite(e.data);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
