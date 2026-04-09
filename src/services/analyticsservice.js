const { getAnalyticsClient, GA_PROPERTY_ID } = require('../config/googleAnalytics');

const property = GA_PROPERTY_ID ? `properties/${GA_PROPERTY_ID}` : null;
console.log('GA property string:', property);

// ── Helper: ejecutar reporte ─────────────────────────────────
const runReport = async (request) => {
  const client = getAnalyticsClient();

  if (!client) {
    throw new Error('Google Analytics no está configurado');
  }

  if (!property) {
    throw new Error('GA_PROPERTY_ID no configurado');
  }

  console.log('📊 Ejecutando runReport sobre:', property);

  const [response] = await client.runReport({
    property,
    ...request,
  });

  return response;
};

// ── Helper: parsear filas del reporte ────────────────────────
const parseRows = (response, dimCount = 1) => {
  if (!response?.rows) return [];
  return response.rows.map(row => {
    const dims = row.dimensionValues?.map(d => d.value) || [];
    const metrics = row.metricValues?.map(m => parseFloat(m.value) || 0) || [];
    return { dims, metrics };
  });
};

// ── Helper: rango de fechas ──────────────────────────────────
const getDateRange = (startDate = '30daysAgo', endDate = 'today') => ({
  startDate,
  endDate,
});

// ═══════════════════════════════════════════════════════════════
// SERVICIOS
// ═══════════════════════════════════════════════════════════════

/**
 * Resumen general: usuarios, sesiones, vistas, engagement
 */
const getSummary = async (startDate = '30daysAgo', endDate = 'today') => {
  const response = await runReport({
    dateRanges: [getDateRange(startDate, endDate)],
    metrics: [
      { name: 'activeUsers' },
      { name: 'newUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' },
      { name: 'engagedSessions' },
      { name: 'bounceRate' },
    ],
  });

  const values = response?.rows?.[0]?.metricValues?.map(m => parseFloat(m.value) || 0) || [];

  return {
    activeUsers: Math.round(values[0] || 0),
    newUsers: Math.round(values[1] || 0),
    sessions: Math.round(values[2] || 0),
    pageViews: Math.round(values[3] || 0),
    avgSessionDuration: Math.round(values[4] || 0), // en segundos
    engagedSessions: Math.round(values[5] || 0),
    bounceRate: parseFloat((values[6] || 0).toFixed(2)),
    dateRange: { startDate, endDate },
  };
};

/**
 * Tráfico diario: usuarios y sesiones por día
 */
const getTraffic = async (startDate = '14daysAgo', endDate = 'today') => {
  const response = await runReport({
    dateRanges: [getDateRange(startDate, endDate)],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
      { name: 'newUsers' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' } }],
  });

  const rows = parseRows(response);
  return rows.map(r => {
    const raw = r.dims[0]; // formato: 20260317
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return {
      date: formatted,
      users: Math.round(r.metrics[0]),
      sessions: Math.round(r.metrics[1]),
      pageViews: Math.round(r.metrics[2]),
      newUsers: Math.round(r.metrics[3]),
    };
  });
};

/**
 * Top páginas más visitadas
 */
const getTopPages = async (startDate = '30daysAgo', endDate = 'today', limit = 15) => {
  const response = await runReport({
    dateRanges: [getDateRange(startDate, endDate)],
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'activeUsers' },
      { name: 'averageSessionDuration' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit,
  });

  const rows = parseRows(response);
  return rows.map(r => ({
    page: r.dims[0],
    views: Math.round(r.metrics[0]),
    users: Math.round(r.metrics[1]),
    avgDuration: Math.round(r.metrics[2]),
  }));
};

/**
 * Dispositivos: mobile, desktop, tablet
 */
const getDevices = async (startDate = '30daysAgo', endDate = 'today') => {
  const response = await runReport({
    dateRanges: [getDateRange(startDate, endDate)],
    dimensions: [{ name: 'deviceCategory' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
    ],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
  });

  const rows = parseRows(response);
  return rows.map(r => ({
    device: r.dims[0],
    users: Math.round(r.metrics[0]),
    sessions: Math.round(r.metrics[1]),
  }));
};

/**
 * Fuentes de tráfico
 */
const getTrafficSources = async (startDate = '30daysAgo', endDate = 'today') => {
  const response = await runReport({
    dateRanges: [getDateRange(startDate, endDate)],
    dimensions: [{ name: 'sessionDefaultChannelGroup' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'newUsers' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 10,
  });

  const rows = parseRows(response);
  return rows.map(r => ({
    source: r.dims[0],
    users: Math.round(r.metrics[0]),
    sessions: Math.round(r.metrics[1]),
    newUsers: Math.round(r.metrics[2]),
  }));
};

/**
 * Tráfico por país
 */
const getCountries = async (startDate = '30daysAgo', endDate = 'today') => {
  const response = await runReport({
    dateRanges: [getDateRange(startDate, endDate)],
    dimensions: [{ name: 'country' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
    ],
    orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    limit: 10,
  });

  const rows = parseRows(response);
  return rows.map(r => ({
    country: r.dims[0],
    users: Math.round(r.metrics[0]),
    sessions: Math.round(r.metrics[1]),
  }));
};

/**
 * Datos en tiempo real (últimos 30 minutos)
 */
const getRealtime = async () => {
  const client = getAnalyticsClient();

  if (!client) throw new Error('Google Analytics no está configurado');
  if (!property) throw new Error('GA_PROPERTY_ID no configurado');

  console.log('⚡ Ejecutando realtime sobre:', property);

  const [response] = await client.runRealtimeReport({
    property,
    metrics: [{ name: 'activeUsers' }],
    dimensions: [{ name: 'unifiedScreenName' }],
  });

  const totalActive = response?.rows?.reduce((sum, row) => {
    return sum + (parseInt(row.metricValues?.[0]?.value) || 0);
  }, 0) || 0;

  const pages = (response?.rows || [])
    .map(row => ({
      page: row.dimensionValues?.[0]?.value || '(not set)',
      activeUsers: parseInt(row.metricValues?.[0]?.value) || 0,
    }))
    .sort((a, b) => b.activeUsers - a.activeUsers)
    .slice(0, 10);

  return {
    activeUsersNow: totalActive,
    topPagesNow: pages,
    timestamp: new Date().toISOString(),
  };
};

module.exports = {
  getSummary,
  getTraffic,
  getTopPages,
  getDevices,
  getTrafficSources,
  getCountries,
  getRealtime,
};