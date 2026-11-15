// 3D Moon panel on the analysis page: embeds solar.html?embed=1 in an iframe (eager-loaded as
// top panel under the command bar). Clicking "Analyse this site" in a 3D site
// card posts the site here; we put it into the analysis form and run it. No changes to app.js needed.
'use strict';

(() => {
  const V = '20261115s';

  function build() {
    const css = document.createElement('style');
    css.textContent = `
      #moon3d-panel iframe { display: block; width: 100%; height: min(470px, 64vh); border: 1px solid var(--line, rgba(255,255,255,0.08)); border-radius: var(--r-sm, 4px); background: #03050a; }`;
    document.head.append(css);
    const sec = document.createElement('section');
    sec.className = 'panel'; sec.id = 'moon3d-panel';
    sec.innerHTML = `
      <div class="panel-head">
        <div class="panel-title">
          <h2>3D Lunar Navigator</h2>
          <span class="micro-meta">Explore landing zones on real NASA relief · click any marker to load telemetry</span>
        </div>
        <a class="subtle-link" href="solar.html" target="_blank" rel="noopener">Open full 3D view ↗</a>
      </div>
      <iframe title="3D Moon with landing sites" loading="eager" src="solar.html?embed=1&v=${V}"></iframe>`;
    const mount = document.getElementById('moon3d-mount');
    if (mount) {
      mount.append(sec);
    } else {
      const fallback = document.getElementById('explore') || document.querySelector('main');
      const before = fallback?.querySelector('#slips');
      if (before && before.parentElement === fallback) fallback.insertBefore(sec, before);
      else fallback?.append(sec);
    }
  }

  function applySite({ lat, lon, name }) {
    if (!Number.isFinite(+lat) || !Number.isFinite(+lon)) return;
    const exploreTab = document.querySelector('.tabs [data-tab="explore"]');
    if (exploreTab && exploreTab.getAttribute('aria-selected') !== 'true') exploreTab.click();
    const sel = document.getElementById('site');
    const opt = sel && [...sel.options].find(o => o.value !== '' && o.text.replace(/^(\u2744\s*|\[[^\]]*\]\s*)/, '').toLowerCase()
      .startsWith(String(name || '').replace(/\s*\(candidate region\)$/i, '').toLowerCase()));
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event('change'));
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
