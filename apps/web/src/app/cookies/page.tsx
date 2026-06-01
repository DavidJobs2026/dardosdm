import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Política de Cookies — DardosDM",
  description: "Política de cookies de DARDOS DM SL. Información sobre los tipos de cookies utilizadas.",
};

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-ink-950">
      {/* Navbar */}
      <header className="border-b border-ink-800 bg-ink-950/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-red-gradient rounded-lg flex items-center justify-center shadow-red-sm">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              <span className="text-white">Dardos</span><span className="text-red-500">DM</span>
            </span>
          </Link>
          <Link href="/registro" className="btn-primary text-sm py-2 px-4">
            Empezar gratis
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Legal</p>
          <h1 className="text-4xl font-black text-white tracking-tight mb-3">Política de Cookies</h1>
          <p className="text-ink-400 text-sm">Última actualización: junio 2025</p>
        </div>

        <div className="prose-legal">

          <section>
            <h2>Definiciones</h2>
            <p>Una Cookie es un fichero que se descarga en su ordenador al acceder a determinadas páginas web, smartphone, tablet o dispositivo análogo. Las cookies permiten a una página web, entre otras cosas, almacenar y recuperar información sobre los hábitos de navegación de un usuario o de su equipo y, dependiendo de la información que contengan y de la forma en que utilice su equipo, pueden utilizarse para reconocer al usuario.</p>
            <p>El navegador del usuario memoriza cookies en el disco duro solo durante la sesión actual, ocupando un espacio de memoria mínimo y sin perjudicar al ordenador. Las cookies no contienen ninguna clase de información personal específica, y la mayoría de las mismas se borran del disco duro al finalizar la sesión de navegador (denominadas cookies de sesión).</p>
          </section>

          <section>
            <h2>¿Qué tipos de cookies utiliza esta página web?</h2>
            <p>Este sitio web <strong>solo emplea cookies necesarias</strong> para el correcto funcionamiento del sitio. No se utilizan cookies de publicidad ni de seguimiento de terceros.</p>
            <p>A efectos informativos, le informamos sobre las distintas clases de cookies que existen:</p>

            <div className="overflow-x-auto my-6">
              <table>
                <thead>
                  <tr>
                    <th>Tipo de cookie</th>
                    <th>Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>De sesión / autenticación</strong></td>
                    <td>Se crean al registrarte o cuando inicias sesión. Permiten mantenerte autenticado mientras navegas y acceder a las zonas privadas de la plataforma.</td>
                  </tr>
                  <tr>
                    <td><strong>De rendimiento</strong></td>
                    <td>Se utilizan para mejorar la experiencia de navegación y optimizar el funcionamiento del sitio web. Almacenan configuraciones de servicios para que no tengas que reconfigurarlos cada vez que nos visitas.</td>
                  </tr>
                  <tr>
                    <td><strong>Analíticas</strong></td>
                    <td>Recopilan información de la experiencia de navegación de forma anónima. Permiten contabilizar el número de visitantes o los contenidos más vistos para mejorar el servicio.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>Desactivación de cookies</h2>
            <p>El usuario podrá, en cualquier momento, elegir qué cookies quiere que funcionen en este sitio web mediante la configuración del navegador:</p>
            <ul>
              <li>
                <strong>Safari:</strong>{" "}
                <a href="https://support.apple.com/es-es/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer">
                  Gestionar cookies y datos de sitios web en Safari
                </a>
              </li>
              <li>
                <strong>Chrome:</strong>{" "}
                <a href="https://support.google.com/accounts/answer/61416" target="_blank" rel="noopener noreferrer">
                  Activar o desactivar las cookies
                </a>
              </li>
              <li>
                <strong>Firefox:</strong>{" "}
                <a href="https://support.mozilla.org/es/kb/proteccion-antirrastreo-mejorada-en-firefox-para-e" target="_blank" rel="noopener noreferrer">
                  Protección Antirrastreo Mejorada en Firefox
                </a>
              </li>
              <li>
                <strong>Edge:</strong>{" "}
                <a href="https://support.microsoft.com/es-es/windows/microsoft-edge-datos-de-exploraci%C3%B3n-y-privacidad-bb8174ba-9d73-dcf2-9b4a-c582b4e640dd" target="_blank" rel="noopener noreferrer">
                  Microsoft Edge, datos de exploración y privacidad
                </a>
              </li>
            </ul>
          </section>

          <section>
            <h2>Actualización de la política de cookies</h2>
            <p>Es posible que actualicemos la Política de Cookies de nuestro Sitio Web, por ello le recomendamos revisar esta política cada vez que acceda a nuestro Sitio Web con el objetivo de estar adecuadamente informado sobre cómo y para qué usamos las cookies.</p>
            <p>Para cualquier consulta sobre el uso de cookies puede contactarnos en <a href="mailto:SUSANA@DARDOSDM.COM">SUSANA@DARDOSDM.COM</a>.</p>
          </section>

        </div>

        {/* Back link */}
        <div className="mt-12 pt-8 border-t border-ink-800 flex items-center gap-6">
          <Link href="/" className="text-ink-400 hover:text-white text-sm transition-colors">
            ← Volver al inicio
          </Link>
          <Link href="/privacidad" className="text-ink-400 hover:text-white text-sm transition-colors flex items-center gap-1">
            Política de Privacidad <ChevronRight className="w-3 h-3" />
          </Link>
          <Link href="/aviso-legal" className="text-ink-400 hover:text-white text-sm transition-colors flex items-center gap-1">
            Aviso Legal <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </main>
    </div>
  );
}
