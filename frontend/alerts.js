/**
 * ThermoRail — Enterprise Day 7 Alert Engine (Tasks 7.1 – 7.3)
 * Paginated alert table (≤25 rows per page), chunked non-blocking GeoJSON processing,
 * lifecycle management (ACTIVE → ACKNOWLEDGED → RESOLVED), multi-tier filtering,
 * and synchronized spatial telemetry routing with defensive property guards.
 */

// Light-theme alert chips and table contrast are handled in stylesheet overrides only.
// ── Alert Lifecycle States ───────────────────────────────────────────────────
export const AlertStatus = {
  ACTIVE: 'ACTIVE',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED'
};

export const AlertLevel = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MODERATE: 'MODERATE'
};

// ── Pagination Constants ─────────────────────────────────────────────────────
const PAGE_SIZE = 25;

// ── Alert Engine State Store ─────────────────────────────────────────────────
class AlertEngineStore {
  constructor() {
    this.alerts = [];
    this.features = [];
    this.rawGeoJSON = null;
    this.listeners = new Set();
    this.currentPage = 0;
    this.activeFilter = {
      status: 'ACTIVE',
      level: 'ALL',
      searchQuery: ''
    };
    this._generating = false;
  }

  getAlerts() {
    return this.alerts || [];
  }

  getAllAlerts() {
    return this.alerts || [];
  }

  getFeatures() {
    return this.features || [];
  }

  getGeoJSON() {
    return this.rawGeoJSON || null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    // Reset to page 0 whenever filters change
    const filtered = this.getFilteredAlerts();
    this.listeners.forEach(fn => {
      try { fn(this.alerts, filtered); } catch (err) { console.error('[AlertEngine] Listener error:', err); }
    });
  }

