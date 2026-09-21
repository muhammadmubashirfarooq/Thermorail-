import { alertEngine, AlertLevel, AlertStatus } from './alerts.js';

// Light-theme safety banner and table readability are intentionally preserved via CSS-only overrides.
const ACTION_GUIDANCE = {
  CRITICAL: 'Review applicable heat-related operating restrictions and railroad procedures; consider enhanced track monitoring/inspection according to operator procedures.',
  HIGH: 'Increase monitoring frequency and review applicable heat protocols.',
  MODERATE: 'Continue baseline environmental monitoring conditions.'
};

const RISK_ORDER = { CRITICAL: 2, HIGH: 1 };
const PAGE_SIZE = 10;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getAuthoritativeRestriction(alert) {
  const telemetry = alert?.telemetry || {};
  const props = alert?.props || {};
  const value = [
    telemetry.railroad_heat_restriction,
    telemetry.heat_restriction,
    telemetry.operating_restriction,
    props.railroad_heat_restriction,
    props.heat_restriction,
    props.operating_restriction
  ].find(item => item != null && String(item).trim() !== '');
  if (value == null) return null;

  const source = [
    telemetry.railroad_heat_restriction_source,
    telemetry.heat_restriction_source,
    telemetry.operating_restriction_source,
    props.railroad_heat_restriction_source,
    props.heat_restriction_source,
    props.operating_restriction_source
  ].find(item => item != null && String(item).trim() !== '');

  return { value: String(value), source: source ? String(source) : 'Segment metadata' };
}

export function getPrecautionGuidance(level) {
  return ACTION_GUIDANCE[level] || ACTION_GUIDANCE.MODERATE;
}

export function getPrecautionZones(alerts = alertEngine.alerts, tier = 'ALL') {
  return (alerts || [])
    .filter(alert => alert?.status === AlertStatus.ACTIVE)
    .filter(alert => alert.level === AlertLevel.CRITICAL || alert.level === AlertLevel.HIGH)
    .filter(alert => tier === 'ALL' || alert.level === tier)
    .sort((a, b) => (RISK_ORDER[b.level] || 0) - (RISK_ORDER[a.level] || 0) || Number(b.risk_score || 0) - Number(a.risk_score || 0));
}

