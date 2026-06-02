import { Resend } from "resend";

// ─── Client ───────────────────────────────────────────────────────────────────
// Set RESEND_API_KEY in server/.env
// Set RESEND_FROM to the verified sender, e.g. "DardosDM <noreply@dardosdm.com>"

let client: Resend | null = null;

function getClient(): Resend | null {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — emails will be logged to console only");
    return null;
  }
  client = new Resend(key);
  return client;
}

const FROM =
  process.env.RESEND_FROM ?? "DardosDM <noreply@dardosdm.com>";

const APP_NAME = "DardosDM";

// ─── HTML escape helper ───────────────────────────────────────────────────────
// All user-supplied values (name, tournamentName, etc.) must be escaped before
// being interpolated into HTML email bodies to prevent HTML/script injection.
function esc(s: string): string {
  return s
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#x27;");
}

// ─── Welcome + verify email ───────────────────────────────────────────────────
export async function sendWelcomeVerification(opts: {
  to: string;
  name: string;
  verifyUrl: string;
}) {
  const { to, name, verifyUrl } = opts;
  const firstName = esc(name.split(" ")[0]);

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bienvenido a ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);padding:36px 32px;text-align:center;">
              <div style="display:inline-block;width:60px;height:60px;background:rgba(255,255,255,0.15);border-radius:16px;line-height:60px;margin-bottom:16px;font-size:30px;">🎯</div>
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">
                Dardos<span style="color:#fca5a5;">DM</span>
              </h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.70);font-size:13px;letter-spacing:.02em;">Plataforma de torneos de dardos</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px;">
              <h2 style="margin:0 0 10px;color:#ffffff;font-size:21px;font-weight:700;">
                ¡Bienvenid${name.endsWith("a") || name.endsWith("A") ? "a" : "o"}, ${firstName}! 🏆
              </h2>
              <p style="margin:0 0 20px;color:#a1a1aa;font-size:14px;line-height:1.7;">
                Tu cuenta de jugador ha sido creada correctamente en <strong style="color:#e4e4e7;">DardosDM</strong>.
                Para activarla y poder inscribirte en torneos, confirma tu dirección de email haciendo clic en el botón de abajo.
              </p>

              <!-- CTA button -->
              <div style="text-align:center;margin:32px 0;">
                <a href="${verifyUrl}"
                   style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:15px 40px;border-radius:12px;letter-spacing:0.2px;box-shadow:0 4px 24px rgba(220,38,38,.35);">
                  ✓ &nbsp; Verificar mi email
                </a>
              </div>

              <p style="margin:0 0 5px;color:#71717a;font-size:12px;text-align:center;">
                Este enlace expira en <strong style="color:#a1a1aa;">24 horas</strong>.
              </p>
              <p style="margin:0;color:#71717a;font-size:12px;text-align:center;">
                Si no creaste esta cuenta, ignora este mensaje.
              </p>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #27272a;margin:28px 0;" />

              <!-- Feature chips -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="text-align:center;padding:10px 4px;">
                    <div style="font-size:26px;line-height:1;">🎯</div>
                    <div style="color:#a1a1aa;font-size:11px;margin-top:6px;font-weight:600;letter-spacing:.04em;">TORNEOS</div>
                  </td>
                  <td width="33%" style="text-align:center;padding:10px 4px;">
                    <div style="font-size:26px;line-height:1;">📊</div>
                    <div style="color:#a1a1aa;font-size:11px;margin-top:6px;font-weight:600;letter-spacing:.04em;">RANKINGS</div>
                  </td>
                  <td width="33%" style="text-align:center;padding:10px 4px;">
                    <div style="font-size:26px;line-height:1;">🏆</div>
                    <div style="color:#a1a1aa;font-size:11px;margin-top:6px;font-weight:600;letter-spacing:.04em;">BRACKETS</div>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #27272a;margin:24px 0;" />

              <!-- PWA + Notifications instructions -->
              <p style="margin:0 0 12px;color:#e4e4e7;font-size:13px;font-weight:700;letter-spacing:.02em;">
                📲 Instala la app y activa notificaciones
              </p>
              <!-- Android -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
                <tr>
                  <td style="background:#1c1c20;border:1px solid #27272a;border-radius:10px;padding:14px 16px;">
                    <p style="margin:0 0 4px;color:#e4e4e7;font-size:13px;font-weight:600;">
                      📱 Android (Chrome)
                    </p>
                    <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.6;">
                      Añadid la aplicación a la pantalla de inicio desde el menú de Chrome para tener un acceso directo y una mejor experiencia de uso.
                    </p>
                  </td>
                </tr>
              </table>
              <!-- iPhone -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
                <tr>
                  <td style="background:#1c1c20;border:1px solid #27272a;border-radius:10px;padding:14px 16px;">
                    <p style="margin:0 0 4px;color:#e4e4e7;font-size:13px;font-weight:600;">
                      📱 iPhone (Safari)
                    </p>
                    <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.6;">
                      Pulsad el botón <strong style="color:#e4e4e7;">Compartir</strong> y seleccionad <strong style="color:#e4e4e7;">"Añadir a pantalla de inicio"</strong> para instalar el acceso directo en vuestro dispositivo.
                    </p>
                  </td>
                </tr>
              </table>
              <!-- Notifications -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1a1010;border:1px solid #7f1d1d50;border-radius:10px;padding:14px 16px;">
                    <p style="margin:0 0 4px;color:#fca5a5;font-size:13px;font-weight:600;">
                      🔔 Notificaciones push
                    </p>
                    <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.6;">
                      Cuando iniciéis sesión, aparecerá un mensaje preguntando si queréis activar las notificaciones. Pulsad en <strong style="color:#e4e4e7;">"Activar"</strong> para recibir avisos importantes, llamadas y novedades al instante.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#09090b;padding:22px 32px;text-align:center;border-top:1px solid #27272a;">
              <p style="margin:0 0 6px;color:#52525b;font-size:11px;line-height:1.6;">
                Si el botón no funciona, copia este enlace en tu navegador:<br />
                <a href="${verifyUrl}" style="color:#3f3f46;font-size:10px;word-break:break-all;">${verifyUrl}</a>
              </p>
              <p style="margin:10px 0 0;color:#3f3f46;font-size:10px;">
                © ${new Date().getFullYear()} DardosDM · Todos los derechos reservados
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `¡Bienvenido a DardosDM, ${firstName}!\n\nVerifica tu email accediendo a este enlace (válido 24 h):\n${verifyUrl}\n\nSi no creaste esta cuenta, ignora este mensaje.`;

  const resend = getClient();
  if (!resend) {
    // Dev fallback — log to console so you can test without SMTP
    console.log(`\n[email] ── WELCOME VERIFICATION (no RESEND_API_KEY) ──`);
    console.log(`  To:  ${to}`);
    console.log(`  URL: ${verifyUrl}\n`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: `Verifica tu email en ${APP_NAME}`,
    text,
    html,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────
const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Eliminación directa",
  double_elimination: "Doble eliminación",
  round_robin:        "Round Robin + KO",
};

function emailShell(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#18181b;border-radius:16px;border:1px solid #27272a;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#7f1d1d 0%,#dc2626 100%);padding:28px 32px;text-align:center;">
            <div style="font-size:28px;line-height:1;margin-bottom:10px;">🎯</div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">
              Dardos<span style="color:#fca5a5;">DM</span>
            </h1>
          </td>
        </tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          ${content}
        </td></tr>

        <!-- Footer -->
        <tr>
          <td style="background:#09090b;padding:18px 32px;text-align:center;border-top:1px solid #27272a;">
            <p style="margin:0;color:#3f3f46;font-size:10px;">© ${new Date().getFullYear()} DardosDM · Todos los derechos reservados</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const resend = getClient();
  if (!resend) {
    console.log(`\n[email] ── ${subject} ──`);
    console.log(`  To: ${to}\n`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM, to, subject, html, text });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

// ─── Password reset email ─────────────────────────────────────────────────────
export async function sendPasswordReset(opts: {
  to: string;
  name: string;
  resetUrl: string;
}) {
  const { to, name, resetUrl } = opts;
  const firstName = esc(name.split(" ")[0]);

  const html = emailShell(`
    <h2 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:700;">
      Restablecer contraseña 🔑
    </h2>
    <p style="margin:0 0 20px;color:#a1a1aa;font-size:14px;line-height:1.7;">
      Hola <strong style="color:#e4e4e7;">${firstName}</strong>, recibimos una solicitud para restablecer la contraseña de tu cuenta.
      Si no fuiste tú, puedes ignorar este mensaje.
    </p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${resetUrl}"
         style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:15px 40px;border-radius:12px;letter-spacing:0.2px;box-shadow:0 4px 24px rgba(220,38,38,.35);">
        🔑 &nbsp; Cambiar contraseña
      </a>
    </div>

    <p style="margin:0 0 5px;color:#71717a;font-size:12px;text-align:center;">
      Este enlace expira en <strong style="color:#a1a1aa;">1 hora</strong>.
    </p>
    <p style="margin:0;color:#71717a;font-size:12px;text-align:center;">
      Si no solicitaste este cambio, ignora este mensaje — tu contraseña no cambiará.
    </p>

    <hr style="border:none;border-top:1px solid #27272a;margin:24px 0;" />
    <p style="margin:0;color:#52525b;font-size:11px;text-align:center;word-break:break-all;">
      Si el botón no funciona: <a href="${resetUrl}" style="color:#3f3f46;">${resetUrl}</a>
    </p>
  `);

  const text = `Hola ${firstName}, recibimos una solicitud para restablecer tu contraseña en DardosDM.\n\nCambia tu contraseña aquí (válido 1 hora):\n${resetUrl}\n\nSi no solicitaste este cambio, ignora este mensaje.`;

  await sendEmail(to, `Restablecer contraseña en ${APP_NAME}`, html, text);
}

// ─── Inscription pending email ────────────────────────────────────────────────
export async function sendInscriptionPending(opts: {
  to: string;
  name: string;
  tournamentName: string;
  tournamentFormat?: string;
  tournamentDate?: string | null;
  tournamentUrl: string;
}) {
  const { to, name, tournamentName, tournamentFormat, tournamentDate, tournamentUrl } = opts;
  const firstName      = esc(name.split(" ")[0]);
  const safeTournament = esc(tournamentName);
  const formatLabel = tournamentFormat ? (FORMAT_LABELS[tournamentFormat] ?? esc(tournamentFormat)) : null;
  const dateStr = tournamentDate
    ? new Date(tournamentDate).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const html = emailShell(`
    <h2 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:700;">
      Solicitud recibida 📋
    </h2>
    <p style="margin:0 0 20px;color:#a1a1aa;font-size:14px;line-height:1.7;">
      Hola <strong style="color:#e4e4e7;">${firstName}</strong>, hemos recibido tu solicitud de inscripción en:
    </p>

    <!-- Tournament card -->
    <div style="background:#09090b;border:1px solid #27272a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 6px;color:#fff;font-size:16px;font-weight:700;">${safeTournament}</p>
      ${formatLabel ? `<p style="margin:0 0 4px;color:#71717a;font-size:12px;">📋 ${formatLabel}</p>` : ""}
      ${dateStr ? `<p style="margin:0;color:#71717a;font-size:12px;">📅 ${dateStr}</p>` : ""}
    </div>

    <!-- Status -->
    <div style="background:#78350f20;border:1px solid #92400e50;border-radius:10px;padding:14px 18px;margin-bottom:24px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:20px;">⏳</span>
      <div>
        <p style="margin:0;color:#fbbf24;font-size:13px;font-weight:700;">Pendiente de aprobación</p>
        <p style="margin:4px 0 0;color:#a16207;font-size:12px;line-height:1.5;">
          El organizador revisará tu solicitud. Te avisaremos cuando sea aprobada.
        </p>
      </div>
    </div>

    <div style="text-align:center;">
      <a href="${tournamentUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 32px;border-radius:10px;">
        Ver torneo
      </a>
    </div>
  `);

  const text = `Hola ${firstName}, hemos recibido tu solicitud de inscripción en "${safeTournament}". Está pendiente de aprobación por parte del organizador. Te avisaremos cuando sea confirmada. Ver torneo: ${tournamentUrl}`;

  await sendEmail(to, `Solicitud de inscripción en ${safeTournament}`, html, text);
}

// ─── Inscription approved email ───────────────────────────────────────────────
export async function sendInscriptionApproved(opts: {
  to: string;
  name: string;
  tournamentName: string;
  tournamentFormat?: string;
  tournamentDate?: string | null;
  tournamentUrl: string;
}) {
  const { to, name, tournamentName, tournamentFormat, tournamentDate, tournamentUrl } = opts;
  const firstName      = esc(name.split(" ")[0]);
  const safeTournament = esc(tournamentName);
  const formatLabel = tournamentFormat ? (FORMAT_LABELS[tournamentFormat] ?? esc(tournamentFormat)) : null;
  const dateStr = tournamentDate
    ? new Date(tournamentDate).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })
    : null;

  const html = emailShell(`
    <h2 style="margin:0 0 8px;color:#fff;font-size:20px;font-weight:700;">
      ¡Inscripción confirmada! 🎯
    </h2>
    <p style="margin:0 0 20px;color:#a1a1aa;font-size:14px;line-height:1.7;">
      Hola <strong style="color:#e4e4e7;">${firstName}</strong>, ¡tu inscripción ha sido <strong style="color:#4ade80;">aprobada</strong>! Estás dentro del torneo:
    </p>

    <!-- Tournament card -->
    <div style="background:#09090b;border:1px solid #27272a;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 6px;color:#fff;font-size:16px;font-weight:700;">${safeTournament}</p>
      ${formatLabel ? `<p style="margin:0 0 4px;color:#71717a;font-size:12px;">📋 ${formatLabel}</p>` : ""}
      ${dateStr ? `<p style="margin:0;color:#71717a;font-size:12px;">📅 ${dateStr}</p>` : ""}
    </div>

    <!-- Confirmed status -->
    <div style="background:#14532d20;border:1px solid #16a34a50;border-radius:10px;padding:14px 18px;margin-bottom:24px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:20px;">✅</span>
      <div>
        <p style="margin:0;color:#4ade80;font-size:13px;font-weight:700;">Plaza confirmada</p>
        <p style="margin:4px 0 0;color:#166534;font-size:12px;line-height:1.5;">
          Sigue el bracket y los resultados en tiempo real desde la app.
        </p>
      </div>
    </div>

    <div style="text-align:center;">
      <a href="${tournamentUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 32px;border-radius:10px;">
        Ver mi torneo 🏆
      </a>
    </div>
  `);

  const text = `¡Hola ${firstName}! Tu inscripción en "${safeTournament}" ha sido aprobada. Ya tienes tu plaza confirmada. Ver torneo: ${tournamentUrl}`;

  await sendEmail(to, `✅ Inscripción confirmada en ${safeTournament}`, html, text);
}