  /**
   * Task 7.1: Non-Blocking Chunked Alert Generation from GeoJSON Features.
   * Processes features in batches of 2000 per animation frame to prevent UI thread lockup.
   */
  generateAlertsFromGeoJSON(geojson, extractTelemetryFn, getCenterFn) {
    if (!geojson || !Array.isArray(geojson?.features)) return Promise.resolve([]);
    this.rawGeoJSON = geojson;
    this.features = geojson.features;
    if (this._generating) return Promise.resolve(this.alerts);
    this._generating = true;

    const features = geojson.features;
    const existingMap = new Map((this.alerts || []).map(a => [a.segment_id, a]));
    const newAlerts = [];
    let alertCounter = 1;
    const CHUNK_SIZE = 2000;

    return new Promise((resolve) => {
      let cursor = 0;

      const processChunk = () => {
        const end = Math.min(cursor + CHUNK_SIZE, features.length);

        for (let idx = cursor; idx < end; idx++) {
          const feature = features[idx];
          if (!feature) continue;

          const props = feature?.properties ?? {};
          let center;
          try {
            center = typeof getCenterFn === 'function' ? getCenterFn(feature) : null;
          } catch (_) { continue; }
          if (!center || !Array.isArray(center) || center.length < 2) continue;

          const [lng, lat] = center;
          if (typeof lng !== 'number' || typeof lat !== 'number') continue;

          let tel;
          try {
            tel = typeof extractTelemetryFn === 'function' ? extractTelemetryFn(feature, lat, lng) : null;
          } catch (err) {
            continue;
          }
          if (!tel) continue;

          const temp = Number(tel.est_rail_temp_c ?? 0);
          const riskScore = Number(tel.risk_score ?? 0);

          let level = null;
          if (temp >= 60.0 || riskScore >= 85) {
            level = AlertLevel.CRITICAL;
          } else if (temp >= 50.0 || riskScore >= 65) {
            level = AlertLevel.HIGH;
          } else if (temp >= 40.0 || riskScore >= 45) {
            level = AlertLevel.MODERATE;
          }
          if (!level) continue;

          const segmentId = String(tel.segment_id ?? props?.segment_id ?? props?.M_ID ?? feature?.id ?? `SW_${idx}`);
          const existing = existingMap.get(segmentId);

          if (existing) {
            existing.temperature = temp;
            existing.ambient_temp = Number(tel.ambient_temp_c ?? 0);
            existing.surface_temp = Number(tel.surface_temp_c ?? 0);
            existing.risk_score = riskScore;
            existing.level = level;
            existing.telemetry = tel;
            existing.props = props;
            existing.center = center;
            newAlerts.push(existing);
          } else {
            const alertId = `ALT-${String(alertCounter).padStart(5, '0')}`;
            alertCounter++;

            const now = new Date();
            const minutesAgo = Math.floor(Math.random() * 45) + 2;
            const timestamp = new Date(now.getTime() - minutesAgo * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            newAlerts.push({
              alert_id: alertId,
              segment_id: segmentId,
              corridor_name: tel.corridor_name || `Corridor Segment ${segmentId}`,
              level,
              temperature: temp,
              ambient_temp: Number(tel.ambient_temp_c ?? 0),
              surface_temp: Number(tel.surface_temp_c ?? 0),
              risk_score: riskScore,
              status: AlertStatus.ACTIVE,
              state: tel.state || 'TX',
              operator: tel.operator || 'Union Pacific / BNSF',
              explanation: tel.explanation || 'Elevated rail thermal stress advisory.',
              timestamp,
              created_at: new Date().toISOString(),
              acknowledged_at: null,
              resolved_at: null,
              center,
              props,
              telemetry: tel
            });
          }
        }

        cursor = end;

        if (cursor < features.length) {
          // Yield to the UI thread, then continue with next chunk
          requestAnimationFrame(processChunk);
        } else {
          // All chunks processed — sort and finalize
          this.alerts = newAlerts.sort((a, b) => {
            const rank = { CRITICAL: 3, HIGH: 2, MODERATE: 1 };
            const diff = (rank[b.level] || 0) - (rank[a.level] || 0);
            if (diff !== 0) return diff;
            return (b.temperature - a.temperature) || (b.risk_score - a.risk_score);
          });

          this._generating = false;
          this.currentPage = 0;
          this.notify();
          resolve(this.alerts);
        }
      };

      // Kick off first chunk on next frame
      requestAnimationFrame(processChunk);
    });
  }

  // ── Task 7.2: Alert Lifecycle Actions ─────────────────────────────────────
  acknowledgeAlert(alertId) {
    const alert = (this.alerts || []).find(a => a.alert_id === alertId || a.segment_id === alertId);
    if (!alert) return false;
    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledged_at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.activeFilter.status = AlertStatus.ACKNOWLEDGED;
    this.currentPage = 0;
    this.notify();
    return true;
  }

  resolveAlert(alertId) {
    const alert = (this.alerts || []).find(a => a.alert_id === alertId || a.segment_id === alertId);
    if (!alert) return false;
    alert.status = AlertStatus.RESOLVED;
    alert.resolved_at = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.notify();
    return true;
  }

  reactivateAlert(alertId) {
    const alert = (this.alerts || []).find(a => a.alert_id === alertId || a.segment_id === alertId);
    if (!alert) return false;
    alert.status = AlertStatus.ACTIVE;
    alert.acknowledged_at = null;
    alert.resolved_at = null;
    this.notify();
    return true;
  }

  // ── Metrics & Filtering ───────────────────────────────────────────────────
  getActiveCount() {
    return (this.alerts || []).filter(a => a.status === AlertStatus.ACTIVE).length;
  }

  getCriticalActiveCount() {
    return (this.alerts || []).filter(a => a.status === AlertStatus.ACTIVE && a.level === AlertLevel.CRITICAL).length;
  }

  getMetrics() {
    const alerts = this.alerts || [];
    return {
      total: alerts.length,
      active: alerts.filter(a => a.status === AlertStatus.ACTIVE).length,
      critical: alerts.filter(a => a.status === AlertStatus.ACTIVE && a.level === AlertLevel.CRITICAL).length,
      high: alerts.filter(a => a.status === AlertStatus.ACTIVE && a.level === AlertLevel.HIGH).length,
      moderate: alerts.filter(a => a.status === AlertStatus.ACTIVE && a.level === AlertLevel.MODERATE).length,
      acknowledged: alerts.filter(a => a.status === AlertStatus.ACKNOWLEDGED).length,
      resolved: alerts.filter(a => a.status === AlertStatus.RESOLVED).length
    };
  }

  setFilter(status = null, level = null, searchQuery = null) {
    if (status !== null) this.activeFilter.status = status;
    if (level !== null) this.activeFilter.level = level;
    if (searchQuery !== null) this.activeFilter.searchQuery = searchQuery;
    this.currentPage = 0; // Reset pagination on any filter change
    this.notify();
  }

  getFilteredAlerts() {
    return (this.alerts || []).filter(alert => {
      if (!alert) return false;
      if (this.activeFilter.status !== 'ALL' && alert.status !== this.activeFilter.status) return false;
      if (this.activeFilter.level !== 'ALL' && alert.level !== this.activeFilter.level) return false;
      if (this.activeFilter.searchQuery) {
        const query = this.activeFilter.searchQuery.toLowerCase();
        const matchesName = (alert.corridor_name || '').toLowerCase().includes(query);
        const matchesId = (alert.segment_id || '').toLowerCase().includes(query) || (alert.alert_id || '').toLowerCase().includes(query);
        const matchesState = (alert.state || '').toLowerCase().includes(query);
        if (!matchesName && !matchesId && !matchesState) return false;
      }
      return true;
    });
  }

  // ── Pagination helpers ────────────────────────────────────────────────────
  getPage(filteredAlerts) {
    const start = this.currentPage * PAGE_SIZE;
    return (filteredAlerts || []).slice(start, start + PAGE_SIZE);
  }

  getTotalPages(filteredAlerts) {
    return Math.max(1, Math.ceil((filteredAlerts || []).length / PAGE_SIZE));
  }

  nextPage(filteredAlerts) {
    const maxPage = this.getTotalPages(filteredAlerts) - 1;
    if (this.currentPage < maxPage) {
      this.currentPage++;
      this.notify();
    }
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.notify();
    }
  }

