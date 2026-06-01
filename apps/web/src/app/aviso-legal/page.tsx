import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Aviso Legal — DardosDM",
  description: "Aviso legal e información sobre las condiciones de uso del sitio web de DARDOS DM SL.",
};

export default function AvisoLegalPage() {
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
          <h1 className="text-4xl font-black text-white tracking-tight mb-3">Aviso Legal</h1>
          <p className="text-ink-400 text-sm">Última actualización: junio 2025</p>
        </div>

        <div className="prose-legal">

          <section>
            <p className="text-ink-300 leading-relaxed">
              En cumplimiento con el deber de información estipulado en el artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y del Comercio Electrónico, DARDOS DM SL, en calidad de titular del sitio web WWW.DARDOSDM.COM, hace constar:
            </p>
          </section>

          <section>
            <h2>Datos identificativos</h2>
            <ul>
              <li><strong>Denominación social:</strong> DARDOS DM SL</li>
              <li><strong>CIF:</strong> B85322535</li>
              <li><strong>Domicilio social:</strong> CALLE RAFAEL PILLADO MOURELLE 6 NAVE B13, ALGETE 28110 MADRID</li>
              <li><strong>Correo electrónico:</strong> <a href="mailto:SUSANA@DARDOSDM.COM">SUSANA@DARDOSDM.COM</a></li>
            </ul>
            <p>La presente información conforma y regula las condiciones de uso, las limitaciones de responsabilidad y las obligaciones que los usuarios de la página Web publicada bajo el nombre de dominio WWW.DARDOSDM.COM asumen y se comprometen a respetar.</p>
          </section>

          <section>
            <h2>Definiciones</h2>
            <ul>
              <li><strong>"Página":</strong> Dominio WWW.DARDOSDM.COM, que se pone a disposición de los Usuarios de Internet.</li>
              <li><strong>"Usuario":</strong> Persona física o jurídica que utiliza o navega por la Página.</li>
              <li><strong>"Contenido":</strong> Las páginas que conforman la totalidad del dominio WWW.DARDOSDM.COM, incluyendo mensajes, textos, fotografías, gráficos, iconos, logos, tecnología, links, diseño gráfico y códigos fuente.</li>
              <li><strong>"Hiperenlace":</strong> Técnica por la cual un Usuario puede navegar por diferentes páginas de la Web con un simple clic.</li>
              <li><strong>"Cookies":</strong> Pequeños ficheros de texto que se escriben en el ordenador del Usuario para la trazabilidad y seguimiento de la navegación.</li>
            </ul>
          </section>

          <section>
            <h2>Usuarios / Condiciones de uso</h2>
            <p>El acceso y/o uso de este sitio web atribuye la condición de USUARIO, que acepta los presentes términos de uso sin reservas. Si el Usuario no estuviera conforme con las cláusulas y condiciones de uso de este Aviso Legal, se abstendrá de utilizar la Página.</p>
          </section>

          <section>
            <h2>Uso del sitio web</h2>
            <p>El USUARIO asume la responsabilidad del uso de la web y se compromete a hacer un uso adecuado de los contenidos, comprometiéndose a NO utilizarlos para:</p>
            <ul>
              <li>Incurrir en actividades ilícitas, ilegales o contrarias a la buena fe y al orden público.</li>
              <li>Difundir contenidos o propaganda de carácter racista, xenófobo, pornográfico-ilegal, de apología del terrorismo o atentatorio contra los derechos humanos.</li>
              <li>Provocar daños en los sistemas físicos y lógicos del sitio web, de sus proveedores o de terceras personas, o introducir virus informáticos.</li>
              <li>Intentar acceder y utilizar las cuentas de correo electrónico de otros usuarios y modificar o manipular sus mensajes.</li>
            </ul>
            <p>EL USUARIO no podrá reproducir, copiar, distribuir, poner a disposición o comunicar públicamente los Contenidos, a menos que cuente con la autorización escrita y explícita de DARDOS DM SL, ni suprimir, manipular o alterar el copyright y demás datos identificativos de los derechos de DARDOS DM SL.</p>
          </section>

          <section>
            <h2>Política de privacidad y protección de datos</h2>
            <p>DARDOS DM SL es consciente de la importancia de la protección de datos, así como de la privacidad del USUARIO y por ello ha implementado una política de tratamiento de datos orientada a proveer la máxima seguridad en el uso y recogida de los mismos, garantizando el cumplimiento de la normativa vigente.</p>
            <p>Puede consultar nuestra <Link href="/privacidad" className="text-red-400 hover:text-red-300 underline">Política de Privacidad</Link> para más información.</p>
          </section>

          <section>
            <h2>Hiperenlaces</h2>
            <p>Nuestro sitio web puede incluir hipervínculos a otros sitios que no son operados o controlados por DARDOS DM SL. Por ello, DARDOS DM SL no garantiza, ni se hace responsable de la licitud, fiabilidad, utilidad, veracidad y actualidad de los contenidos de tales sitios web.</p>
            <p>Las personas que se propongan establecer hiperenlaces entre su página Web y la nuestra deberán observar las siguientes condiciones:</p>
            <ul>
              <li>No será necesaria autorización previa cuando el Hiperenlace permita únicamente el acceso a la página de inicio.</li>
              <li>No se crearán marcos ("frames") con las páginas Web de DARDOS DM SL.</li>
              <li>No se realizarán manifestaciones falsas, inexactas u ofensivas sobre DARDOS DM SL.</li>
              <li>No se declarará ni se dará a entender que DARDOS DM SL ha autorizado el Hiperenlace o supervisado los contenidos de la página que lo establece.</li>
            </ul>
          </section>

          <section>
            <h2>Modificación del Aviso Legal</h2>
            <p>DARDOS DM SL se reserva la facultad de efectuar, en cualquier momento y sin necesidad de previo aviso, modificaciones y actualizaciones de la información contenida en el sitio Web. Todas las actualizaciones y/o modificaciones se comunicarán cuando se acceda al sitio Web.</p>
          </section>

          <section>
            <h2>Propiedad intelectual / industrial</h2>
            <p>DARDOS DM SL es titular de todos los derechos de propiedad intelectual e industrial de su página web, así como de los elementos contenidos en la misma (imágenes, sonido, audio, vídeo, software o textos; marcas o logotipos, combinaciones de colores, estructura y diseño, etc.). Todos los derechos están reservados.</p>
            <p>Cualquier uso no autorizado previamente por DARDOS DM SL será considerado un incumplimiento grave de los derechos de propiedad intelectual o industrial del autor.</p>
          </section>

          <section>
            <h2>Cookies</h2>
            <p>Las cookies son pequeños ficheros de texto que se escriben en el ordenador del Usuario para la trazabilidad y seguimiento de la navegación en los sitios Web. DARDOS DM SL informa de que podrá utilizar cookies con la finalidad de elaborar estadísticas de utilización del sitio web así como para identificar y reconocer al Usuario en sus próximas visitas.</p>
            <p>Puede obtener más información en nuestra <Link href="/cookies" className="text-red-400 hover:text-red-300 underline">Política de Cookies</Link>.</p>
          </section>

          <section>
            <h2>Disponibilidad de la página</h2>
            <p>DARDOS DM SL no garantiza la inexistencia de interrupciones o errores en el acceso a la Página o a sus Contenidos, aunque desarrollará sus mejores esfuerzos para evitarlos, subsanarlos o actualizarlos. DARDOS DM SL no se responsabiliza de los daños o perjuicios de cualquier tipo producidos en el USUARIO que traigan causa de fallos o desconexiones en las redes de telecomunicaciones.</p>
          </section>

          <section>
            <h2>Jurisdicción y legislación aplicable</h2>
            <p>Para cuantas cuestiones se susciten sobre la interpretación, aplicación y cumplimiento de este Aviso Legal, así como de las reclamaciones que puedan derivarse de su uso, todas las partes intervinientes se someten a la <strong>legislación española</strong> vigente.</p>
            <p>Reservados todos los derechos de autor por las leyes y tratados internacionales de propiedad intelectual. Queda expresamente prohibida su copia, reproducción o difusión, total o parcial, por cualquier medio.</p>
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
          <Link href="/cookies" className="text-ink-400 hover:text-white text-sm transition-colors flex items-center gap-1">
            Política de Cookies <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </main>
    </div>
  );
}
