/**
 * Seeder de categorías y subcategorías para ZonaServicios
 * Ejecutar: node src/scripts/seedCategories.js
 * Idempotente: no duplica si ya existen
 */
const mongoose = require('mongoose');
require('dotenv').config();

const ServiceCategory = require('../models/servicecategory');

const categories = [
  {
    name: 'Electricista', slug: 'electricista', icon: '⚡',
    subcategories: [
      { name: 'Instalaciones eléctricas', slug: 'instalaciones-electricas' },
      { name: 'Tableros y térmicas', slug: 'tableros-termicas' },
      { name: 'Iluminación LED', slug: 'iluminacion-led' },
      { name: 'Electricidad industrial', slug: 'electricidad-industrial' },
    ],
  },
  {
    name: 'Plomero', slug: 'plomero', icon: '🔧',
    subcategories: [
      { name: 'Reparación de cañerías', slug: 'reparacion-canerias' },
      { name: 'Destapaciones', slug: 'destapaciones' },
      { name: 'Instalación sanitaria', slug: 'instalacion-sanitaria' },
      { name: 'Termotanques y calderas', slug: 'termotanques-calderas' },
    ],
  },
  {
    name: 'Pintor', slug: 'pintor', icon: '🖌️',
    subcategories: [
      { name: 'Pintura interior', slug: 'pintura-interior' },
      { name: 'Pintura exterior', slug: 'pintura-exterior' },
      { name: 'Durlock y enduido', slug: 'durlock-enduido' },
      { name: 'Impermeabilización', slug: 'impermeabilizacion' },
    ],
  },
  {
    name: 'Carpintero', slug: 'carpintero', icon: '🪚',
    subcategories: [
      { name: 'Muebles a medida', slug: 'muebles-a-medida' },
      { name: 'Puertas y ventanas', slug: 'puertas-ventanas' },
      { name: 'Pisos de madera', slug: 'pisos-madera' },
      { name: 'Reparaciones generales', slug: 'reparaciones-carpinteria' },
    ],
  },
  {
    name: 'Gasista', slug: 'gasista', icon: '🔥',
    subcategories: [
      { name: 'Instalación de gas', slug: 'instalacion-gas' },
      { name: 'Estufas y calefacción', slug: 'estufas-calefaccion' },
      { name: 'Gasista matriculado', slug: 'gasista-matriculado' },
    ],
  },
  {
    name: 'Cerrajero', slug: 'cerrajero', icon: '🔑',
    subcategories: [
      { name: 'Apertura de puertas', slug: 'apertura-puertas' },
      { name: 'Cambio de cerraduras', slug: 'cambio-cerraduras' },
      { name: 'Cerrajería automotor', slug: 'cerrajeria-automotor' },
    ],
  },
  {
    name: 'Limpieza', slug: 'limpieza', icon: '🧹',
    subcategories: [
      { name: 'Limpieza de hogar', slug: 'limpieza-hogar' },
      { name: 'Limpieza de oficinas', slug: 'limpieza-oficinas' },
      { name: 'Limpieza post-obra', slug: 'limpieza-post-obra' },
    ],
  },
  {
    name: 'Jardinero', slug: 'jardinero', icon: '🌿',
    subcategories: [
      { name: 'Mantenimiento de jardín', slug: 'mantenimiento-jardin' },
      { name: 'Poda y desmalezado', slug: 'poda-desmalezado' },
      { name: 'Diseño de parques', slug: 'diseno-parques' },
      { name: 'Riego automatizado', slug: 'riego-automatizado' },
    ],
  },
  {
    name: 'Albañil', slug: 'albanil', icon: '🧱',
    subcategories: [
      { name: 'Construcción en seco', slug: 'construccion-seco' },
      { name: 'Reformas y ampliaciones', slug: 'reformas-ampliaciones' },
      { name: 'Revestimientos', slug: 'revestimientos' },
      { name: 'Albañilería general', slug: 'albanileria-general' },
    ],
  },
  {
    name: 'Técnico PC / Celulares', slug: 'tecnico-pc', icon: '💻',
    subcategories: [
      { name: 'Reparación de PC', slug: 'reparacion-pc' },
      { name: 'Reparación de celulares', slug: 'reparacion-celulares' },
      { name: 'Redes y WiFi', slug: 'redes-wifi' },
      { name: 'Recuperación de datos', slug: 'recuperacion-datos' },
    ],
  },
  {
    name: 'Aire Acondicionado', slug: 'aire-acondicionado', icon: '❄️',
    subcategories: [
      { name: 'Instalación de split', slug: 'instalacion-split' },
      { name: 'Limpieza y carga de gas', slug: 'limpieza-carga-gas' },
      { name: 'Reparación de equipos', slug: 'reparacion-equipos-aa' },
    ],
  },
  {
    name: 'Mudanza y Flete', slug: 'mudanza-flete', icon: '🚚',
    subcategories: [
      { name: 'Mudanza completa', slug: 'mudanza-completa' },
      { name: 'Flete y traslado', slug: 'flete-traslado' },
      { name: 'Embalaje', slug: 'embalaje' },
    ],
  },
  {
    name: 'Herrero', slug: 'herrero', icon: '⚒️',
    subcategories: [
      { name: 'Rejas y portones', slug: 'rejas-portones' },
      { name: 'Estructuras metálicas', slug: 'estructuras-metalicas' },
      { name: 'Soldadura', slug: 'soldadura' },
    ],
  },
  {
    name: 'Vidriero', slug: 'vidriero', icon: '🪟',
    subcategories: [
      { name: 'Vidrios y espejos', slug: 'vidrios-espejos' },
      { name: 'Mamparas de baño', slug: 'mamparas-bano' },
      { name: 'Cerramientos de aluminio', slug: 'cerramientos-aluminio' },
    ],
  },
  {
    name: 'Diseñador / Arquitecto', slug: 'diseno-arquitectura', icon: '📐',
    subcategories: [
      { name: 'Diseño de interiores', slug: 'diseno-interiores' },
      { name: 'Arquitectura', slug: 'arquitectura' },
      { name: 'Renders y planos', slug: 'renders-planos' },
    ],
  },
  {
    name: 'Fumigador', slug: 'fumigador', icon: '🐛',
    subcategories: [
      { name: 'Control de plagas', slug: 'control-plagas' },
      { name: 'Desratización', slug: 'desratizacion' },
      { name: 'Fumigación de cucarachas', slug: 'fumigacion-cucarachas' },
    ],
  },
  {
    name: 'Mecánico', slug: 'mecanico', icon: '🔩',
    subcategories: [
      { name: 'Mecánica general', slug: 'mecanica-general' },
      { name: 'Service y mantenimiento', slug: 'service-mantenimiento' },
      { name: 'Electricidad automotor', slug: 'electricidad-automotor' },
    ],
  },
  {
    name: 'Profesor Particular', slug: 'profesor-particular', icon: '📚',
    subcategories: [
      { name: 'Matemáticas', slug: 'matematicas' },
      { name: 'Inglés', slug: 'ingles' },
      { name: 'Ciencias', slug: 'ciencias' },
      { name: 'Apoyo escolar general', slug: 'apoyo-escolar' },
    ],
  },
  {
    name: 'Fotógrafo / Videógrafo', slug: 'fotografo', icon: '📷',
    subcategories: [
      { name: 'Eventos sociales', slug: 'eventos-sociales' },
      { name: 'Fotografía corporativa', slug: 'fotografia-corporativa' },
      { name: 'Video y edición', slug: 'video-edicion' },
    ],
  },
  {
    name: 'Otros servicios', slug: 'otros', icon: '🛠️',
    subcategories: [
      { name: 'Servicio general', slug: 'servicio-general' },
    ],
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Conectado a MongoDB');

    let created = 0;
    let updated = 0;

    for (const cat of categories) {
      const existing = await ServiceCategory.findOne({ slug: cat.slug });
      if (existing) {
        // Actualizar subcategorías e icono si cambió
        existing.subcategories = cat.subcategories || [];
        existing.icon = cat.icon || '🔧';
        await existing.save();
        updated++;
      } else {
        await ServiceCategory.create(cat);
        created++;
      }
    }

    console.log(`✅ Seeder completado: ${created} creadas, ${updated} actualizadas`);
    console.log(`📊 Total categorías: ${await ServiceCategory.countDocuments()}`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
};

seed();