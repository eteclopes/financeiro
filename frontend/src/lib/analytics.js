/**
 * analytics.js — tracking unificado
 *
 * Suporta:
 *  1. Google Analytics 4 (via gtag) — configure GA_MEASUREMENT_ID no .env
 *  2. Analytics próprio   (POST /analytics/track) — sempre ativo
 *
 * Uso:
 *   import { trackPage, trackEvent } from '../lib/analytics';
 *   trackPage('/dashboard');
 *   trackEvent('upgrade_click', { plan: 'pro', interval: 'monthly' });
 */
import { api } from './api';

// ── Helpers ────────────────────────────────────────────────────────────────────

function getOrCreateSession() {
  let sid = sessionStorage.getItem('_fsid');
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('_fsid', sid);
  }
  return sid;
}

function gtagAvailable() {
  return typeof window !== 'undefined' && typeof window.gtag === 'function';
}

// ── Page tracking ──────────────────────────────────────────────────────────────

export function trackPage(path) {
  const sessionId = getOrCreateSession();

  // 1. Google Analytics
  if (gtagAvailable()) {
    window.gtag('config', window._GA_ID, { page_path: path });
  }

  // 2. Analytics próprio (fire-and-forget — não bloqueia nada)
  api.post('/analytics/track', {
    path,
    sessionId,
    referrer: document.referrer || null,
  }).catch(() => {});
}

// ── Event tracking ─────────────────────────────────────────────────────────────

export function trackEvent(eventName, params = {}) {
  if (gtagAvailable()) {
    window.gtag('event', eventName, params);
  }
}

// ── Inicializa GA4 dinamicamente ───────────────────────────────────────────────
// Chamado uma vez no App.jsx quando GA_ID estiver configurado

export function initGoogleAnalytics(measurementId) {
  if (!measurementId || typeof window === 'undefined') return;
  if (document.getElementById('ga-script')) return; // já carregado

  window._GA_ID = measurementId;

  // Carrega o script do GA4
  const script = document.createElement('script');
  script.id    = 'ga-script';
  script.async = true;
  script.src   = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false }); // gerenciamos manualmente
}