  goToPage(page, filteredAlerts) {
    const maxPage = this.getTotalPages(filteredAlerts) - 1;
    this.currentPage = Math.max(0, Math.min(page, maxPage));
    this.notify();
  }
}

export const alertEngine = new AlertEngineStore();
if (typeof window !== 'undefined') {
  window.alertEngine = alertEngine;
}

// ── Task 7.3: Alerts UI Renderer & Controller ────────────────────────────────
export function initAlertsUI(onSelectAlertOnMap) {
  const alertsContainer = document.getElementById('view-alerts');
  if (!alertsContainer) return;

  alertsContainer.innerHTML = `
    <div class="alerts-center-panel glass-panel">
      <!-- Alerts Header & KPI Metric Counters -->
      <div class="alerts-center-header">
        <div class="alerts-title-group">
          <div class="alerts-live-indicator">
            <span class="alerts-radar-dot"></span>
            <h2>Thermal Risk Alert Center</h2>
          </div>
          <p class="alerts-subtitle">Real-time automated CWR track buckle warnings and slow-order notifications</p>
        </div>
        
        <div class="alerts-kpi-row">
          <div class="alert-kpi-pill kpi-critical">
            <span class="kpi-label">Critical Active</span>
            <span class="kpi-val" id="alert-kpi-critical">0</span>
          </div>
          <div class="alert-kpi-pill kpi-high">
            <span class="kpi-label">High Active</span>
            <span class="kpi-val" id="alert-kpi-high">0</span>
          </div>
          <div class="alert-kpi-pill kpi-ack">
            <span class="kpi-label">Acknowledged</span>
            <span class="kpi-val" id="alert-kpi-ack">0</span>
          </div>
          <div class="alert-kpi-pill kpi-resolved">
            <span class="kpi-label">Resolved</span>
            <span class="kpi-val" id="alert-kpi-resolved">0</span>
          </div>
        </div>
      </div>

      <!-- Filter Bar: Lifecycle Tabs + Severity Pills + Search -->
      <div class="alerts-filter-toolbar">
        <div class="alert-status-tabs" id="alert-status-tabs">
          <button class="alert-tab-btn active" data-status="ACTIVE">Active Alerts</button>
          <button class="alert-tab-btn" data-status="ACKNOWLEDGED">Acknowledged</button>
          <button class="alert-tab-btn" data-status="RESOLVED">Resolved</button>
          <button class="alert-tab-btn" data-status="ALL">All Records</button>
        </div>

        <div class="alert-filters-right">
          <div class="alert-level-filters" id="alert-level-filters">
            <button class="level-filter-btn active" data-level="ALL">All Tiers</button>
            <button class="level-filter-btn tier-critical" data-level="CRITICAL">Critical (≥60°C)</button>
            <button class="level-filter-btn tier-high" data-level="HIGH">High (50-59°C)</button>
            <button class="level-filter-btn tier-moderate" data-level="MODERATE">Moderate (40-49°C)</button>
          </div>

          <div class="alert-search-box">
            <input type="text" id="alert-search-input" placeholder="Search corridor or segment ID…" />
          </div>
        </div>
      </div>

      <!-- Alerts Table -->
      <div class="alerts-table-wrapper">
        <table class="alerts-table">
          <thead>
            <tr>
              <th>Alert ID</th>
              <th>Severity</th>
              <th>Corridor & Segment</th>
              <th>ST</th>
              <th>Est Rail Temp</th>
              <th>Ambient</th>
              <th>Risk Score</th>
              <th>Lifecycle</th>
              <th>Issued</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody id="alerts-table-tbody">
            <!-- Paginated rows rendered here (max 25 DOM elements) -->
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls -->
      <div class="alerts-pagination-bar" id="alerts-pagination-bar">
        <button class="pagination-btn" id="alerts-page-prev" title="Previous Page">← Prev</button>
        <span class="pagination-info" id="alerts-page-info">Page 1 of 1</span>
        <button class="pagination-btn" id="alerts-page-next" title="Next Page">Next →</button>
        <span class="pagination-total" id="alerts-page-total">0 alerts</span>
      </div>
    </div>
  `;

  // Bind Status Tab buttons
  const statusTabs = document.getElementById('alert-status-tabs');
  if (statusTabs) {
    statusTabs.querySelectorAll('.alert-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        statusTabs.querySelectorAll('.alert-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        alertEngine.setFilter(btn.getAttribute('data-status'), null, null);
      });
    });
  }

  // Bind Level Filter buttons
  const levelFilters = document.getElementById('alert-level-filters');
  if (levelFilters) {
    levelFilters.querySelectorAll('.level-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        levelFilters.querySelectorAll('.level-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        alertEngine.setFilter(null, btn.getAttribute('data-level'), null);
      });
    });
  }

  // Bind Search Input (debounced 150ms)
  const searchInput = document.getElementById('alert-search-input');
  let searchTimer = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        alertEngine.setFilter(null, null, e.target.value.trim());
      }, 150);
    });
  }

  // Bind Pagination Buttons
  const prevBtn = document.getElementById('alerts-page-prev');
  const nextBtn = document.getElementById('alerts-page-next');
  if (prevBtn) prevBtn.addEventListener('click', () => alertEngine.prevPage());
  if (nextBtn) nextBtn.addEventListener('click', () => {
    alertEngine.nextPage(alertEngine.getFilteredAlerts());
  });

  // Subscribe to Alert Engine updates
  alertEngine.subscribe((_allAlerts, filteredAlerts) => {
    syncAlertFilterControls();
    renderAlertsPage(filteredAlerts, onSelectAlertOnMap);
    updateAlertKPIs(alertEngine.getMetrics());
    updatePaginationControls(filteredAlerts);
  });

  // Initial render
  const initialFiltered = alertEngine.getFilteredAlerts();
  renderAlertsPage(initialFiltered, onSelectAlertOnMap);
  updateAlertKPIs(alertEngine.getMetrics());
  updatePaginationControls(initialFiltered);
}

