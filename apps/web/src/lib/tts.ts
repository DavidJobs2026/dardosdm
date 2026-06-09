// ─── Shared TTS utility ───────────────────────────────────────────────────────
// Announcements are queued as batches. Each batch plays fully (utterance by
// utterance via onend) before the next batch starts — no cancel(), no interruption.
// Safe to call from any component; works only in the browser.

// ── Name normalisation ────────────────────────────────────────────────────────
// TTS engines struggle with ALL-CAPS text (read letter by letter) and with
// missing accent marks (wrong stress / wrong diphthong analysis).
// We convert to Title Case and restore Spanish accents via two mechanisms:
//   1. A large static dictionary for known names.
//   2. A pattern-based fallback for common Spanish accent patterns
//      (-ción, -ón, -ín, -ás…) that are nearly always correct.

// Words that should stay lowercase inside a name (Spanish particles)
const _LC = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "i"]);

// ─── Static accent dictionary ─────────────────────────────────────────────────
// Key   = unaccented, all-lowercase form.
// Value = correctly accented form (Title Case).
// Covers Spanish/Galician/Catalan/Basque surnames + given names.
const _ACCENT_MAP: Record<string, string> = {

  // ── Surnames A ──────────────────────────────────────────────────────────────
  abad:        "Abad",
  abejon:      "Abejón",
  abellan:     "Abellán",
  abellanas:   "Abellanas",
  abreu:       "Abreu",
  acosta:      "Acosta",
  aguilar:     "Aguilar",
  aguilera:    "Aguilera",
  agudo:       "Agudo",
  aguirre:     "Aguirre",
  aicart:      "Aicart",
  alarcon:     "Alarcón",
  alba:        "Alba",
  albeniz:     "Albéniz",
  alberdi:     "Alberdi",
  alcala:      "Alcalá",
  alcazar:     "Alcázar",
  alcolea:     "Alcolea",
  aldana:      "Aldana",
  alfaro:      "Alfaro",
  almazan:     "Almazán",
  almendros:   "Almendros",
  almonacid:   "Almonacid",
  alonso:      "Alonso",
  altamirano:  "Altamirano",
  alvarez:     "Álvarez",
  amador:      "Amador",
  andrade:     "Andrade",
  andres:      "Andrés",
  angel:       "Ángel",
  anguita:     "Anguita",
  aragon:      "Aragón",
  aranda:      "Aranda",
  arce:        "Arce",
  arenas:      "Arenas",
  arevalo:     "Arévalo",
  arias:       "Arias",
  armijo:      "Armijo",
  arroyo:      "Arroyo",
  arteaga:     "Arteaga",
  avila:       "Ávila",
  ayala:       "Ayala",

  // ── Surnames B ──────────────────────────────────────────────────────────────
  baena:       "Baena",
  baeza:       "Baeza",
  banuelos:    "Bañuelos",
  barajas:     "Barajas",
  barba:       "Barba",
  barbero:     "Barbero",
  barragan:    "Barragán",
  barranco:    "Barranco",
  barrera:     "Barrera",
  barrio:      "Barrio",
  barrios:     "Barrios",
  becerra:     "Becerra",
  bejarano:    "Bejarano",
  benavente:   "Benavente",
  bernal:      "Bernal",
  bermudez:    "Bermúdez",
  blanco:      "Blanco",
  bolanos:     "Bolaños",
  borrego:     "Borrego",
  briongos:    "Briongos",
  bueno:       "Bueno",
  buitrago:    "Buitrago",
  bustos:      "Bustos",

  // ── Surnames C ──────────────────────────────────────────────────────────────
  caballero:   "Caballero",
  cabello:     "Cabello",
  cabezas:     "Cabezas",
  cabrera:     "Cabrera",
  calderon:    "Calderón",
  calleja:     "Calleja",
  calvo:       "Calvo",
  camara:      "Cámara",
  campos:      "Campos",
  cano:        "Cano",
  canton:      "Cantón",
  canizares:   "Cañizares",
  cardenas:    "Cárdenas",
  carmona:     "Carmona",
  caro:        "Caro",
  carrasco:    "Carrasco",
  carrera:     "Carrera",
  carrillo:    "Carrillo",
  carrion:     "Carrión",
  casas:       "Casas",
  castano:     "Castaño",
  castellano:  "Castellano",
  castillo:    "Castillo",
  castro:      "Castro",
  ceballos:    "Ceballos",
  cepeda:      "Cepeda",
  cervantes:   "Cervantes",
  cifuentes:   "Cifuentes",
  cobos:       "Cobos",
  contreras:   "Contreras",
  cordero:     "Cordero",
  cordoba:     "Córdoba",
  cornejo:     "Cornejo",
  corral:      "Corral",
  cortazar:    "Cortázar",
  cristobal:   "Cristóbal",
  cuellar:     "Cuéllar",
  cuenca:      "Cuenca",
  cuevas:      "Cuevas",

  // ── Surnames D ──────────────────────────────────────────────────────────────
  davalos:     "Dávalos",
  davila:      "Dávila",
  delgado:     "Delgado",
  diaz:        "Díaz",
  dolz:        "Dolz",
  dominguez:   "Domínguez",
  dopazo:      "Dopazo",
  duran:       "Durán",

  // ── Surnames E ──────────────────────────────────────────────────────────────
  echevarria:  "Echevarría",
  egea:        "Egea",
  enriquez:    "Enríquez",
  espin:       "Espín",
  espinosa:    "Espinosa",
  esteban:     "Esteban",
  estevez:     "Estévez",

  // ── Surnames F ──────────────────────────────────────────────────────────────
  felix:       "Félix",
  fernandez:   "Fernández",
  ferrer:      "Ferrer",
  figueroa:    "Figueroa",
  flores:      "Flores",
  fontan:      "Fontán",
  freire:      "Freire",
  fuentes:     "Fuentes",

  // ── Surnames G ──────────────────────────────────────────────────────────────
  gaitan:      "Gaitán",
  galan:       "Galán",
  gallardo:    "Gallardo",
  gallego:     "Gallego",
  galvan:      "Galván",
  garcia:      "García",
  garzon:      "Garzón",
  gil:         "Gil",
  gomez:       "Gómez",
  gonzalez:    "González",
  gordillo:    "Gordillo",
  granados:    "Granados",
  guillen:     "Guillén",
  gutierrez:   "Gutiérrez",
  guzman:      "Guzmán",

  // ── Surnames H ──────────────────────────────────────────────────────────────
  heredia:     "Heredia",
  hernandez:   "Hernández",
  herrero:     "Herrero",
  hidalgo:     "Hidalgo",
  hurtado:     "Hurtado",

  // ── Surnames I ──────────────────────────────────────────────────────────────
  ibanez:      "Ibáñez",
  iglesias:    "Iglesias",

  // ── Surnames J ──────────────────────────────────────────────────────────────
  jimenez:     "Jiménez",
  jordan:      "Jordán",
  juarez:      "Juárez",

  // ── Surnames L ──────────────────────────────────────────────────────────────
  lamas:       "Lamas",
  lara:        "Lara",
  lazo:        "Lazo",
  lebron:      "Lebrón",
  leon:        "León",
  linares:     "Linares",
  llanos:      "Llanos",
  llorente:    "Llorente",
  lopez:       "López",
  lorente:     "Lorente",
  losada:      "Losada",
  lucena:      "Lucena",
  luna:        "Luna",

  // ── Surnames M ──────────────────────────────────────────────────────────────
  manzanares:  "Manzanares",
  marin:       "Marín",
  marquez:     "Márquez",
  martin:      "Martín",
  martinez:    "Martínez",
  mayorga:     "Mayorga",
  medina:      "Medina",
  mejias:      "Mejías",
  mendez:      "Méndez",
  mendoza:     "Mendoza",
  molina:      "Molina",
  montero:     "Montero",
  montoya:     "Montoya",
  mora:        "Mora",
  morales:     "Morales",
  moran:       "Morán",
  moreno:      "Moreno",
  moron:       "Morón",
  munoz:       "Muñoz",

  // ── Surnames N ──────────────────────────────────────────────────────────────
  naranjo:     "Naranjo",
  navarrete:   "Navarrete",
  navarro:     "Navarro",
  nieto:       "Nieto",
  nunez:       "Núñez",

  // ── Surnames O ──────────────────────────────────────────────────────────────
  ocana:       "Ocaña",
  ojeda:       "Ojeda",
  olmedo:      "Olmedo",
  ortega:      "Ortega",
  ortiz:       "Ortiz",
  osorio:      "Osorio",
  otero:       "Otero",

  // ── Surnames P ──────────────────────────────────────────────────────────────
  pacheco:     "Pacheco",
  palacios:    "Palacios",
  palomares:   "Palomares",
  paredes:     "Paredes",
  pascual:     "Pascual",
  pastor:      "Pastor",
  paz:         "Paz",
  peralta:     "Peralta",
  perez:       "Pérez",
  pineda:      "Pineda",
  pineiro:     "Piñeiro",
  pizarro:     "Pizarro",
  prieto:      "Prieto",

  // ── Surnames Q ──────────────────────────────────────────────────────────────
  quesada:     "Quesada",
  quijada:     "Quijada",
  quijano:     "Quijano",
  quintana:    "Quintana",
  quintero:    "Quintero",

  // ── Surnames R ──────────────────────────────────────────────────────────────
  ramirez:     "Ramírez",
  ramos:       "Ramos",
  recio:       "Recio",
  redondo:     "Redondo",
  reyes:       "Reyes",
  rincon:      "Rincón",
  rios:        "Ríos",
  rivas:       "Rivas",
  rivera:      "Rivera",
  rodriguez:   "Rodríguez",
  romero:      "Romero",
  rosales:     "Rosales",
  rubio:       "Rubio",
  ruiz:        "Ruiz",

  // ── Surnames S ──────────────────────────────────────────────────────────────
  saez:        "Sáez",
  salas:       "Salas",
  salazar:     "Salazar",
  sanchez:     "Sánchez",
  sandoval:    "Sandoval",
  santamaria:  "Santamaría",
  santillan:   "Santillán",
  santos:      "Santos",
  serrano:     "Serrano",
  sierra:      "Sierra",
  soler:       "Soler",
  soria:       "Soria",
  soriano:     "Soriano",
  suarez:      "Suárez",

  // ── Surnames T ──────────────────────────────────────────────────────────────
  tapia:       "Tapia",
  tejada:      "Tejada",
  tello:       "Tello",
  toribio:     "Toribio",
  torralba:    "Torralba",
  torres:      "Torres",
  tovar:       "Tovar",

  // ── Surnames V ──────────────────────────────────────────────────────────────
  valdes:      "Valdés",
  valencia:    "Valencia",
  valenzuela:  "Valenzuela",
  vargas:      "Vargas",
  vazquez:     "Vázquez",
  vega:        "Vega",
  velez:       "Vélez",
  vera:        "Vera",
  vergara:     "Vergara",
  villanueva:  "Villanueva",
  villegas:    "Villegas",
  vidal:       "Vidal",

  // ── Surnames Z ──────────────────────────────────────────────────────────────
  zambrano:    "Zambrano",
  zamora:      "Zamora",
  zarate:      "Zárate",
  zavala:      "Zavala",

  // ── Galician / Asturian / Catalan surnames ───────────────────────────────────
  ameneiros:   "Ameneiros",
  ameiro:      "Ameiro",
  casal:       "Casal",
  meiras:      "Meiras",
  noia:        "Noia",
  pazos:       "Pazos",
  pereiro:     "Pereiro",
  pousada:     "Pousada",
  seoane:      "Seoane",
  somoza:      "Somoza",
  veiras:      "Veiras",

  // ── Given names (masculine) ──────────────────────────────────────────────────
  abel:        "Abel",
  agustin:     "Agustín",
  alberto:     "Alberto",
  alejandro:   "Alejandro",
  alfredo:     "Alfredo",
  alvaro:      "Álvaro",
  antonio:     "Antonio",
  bartolome:   "Bartolomé",
  benjamin:    "Benjamín",
  bernabe:     "Bernabé",
  carlos:      "Carlos",
  cesar:       "César",
  claudio:     "Claudio",
  damian:      "Damián",
  daniel:      "Daniel",
  david:       "David",
  diego:       "Diego",
  domingo:     "Domingo",
  eduardo:     "Eduardo",
  enrique:     "Enrique",
  eugenio:     "Eugenio",
  ezequiel:    "Ezequiel",
  fabian:      "Fabián",
  fermin:      "Fermín",
  fernando:    "Fernando",
  francisco:   "Francisco",
  german:      "Germán",
  gonzalo:     "Gonzalo",
  gregorio:    "Gregorio",
  guillermo:   "Guillermo",
  gustavo:     "Gustavo",
  hector:      "Héctor",
  hernan:      "Hernán",
  hugo:        "Hugo",
  ignacio:     "Ignacio",
  iker:        "Iker",
  inigo:       "Íñigo",
  ivan:        "Iván",
  javier:      "Javier",
  jesus:       "Jesús",
  joaquin:     "Joaquín",
  jorge:       "Jorge",
  jose:        "José",
  juan:        "Juan",
  julian:      "Julián",
  leandro:     "Leandro",
  leonardo:    "Leonardo",
  lorenzo:     "Lorenzo",
  lucas:       "Lucas",
  luis:        "Luis",
  manuel:      "Manuel",
  marcos:      "Marcos",
  mario:       "Mario",
  matias:      "Matías",
  maximo:      "Máximo",
  miguel:      "Miguel",
  moises:      "Moisés",
  nicolas:     "Nicolás",
  oscar:       "Óscar",
  pablo:       "Pablo",
  patricio:    "Patricio",
  pedro:       "Pedro",
  rafael:      "Rafael",
  ramon:       "Ramón",
  raul:        "Raúl",
  ricardo:     "Ricardo",
  roberto:     "Roberto",
  rodrigo:     "Rodrigo",
  ruben:       "Rubén",
  salvador:    "Salvador",
  samuel:      "Samuel",
  santiago:    "Santiago",
  sebastian:   "Sebastián",
  sergio:      "Sergio",
  simon:       "Simón",
  tomas:       "Tomás",
  victor:      "Víctor",
  xavier:      "Xavier",

  // ── Given names (feminine) ───────────────────────────────────────────────────
  alejandra:   "Alejandra",
  alicia:      "Alicia",
  amparo:      "Amparo",
  andrea:      "Andrea",
  angela:      "Ángela",
  beatriz:     "Beatriz",
  belen:       "Belén",
  blanca:      "Blanca",
  camila:      "Camila",
  carmen:      "Carmen",
  carolina:    "Carolina",
  catalina:    "Catalina",
  claudia:     "Claudia",
  concepcion:  "Concepción",
  consuelo:    "Consuelo",
  cristina:    "Cristina",
  debora:      "Débora",
  elena:       "Elena",
  elisa:       "Elisa",
  elvira:      "Elvira",
  emilia:      "Emilia",
  esther:      "Esther",
  fatima:      "Fátima",
  fernanda:    "Fernanda",
  francisca:   "Francisca",
  gloria:      "Gloria",
  helena:      "Helena",
  ines:        "Inés",
  irene:       "Irene",
  isabel:      "Isabel",
  jessica:     "Jéssica",
  julia:       "Julia",
  laura:       "Laura",
  leticia:     "Leticia",
  lorena:      "Lorena",
  lucia:       "Lucía",
  luisa:       "Luisa",
  manuela:     "Manuela",
  maria:       "María",
  marta:       "Marta",
  mercedes:    "Mercedes",
  miriam:      "Miriam",
  monica:      "Mónica",
  natalia:     "Natalia",
  noelia:      "Noelia",
  nuria:       "Nuria",
  olga:        "Olga",
  paloma:      "Paloma",
  patricia:    "Patricia",
  paula:       "Paula",
  pilar:       "Pilar",
  raquel:      "Raquel",
  rebeca:      "Rebeca",
  rocio:       "Rocío",
  rosa:        "Rosa",
  rosario:     "Rosario",
  sara:        "Sara",
  silvia:      "Silvia",
  sofia:       "Sofía",
  sonia:       "Sonia",
  susana:      "Susana",
  teresa:      "Teresa",
  vanesa:      "Vanesa",
  veronica:    "Verónica",
  virginia:    "Virginia",

  // ── Particles / prepositions (always lowercase mid-name) ────────────────────
  de:          "de",
  del:         "del",
  el:          "el",
  la:          "la",
  las:         "las",
  los:         "los",
  y:           "y",
  e:           "e",
  i:           "i",
};

