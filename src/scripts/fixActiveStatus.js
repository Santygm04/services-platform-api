require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const ProviderProfile = require('../models/ProviderProfile');

async function fix() {
  console.log('Conectando a MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Conectado. Actualizando perfiles...');
  
  const result = await ProviderProfile.updateMany(
    { activeStatus: { $exists: false } },
    { $set: { activeStatus: true } }
  );
  console.log(`Actualizados: ${result.modifiedCount} perfiles sin activeStatus`);

  const result2 = await ProviderProfile.updateMany(
    { activeStatus: null },
    { $set: { activeStatus: true } }
  );
  console.log(`Actualizados: ${result2.modifiedCount} perfiles con activeStatus null`);

  await mongoose.disconnect();
  console.log('Listo.');
}

fix().catch(console.error);