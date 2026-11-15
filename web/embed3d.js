// 3D Moon panel on the analysis page: embeds solar.html?embed=1 in an iframe (lazy-loaded so the
// WebGL scene only starts when the panel scrolls into view). Clicking "Analyse this site" in a 3D site
// card posts the site here; we put it into the analysis form and run it. No changes to app.js needed.
'use strict';

(() => {
  const V = '20261115i';

  function build() {
    const css = document.createElement('style');
    css.textContent = `
      #moon3d-panel { margin-top: 16px; }
      #moon3d-panel .m3-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
      #moon3d-panel .m3-head a { font-size: 12px; color: var(--accent, #4ea1ff); text-decoration: none; }
      #moon3d-panel iframe { display: block; width: 100%; height: min(520px, 70vh); border: 0; border-radius: 10px; background: #02030a; }
      #moon3d-panel .m3-hint { color: var(--muted, #8b93a7); font-size: 12px; margin: 8px 0 0; }`;
    document.head.append(css);
    const sec = document.createElement('section');
    sec.className = 'panel'; sec.id = 'moon3d-panel';
    sec.innerHTML = `
      <div class="m3-head"><h2>3D Moon: landing sites and areas</h2><a href="solar.html" target="_blank" rel="noopener">Open full 3D view ↗</a></div>
      <iframe title="3D Moon with landing sites" loading="lazy" src="solar.html?embed=1&v=${V}"></iframe>
      <p class="m3-hint">Drag to turn the Moon, scroll to zoom. Click a marker, then "Analyse this site" to load it into the analysis above.</p>`;
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
    (document.getElementById('timeline-panel') || document.body).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  window.addEventListener('message', e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'lunar-nav:site') return;
    applySite(e.data);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