// ─── Pattern-based fallback ───────────────────────────────────────────────────
// Applied only when a word is NOT found in the static map.
// These patterns are extremely common in Spanish and have very few exceptions
// when dealing with proper names.
//
// Rules applied (in order):
//  1. -cion  → -ción   (cancion → canción)
//  2. -sion  → -sión   (mision → misión)
//  3. -cion- → guarded against false positives (word must be ≥5 chars)
//
// We deliberately do NOT auto-accent -on/-an/-en/-in endings because those
// rules have too many false positives (Carmen, Orden, etc. are already correct
// without an accent).  Those cases must be in the static map.

function _applyPatterns(word: string): string {
  const w = word.toLowerCase();

  // -ción / -sión suffixes (nearly universal in Spanish)
  if (w.length >= 5 && w.endsWith("cion"))
    return w.slice(0, -4) + "ción";
  if (w.length >= 5 && w.endsWith("sion"))
    return w.slice(0, -4) + "sión";

  // Capitalise first letter and return
  return w.charAt(0).toUpperCase() + w.slice(1);
}

// ─── Main normalisation function ─────────────────────────────────────────────

function _normaliseName(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => {
      // 1. Explicit dictionary hit
      if (_ACCENT_MAP[word] !== undefined) return _ACCENT_MAP[word];
      // 2. Lowercase particle mid-name
      if (i > 0 && _LC.has(word)) return word;
      // 3. Pattern-based fallback (handles -ción / -sión + Title Case)
      return _applyPatterns(word);
    })
    .join(" ");
}

