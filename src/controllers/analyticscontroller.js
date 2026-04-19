const analyticsService = require('../services/analyticsservice');

// Helper para extraer rango de fechas de query params
const getDates = (query) => ({
  startDate: query.startDate || '30daysAgo',
  endDate: query.endDate || 'today',
});

// GET /api/admin/analytics/summary
const getSummary = async (req, res) => {
  try {
    const { startDate, endDate } = getDates(req.query);
    const data = await analyticsService.getSummary(startDate, endDate);
    res.json(data);
  } catch (err) {
    console.error('Analytics summary error:', err.message);
    res.status(err.message.includes('no está configurado') ? 503 : 500)
      .json({ message: err.message || 'Error al obtener resumen de analytics' });
  }
};

// GET /api/admin/analytics/traffic
const getTraffic = async (req, res) => {
  try {
    const { startDate, endDate } = getDates(req.query);
    const data = await analyticsService.getTraffic(startDate, endDate);
    res.json({ traffic: data });
  } catch (err) {
    console.error('Analytics traffic error:', err.message);
    res.status(err.message.includes('no está configurado') ? 503 : 500)
      .json({ message: err.message || 'Error al obtener tráfico' });
  }
};

// GET /api/admin/analytics/pages
const getTopPages = async (req, res) => {
  try {
    const { startDate, endDate } = getDates(req.query);
    const limit = parseInt(req.query.limit) || 15;
    const data = await analyticsService.getTopPages(startDate, endDate, limit);
    res.json({ pages: data });
  } catch (err) {
    console.error('Analytics pages error:', err.message);
    res.status(err.message.includes('no está configurado') ? 503 : 500)
      .json({ message: err.message || 'Error al obtener páginas' });
  }
};

// GET /api/admin/analytics/devices
const getDevices = async (req, res) => {
  try {
    const { startDate, endDate } = getDates(req.query);
    const data = await analyticsService.getDevices(startDate, endDate);
    res.json({ devices: data });
  } catch (err) {
    console.error('Analytics devices error:', err.message);
    res.status(err.message.includes('no está configurado') ? 503 : 500)
      .json({ message: err.message || 'Error al obtener dispositivos' });
  }
};

// GET /api/admin/analytics/sources
const getTrafficSources = async (req, res) => {
  try {
    const { startDate, endDate } = getDates(req.query);
    const data = await analyticsService.getTrafficSources(startDate, endDate);
    res.json({ sources: data });
  } catch (err) {
    console.error('Analytics sources error:', err.message);
    res.status(err.message.includes('no está configurado') ? 503 : 500)
      .json({ message: err.message || 'Error al obtener fuentes de tráfico' });
  }
};

// GET /api/admin/analytics/countries
const getCountries = async (req, res) => {
  try {
    const { startDate, endDate } = getDates(req.query);
    const data = await analyticsService.getCountries(startDate, endDate);
    res.json({ countries: data });
  } catch (err) {
    console.error('Analytics countries error:', err.message);
    res.status(err.message.includes('no está configurado') ? 503 : 500)
      .json({ message: err.message || 'Error al obtener países' });
  }
};

// GET /api/admin/analytics/realtime
const getRealtime = async (req, res) => {
  try {
    const data = await analyticsService.getRealtime();
    res.json(data);
  } catch (err) {
    console.error('Analytics realtime error:', err.message);
    res.status(err.message.includes('no está configurado') ? 503 : 500)
      .json({ message: err.message || 'Error al obtener datos en tiempo real' });
  }
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