const nodemailer = require('nodemailer');

// Configurar transporter según entorno
const createTransporter = () => {
  if (process.env.NODE_ENV === 'production') {
    // Gmail o cualquier SMTP real
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS, // App Password de Gmail
      },
    });
  }
  // En desarrollo usamos Ethereal (emails de prueba, no llegan a nadie)
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: process.env.ETHEREAL_USER || 'test@ethereal.email',
      pass: process.env.ETHEREAL_PASS || 'testpass',
    },
  });
};

const transporter = createTransporter();

const BRAND = {
  name: 'ZonaServicios',
  color: '#2563C4',
  accent: '#0EA5E9',
  url: process.env.FRONTEND_URL || 'http://localhost:5173',
};

// Template base HTML
const baseTemplate = (content) => `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${BRAND.name}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND.color};border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
              <span style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;">
                Zona<span style="color:${BRAND.accent}">Servicios</span>
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:36px 32px;border-radius:0 0 16px 16px;">
              ${content}
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:28px 0;" />
              <p style="color:#94A3B8;font-size:12px;text-align:center;margin:0;">
                © ${new Date().getFullYear()} ${BRAND.name} · Este email fue enviado automáticamente, no respondas este mensaje.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const btnStyle = (color = BRAND.color) =>
  `display:inline-block;background:${color};color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;margin:20px 0;`;

// ── Emails ──────────────────────────────────────────────────

// 1. Verificación de email
const sendVerificationEmail = async (to, name, token) => {
  const url = `${BRAND.url}/verify-email?token=${token}`;
  const html = baseTemplate(`
    <h2 style="color:#0B1F3A;font-size:22px;margin:0 0 8px;">¡Hola, ${name}! 👋</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Gracias por registrarte en <strong>ZonaServicios</strong>. Para activar tu cuenta hacé clic en el botón de abajo.
    </p>
    <div style="text-align:center;">
      <a href="${url}" style="${btnStyle()}">Verificar mi email</a>
    </div>
    <p style="color:#94A3B8;font-size:13px;text-align:center;margin:0;">
      Este enlace expira en 24 horas. Si no creaste una cuenta, ignorá este email.
    </p>
  `);
  await transporter.sendMail({ from: `"${BRAND.name}" <${process.env.EMAIL_USER}>`, to, subject: '✅ Verificá tu cuenta en ZonaServicios', html });
};

// 2. Bienvenida post-verificación
const sendWelcomeEmail = async (to, name, role) => {
  const isProvider = role === 'provider';
  const html = baseTemplate(`
    <h2 style="color:#0B1F3A;font-size:22px;margin:0 0 8px;">¡Bienvenido/a a ZonaServicios, ${name}! 🎉</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      ${isProvider
        ? 'Tu cuenta como <strong>prestador</strong> ya está activa. Completá tu perfil para que los clientes puedan encontrarte.'
        : 'Tu cuenta ya está activa. Empezá a buscar el servicio que necesitás.'}
    </p>
    <div style="text-align:center;">
      <a href="${BRAND.url}/${isProvider ? 'dashboard' : 'search'}" style="${btnStyle()}">
        ${isProvider ? 'Completar mi perfil' : 'Buscar servicios'}
      </a>
    </div>
  `);
  await transporter.sendMail({ from: `"${BRAND.name}" <${process.env.EMAIL_USER}>`, to, subject: '🎉 ¡Tu cuenta en ZonaServicios está activa!', html });
};

// 3. Nueva reseña recibida (al prestador)
const sendNewReviewEmail = async (to, providerName, reviewerAlias, rating, comment) => {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const html = baseTemplate(`
    <h2 style="color:#0B1F3A;font-size:20px;margin:0 0 8px;">Nueva reseña recibida ⭐</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hola <strong>${providerName}</strong>, recibiste una nueva reseña:
    </p>
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 6px;color:#F59E0B;font-size:20px;letter-spacing:2px;">${stars}</p>
      <p style="margin:0 0 4px;font-weight:600;color:#0B1F3A;">${reviewerAlias}</p>
      <p style="margin:0;color:#475569;font-size:14px;">"${comment}"</p>
    </div>
    <div style="text-align:center;">
      <a href="${BRAND.url}/dashboard" style="${btnStyle()}">Ver en mi panel</a>
    </div>
  `);
  await transporter.sendMail({ from: `"${BRAND.name}" <${process.env.EMAIL_USER}>`, to, subject: `⭐ Nueva reseña de ${reviewerAlias}`, html });
};

// 4. Upgrade a Plus confirmado
const sendUpgradePlusEmail = async (to, name) => {
  const html = baseTemplate(`
    <h2 style="color:#0B1F3A;font-size:22px;margin:0 0 8px;">¡Bienvenido/a al Plan Plus! ⭐</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hola <strong>${name}</strong>, tu suscripción Plus ya está activa. Ahora tenés acceso a:
    </p>
    <ul style="color:#475569;font-size:14px;line-height:2;padding-left:20px;">
      <li>📸 Portfolio de imágenes</li>
      <li>🔗 Links externos en tu perfil</li>
      <li>💬 Responder reseñas de clientes</li>
      <li>⭐ Badge Plus visible en búsquedas</li>
    </ul>
    <div style="text-align:center;">
      <a href="${BRAND.url}/dashboard" style="${btnStyle('#D97706')}">Ir a mi panel Plus</a>
    </div>
  `);
  await transporter.sendMail({ from: `"${BRAND.name}" <${process.env.EMAIL_USER}>`, to, subject: '⭐ ¡Tu Plan Plus está activo!', html });
};

// 5. Verificación aprobada (admin verifica al prestador)
const sendVerifiedProviderEmail = async (to, name) => {
  const html = baseTemplate(`
    <h2 style="color:#0B1F3A;font-size:22px;margin:0 0 8px;">¡Tu perfil fue verificado! ✅</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hola <strong>${name}</strong>, nuestro equipo revisó tu documentación y tu perfil ahora tiene el badge de <strong>Prestador Verificado</strong>.
    </p>
    <p style="color:#475569;font-size:14px;">Esto aumenta tu visibilidad y confianza con los clientes.</p>
    <div style="text-align:center;">
      <a href="${BRAND.url}/dashboard" style="${btnStyle('#22C55E')}">Ver mi perfil</a>
    </div>
  `);
  await transporter.sendMail({ from: `"${BRAND.name}" <${process.env.EMAIL_USER}>`, to, subject: '✅ Tu perfil fue verificado en ZonaServicios', html });
};

// 6. Recuperar contraseña
const sendPasswordResetEmail = async (to, name, token) => {
  const url = `${BRAND.url}/reset-password?token=${token}`;
  const html = baseTemplate(`
    <h2 style="color:#0B1F3A;font-size:22px;margin:0 0 8px;">Recuperar contraseña 🔐</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hola <strong>${name}</strong>, recibimos una solicitud para restablecer tu contraseña. Hacé clic en el botón de abajo:
    </p>
    <div style="text-align:center;">
      <a href="${url}" style="${btnStyle('#EF4444')}">Restablecer contraseña</a>
    </div>
    <p style="color:#94A3B8;font-size:13px;text-align:center;margin:0;">
      Este enlace expira en 1 hora. Si no solicitaste esto, ignorá este email.
    </p>
  `);
  await transporter.sendMail({ from: `"${BRAND.name}" <${process.env.EMAIL_USER}>`, to, subject: '🔐 Restablecer contraseña - ZonaServicios', html });
};

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendNewReviewEmail,
  sendUpgradePlusEmail,
  sendVerifiedProviderEmail,
  sendPasswordResetEmail,
};