// ── Voice cache ──────────────────────────────────────────────────────────────

let _cachedVoice: SpeechSynthesisVoice | null | undefined; // undefined = not yet resolved

function _scoreVoice(v: SpeechSynthesisVoice): number {
  if (!v.lang.startsWith("es")) return -1;
  const n = v.name.toLowerCase();
  let s = 1;
  if (v.lang === "es-ES")        s += 2;
  if (n.includes("neural"))      s += 10;
  if (n.includes("natural"))     s += 10;
  if (n.includes("online"))      s += 9;
  if (n.includes("enhanced"))    s += 8;
  if (n.includes("google"))      s += 6;
  if (n.includes("microsoft"))   s += 5;
  return s;
}

function _pickBest(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const sorted = [...voices].sort((a, b) => _scoreVoice(b) - _scoreVoice(a));
  return _scoreVoice(sorted[0]) >= 1 ? sorted[0] : null;
}

async function _getVoice(): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  if (_cachedVoice !== undefined) return _cachedVoice;
  const immediate = _pickBest();
  if (immediate) { _cachedVoice = immediate; return immediate; }
  return new Promise<SpeechSynthesisVoice | null>(resolve => {
    const done = (v: SpeechSynthesisVoice | null) => { _cachedVoice = v; resolve(v); };
    const handler = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      done(_pickBest());
    };
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", handler);
      done(_pickBest());
    }, 3000);
  });
}

