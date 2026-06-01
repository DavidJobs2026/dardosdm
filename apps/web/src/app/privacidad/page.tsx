import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Política de Privacidad — DardosDM",
  description: "Política de privacidad de DARDOS DM SL conforme al RGPD y LOPD-GDD.",
};

export default function PrivacidadPage() {
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
          <h1 className="text-4xl font-black text-white tracking-tight mb-3">Política de Privacidad</h1>
          <p className="text-ink-400 text-sm">Última actualización: junio 2025</p>
        </div>

        <div className="prose-legal">

          <section>
            <p className="text-ink-300 leading-relaxed">
              De conformidad con lo establecido en la legislación vigente sobre protección de datos, el Reglamento (UE) 2016/679, del Parlamento Europeo y del Consejo, de 27 de abril de 2016, relativo a la protección de las personas físicas en lo que respecto al tratamiento de datos personales y a la libre circulación de estos datos (en adelante, RGPD), así como en la Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos y garantía de los derechos digitales (en adelante, LOPD-GDD), se informa al usuario de conformidad con lo establecido en los artículos 13 del RGPD y 11 de la LOPD-GDD:
            </p>
          </section>

          <section>
            <h2>RESPONSABLE</h2>
            <p>¿Quién es el responsable de tratamiento de sus datos?</p>
            <ul>
              <li><strong>Razón social:</strong> DARDOS DM SL</li>
              <li><strong>CIF:</strong> B85322535</li>
              <li><strong>Domicilio:</strong> CALLE RAFAEL PILLADO MOURELLE 6 NAVE B13, ALGETE 28110 MADRID</li>
              <li><strong>Correo electrónico:</strong> <a href="mailto:SUSANA@DARDOSDM.COM">SUSANA@DARDOSDM.COM</a></li>
            </ul>
          </section>

          <section>
            <h2>FINALIDAD</h2>
            <p>¿Con qué finalidad trataremos sus datos personales?</p>
            <p>DARDOS DM SL trata su información para:</p>
            <ul>
              <li>Mantenimiento de la relación mercantil y prestación del servicio contratado.</li>
              <li>Realización de un presupuesto ajustado a sus necesidades.</li>
              <li>Gestionar comunicaciones por correo electrónico con interesados.</li>
              <li>Llevar a cabo los procesos de selección de la sociedad.</li>
              <li>Gestión de los empleados y recursos humanos de la sociedad.</li>
              <li>Envío de información comercial vinculada con nuestro sector: INSTALACIÓN MAQUINAS DARDOS.</li>
              <li>Controlar la seguridad de las instalaciones (videovigilancia).</li>
              <li>Gestionar las actividades formativas.</li>
            </ul>

            <h3>¿Durante cuánto tiempo tendremos sus datos?</h3>
            <p>Los datos personales que nos proporciones serán conservados mientras se mantenga la relación mercantil vigente. Los cómputos generales son:</p>
            <ul>
              <li><strong>Datos genéricos de identificación</strong> (correo electrónico, nombre, apellidos, teléfono, etc.): mientras dure la relación mercantil o hasta que se revoque el consentimiento.</li>
              <li><strong>Contable, fiscal y laboral:</strong> seis (6) años.</li>
              <li><strong>Laboral:</strong> diez (10) años.</li>
              <li><strong>Procesos de selección:</strong> dos (2) años desde la entrega del curriculum vitae.</li>
              <li><strong>Videovigilancia:</strong> treinta (30) días, salvo grabación de una infracción y/o delito.</li>
            </ul>
            <p>Asimismo, dado el envío de información comercial, aunque se ponga fin a la relación entre las partes, DARDOS DM SL seguirá conservando su información para el envío de newsletters vinculadas con nuestros productos y servicios. Siempre podrá ejercitar los derechos que le reconoce la normativa vigente.</p>
          </section>

          <section>
            <h2>LEGITIMACIÓN</h2>
            <p>¿Cuál es la legitimación para el tratamiento de sus datos?</p>
            <ul>
              <li><strong>Gestionar la relación mercantil:</strong> Ejecución de un contrato (artículo 6.1.b RGPD) / Consentimiento del interesado (artículo 6.1.a RGPD).</li>
              <li><strong>Realización de presupuesto:</strong> Ejecución de un contrato y/o relación precontractual (artículo 6.1.b RGPD).</li>
              <li><strong>Comunicaciones por correo electrónico:</strong> Consentimiento del interesado (artículo 6.1.a RGPD) / Interés legítimo (artículo 6.1.f RGPD).</li>
              <li><strong>Procesos de selección:</strong> Consentimiento del interesado (artículo 6.1.a RGPD).</li>
              <li><strong>Gestión de empleados:</strong> Ejecución contractual (artículo 6.1.b RGPD).</li>
              <li><strong>Envío de comunicaciones comerciales:</strong> Consentimiento del interesado (artículo 6.1.a RGPD y artículo 20 LSSICE) / Interés legítimo (artículo 6.1.f RGPD).</li>
              <li><strong>Videovigilancia:</strong> Interés legítimo (artículo 6.1.f RGPD).</li>
              <li><strong>Actividades formativas:</strong> Ejecución de un contrato (artículo 6.1.b RGPD) / Consentimiento del interesado (artículo 6.1.a RGPD).</li>
            </ul>
          </section>

          <section>
            <h2>DERECHOS QUE LE ASISTEN</h2>
            <p>¿Qué derechos tengo en materia de protección de datos?</p>
            <p>Conforme a los artículos 13 RGPD y 11.2.c) LOPDGDD, puede ejercitar cualquiera de los siguientes derechos comunicándonoslo a la dirección postal <strong>CALLE RAFAEL PILLADO MOURELLE 6 NAVE B13 ALGETE 28110 MADRID</strong> o a la dirección electrónica <a href="mailto:SUSANA@DARDOSDM.COM">SUSANA@DARDOSDM.COM</a>:</p>
            <ul>
              <li>Derecho a solicitar el acceso a los datos personales relativos al interesado.</li>
              <li>Derecho a solicitar su rectificación o supresión.</li>
              <li>Derecho a solicitar la limitación del tratamiento.</li>
              <li>Derecho a oponerse al tratamiento.</li>
              <li>Derecho a la portabilidad.</li>
            </ul>
            <p>Puede solicitar al Responsable los formularios para ejercer sus derechos a través de la dirección de correo electrónico indicada. Adicionalmente, puede presentar una reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong>. Más información en <a href="http://www.agpd.es/" target="_blank" rel="noopener noreferrer">www.agpd.es</a>.</p>
          </section>

          <section>
            <h2>DESTINATARIOS</h2>
            <p>¿A qué destinatarios se comunicarán sus datos?</p>
            <p>Siempre se informará y, cuando proceda, se solicitará su consentimiento expreso para ceder sus datos personales o realizar transferencias internacionales de acuerdo a la normativa vigente (arts. 13.1.e) y 44 RGPD, así como el art. 11.1 y 40 LOPDGDD 3/2018).</p>
          </section>

          <section>
            <h2>PROCEDENCIA DE SUS DATOS</h2>
            <p>¿Cómo hemos obtenido sus datos?</p>
            <p>Los datos de carácter personal que utiliza DARDOS DM SL proceden del propio interesado, o de empresas del grupo o colaboradoras, sobre las que puede obtener más información escribiendo a <a href="mailto:SUSANA@DARDOSDM.COM">SUSANA@DARDOSDM.COM</a>.</p>

            <h3>¿Qué categorías de datos manejamos?</h3>
            <ul>
              <li>Datos de identificación: nombre, apellidos, DNI/NIE/Pasaporte, direcciones postales, direcciones electrónicas, sexo, fecha de nacimiento, lugar de nacimiento, teléfono de contacto.</li>
              <li>Información comercial.</li>
              <li>Datos económicos: número de cuenta bancaria, número de tarjeta de crédito.</li>
              <li>Curriculum vitae, datos académicos, titulaciones.</li>
              <li>Aficiones, pertenencia a asociaciones o clubes.</li>
              <li>Videovigilancia / Imagen.</li>
            </ul>
          </section>

          <section>
            <h2>AUTORIDAD DE CONTROL</h2>
            <p>DARDOS DM SL pone el máximo empeño para cumplir con la normativa de protección de datos. No obstante, le informamos que en caso de que entienda que sus derechos se han visto menoscabados, puede presentar una reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong>, sita en C/ Jorge Juan, 6, 28001 Madrid. Más información en <a href="http://www.agpd.es/" target="_blank" rel="noopener noreferrer">www.agpd.es</a>.</p>
          </section>

        </div>

        {/* Back link */}
        <div className="mt-12 pt-8 border-t border-ink-800 flex items-center gap-6">
          <Link href="/" className="text-ink-400 hover:text-white text-sm transition-colors">
            ← Volver al inicio
          </Link>
          <Link href="/aviso-legal" className="text-ink-400 hover:text-white text-sm transition-colors flex items-center gap-1">
            Aviso Legal <ChevronRight className="w-3 h-3" />
          </Link>
          <Link href="/cookies" className="text-ink-400 hover:text-white text-sm transition-colors flex items-center gap-1">
            Política de Cookies <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
      </main>
    </div>
  );
}