function syncAlertFilterControls() {
  const statusTabs = document.getElementById('alert-status-tabs');
  if (statusTabs) {
    statusTabs.querySelectorAll('.alert-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-status') === alertEngine.activeFilter.status);
    });
  }

  const levelFilters = document.getElementById('alert-level-filters');
  if (levelFilters) {
    levelFilters.querySelectorAll('.level-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-level') === alertEngine.activeFilter.level);
    });
  }
}

function updateAlertKPIs(metrics) {
  if (!metrics) return;
  const criticalEl = document.getElementById('alert-kpi-critical');
  if (criticalEl) criticalEl.textContent = String(metrics.critical ?? 0);

  const highEl = document.getElementById('alert-kpi-high');
  if (highEl) highEl.textContent = String(metrics.high ?? 0);

  const ackEl = document.getElementById('alert-kpi-ack');
  if (ackEl) ackEl.textContent = String(metrics.acknowledged ?? 0);

  const resEl = document.getElementById('alert-kpi-resolved');
  if (resEl) resEl.textContent = String(metrics.resolved ?? 0);

  // Sync dashboard top metric card
  const topActiveMetric = document.getElementById('metric-active-alerts');
  if (topActiveMetric) topActiveMetric.textContent = String(metrics.active ?? 0);

  // Sync top navbar notification badge
  const navbarBadge = document.querySelector('.notification-badge-btn .notif-count');
  if (navbarBadge) navbarBadge.textContent = String(metrics.critical || metrics.active || 0);
}

function updatePaginationControls(filteredAlerts) {
  const totalItems = (filteredAlerts || []).length;
  const totalPages = alertEngine.getTotalPages(filteredAlerts);
  const currentPage = alertEngine.currentPage;

  const infoEl = document.getElementById('alerts-page-info');
  if (infoEl) infoEl.textContent = `Page ${currentPage + 1} of ${totalPages}`;

  const totalEl = document.getElementById('alerts-page-total');
  if (totalEl) totalEl.textContent = `${totalItems.toLocaleString()} alerts`;

  const prevBtn = document.getElementById('alerts-page-prev');
  if (prevBtn) {
    prevBtn.disabled = currentPage <= 0;
    prevBtn.classList.toggle('disabled', currentPage <= 0);
  }

  const nextBtn = document.getElementById('alerts-page-next');
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages - 1;
    nextBtn.classList.toggle('disabled', currentPage >= totalPages - 1);
  }
}