export function initPrecautionsUI(onSelectAlertOnMap) {
  const container = document.getElementById('view-precautions');
  if (!container) return;

  container.innerHTML = `
    <div class="precautions-panel glass-panel">
      <header class="precautions-header">
        <div>
          <div class="precautions-institution-badge">INSTITUTIONAL DIRECTIVE &bull; STANDARD OPERATING PROCEDURES (SOP)</div>
          <h2>Operational Precaution Standards</h2>
          <p>Thermal risk intelligence and continuous welded rail safety protocols for qualified railroad personnel.</p>
        </div>
        <div class="precautions-quick-actions">
          <button class="precautions-map-link" type="button" data-precautions-map>Open Live Map ↗</button>
        </div>
      </header>

      <section class="precautions-section" aria-labelledby="actions-title">
        <div class="precautions-section-heading"><div><h3 id="actions-title">Recommended Actions Matrix</h3><p class="precautions-section-description">Decision-support guidance for qualified railroad personnel.</p></div></div>
        <div class="precaution-action-matrix">
          ${['CRITICAL', 'HIGH', 'MODERATE'].map(level => `
            <article class="precaution-action-card precaution-${level.toLowerCase()}">
              <div class="precaution-card-heading">
                <span class="badge-tag badge-${level === 'CRITICAL' ? 'critical' : level === 'HIGH' ? 'high' : 'moderate'}">${level}</span>
              </div>
              <ol class="precaution-step-list">
                <li><strong>${level === 'CRITICAL' ? 'Mandatory Speed Advisory Check' : level === 'HIGH' ? 'Review Heat Protocols' : 'Confirm Baseline Monitoring'}</strong></li>
                <li><strong>${level === 'CRITICAL' ? 'Dispatch Visual Patrols' : level === 'HIGH' ? 'Increase Monitoring Frequency' : 'Continue Environmental Monitoring'}</strong></li>
                <li><strong>Log Thermal Stress Metrics</strong></li>
              </ol>
              <p class="precaution-guidance-note">${getPrecautionGuidance(level)}</p>
            </article>
          `).join('')}
        </div>
      </section>

      <section class="precautions-section" aria-labelledby="protocols-title">
        <div class="precautions-section-heading"><div><h3 id="protocols-title">Safety &amp; Remediation Protocols</h3><p class="precautions-section-description">Review applicable railroad procedures and confirm field conditions before action.</p></div></div>
        <div class="precaution-protocol-grid">
          <details class="precaution-protocol-card" open><summary>Thermal Remediation SOP</summary><p>Review water spraying and coolant spray protocols with the responsible railroad authority before any approved cooling action.</p></details>
          <details class="precaution-protocol-card"><summary>Track Mechanical Maintenance</summary><p>Review lubrication plans and rail tension adjustment requirements with qualified track personnel.</p></details>
          <details class="precaution-protocol-card"><summary>Visual &amp; Drone Patrols</summary><p>Coordinate enhanced patrol schedules, field inspection, and drone review according to operator procedures.</p></details>
          <details class="precaution-protocol-card"><summary>Regulatory Compliance (FRA)</summary><p>Review applicable FRA restrictions and dispatch orders. ThermoRail does not issue operating orders.</p></details>
        </div>
      </section>

      <section class="precautions-section critical-zones-section" aria-labelledby="critical-zones-title">
        <div class="precautions-section-heading">
          <div><h3 id="critical-zones-title">Active Precaution Zones</h3><p class="precautions-section-description">Live Critical and High segments, limited to ${PAGE_SIZE} records per page.</p></div>
          <div class="precautions-filters" role="group" aria-label="Risk tier filter">
            <button class="precaution-filter active" type="button" data-tier="ALL">All flagged</button>
            <button class="precaution-filter" type="button" data-tier="CRITICAL">Critical</button>
            <button class="precaution-filter" type="button" data-tier="HIGH">High</button>
          </div>
        </div>
        <label class="precaution-search-label" for="precaution-search">Search corridor, segment, state, or operator</label>
        <input class="precaution-search" id="precaution-search" type="search" placeholder="Search active zones" autocomplete="off" />
        <div class="precaution-zones" data-precaution-zones></div>
        <div class="precaution-pagination" aria-live="polite">
          <button class="precaution-page-btn" type="button" data-page-prev>Previous</button>
          <span class="precaution-page-info" data-page-info>Page 1 of 1</span>
          <button class="precaution-page-btn" type="button" data-page-next>Next</button>
        </div>
      </section>

      <section class="precautions-section methodology-section" aria-labelledby="methodology-title">
        <div class="precautions-section-heading"><div><h3 id="methodology-title">Heat-Risk Methodology</h3></div></div>
        <div class="methodology-equation" aria-label="Heat risk methodology equation">Ambient Air Temp <b>+</b> Direct Solar Exposure <b>+</b> 500m Environmental Proximity Offset <b>+</b> Maintenance History Modifier <b>=</b> Rail Temperature &amp; Buckle Risk Score</div>
        <p class="methodology-copy">Telemetry inputs are normalized by segment and combined with environmental context to support prioritization. The resulting temperature and risk score are intelligence signals for review, not an operational order.</p>
      </section>

      <aside class="precautions-disclaimer" aria-labelledby="disclaimer-title">
        <div class="precautions-warning-heading"><strong id="disclaimer-title">Official Safety Warning</strong></div>
        <ul>
          <li>ThermoRail provides thermal risk intelligence for operational decision support only.</li>
          <li>It does not replace official railroad dispatch orders, FRA standards, or field inspector manual verification.</li>
          <li>Follow applicable railroad procedures and authoritative instructions at all times.</li>
        </ul>
      </aside>
    </div>
  `;

  let selectedTier = 'ALL';
  let searchQuery = '';
  let currentPage = 0;
  let indexedZones = [];
  let renderToken = 0;
  const zonesEl = container.querySelector('[data-precaution-zones]');
  const pageInfoEl = container.querySelector('[data-page-info]');
  const prevPageBtn = container.querySelector('[data-page-prev]');
  const nextPageBtn = container.querySelector('[data-page-next]');

  function rebuildZoneIndex() {
    const token = ++renderToken;
    const source = alertEngine.alerts || [];
    const nextIndex = [];
    let cursor = 0;

    const processChunk = () => {
      if (token !== renderToken) return;
      const end = Math.min(cursor + 500, source.length);
      for (; cursor < end; cursor++) {
        const alert = source[cursor];
        if (!alert || alert.status !== AlertStatus.ACTIVE) continue;
        if (alert.level !== AlertLevel.CRITICAL && alert.level !== AlertLevel.HIGH) continue;
        const searchText = [alert.corridor_name, alert.segment_id, alert.alert_id, alert.state, alert.operator].join(' ').toLowerCase();
        nextIndex.push({ alert, searchText });
      }
      if (cursor < source.length) {
        requestAnimationFrame(processChunk);
        return;
      }
      indexedZones = nextIndex
        .filter(item => selectedTier === 'ALL' || item.alert.level === selectedTier)
        .filter(item => !searchQuery || item.searchText.includes(searchQuery))
        .map(item => item.alert)
        .sort((a, b) => (RISK_ORDER[b.level] || 0) - (RISK_ORDER[a.level] || 0) || Number(b.risk_score || 0) - Number(a.risk_score || 0));
      currentPage = 0;
      renderZones();
    };

    requestAnimationFrame(processChunk);
  }

  function renderZones() {
    const totalPages = Math.max(1, Math.ceil(indexedZones.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages - 1);
    const zones = indexedZones.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
    if (!zones.length) {
      zonesEl.innerHTML = '<div class="precaution-empty">No active Critical or High zones match this filter.</div>';
    } else {
      zonesEl.innerHTML = `<div class="precaution-zone-table-wrap"><table class="precaution-zone-table"><thead><tr><th>Risk Level</th><th>Segment &amp; Corridor</th><th>Location (State)</th><th>Rail Temp</th><th>Buckle Risk Index</th><th>Action</th></tr></thead><tbody>${zones.map(alert => {
        const restriction = getAuthoritativeRestriction(alert);
        const levelClass = alert.level === 'CRITICAL' ? 'critical' : 'high';
        return `
          <tr class="precaution-zone-table-row ${levelClass === 'critical' ? 'precaution-critical-row' : ''}">
            <td><span class="badge-tag badge-${levelClass}">${escapeHtml(alert.level)}</span></td>
            <td><strong>${escapeHtml(alert.corridor_name || 'Rail corridor')}</strong><small>${escapeHtml(alert.segment_id || alert.alert_id)} • ${escapeHtml(alert.operator || 'Operator unavailable')}</small>
              ${restriction ? `<div class="precaution-authority"><strong>Authoritative restriction:</strong> ${escapeHtml(restriction.value)} <span>Source: ${escapeHtml(restriction.source)}</span></div>` : ''}
            </td><td>${escapeHtml(alert.state || 'Region unavailable')}</td><td><b>${Number(alert.temperature || 0).toFixed(1)}°C</b></td><td><b>${Math.round(Number(alert.risk_score || 0))}/100</b></td><td><button class="precaution-inspect-btn" type="button" data-alert-id="${escapeHtml(alert.alert_id)}">Inspect on Map <span aria-hidden="true">↗</span></button></td>
          </tr>
        `;
      }).join('')}</tbody></table></div>`;
    }

    zonesEl.querySelectorAll('[data-alert-id]').forEach(button => {
      button.addEventListener('click', () => {
        const alert = zones.find(item => item.alert_id === button.getAttribute('data-alert-id'));
        if (alert && typeof onSelectAlertOnMap === 'function') onSelectAlertOnMap(alert);
      });
    });
    pageInfoEl.textContent = `Page ${currentPage + 1} of ${totalPages}`;
    prevPageBtn.disabled = currentPage === 0;
    nextPageBtn.disabled = currentPage >= totalPages - 1;
  }

  container.querySelectorAll('[data-tier]').forEach(button => {
    button.addEventListener('click', () => {
      selectedTier = button.getAttribute('data-tier') || 'ALL';
      container.querySelectorAll('[data-tier]').forEach(item => item.classList.toggle('active', item === button));
      rebuildZoneIndex();
    });
  });

  container.querySelector('#precaution-search')?.addEventListener('input', event => {
    searchQuery = event.target.value.trim().toLowerCase();
    rebuildZoneIndex();
  });
  prevPageBtn?.addEventListener('click', () => { if (currentPage > 0) { currentPage--; renderZones(); } });
  nextPageBtn?.addEventListener('click', () => {
    if (currentPage < Math.ceil(indexedZones.length / PAGE_SIZE) - 1) { currentPage++; renderZones(); }
  });

  container.querySelector('[data-precautions-map]')?.addEventListener('click', () => {
    if (typeof onSelectAlertOnMap === 'function') onSelectAlertOnMap(null);
  });

  alertEngine.subscribe(() => rebuildZoneIndex());
  rebuildZoneIndex();
}