// ── Queue ─────────────────────────────────────────────────────────────────────

const _queue: SpeechSynthesisUtterance[][] = [];
let _busy = false;

function _nextBatch() {
  if (_queue.length === 0) { _busy = false; return; }
  _busy = true;
  const batch = _queue.shift()!;
  let i = 0;
  const playOne = () => {
    if (i >= batch.length) { _nextBatch(); return; }
    const u = batch[i++];
    u.onend = playOne;
    window.speechSynthesis.speak(u);
  };
  playOne();
}

function _enqueue(utterances: SpeechSynthesisUtterance[]) {
  if (!utterances.length) return;
  _queue.push(utterances);
  if (!_busy) _nextBatch();
}

function _u(text: string, voice: SpeechSynthesisVoice | null, rate = 0.88) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "es-ES"; u.rate = rate; u.pitch = 1;
  if (voice) u.voice = voice;
  return u;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** 1st call: "Player1 contra Player2 [y Player3], Diana N" × 2 */
export async function announceMatch(p1: string, p2: string, dianaNumber: number, p3?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const voice = await _getVoice();
  const names = p3
    ? `${_normaliseName(p1)}, ${_normaliseName(p2)} y ${_normaliseName(p3)}`
    : `${_normaliseName(p1)} contra ${_normaliseName(p2)}`;
  const text = `${names}, Diana ${dianaNumber}`;
  _enqueue([_u(text, voice), _u(text, voice)]);
}

/** 2nd / 3rd call: "PlayerName, Diana N, segundo/tercer aviso" × 2 */
export async function announceWarning(playerName: string, dianaNumber: number, callNum: 2 | 3) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const voice = await _getVoice();
  const text  = `${_normaliseName(playerName)}, Diana ${dianaNumber}, ${callNum === 2 ? "segundo aviso" : "tercer aviso"}`;
  _enqueue([_u(text, voice), _u(text, voice)]);
}

/** No-show: "PlayerName. PlayerName. No presentado." */
export async function announceEliminated(name: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const voice = await _getVoice();
  const n = _normaliseName(name);
  _enqueue([
    _u(n, voice, 0.82),
    _u(n, voice, 0.82),
    _u("No presentado", voice, 0.72),
  ]);
}
