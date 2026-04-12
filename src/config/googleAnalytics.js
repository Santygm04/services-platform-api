const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const path = require('path');
const fs = require('fs');

let analyticsClient = null;

const getAnalyticsClient = () => {
  if (analyticsClient) return analyticsClient;

  const keyFilePath = process.env.GA_KEY_FILE_PATH;
  const propertyId = process.env.GA_PROPERTY_ID;

  console.log('GA_PROPERTY_ID:', propertyId);
  console.log('GA_KEY_FILE_PATH raw:', keyFilePath);

  if (!propertyId) {
    console.warn('⚠ GA_PROPERTY_ID no configurado');
    return null;
  }

  if (!keyFilePath) {
    console.warn('⚠ GA_KEY_FILE_PATH no configurado');
    return null;
  }

  try {
    const resolvedPath = path.isAbsolute(keyFilePath)
      ? keyFilePath
      : path.resolve(__dirname, '..', '..', keyFilePath);

    console.log('GA_KEY_FILE_PATH resolved:', resolvedPath);
    console.log('GA key exists:', fs.existsSync(resolvedPath));

    if (!fs.existsSync(resolvedPath)) {
      console.error('❌ No existe el archivo de credenciales de GA en esa ruta');
      return null;
    }

    analyticsClient = new BetaAnalyticsDataClient({
      keyFilename: resolvedPath,
    });

    console.log('✅ Google Analytics Data API conectado');
    return analyticsClient;
  } catch (err) {
    console.error('❌ Error al conectar GA4 Data API:', err.message);
    return null;
  }
};

const GA_PROPERTY_ID = process.env.GA_PROPERTY_ID;

module.exports = { getAnalyticsClient, GA_PROPERTY_ID };