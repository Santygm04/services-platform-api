const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const path = require('path');
const fs = require('fs');

let analyticsClient = null;

const getAnalyticsClient = () => {
  if (analyticsClient) return analyticsClient;

  const propertyId = process.env.GA_PROPERTY_ID;

  if (!propertyId) {
    console.warn('⚠ GA_PROPERTY_ID no configurado');
    return null;
  }

  // Opción 1: credenciales como JSON en variable de entorno (Railway)
  if (process.env.GA_CREDENTIALS_JSON) {
    try {
      const credentials = JSON.parse(process.env.GA_CREDENTIALS_JSON);
      analyticsClient = new BetaAnalyticsDataClient({ credentials });
      console.log('✅ Google Analytics conectado via GA_CREDENTIALS_JSON');
      return analyticsClient;
    } catch (err) {
      console.error('❌ Error parseando GA_CREDENTIALS_JSON:', err.message);
    }
  }

  // Opción 2: archivo local (desarrollo)
  const keyFilePath = process.env.GA_KEY_FILE_PATH;
  if (!keyFilePath) {
    console.warn('⚠ GA_KEY_FILE_PATH no configurado');
    return null;
  }

  try {
    const resolvedPath = path.isAbsolute(keyFilePath)
      ? keyFilePath
      : path.resolve(__dirname, '..', '..', keyFilePath);

    if (!fs.existsSync(resolvedPath)) {
      console.error('❌ No existe el archivo de credenciales GA:', resolvedPath);
      return null;
    }

    analyticsClient = new BetaAnalyticsDataClient({ keyFilename: resolvedPath });
    console.log('✅ Google Analytics conectado via keyfile');
    return analyticsClient;
  } catch (err) {
    console.error('❌ Error conectando GA4:', err.message);
    return null;
  }
};

const GA_PROPERTY_ID = process.env.GA_PROPERTY_ID;

module.exports = { getAnalyticsClient, GA_PROPERTY_ID };