/**
 * Renders ONLY the current page slice (≤25 <tr> DOM elements).
 * Stats are computed in memory over the full dataset, but the DOM is never flooded.
 */
function renderAlertsPage(filteredAlerts, onSelectAlertOnMap) {
  const tbody = document.getElementById('alerts-table-tbody');
  if (!tbody) return;

  const pageSlice = alertEngine.getPage(filteredAlerts);

  if (!pageSlice || pageSlice.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="alerts-empty-state">
          <div class="empty-msg">No thermal alerts found matching current filter criteria.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pageSlice.map(alert => {
    if (!alert) return '';
    const badgeClass = alert.level === 'CRITICAL' ? 'badge-critical' : alert.level === 'HIGH' ? 'badge-high' : 'badge-moderate';
    const statusBadgeClass = alert.status === 'ACTIVE' ? 'status-active' : alert.status === 'ACKNOWLEDGED' ? 'status-ack' : 'status-resolved';
    const tempClass = alert.level === 'CRITICAL' ? 'red' : alert.level === 'HIGH' ? 'orange' : 'yellow';
    const tempVal = Number(alert.temperature ?? 0).toFixed(1);
    const ambVal = Number(alert.ambient_temp ?? 0).toFixed(1);

    return `
      <tr class="alert-row" data-alert-id="${alert.alert_id}">
        <td class="alert-id-cell"><code>${alert.alert_id}</code></td>
        <td><span class="badge-tag ${badgeClass}">${alert.level}</span></td>
        <td class="alert-corridor-cell">
          <div class="corridor-main">${alert.corridor_name || 'Corridor Segment'}</div>
          <div class="segment-sub">${alert.segment_id || 'SW_UNKNOWN'} &bull; ${alert.operator || 'Union Pacific'}</div>
        </td>
        <td class="state-cell">${alert.state || 'TX'}</td>
        <td class="temp-cell ${tempClass}">${tempVal}°C</td>
        <td class="ambient-cell">${ambVal}°C</td>
        <td class="score-cell">${alert.risk_score ?? 0}/100</td>
        <td><span class="alert-status-pill ${statusBadgeClass}">${alert.status}</span></td>
        <td class="time-cell">${alert.timestamp || 'Just now'}</td>
        <td class="actions-cell">
          <div class="alert-actions-group">
            <button class="alert-action-btn btn-map" title="Inspect on Map" data-action="map" data-id="${alert.alert_id}">
              Inspect ↗
            </button>
            ${alert.status === 'ACTIVE' ? `
              <button class="alert-action-btn btn-ack" title="Acknowledge Alert" data-action="ack" data-id="${alert.alert_id}">
                Ack
              </button>
              <button class="alert-action-btn btn-res" title="Resolve Alert" data-action="resolve" data-id="${alert.alert_id}">
                Resolve
              </button>
            ` : alert.status === 'ACKNOWLEDGED' ? `
              <button class="alert-action-btn btn-res" title="Resolve Alert" data-action="resolve" data-id="${alert.alert_id}">
                Resolve
              </button>
            ` : `
              <button class="alert-action-btn btn-reopen" title="Reopen Alert" data-action="reopen" data-id="${alert.alert_id}">
                Reopen
              </button>
            `}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Bind click handlers to this page's rows only (max 25)
  tbody.querySelectorAll('.alert-row').forEach(row => {
    const alertId = row.getAttribute('data-alert-id');
    const alert = pageSlice.find(a => a?.alert_id === alertId);
    if (!alert) return;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.alert-action-btn')) return;
      if (typeof onSelectAlertOnMap === 'function' && alert.center) {
        onSelectAlertOnMap(alert);
      }
    });

    row.querySelectorAll('.alert-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const id = btn.getAttribute('data-id');

        if (action === 'map' && typeof onSelectAlertOnMap === 'function' && alert.center) {
          onSelectAlertOnMap(alert);
        } else if (action === 'ack') {
          alertEngine.acknowledgeAlert(id);
        } else if (action === 'resolve') {
          alertEngine.resolveAlert(id);
        } else if (action === 'reopen') {
          alertEngine.reactivateAlert(id);
        }
      });
    });
  });
}
