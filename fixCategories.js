const mongoose = require('mongoose');
require('dotenv').config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  console.log('Conectado');

  const db = mongoose.connection.db;
  const col = db.collection('servicecategories');

  const docs = await col.find({}).toArray();
  console.log(`Encontrados: ${docs.length} documentos`);

  for (const doc of docs) {
    const updates = {};

    // Si tiene campos en español, los mapea a inglés
    if (doc.nombre !== undefined)       updates.name   = doc.nombre.trim();
    if (doc.babosa !== undefined)       updates.slug   = doc.babosa.trim().toLowerCase();
    if (doc.activo !== undefined)       updates.active = doc.activo;
    if (doc.icono  !== undefined)       updates.icon   = doc.icono;
    if (doc.subcategorías !== undefined) updates.subcategories = doc.subcategorías;

    if (Object.keys(updates).length > 0) {
      await col.updateOne(
        { _id: doc._id },
        { $set: updates, $unset: { nombre: '', babosa: '', activo: '', icono: '', 'subcategorías': '' } }
      );
      console.log(`Actualizado: ${updates.name || doc.name}`);
    }
  }

  console.log('Listo');
  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });