const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const BRAND = {
  name:   'ZonaServicios',
  color:  '#1E2B58',
  accent: '#edb449',
  teal:   '#6e70c4',
  url:    process.env.FRONTEND_URL || 'http://localhost:5173',
};
const LOGO_URL = `${BRAND.url}/logo-navbar.png`;

const FROM = 'ZonaServicios <no-reply@zonaservicios.com.ar>';

// ── Template base ─────────────────────────────────────────
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
          <tr>
            <td style="background:${BRAND.color};border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="${BRAND.name}" width="160" style="display:inline-block;height:auto;max-width:160px;" />
            </td>
          </tr>
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

const btnStyle = (color = BRAND.teal) =>
  `display:inline-block;background:${color};color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;margin:20px 0;`;

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
};

// ════════════════════════════════════════════════════════════
//  EMAILS
// ════════════════════════════════════════════════════════════

const sendVerificationEmail = async (to, name, token) => {
  const url  = `${BRAND.url}/verify-email?token=${token}`;
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
  await resend.emails.send({ from: FROM, to, subject: '✅ Verificá tu cuenta en ZonaServicios', html });
};

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
      <a href="${BRAND.url}${isProvider ? '/dashboard' : ''}" style="${btnStyle()}">
        ${isProvider ? 'Completar mi perfil' : 'Buscar servicios'}
      </a>
    </div>
  `);
  await resend.emails.send({ from: FROM, to, subject: '🎉 ¡Tu cuenta en ZonaServicios está activa!', html });
};

const sendNewReviewEmail = async (to, providerName, reviewerAlias, rating, comment) => {
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
  const html  = baseTemplate(`
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
  await resend.emails.send({ from: FROM, to, subject: `⭐ Nueva reseña de ${reviewerAlias}`, html });
};

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
  await resend.emails.send({ from: FROM, to, subject: '⭐ ¡Tu Plan Plus está activo!', html });
};

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
  await resend.emails.send({ from: FROM, to, subject: '✅ Tu perfil fue verificado en ZonaServicios', html });
};

const sendPasswordResetEmail = async (to, name, token) => {
  const url  = `${BRAND.url}/reset-password?token=${token}`;
  const html = baseTemplate(`
    <h2 style="color:#0B1F3A;font-size:22px;margin:0 0 8px;">Recuperar contraseña 🔐</h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hola <strong>${name}</strong>, recibimos una solicitud para restablecer tu contraseña. Hacé clic en el botón de abajo:
    </p>
    <div style="text-align:center;">
      <a href="${url}" style="${btnStyle()}">Restablecer contraseña</a>
    </div>
    <p style="color:#94A3B8;font-size:13px;text-align:center;margin:0;">
      Este enlace expira en 1 hora. Si no solicitaste esto, ignorá este email.
    </p>
  `);
  await resend.emails.send({ from: FROM, to, subject: '🔐 Restablecer contraseña - ZonaServicios', html });
};

const sendPlanUpgradeEmail = async (to, name, plan, expiresAt) => {
  const isPremium = plan === 'premium';
  const planConfig = {
    plus: {
      emoji: '⭐', label: 'Plus', color: '#D97706', price: '$4.999',
      features: [
        '📸 Portfolio de fotos de trabajo',
        '🔗 Links a redes sociales y sitio web',
        '💬 Responder reseñas públicamente',
        '⭐ Badge Plus destacado en búsquedas',
        '🚨 Disponible para urgencias',
        '📊 Prioridad en resultados de búsqueda',
      ],
    },
    premium: {
      emoji: '👑', label: 'Premium', color: '#B45309', price: '$10.000',
      features: [
        '✅ Todo lo del Plan Plus',
        '👑 Badge dorado Premium en búsquedas',
        '🏆 Posición TOP en resultados',
        '🎯 Destacado en la página de inicio',
        '🎁 Banner publicitario mensual incluido',
        '📣 Prioridad máxima en notificaciones de zona',
      ],
    },
  };

  const cfg     = planConfig[plan] || planConfig.plus;
  const expDate = formatDate(expiresAt);
  const html    = baseTemplate(`
    <h2 style="color:#0B1F3A;font-size:22px;margin:0 0 8px;">
      ${cfg.emoji} ¡Bienvenido/a al Plan ${cfg.label}!
    </h2>
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hola <strong>${name}</strong>, tu suscripción <strong>${cfg.label}</strong> ya está activa.
      ${expDate ? `Tu plan está activo hasta el <strong>${expDate}</strong>.` : ''}
    </p>
    <div style="text-align:center;margin:16px 0 24px;">
      <span style="display:inline-block;background:${cfg.color};color:#fff;font-size:13px;font-weight:700;padding:6px 18px;border-radius:999px;letter-spacing:0.5px;">
        ${cfg.emoji} PLAN ${cfg.label.toUpperCase()} ACTIVO
      </span>
    </div>
    <p style="color:#0B1F3A;font-size:14px;font-weight:600;margin:0 0 10px;">Lo que tenés disponible ahora:</p>
    <ul style="color:#475569;font-size:14px;line-height:2.1;padding-left:20px;margin:0 0 24px;">
      ${cfg.features.map(f => `<li>${f}</li>`).join('')}
    </ul>
    ${isPremium ? `
    <div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0;color:#92400E;font-size:13px;font-weight:600;">
        🎁 Recordatorio: Tu plan Premium incluye un banner publicitario gratis por mes.
        Podés activarlo desde tu panel en la sección Publicidad.
      </p>
    </div>
    ` : ''}
    <div style="text-align:center;">
      <a href="${BRAND.url}/dashboard" style="${btnStyle(cfg.color)}">Ir a mi panel ${cfg.label}</a>
    </div>
    <p style="color:#94A3B8;font-size:12px;text-align:center;margin:8px 0 0;">
      ${expDate ? `Tu plan se renueva el ${expDate}. Podés cancelarlo en cualquier momento desde tu panel.` : ''}
    </p>
  `);
  await resend.emails.send({ from: FROM, to, subject: `${cfg.emoji} ¡Tu Plan ${cfg.label} está activo! — ZonaServicios`, html });
};

module.exports = {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendNewReviewEmail,
  sendUpgradePlusEmail,
  sendVerifiedProviderEmail,
  sendPasswordResetEmail,
  sendPlanUpgradeEmail,
};