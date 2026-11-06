// The Spanish text of the UI: the same shape as `en.ts` (a missing or extra key fails the build), in the football
// Spanish of Spain, whose conventions the dates and numbers follow too (see `index.ts`). It speaks to the player as
// "tú", as games in Spanish do. The comments in `en.ts` say what each string is for.
//
// Spanish puts the plural after every number but 1 ("0 cambios", "1 cambio"), and the words after a count agree with
// its noun ("1 cambio aplicado", "3 cambios aplicados"), so the sentences with a count are written out for one and for
// many.

import type { MassEntity } from "../types";
import { PERCENT_CLAUSES, RELEASE_CLAUSES } from "../clauseKinds";
import type { ErrorTexts, Strings } from "./en";
import { fieldName } from "./fieldNames";

const numbers = new Intl.NumberFormat("es-ES");
const percents = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

/**
 * A count or an amount with the thousands separators of the language: "12.345", but "1234", as Spanish leaves four
 * digits whole.
 */
const format = (value: number) => numbers.format(value);

/** "0 cambios", "1 cambio", "12.345 cambios". */
const changes = (count: number) => (count === 1 ? "1 cambio" : `${format(count)} cambios`);

/** For the places that say how many changes there are, which may be none: "Ningún cambio", "3 cambios". */
const changeCount = (count: number) => (count === 0 ? "Ningún cambio" : changes(count));

/** "1 valor sin tocar", "12 valores sin tocar". */
const valuesLeftAlone = (count: number) =>
  count === 1 ? "1 valor sin tocar" : `${format(count)} valores sin tocar`;

/** What each list holds, for one and for many. Every one of them is masculine, so the words around them are too. */
const nouns: Record<MassEntity, { one: string; many: string }> = {
  player: { one: "jugador", many: "jugadores" },
  staff: { one: "empleado", many: "empleados" },
  club: { one: "club", many: "clubes" },
};

/** "237 jugadores", "1 empleado", "12 clubes". */
const entityCount = (entity: MassEntity, count: number) =>
  `${format(count)} ${count === 1 ? nouns[entity].one : nouns[entity].many}`;

const SQUAD_STATUSES: Partial<Record<number, string>> = {
  1: "Jugador estrella",
  2: "Jugador importante",
  3: "Titular habitual",
  4: "Jugador de plantilla",
  5: "Revulsivo",
  7: "Jugador secundario",
  9: "Suplente de emergencia",
  10: "Promesa emergente",
  11: "Promesa de futuro",
  13: "Joven",
  15: "Portero titular",
  16: "Portero de copa",
  17: "Portero de copa nacional",
  20: "Suplente",
  21: "Suplente de emergencia",
  22: "Prescindible",
};

/** The name of the field a failure names. */
const field = (key: string | undefined) => fieldName(es, key ?? "");

/** The noun of the kind of record a failure names, or "registro" when it names none. */
const recordNoun = (entity: string | undefined) =>
  entity === "player" || entity === "staff" || entity === "club" ? nouns[entity].one : "registro";

/** The reasons the Rust side gives for a field that cannot be changed some way. */
const UNSUPPORTED: Partial<Record<string, string>> = {
  "a date can only be set": "una fecha solo se puede fijar",
  "it is changed one person at a time": "se cambia persona a persona",
  "the new value is not one of the game's own records of that kind":
    "el nuevo valor no es uno de los registros del propio juego de ese tipo",
};

const reload = "vuelve a leer los datos e inténtalo de nuevo";

/** The lists of a club's staff, as `staff.noRoom` names them. */
const STAFF_DEPARTMENTS: Partial<Record<string, string>> = {
  medical: "del personal médico",
  coaching: "del cuerpo técnico",
  scouting: "de ojeadores",
};

/** The kinds of contract clauses and bonuses, by the codes contracts hold them as (see `en.ts`). */
const CLAUSE_NAMES_ES: Partial<Record<number, string>> = {
  0: "Cláusula de rescisión por traspaso mínimo",
  1: "Cláusula de rescisión por descenso",
  2: "Cláusula de rescisión si no asciende",
  3: "Aumento salarial anual",
  4: "Aumento salarial por ascenso",
  5: "Rebaja salarial por descenso",
  6: "Cláusula de rescisión por oferta de puesto técnico",
  7: "Rescisión en cualquier momento",
  8: "Porcentaje de futura venta",
  9: "Porcentaje de futura venta sobre el beneficio",
  10: "Prima por objetivo de goles en la temporada",
  11: "Ampliación de un año tras partidos de liga",
  12: "Igualar al que más cobra",
  13: "Salario tras alcanzar partidos de liga del club",
  14: "Aumento salarial por ascenso a primera división",
  15: "Rebaja salarial por descenso de primera división",
  16: "Cláusula de rescisión por traspaso mínimo (clubes extranjeros)",
  17: "Cláusula de rescisión por traspaso mínimo (clubes de una división superior)",
  18: "Cláusula de rescisión por traspaso mínimo (clubes nacionales)",
  19: "Salario tras alcanzar partidos internacionales",
  20: "Salario pagado por un patrocinador",
  21: "Parte de la taquilla",
  22: "Ampliación opcional del contrato por parte del club",
  23: "Sin indemnización si le ofrecen ser entrenador",
  24: "Indemnización necesaria para salir",
  25: "Ampliación de un año si asciende",
  26: "Ampliación de un año si evita el descenso",
  27: "Cláusula de rescisión por traspaso mínimo (clubes en la Copa de Campeones)",
  28: "Contrato garantizado",
  29: "Ampliación automática si asciende",
  30: "Cláusula de rescisión por lesión",
  31: "Cláusula de rescisión por traspaso mínimo (clubes en competiciones continentales)",
  32: "Prima por partido jugado",
  33: "Prima por gol",
  34: "Prima por portería a cero",
  37: "Prima por partido internacional",
  38: "Prima por suplente no utilizado",
  39: "Prima por asistencia",
  40: "Prima por objetivo de asistencias en la temporada",
  41: "Prima combinada por objetivo de goles y asistencias en la temporada",
  55: "Cláusula de rescisión activa por descenso",
};

/** Reasons to be unhappy, by the codes the game keeps them as (see `en.ts`). */
const CONCERN_MOTIVES_ES: Partial<Record<number, string>> = {
  596: "Excluido de la lista de una competición",
  808: "Cree que un compañero ha recibido un trato injusto",
  926: "No cree que un compañero merezca los minutos que quiere",
};

/** Players' traits (preferred moves), by their bit in the game's mask (see `en.ts`). */
const TRAIT_NAMES_ES: readonly string[] = [
  "Conduce el balón por la izquierda",
  "Conduce el balón por la derecha",
  "Conduce el balón por el centro",
  "Se mete en el área rival",
  "Se desmarca a los espacios",
  "Sube al ataque siempre que puede",
  "Juega pases cortos y sencillos",
  "Intenta pases definitivos a menudo",
  "Dispara desde lejos",
  "Dispara con potencia",
  "Coloca los disparos",
  "Golpea con efecto",
  "Le gusta regatear al portero",
  "Le gusta romper el fuera de juego",
  "Usa el exterior del pie",
  "Marca de cerca al rival",
  "Provoca a los rivales",
  "Protesta a los árbitros",
  "Juega de espaldas a la portería",
  "Baja a recibir el balón",
  "Hace paredes",
  "Le gusta hacer vaselinas al portero",
  "Marca el ritmo del juego",
  "Intenta chilenas",
  "Busca el pase antes que el disparo",
  "No juega balones al hueco",
  "Detiene el juego",
  "Se pasa el balón por delante del rival",
  "Se pasa el balón a la derecha antes de regatear",
  "Se pasa el balón a la izquierda antes de regatear",
  "Se recrea con el balón",
  "Llega tarde al área rival",
  "Intenta salir jugando de los apuros",
  "Se queda siempre atrás",
  "Evita usar la pierna mala",
  "Intenta jugadas de fantasía",
  "Intenta faltas lejanas",
  "Se lanza al suelo en las entradas",
  "No se lanza al suelo en las entradas",
  "Recorta hacia dentro",
  "Se pega a la banda",
  "Anima al público",
  "Intenta disparos al primer toque",
  "Intenta pases largos",
  "Le gusta recibir al pie",
  "Lanza las faltas con potencia",
  "Le gusta regatear una y otra vez",
  "Le gusta cambiar el juego a la otra banda",
  "Se retirará en lo más alto",
  "Jugará al fútbol tanto tiempo como pueda",
  "Tiene un saque de banda largo y tenso",
  "Conduce el balón a menudo",
  "Conduce el balón pocas veces",
  "Intenta mejorar la pierna mala",
  "Delantero de referencia estático",
  "Usa el saque de banda largo para iniciar contraataques",
  "Evita los disparos lejanos",
  "Recorta hacia dentro desde la banda izquierda",
  "Recorta hacia dentro desde la banda derecha",
  "Centra pronto",
  "Saca el balón jugado desde la defensa",
  "Juega el balón con los pies",
];

/** What a check is about, from the key a failure gives, with a capital. */
const checkName = (key: string | undefined) => {
  const name = (es.checks as Partial<Record<string, string>>)[key ?? ""] ?? key ?? "";
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** The name of a job code a failure gives, as `jobs` below has it. */
const jobName = (code: string | undefined) => (es.jobs as Partial<Record<number, string>>)[Number(code)] ?? code;

const errors: ErrorTexts = {
  "guard.unknownBuild": () =>
    "FM Lens no se ha probado con esta versión del juego. La edición seguirá desactivada hasta que se valide.",
  "guard.careerChanged": () => "FM ha movido sus datos desde que FM Lens los leyó. Pulsa Recargar datos y vuelve a intentarlo.",
  "guard.failed": (p) =>
    `${checkName(p.check)}: no han superado las comprobaciones en esta versión del juego, así que FM Lens no ` +
    "los cambia.",
  "edit.unknownField": (p) => `Aquí no hay ningún campo editable llamado «${p.field}».`,
  "edit.outOfRange": (p) => `${p.value} no es un valor válido para ${field(p.field)}: admite de ${p.min} a ${p.max}.`,
  "edit.notADate": (p) => `${p.value} no es una fecha válida para ${field(p.field)}.`,
  "edit.notAChoice": (p) => `${p.value} no es uno de los valores que admite ${field(p.field)}.`,
  "edit.taken": (p) => `El dorsal ${p.value} está ocupado: lo lleva ${p.name ?? `el jugador con UID ${p.uid}`}.`,
  "edit.unsupported": (p) => `${field(p.field)} no se puede cambiar así: ${UNSUPPORTED[p.reason] ?? p.reason}.`,
  "edit.moved": (p) => `Este ${recordNoun(p.entity)} ha cambiado de sitio en la memoria del juego; ${reload}.`,
  "edit.noRecord": (p) => `${field(p.field)} no se puede cambiar aquí: su registro falta o no supera la comprobación.`,
  "edit.unset": (p) => `${field(p.field)} no está fijado en el juego, así que no se ha tocado.`,
  "edit.implausible": (p) =>
    `${field(p.field)} marca ${p.value}, un valor que no puede tener; por seguridad, no se ha tocado.`,
  "edit.notApplied": (p) => `${field(p.field)}: se escribió ${p.wrote}, pero al releerlo dio ${p.read}.`,
  "edit.conflict": (p) =>
    `${field(p.field)} vale ahora ${p.found}, no ${p.expected}: el juego lo ha cambiado desde entonces.`,
  "move.moved": () => `El jugador ha cambiado de sitio en la memoria del juego; ${reload}.`,
  "move.notAClub": () => "Este club no tiene un primer equipo al que pueda unirse el jugador.",
  "move.freeAgent": () => "El jugador no tiene club; los agentes libres aún no se pueden traspasar.",
  "move.sameClub": () => "El jugador ya está en este club.",
  "move.onLoan": () => "El jugador está cedido; los jugadores cedidos aún no se pueden traspasar.",
  "move.playerCoach": () => "Los jugadores-entrenadores no se pueden traspasar: también trabajan como personal.",
  "move.unusualContract": () => "El contrato del jugador no es un contrato de jugador corriente.",
  "move.humanClub": () =>
    "El jugador está en un club que dirige un mánager humano. Las tácticas y el entrenamiento del club también " +
    "apuntan a él, así que solo puede salir del club desde el propio juego.",
  "move.menAndWomen": () => "Uno de los clubes es masculino y el otro, femenino.",
  "move.notListed": () => "Las listas de la plantilla no tienen al jugador donde deberían.",
  "move.noRoom": (p) =>
    `La lista de la plantilla del club no tiene sitio para otro jugador (ahora ${p.players}) y el editor no puede ` +
    "ampliarla.",
  "move.outOfRange": (p) => `${p.value} no es un valor válido para ${field(p.field)}: admite de ${p.min} a ${p.max}.`,
  "move.changed": () => `El juego ha cambiado esa memoria desde entonces; ${reload}.`,
  "move.notApplied": () => "Se escribió en la memoria, pero al releerla dio otra cosa.",
  "heal.notInjured": () => "El jugador no tiene ninguna lesión que curar.",
  "ban.notBanned": () => "El jugador no tiene ninguna sanción que levantar.",
  "call.unavailable": () => "FM no puede hacer este cambio en esta versión.",
  "call.declined": () => "FM no hizo el cambio.",
  "loan.futureFee": () =>
    "Esta cesión tiene un traspaso futuro. Terminarla antes haría que FM completara el traspaso, así que FM Lens no la termina.",
  "loan.joinedOther": (p) => `FM terminó la cesión, pero fichó por ${p.club} en lugar de volver.`,
  "injury.already": () => "Ya está lesionado. Cúralo primero.",
  "injury.noKind": () => "FM no tiene esa lesión.",
  "cohesion.none": () => "FM aún no le ha dado familiaridad con este club, así que no hay nada que subir.",
  "cohesion.changed": (p) =>
    `Su familiaridad con el club vale ahora ${p.found}: el juego la ha cambiado desde entonces, así que no se ha tocado.`,
  "tactics.changed": () => "El juego ha cambiado desde entonces su familiaridad con la táctica, así que no se ha tocado.",
  "list.missing": () => `Esa entrada ya no está en la lista; ${reload}.`,
  "relation.missing": () => `Esa nacionalidad o formación ya no está en la lista del jugador; ${reload}.`,
  "relation.noRoom": () =>
    "La lista del jugador no tiene sitio y el editor no puede ampliarla; cambia una de sus entradas en su lugar.",
  "relation.target": () => "No es un país ni un club del juego del tipo que admite esta entrada.",
  "relation.same": () => "El jugador ya tiene eso.",
  "relation.rule": (p) => `La regla de formación local ${p.rule} no es de las que escribe el editor.`,
  "staff.you": () => "Eres tú, el mánager que controlas.",
  "staff.unemployed": () => "Este miembro del personal no tiene club.",
  "staff.role": () =>
    "El club o uno de sus equipos apunta directamente a este miembro del personal (como un equipo a su mánager); " +
    "de moverlo se encarga el propio juego.",
  "staff.notListed": () => "Las listas de personal del club no lo tienen donde deberían.",
  "staff.noRoom": (p) =>
    `La lista ${STAFF_DEPARTMENTS[p.department] ?? `de ${p.department}`} del club no tiene sitio para nadie más ` +
    `(ahora ${p.staff}) y el editor no puede ampliarla.`,
  "staff.job": (p) => `El editor todavía no mueve al personal con el puesto de ${jobName(p.job)} ni da ese puesto.`,
  "squad.noTeam": () => `El club no tiene ese equipo o no supera la comprobación; ${reload}.`,
  "captain.notInTeam": () =>
    "El jugador no juega en este equipo; el capitán solo puede ser uno de los jugadores del propio equipo.",
  "captain.unchanged": () => "El jugador ya tiene ese papel.",
  "session.notRunning": () =>
    "Football Manager 27 no se está ejecutando. Inicia el juego, carga una partida y vuelve a intentarlo.",
  "session.noSuchProcess": () => "FM27 se ha cerrado o reiniciado. Carga una partida y vuelve a conectar.",
  "session.noCareer": () => "No hay ninguna partida cargada en FM27. Carga una partida y conecta.",
  "attributes.level": () => "Elige un valor del 1 al 20.",
  "session.playersNotFound": () => "No hay ninguna partida cargada en FM27. Carga una partida y conecta.",
  "session.severalRunning": (p) => `Hay ${p.count} copias de ${p.exe ?? "fm.exe"} en ejecución (${p.pids}); elige una.`,
  "session.pluginNotLoaded": () =>
    "Los datos del juego aún no se han cargado; espera al menú principal y vuelve a intentarlo.",
  "session.unsupportedEdition": (p) => `FM${p.edition} aún no es compatible.`,
  "session.unknownEdition": () => "No se ha podido saber qué Football Manager es este.",
  "memory.win32": (p) => `Windows ha rechazado una operación (${p.operation}, error ${p.code}).`,
  "memory.read": (p) => `No se ha podido leer la memoria del juego (error del sistema ${p.code}).`,
  "memory.write": (p) => `No se ha podido escribir en la memoria del juego (error del sistema ${p.code}).`,
  "memory.readOnly": () => "El juego se abrió solo para lectura; Windows no ha permitido escribir.",
  "memory.notWritable": () =>
    "Esa dirección no está en la memoria de datos modificable del juego, así que no se ha escrito.",
  "memory.invalidPe": () => "No se ha podido leer el módulo del juego.",
  "memory.invalidMachO": () => "No se ha podido leer el módulo del juego.",
  "memory.mach": (p) => `macOS ha rechazado una operación (${p.operation}, error ${p.code}).`,
  "memory.posix": (p) => `macOS ha rechazado una operación (${p.operation}, errno ${p.code}).`,
  "memory.noBridge": () =>
    "FM27 se inició sin el ayudante de FM Lens. Cuando termines la configuración, cierra FM27 y vuelve a " +
    "iniciarlo desde Steam.",
  "memory.bridge": (p) => `El puente de FM Lens en el juego no ha entregado la memoria (${p.reason}).`,
  "setup.steamRunning": () =>
    "El ayudante está instalado, pero Steam está abierto y no se ha configurado la opción de lanzamiento. Cierra " +
    "Steam y vuelve a pulsar Configurar, o introduce tú la opción de lanzamiento.",
  "setup.noSteamAccount": () =>
    "No se ha encontrado ninguna cuenta de Steam en este Mac; abre Steam e inicia sesión una vez.",
  "setup.noLibrary": (p) => `Falta un archivo del puente en la aplicación: ${p.path}`,
  "setup.unknownConfig": (p) => `${p.path} no tiene un formato que FM Lens conozca, así que no se ha tocado.`,
  "setup.io": (p) => `${p.path}: ${p.error}`,
  "app.internal": () => "Se ha producido un error inesperado en la aplicación.",
  "app.notConnected": () => "No hay conexión con el juego.",
  "app.notFound": (p) =>
    `No hay ningún ${recordNoun(p.entity)} con el ID ${p.uid} en las listas; vuelve a leer los datos.`,
  "app.dataChanged": () => `Estos datos han cambiado en el juego; ${reload}.`,
  "app.noChange": (p) => `No existe el cambio ${p.id}.`,
  "app.alreadyUndone": () => "Este cambio ya se ha deshecho.",
  "app.permanent": () => "Este cambio no se puede deshacer.",
  "app.earlierGame": () =>
    "Este cambio se hizo antes de que FM se cerrara o cargara una partida, así que ya no se puede deshacer.",
  "export.failed": (p) => `No se ha podido escribir el archivo: ${p.reason}`,
  "export.notAllowed": (p) =>
    `FM Lens no puede escribir en ${p.folder}. Si macOS ha preguntado si puede usar tu carpeta Documentos, ` +
    "permítelo en Ajustes del Sistema › Privacidad y seguridad › Archivos y carpetas y vuelve a exportar.",
  "export.noFolder": () => "No hay ninguna carpeta a la que exportar.",
  "export.notExported": () => "Ese no es un archivo que haya exportado FM Lens.",
  "export.openFailed": (p) => `No se ha podido abrir: ${p.reason}`,
  "mass.noOperations": () => "Elige al menos un campo que cambiar.",
  "mass.tooMany": (p) =>
    `Hay ${p.count} resultados. Para una edición masiva, acota la búsqueda o los filtros a ${p.limit} como máximo.`,
  "mass.outOfDate": () => "Esta vista previa está desfasada. Vuelve a generar la vista previa de la edición masiva.",
};

export const es: Strings = {
  attributes: {
    // Técnicos
    corners: "Saques de esquina",
    crossing: "Centros",
    dribbling: "Regate",
    finishing: "Remate",
    first_touch: "Control",
    free_kicks: "Lanzamiento de faltas",
    heading: "Cabeceo",
    long_shots: "Tiros lejanos",
    long_throws: "Saque de banda largo",
    marking: "Marcaje",
    passing: "Pases",
    penalty_taking: "Penaltis",
    tackling: "Entradas",
    technique: "Técnica",
    // Mentales
    aggression: "Agresividad",
    anticipation: "Anticipación",
    bravery: "Valentía",
    composure: "Serenidad",
    concentration: "Concentración",
    decisions: "Decisiones",
    determination: "Determinación",
    flair: "Talento",
    leadership: "Liderazgo",
    off_the_ball: "Desmarques",
    positioning: "Colocación",
    teamwork: "Juego en equipo",
    vision: "Visión",
    work_rate: "Sacrificio",
    // Físicos
    acceleration: "Aceleración",
    agility: "Agilidad",
    balance: "Equilibrio",
    jumping_reach: "Alcance de salto",
    natural_fitness: "Recuperación física",
    pace: "Velocidad",
    stamina: "Resistencia",
    strength: "Fuerza",
    // Portero (el control y los pases son los de Técnicos)
    aerial_reach: "Alcance aéreo",
    command_of_area: "Mando en el área",
    communication: "Comunicación",
    eccentricity: "Excentricidad",
    handling: "Blocaje",
    kicking: "Saque con el pie",
    one_on_ones: "Uno contra uno",
    punching: "Despeje de puños (tendencia)",
    reflexes: "Reflejos",
    rushing_out: "Salidas (tendencia)",
    throwing: "Saque con la mano",
    // Ocultos
    consistency: "Regularidad",
    dirtiness: "Juego sucio",
    important_matches: "Partidos importantes",
    injury_proneness: "Propensión a lesiones",
    versatility: "Versatilidad",
    // Pies
    left_foot: "Pie izquierdo",
    right_foot: "Pie derecho",
  },

  staffAttributes: {
    // Entrenamiento
    attacking: "Ataque",
    defending: "Defensa",
    fitness: "Preparación física",
    goalkeeping: "Porteros",
    possession: "Posesión",
    set_pieces: "Balón parado",
    tactical: "Táctica",
    technical: "Técnica",
    working_with_youngsters: "Trabajo con jóvenes",
    // Mentales
    authority: "Autoridad",
    determination: "Determinación",
    motivating: "Motivación",
    people_management: "Gestión de personas",
    // Conocimientos
    data_analysis: "Análisis de datos",
    judging_ability: "Valorar la calidad de jugadores",
    judging_potential: "Valorar el potencial de jugadores",
    judging_staff: "Valorar la calidad del personal",
    negotiating: "Negociación",
    tactical_knowledge: "Conocimiento táctico",
    // Médicos
    physiotherapy: "Fisioterapia",
    sports_science: "Ciencias del deporte",
  },

  personality: {
    adaptability: "Adaptabilidad",
    ambition: "Ambición",
    loyalty: "Lealtad",
    pressure: "Presión",
    professionalism: "Profesionalidad",
    sportsmanship: "Deportividad",
    temperament: "Temperamento",
    controversy: "Controversia",
  },

  positions: {
    gk: "GK",
    sw: "SW",
    dl: "DL",
    dc: "DC",
    dr: "DR",
    dm: "DM",
    ml: "ML",
    mc: "MC",
    mr: "MR",
    aml: "AML",
    amc: "AMC",
    amr: "AMR",
    st: "ST",
    wbl: "WBL",
    wbr: "WBR",
  },

  clubFacilities: {
    training: "Entrenamiento",
    youth_facilities: "Instalaciones de cantera",
    youth_coaching: "Formación en la cantera",
    youth_recruitment: "Captación de cantera",
    corporate: "Corporativas",
  },

  supporterTraits: {
    loyalty: "Lealtad",
    passion: "Pasión",
    patience: "Paciencia",
    affluence: "Poder adquisitivo",
    temperament: "Temperamento",
    expectations: "Expectativas",
  },

  supporterMix: {
    hardcore: "Incondicionales",
    core: "Habituales",
    family: "Familias",
    fair_weather: "Oportunistas",
    casual: "Ocasionales",
    other: "Otros",
  },

  jobs: {
    1: "Jugador",
    2: "Entrenador",
    4: "Presidente",
    6: "Directivo",
    12: "Fisioterapeuta",
    14: "Ojeador",
    16: "Mánager",
    20: "Segundo entrenador",
    22: "Entrenador de balón parado",
    26: "Preparador físico",
    34: "Entrenador de porteros",
    40: "Jefe de ciencias del deporte",
    44: "Jefe de ojeadores",
    48: "Científico deportivo",
    50: "Fisioterapeuta jefe",
    58: "Analista de captación",
    60: "Analista de rendimiento",
    64: "Director de cantera",
    70: "Presidente del club",
    86: "Gestor de cesiones",
    88: "Director técnico",
  },

  fields: {
    current_ability: "Habilidad actual",
    potential_ability: "Habilidad potencial",
    height: "Altura (cm)",
    date_of_birth: "Fecha de nacimiento",
    asking_price: "Precio de venta",
    nation: "Nacionalidad",
    "reputation.home": "Reputación local",
    "reputation.current": "Reputación actual",
    "reputation.world": "Reputación mundial",
    "international.caps": "Partidos internacionales",
    "international.goals": "Goles internacionales",
    "international.u21_caps": "Partidos sub-21",
    "international.u21_goals": "Goles sub-21",
    condition: "Energía",
    match_sharpness: "Ritmo de competición",
    jadedness: "Fatiga",
    morale: "Moral",
    "contract.wage": "Salario semanal",
    "contract.loyalty_bonus": "Prima de fidelidad semanal",
    "contract.happiness": "Felicidad",
    "contract.playing_time_happiness": "Felicidad con los minutos",
    "contract.unhappiness": "Motivos de descontento",
    "contract.expires": "Fin de contrato",
    "loan.wage": "Salario pagado por el club receptor",
    "loan.ends": "Fin de la cesión",
    "transfer.joins": "Se incorpora",
    future_transfer: "Traspaso pendiente",
    loan: "Cesión",
    "contract.squad_number": "Dorsal",
    "contract.squad_status": "Estatus en la plantilla",
    "contract.transfer_listed": "Transferible",
    "contract.loan_listed": "Cedible",
    "contract.job": "Puesto",
    coaching_licence: "Licencia de entrenador",
    "manager.unsackable": "Indespedible (experimental)",
    "manager.registration_anytime": "Inscribir plantilla en cualquier momento (experimental)",
    "tie.nationality": "Nacionalidad secundaria",
    "tie.trainedInNation": "Formado en el país",
    "tie.trainedAtClub": "Formado en el club",
    "preference.favouredClub": "Club favorito",
    "preference.dislikedClub": "Club que no soporta",
    "preference.favouredPerson": "Persona favorita",
    "preference.dislikedPerson": "Persona que no soporta",
    strength: "Intensidad",
    language: "Idioma",
    level: "Nivel",
    club: "Club",
    injuries: "Lesiones",
    injury: "Lesión",
    work_permit: "Permiso de trabajo",
    bans: "Sanciones",
    cohesion: "Familiaridad con el club",
    tactics: "Familiaridad táctica",
    retirement: "Retirada",
    clause: "Cláusula del contrato",
    "clause.amount": "Importe de la cláusula",
    "clause.condition": "Condición de la cláusula",
    captain: "Capitán",
    vice_captain: "Vicecapitán",
    reputation: "Reputación",
    "facilities.training": "Instalaciones de entrenamiento",
    "facilities.youth_facilities": "Instalaciones de cantera",
    "facilities.youth_coaching": "Formación en la cantera",
    "facilities.youth_recruitment": "Captación de cantera",
    "facilities.corporate": "Instalaciones corporativas",
    "finance.balance": "Saldo",
    "finance.transfer_budget": "Presupuesto de fichajes",
    "finance.wage_budget": "Presupuesto salarial",
    "finance.total_wage_budget": "Presupuesto salarial total",
    "stadium.capacity": "Aforo del estadio",
    "stadium.seating": "Aforo con asientos",
    "stadium.used": "Aforo en uso",
    "stadium.expansion": "Aforo ampliable",
    population: "Población",
    dual_nationality: "Doble nacionalidad",
    naturalisation: "Años para nacionalizarse",
    youth_rating: "Valoración de cantera",
    "women.reputation": "Reputación femenina",
    "women.youth_rating": "Valoración de cantera femenina",
    game_importance: "Importancia del juego",
    attendance: "Asistencia",
    "women.game_importance": "Importancia del juego femenino",
    "women.attendance": "Asistencia femenina",
    points: "Puntos FIFA",
  },

  profile: {
    close: "Cerrar perfil",
    sections: "Secciones",
    top: "Arriba",
    loading: "Cargando perfil…",
    resize: "Cambiar el ancho del panel del perfil",
    resizeHint: "Arrastra para cambiar el ancho. Doble clic para restablecerlo.",
    none: "-",

    // Cabecera
    freeAgent: "Agente libre",
    born: "Nacimiento:",
    height: (cm) => `${cm} cm`,
    heightUnit: "cm",
    uid: "UID",
    currentAbility: "Habilidad actual",
    currentAbilityShort: "HA",
    potentialAbility: "Habilidad potencial",
    potentialAbilityShort: "HP",
    potentialRange: "Potencial fijado como un rango",

    // Atributos
    technical: "Técnicos",
    goalkeeping: "Portero",
    mental: "Mentales",
    physical: "Físicos",
    hidden: "Ocultos",
    feet: "Pies",
    personality: "Personalidad",
    raw: (raw, scale = 100) => `valor interno ${raw} / ${scale}`,
    lowerIsBetter: "cuanto más bajo, mejor",
    age: (age) => `${age} años`,

    // Posiciones
    positions: "Posiciones",
    positionsSummary: (best) => `Valoraciones por posición: ${best}`,
    positionRatings: "Valoraciones por posición",
    positionTiers: {
      natural: "Natural",
      accomplished: "Hábil",
      competent: "Competente",
      unconvincing: "Poco convincente",
      ineffective: "Ineficaz",
    },
    positionTooltip: (position, rating, tier) => `${position} · ${rating} · ${tier}`,

    // Contrato
    contract: "Contrato",
    wage: "Salario semanal",
    converted: "Al cambio de FM",
    signed: "Firmado",
    expires: "Vence",
    loan: "Cesión",
    loanFrom: "Cedido por",
    loanWage: "Paga el club receptor por semana",
    loanStarts: "Inicio de la cesión",
    loanEnds: "Fin de la cesión",
    loanFutureFee: "Traspaso futuro",
    futureTransfer: "Traspaso pendiente",
    futureClub: "Club",
    futureJoins: "Se incorpora",
    workPermit: "Permiso de trabajo",
    permitActive: "Activo",
    permitEsc: (date: string) => `Plaza ESC desde el ${date}`,
    permitNone: "Ninguno",
    grantPermit: "Conceder",
    revokePermit: "Retirar",
    joined: "Incorporación",
    squadStatus: "Estatus en la plantilla",
    squadStatusName: (status) => SQUAD_STATUSES[status] ?? `Estatus ${status}`,
    qualifications: "Titulación",
    coachingLicence: "Licencia de entrenador",
    licenceName: (level: number): string =>
      ({
        1: "Licencia Continental Pro",
        2: "Licencia Continental A",
        3: "Licencia Continental B",
        4: "Licencia Continental C",
        5: "Licencia Nacional A",
        6: "Licencia Nacional B",
        7: "Licencia Nacional C",
      })[level] ?? "Ninguna",
    squadNumber: "Dorsal",
    transferListed: "Transferible",
    loanListed: "Cedible",

    // Trayectoria
    career: "Trayectoria",
    internationalCaps: "Partidos internacionales",
    internationalGoals: "Goles internacionales",
    u21Caps: "Partidos sub-21",
    u21Goals: "Goles sub-21",
    askingPrice: "Precio de venta",
    notSet: "Sin fijar",
    reputation: "Reputación",
    reputationHome: "Local",
    reputationCurrent: "Actual",
    reputationWorld: "Mundial",
    retirement: "Retirada",
    retires: "Prevé retirarse",
    preferences: "Afinidades",
    languages: "Idiomas",
    /** How well a person speaks a language (0 to 10), in the words of FM's profile (see en.ts). */
    languageLevel: (level: number): string =>
      level >= 7 ? "Fluido" : level >= 5 ? "Bueno" : level >= 2 ? "Básico" : "No lo habla",
    languageLevelTitle: (level: number) => `${level}/10`,
    rivals: "Rivales",
    linkedClubs: "Clubes afiliados",
    preferenceKinds: {
      favouredClub: "Clubes favoritos",
      dislikedClub: "Clubes que no soporta",
      favouredPerson: "Personas favoritas",
      dislikedPerson: "Personas que no soporta",
    },
    noRetirement: "El juego no ha previsto su retirada",
    keepPlaying: "Evitar la retirada",
    keepingPlaying: "Evitando…",
    keepPlayingTitle:
      "Cancela su retirada. Puedes deshacerlo en Cambios.",

    // Médico
    morale: (value) => `${value} / 20`,
    traits: "Características",
    noTraits: "Sin características",
    traitName: (bit) => TRAIT_NAMES_ES[bit] ?? `Característica ${bit}`,
    unhappiness: "Descontento",
    noUnhappiness: "Nada le hace estar descontento",
    removeUnhappiness: "Quitar todo",
    removingUnhappiness: "Quitando…",
    removeUnhappinessTitle:
      "Quita todos sus motivos de descontento. Puedes deshacerlo en Cambios.",
    concernSince: (date) => `desde el ${date}`,
    concernKind: (kind) => (kind === 1 ? "Preocupado" : kind === 2 ? "Interno" : `Tipo ${kind}`),
    concernMotive: (motive) => CONCERN_MOTIVES_ES[motive] ?? `Motivo ${motive}`,
    clauses: "Primas y cláusulas",
    noClauses: "Sin primas ni cláusulas",
    loyaltyBonus: "Prima de fidelidad",
    happiness: "Felicidad",
    playingTimeHappiness: "Felicidad con los minutos",
    moodTitle: "Como lo muestra FMRTE, de -100 a 100; el juego lo muestra con palabras",
    clauseName: (kind) => CLAUSE_NAMES_ES[kind] ?? `Cláusula ${kind}`,
    clauseCondition: (kind, value) => {
      if (RELEASE_CLAUSES.has(kind)) {
        return null;
      }
      if (PERCENT_CLAUSES.has(kind)) {
        return `${value} %`;
      }
      switch (kind) {
        case 10:
          return value === 1 ? "1 gol" : `${format(value)} goles`;
        case 40:
          return value === 1 ? "1 asistencia" : `${format(value)} asistencias`;
        case 41:
          return `${format(value)} goles y asistencias`;
        case 11:
        case 13:
          return value === 1 ? "1 partido de liga" : `${format(value)} partidos de liga`;
        case 19:
          return value === 1 ? "1 partido internacional" : `${format(value)} partidos internacionales`;
        case 22:
          return value === 1 ? "1 año" : `${format(value)} años`;
        default:
          return String(value);
      }
    },
    moraleTitle:
      "En FM: 10 es satisfecho, 11 algo feliz, 15 y 20 extremadamente feliz.",
    jadednessTitle:
      "Lo cansado que está. -500 es totalmente descansado.",
    noInjuries: "Sin lesiones",
    unknownInjury: "Lesión desconocida",
    injuryStarted: (date) => `Desde el ${date}`,
    injuryBack: (dates) => `Regreso previsto: ${dates}`,
    heal: "Curar",
    healTitle: "Curar todas las lesiones de este jugador en el juego",
    addInjury: "Añadir lesión",
    injuryKind: "Lesión",
    noBans: "Sin sanciones",
    banMatches: (matches) => (matches === 1 ? "1 partido" : `${format(matches)} partidos`),
    banStarted: (date) => `Desde el ${date}`,
    liftBans: "Levantar",
    liftBansTitle: "Levantar todas las sanciones de este jugador en el juego",

    // Sobre los atributos, mientras se lee el perfil
    setAttributes: "Poner todos los atributos en",
    setAttributesButton: "Aplicar",
    setAttributesDone: (count, level) =>
      count === 0
        ? "Todos sus atributos ya tienen ese valor"
        : `${count === 1 ? "1 cambio escrito" : `${format(count)} cambios escritos`}. La propensión a lesiones y el ` +
          `juego sucio quedan en ${21 - level}, porque para ellos menos es mejor.`,
    setAttributesUndone: (count) =>
      count === 0 ? "No se ha deshecho nada" : count === 1 ? "1 cambio deshecho" : `${format(count)} cambios deshechos`,
    undoSetAttributes: "Deshacer",
    undoSetAttributesTitle: "Recuperar sus atributos anteriores",
    freezeAttributes: "Congelar los atributos",
    freezeAttributesNote:
      "Mientras FM Lens esté abierto y conectado, sus atributos no pueden bajar. Las mejoras sí cuentan. " +
      "FM Lens lo recuerda para esta partida.",

    // Personal
    you: "Tú",
    youTitle: "El mánager que controlas en esta partida",
    id: "ID",
    job: "Puesto",
    changeJob: "Cambiar de puesto",
    changeJobTitle: "Dar a este miembro del personal otro puesto en su club en el juego",
    newJob: "Nuevo puesto",
    applyJob: "Aplicar",
    cancelJob: "Cancelar",
    unemployed: "Sin empleo",
    coaching: "Entrenamiento",
    knowledge: "Conocimientos",
    medical: "Médico",
    playerCoach: (job) => `${job} (jugador-entrenador)`,
    unknownJob: (code) => `Puesto ${code}`,
  },

  playerList: {
    nav: "Jugadores",
    count: (total) => entityCount("player", total),
    search: "Buscar jugadores por nombre o UID",
    summary: (total, shown, sorted) => {
      const count = entityCount("player", total);
      if (total <= shown) {
        return count;
      }
      return sorted === null
        ? `${count} · se muestran los ${shown} mejores por habilidad actual`
        : `${count} · se muestran los ${shown} primeros por ${sorted.by}, en orden ` +
            (sorted.ascending ? "ascendente" : "descendente");
    },
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Ningún jugador coincide con estos filtros." : "No se han encontrado jugadores.";
      }
      return filtered
        ? `Ningún jugador coincide con «${query}» con estos filtros.`
        : `Ningún jugador coincide con «${query}».`;
    },
    columns: {
      name: "Nombre",
      age: "Edad",
      positions: "Posiciones",
      nation: "País",
      club: "Club",
      contractExpires: "Contrato",
      born: "Nacimiento",
      currentAbility: "HA",
      potentialAbility: "HP",
      uid: "UID",
    },
    sortBy: (by) => `Ordenar por ${by}`,
    sortNames: {
      currentAbility: "habilidad actual",
      potentialAbility: "habilidad potencial",
      age: "edad",
      name: "nombre",
      nation: "país",
      club: "club",
      contractExpires: "fin de contrato",
    },
    filters: {
      toggle: "Filtros",
      toggleActive: (count) => (count === 1 ? "Filtros, 1 activo" : `Filtros, ${count} activos`),
      clear: "Borrar",
      any: "Cualquiera",
      position: "Posición",
      age: "Edad",
      minAge: "Edad mínima",
      maxAge: "Edad máxima",
      minPlaceholder: "Mín.",
      maxPlaceholder: "Máx.",
      minCurrentAbility: "HA mín.",
      minCurrentAbilityTitle: "Habilidad actual mínima",
      minPotentialAbility: "HP mín.",
      minPotentialAbilityTitle: "Habilidad potencial mínima",
      abilityPlaceholder: "1–200",
      nation: "País",
      club: "Club",
      freeAgentsOnly: "Solo agentes libres",
      contractEndsBy: "Contrato hasta",
      transferListedOnly: "Solo transferibles",
      loanListedOnly: "Solo cedibles",
      attributes: {
        heading: "Atributos",
        attribute: "Atributo",
        pick: "Elige un atributo",
        min: (name) => (name ? `${name}: mínimo` : "Mínimo"),
        max: (name) => (name ? `${name}: máximo` : "Máximo"),
        add: "Añadir atributo",
        remove: (name) => (name ? `Quitar ${name}` : "Quitar esta fila"),
      },
      saved: {
        save: "Guardar",
        saveTitle: "Guardar con un nombre los filtros y el orden actuales",
        name: "Nombre del filtro guardado",
        namePlaceholder: "Nombre del filtro",
        ok: "Aceptar",
        cancel: "Cancelar",
        select: "Filtros guardados",
        delete: "Eliminar",
        deleteTitle: (name) => `Eliminar el filtro guardado: ${name}`,
        replaceQuestion: (name) => `Ya hay un filtro guardado llamado «${name}». ¿Reemplazarlo?`,
        replace: "Reemplazar",
        full: (max) =>
          `Se pueden guardar hasta ${max} filtros. Elimina uno antes, o usa el nombre de un filtro guardado para ` +
          "reemplazarlo.",
      },
    },
  },

  staffList: {
    nav: "Personal",
    count: (total) => entityCount("staff", total),
    search: "Buscar personal por nombre o ID",
    summary: (total, shown) =>
      total > shown
        ? `${entityCount("staff", total)} · se muestran los ${shown} mejores por habilidad actual`
        : entityCount("staff", total),
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Ningún empleado coincide con estos filtros." : "No se ha encontrado personal.";
      }
      return filtered
        ? `Ningún empleado coincide con «${query}» con estos filtros.`
        : `Ningún empleado coincide con «${query}».`;
    },
    columns: {
      name: "Nombre",
      age: "Edad",
      job: "Puesto",
      club: "Club",
      nation: "País",
      born: "Nacimiento",
      currentAbility: "HA",
      potentialAbility: "HP",
      id: "ID",
    },
    filters: {
      job: "Puesto",
      anyJob: "Cualquiera",
      unemployedOnly: "Solo sin empleo",
      humanOnly: "Solo mánagers humanos",
      age: "Edad",
      minAge: "Edad mínima",
      maxAge: "Edad máxima",
      minPlaceholder: "Mín.",
      maxPlaceholder: "Máx.",
      minCurrentAbility: "HA mín.",
      minCurrentAbilityTitle: "Habilidad actual mínima",
      minPotentialAbility: "HP mín.",
      minPotentialAbilityTitle: "Habilidad potencial mínima",
      abilityPlaceholder: "1–200",
      nation: "País",
      club: "Club",
    },
  },

  clubProfile: {
    // Cabecera
    womensClub: "Club femenino",
    founded: (year) => `Fundado en ${year}`,
    reputationShort: "REP",
    reputationTitle: "Reputación",

    tabsLabel: "Secciones del club",
    tabs: { overview: "Resumen", squad: "Plantilla" },
    squadLocked: "Termina de editar para abrir la plantilla",

    facilities: "Instalaciones",

    // Afición
    supporters: "Afición",
    supporterMix: "Tipos de aficionados",
    percent: (value) => `${percents.format(value)} %`,
    mixTooltip: (kind, percent) => `${kind} · ${percent}`,

    // Finanzas
    finances: "Finanzas",
    balance: "Saldo",
    transferBudget: "Presupuesto de fichajes",
    wageBudget: "Presupuesto salarial (gasto)",
    totalWageBudget: "Presupuesto salarial total",
    ticketPrice: "Precio medio de la entrada",
    perWeek: "por semana",
    noFinances: "FM solo lleva las finanzas de los clubes de ligas jugables.",
    freeze: "Congelar el dinero",
    freezeNote:
      "Mientras FM Lens esté abierto y conectado, el saldo no puede bajar. Los ingresos sí cuentan. " +
      "FM Lens lo recuerda para esta partida.",

    // Estadio
    stadium: "Estadio",
    capacity: "Aforo",
    seating: "Con asientos",
    used: "En uso",
    usedAll: "Todo",
    usedTitle:
      "La parte del aforo que el juego deja usar cuando la limita (por ejemplo, con asientos cerrados); 0 significa " +
      "todo",
    expansion: "Ampliable hasta",
    noStadium: "No se ha podido leer el estadio de este club.",

    // Datos del club
    info: "Datos del club",
    seasonTickets: "Abonos de temporada",
    socialMedia: "Seguidores en redes sociales",
  },

  clubList: {
    nav: "Clubes",
    count: (total) => entityCount("club", total),
    search: "Buscar clubes por nombre o UID",
    summary: (total, shown) =>
      total > shown
        ? `${entityCount("club", total)} · se muestran los ${shown} primeros por reputación`
        : entityCount("club", total),
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Ningún club coincide con estos filtros." : "No se han encontrado clubes.";
      }
      return filtered
        ? `Ningún club coincide con «${query}» con estos filtros.`
        : `Ningún club coincide con «${query}».`;
    },
    women: "Femenino",
    columns: {
      name: "Nombre",
      reputation: "Reputación",
      founded: "Fundación",
      uid: "UID",
    },
    filters: {
      kind: "Clubes que mostrar",
      all: "Todos los clubes",
      men: "Clubes masculinos",
      women: "Clubes femeninos",
      reputation: "Reputación",
      minReputation: "Reputación mínima",
      maxReputation: "Reputación máxima",
      minPlaceholder: "Mín.",
      maxPlaceholder: "Máx.",
      founded: "Fundación",
      foundedFrom: "Fundado desde",
      foundedTo: "Fundado hasta",
      yearPlaceholder: "Año",
    },
  },

  officialList: {
    nav: "Árbitros",
    search: "Buscar árbitros por nombre o UID",
    summary: (total, shown) => {
      const count = total === 1 ? "1 árbitro" : `${format(total)} árbitros`;
      return total > shown ? `${count} · los ${shown} de más calidad` : count;
    },
    empty: (query) =>
      query === "" ? "No se han podido leer los árbitros en esta versión de FM." : `Ningún árbitro coincide con «${query}».`,
    columns: { name: "Nombre", nation: "País", age: "Edad", ca: "HA", pa: "HP", reputation: "Reputación", uid: "UID" },
    reputation: "Reputación",
  },

  competitionList: {
    nav: "Competiciones",
    search: "Buscar competiciones por nombre o UID",
    summary: (total, shown) => {
      const count = total === 1 ? "1 competición" : `${format(total)} competiciones`;
      return total > shown ? `${count} · las ${shown} de más reputación` : count;
    },
    empty: (query) =>
      query === ""
        ? "No se han podido leer las competiciones en esta versión de FM."
        : `Ninguna competición coincide con «${query}».`,
    columns: { name: "Nombre", nation: "País", continent: "Continente", reputation: "Reputación", uid: "UID" },
    shortName: "Nombre corto",
    reputation: "Reputación",
    women: "Femenino",
    rules: "Reglas",
    ruleNames: {
      level: "Nivel",
      max_squad_size: "Tamaño máximo de plantilla",
      min_squad_size: "Tamaño mínimo de plantilla",
      recommended_squad_size: "Tamaño de plantilla recomendado",
      max_prelim_squad_size: "Máximo en la lista preliminar",
      min_foreign_players: "Mínimo de extranjeros",
      max_foreign_players: "Máximo de extranjeros",
      foreign_trialists_can_play: "Pueden jugar extranjeros a prueba",
      subs_allowed: "Cambios permitidos",
      max_subs: "Suplentes convocados",
      extended_injury_time: "Tiempo añadido ampliado",
      daylight_offside_rule: "Fuera de juego con luz",
      yellow_cards_for_fine: "Amarillas para una multa",
      min_games_for_medal: "Partidos para una medalla",
      number_of_medals: "Medallas",
      min_stadium_capacity: "Aforo mínimo del estadio",
      min_stadium_seating: "Asientos mínimos del estadio",
      requires_grass_pitch: "Exige césped natural",
      requires_undersoil_heating: "Exige calefacción bajo el césped",
    },
  },

  awardList: {
    nav: "Premios",
    search: "Buscar premios por nombre, competición o UID",
    summary: (total, shown) => {
      const count = total === 1 ? "1 premio" : `${format(total)} premios`;
      return total > shown ? `${count} · los ${shown} de más prestigio` : count;
    },
    empty: (query) =>
      query === "" ? "No se han podido leer los premios en esta versión de FM." : `Ningún premio coincide con «${query}».`,
    columns: { name: "Nombre", competition: "Competición", nation: "País", prestige: "Prestigio", uid: "UID" },
    competition: "Competición",
    prestige: "Prestigio",
    period: "Se entrega",
    periodName: (code) =>
      ({
        1: "Cada semana",
        2: "Cada mes",
        3: "Cada temporada",
        4: "Al final de la competición",
        5: "Cada año natural",
        6: "Cada año",
        7: "Cada jornada",
      })[code] ?? null,
    recipients: "Para",
    recipientName: (code) => ({ 1: "Un jugador", 2: "Un entrenador", 7: "Un equipo de jugadores" })[code] ?? null,
    goalkeepersOnly: "Solo porteros",
    ageLimit: "Límite de edad",
    ageLimitValue: (age) => `${age} años o menos`,
    women: "Femenino",
  },

  stadiumList: {
    nav: "Estadios",
    search: "Buscar estadios por nombre o club",
    summary: (total, shown) => {
      const count = total === 1 ? "1 estadio" : `${format(total)} estadios`;
      return total > shown ? `${count} · se muestran los primeros ${shown} por aforo` : count;
    },
    empty: (query, filtered) => {
      if (query === "" && !filtered) {
        return "No se ha podido leer ningún estadio.";
      }
      if (query === "") {
        return "Ningún estadio coincide con estos filtros.";
      }
      return filtered
        ? `Ningún estadio coincide con «${query}» con estos filtros.`
        : `Ningún estadio coincide con «${query}».`;
    },
    columns: {
      name: "Estadio",
      club: "Club",
      capacity: "Aforo",
      seating: "Sentados",
      expansion: "Puede crecer hasta",
    },
    filters: {
      capacity: "Aforo",
      minCapacity: "Aforo mínimo",
      maxCapacity: "Aforo máximo",
      placeholder: "Mín.",
    },
    note: "El estadio del primer equipo de este club, leído de los mismos campos que la ficha del club.",
  },

  nationList: {
    nav: "Países",
    search: "Buscar países por nombre",
    summary: (total, shown) => {
      const count = total === 1 ? "1 país" : `${format(total)} países`;
      return total > shown ? `${count} · se muestran los primeros ${shown}` : count;
    },
    empty: (query) => (query === "" ? "No se han encontrado países." : `Ningún país coincide con «${query}».`),
    columns: { name: "País", uid: "UID" },
    note: "Solo los países de los jugadores y el personal de esta partida.",
    uid: "UID",
    noUid: "Sin UID",
    nation: "País",
    capital: "Capital",
    population: "Población",
    languages: "Idiomas",
    dualNationality: "Doble nacionalidad",
    allowed: "Permitida",
    notAllowed: "No permitida",
    naturalisation: "Años para nacionalizarse",
    never: "Nunca",
    fifa: "FIFA",
    ranking: "Ranking mundial",
    points: "Puntos",
    founded: "Federación fundada",
    joinedFifa: "Ingreso en la FIFA",
    joinedContinental: "Ingreso en la confederación",
    youthRating: "Valoración de cantera",
    gameImportance: "Importancia del juego",
    attendance: "Asistencia",
    women: "Fútbol femenino",
    teamName: (ageLimit) => (ageLimit === null ? "Selección absoluta" : `Sub-${ageLimit}`),
    womenTeamName: (ageLimit) => (ageLimit === null ? "Selección femenina absoluta" : `Femenina sub-${ageLimit}`),
    manager: "Seleccionador",
    captain: "Capitán",
    viceCaptain: "Segundo capitán",
    reputation: "Reputación",
    squad: (count) => `Convocatoria (${count})`,
  },

  app: {
    settingsLabel: "Ajustes",
    languageLabel: "Idioma",
    currencyLabel: "Moneda",
    appearanceLabel: "Apariencia",
    appearanceSystem: "Sistema",
    appearanceLight: "Claro",
    appearanceDark: "Oscuro",
    zoomLabel: "Zoom",
    appearance: "Apariencia",
    themes: { system: "Sistema", light: "Claro", dark: "Oscuro" },
    tour: {
      label: "Introducción",
      skip: "Omitir",
      back: "Atrás",
      next: "Siguiente",
      done: "Listo",
      progress: (step: number, total: number) => `${step} de ${total}`,
      steps: {
        brand: {
          title: "FM Lens",
          body: "Mira todo lo de tu partida y cámbialo. Los cambios llegan a FM al pulsar Aplicar. Pruébalos antes en una copia.",
        },
        tabs: {
          title: "Secciones",
          body: "Jugadores, personal, clubes, países y estadios.",
        },
        search: {
          title: "Búsqueda y filtros",
          body: "Escribe un nombre o ID. Usa Filtros para acotar.",
        },
        settings: {
          title: "Ajustes",
          body: "Idioma, moneda, modo claro u oscuro y zoom.",
        },
        status: {
          title: "Conexión",
          body: "La barra de abajo muestra si estás conectado a FM.",
        },
      },
      exercise: {
        list: { title: "Prueba una edición", body: "Abre a cualquiera de la lista." },
        edit: { title: "Editar", body: "Pulsa Editar o haz clic en un valor." },
        profile: { title: "Cambia un valor", body: "Escribe un valor nuevo. Aún no se envía nada a FM." },
        apply: { title: "Aplicar", body: "Aplicar envía el cambio a FM. Descartar lo elimina." },
        changes: { title: "Cambios", body: "Aquí aparece cada cambio aplicado, y se puede deshacer." },
      },
    },

    noteEditable: "Edición activada",
    noteReadOnly: "Solo lectura",
    noteUnknownBuild: "Solo lectura: esta versión de FM aún no es compatible",
    noteReloadRequired: "FM ha movido sus datos. Pulsa Recargar datos para editar.",

    notConnected: "Sin conexión",
    connected: "Conectado",
    detailsLabel: "Detalles de la app",
    reportProblem: "Informar de un problema",
    more: "Más",
    previewTag: "vista previa en el navegador · datos de ejemplo",
    noDate: "Sin fecha del juego",
    noDateTitle:
      "No se pudo leer la fecha del juego, así que no hay edades y los filtros de edad no encuentran a nadie. " +
      "Busca actualizaciones.",
    reload: "Recargar datos",
    detecting: "Buscando Football Manager…",
    connecting: "Cargando partida…",
    reloading: "Cargando partida…",

    refrozen: {
      title: "Congelado de nuevo desde la última vez",
      waitingTitle: "Lo congelado espera por ahora",
      players: (names) => `Atributos: ${names}`,
      clubs: (names) => `Dinero: ${names}`,
      more: (count) => `y ${format(count)} más`,
      waiting: (count) =>
        `${count === 1 ? "1 sigue recordado" : `${format(count)} siguen recordados`}, pero no se congelan ahora: ` +
        "FM Lens aún no puede escribir en esta versión del juego.",
      dismiss: "Cerrar",
    },

    connect: {
      title: "Conectar con Football Manager 27",
      intro: "Carga una partida en FM y conecta.",
      notRunning: "Football Manager 27 no se está ejecutando.",
      openFailed: (error) => `No se pudo abrir FM: ${error}`,
      stillLoading: "FM aún se está iniciando. Espera al menú principal.",
      several: "Hay más de una copia de FM abierta. Se usa la primera.",
      button: "Conectar",

      bridge: {
        title: "Configuración inicial",
        intro:
          "FM Lens necesita un pequeño ayudante que FM carga al iniciarse. Guarda y cierra FM, y luego Steam, " +
          "antes de configurarlo.",
        library: "Ayudante",
        installed: "Instalado",
        missing: "No instalado",
        launchOption: "Opción de lanzamiento de Steam",
        set: "Configurada",
        notSet: "Sin configurar",
        steamRunning: "Steam está abierto. Ciérralo antes, o añade tú la opción de lanzamiento.",
        setUp: "Configurar",
        remove: "Quitar el ayudante",
        manual:
          "O, en Steam, haz clic derecho en Football Manager 27 › Propiedades › General › Opciones de lanzamiento, " +
          "e introduce:",
        copy: "Copiar",
        copied: "Copiado",
      },
    },
  },

  compatibility: {
    unknownBuild: (game) => `FM Lens aún no se ha probado con ${game}`,
    unknownBuildText:
      "FM Lens no se ha probado con esta versión de FM. Los valores pueden estar mal, así que la edición está " +
      "desactivada.",
    allowedText:
      "La edición está activada donde pasaron las comprobaciones. Haz una copia de tu partida.",
    failedTitle: "Algunos datos parecen incorrectos",
    reloadHint: "Si una partida aún se estaba cargando, «Recargar datos» vuelve a comprobarlo.",
    noDate: "La fecha del juego no ha superado las comprobaciones, así que no se muestran las edades.",
    failed: (names) => `Quedan en solo lectura: ${names}.`,
    join: (names) =>
      names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`,
    allow: "Editar de todos modos",
    allowTitle:
      "Activa la edición hasta que se cierre FM Lens o se vuelva a conectar. Haz antes una copia de tu partida.",
  },

  checks: {
    gameDate: "la fecha del juego",
    players: "los datos de los jugadores",
    positions: "las posiciones",
    attributes: "los atributos",
    personality: "la personalidad",
    liveValues: "la energía, el ritmo de competición, el cansancio y la moral",
    contracts: "los contratos",
    teams: "los equipos",
    staff: "el personal",
    clubs: "los clubes",
    nations: "los países",
    officials: "los árbitros",
  },

  update: {
    relaunch: "Reiniciar para actualizar",
    available: (version) => `FM Lens ${version} ya está disponible`,
    download: "Descargar",
    installFailed: (reason) => `No se ha podido actualizar: ${reason}. Descárgala desde su página.`,
    later: "Más tarde",
    whatsNew: (version) => `Novedades de FM Lens ${version}`,
    releaseNotes: "Notas de la versión",
    dismiss: "Cerrar",
    changes: {
      "0.5.3": [
        "Los archivos, los ajustes y el ayudante de Steam usan ahora el nombre FM Lens. Tu configuración se ha conservado.",
      ],
      "0.5.2": [
        "Informar de un problema, en Ajustes, abre un informe de error con tus versiones y cambios ya rellenados.",
        "Cuando FM mueve sus datos, FM Lens vuelve a leer la partida solo: ya no hace falta pulsar Recargar datos.",
        "Las actualizaciones se instalan en segundo plano. Pulsa Reiniciar para actualizar, al pie de la ventana, cuando te venga bien.",
      ],
    },
  },

  edit: {
    appliedTitle: "Aplicado",
    unknownNation: "País desconocido",
    edit: "Editar",
    editTitle: "Cambiar los valores de este perfil en el juego",
    startFailed: (reason) => `No se ha podido empezar a editar: ${reason}`,
    positionRating: (position) => `Valoración de ${position}`,
    was: (value) => `antes: ${value}`,
    invalid: (min, max) => `Introduce un número entero de ${min} a ${max}`,
    least: (value) => `Mín.: ${value}`,
    most: (value) => `Máx.: ${value}`,
    invalidDate: (from, to) => `Introduce una fecha del ${from} al ${to}`,
    invalidMoney: (from, to) => `Introduce un importe entero de ${from} a ${to}`,
    invalidPercentage: (from, to) => `Introduce un porcentaje entero de ${from} a ${to}`,
    invalidDecimal: (from, to) => `Introduce un número con hasta dos decimales de ${from} a ${to}`,
    percent: "%",
    yes: "Sí",
    no: "No",
    none: "ninguno",

    // El pie
    footer: "Editando",
    changes: changeCount,
    invalidCount: (count) => (count === 1 ? "1 no válido" : `${count} no válidos`),
    review: "Revisar",
    reviewList: "Cambios por aplicar",
    discard: "Descartar",
    apply: "Aplicar",
    applying: "Aplicando…",
    applyBlocked: "Corrige antes los valores no válidos",
    done: "Hecho",
    confirmDiscard: (count) => `¿Descartar ${changes(count)}?`,
    keepEditing: "Seguir editando",

    // Tras aplicar
    applied: (count) =>
      count === 0
        ? "No se ha aplicado ningún cambio"
        : count === 1
          ? "1 cambio aplicado. Se verá en FM cuando pulses Continuar."
          : `${format(count)} cambios aplicados. Se verán en FM cuando pulses Continuar.`,
    nothingToChange: "Nada que cambiar. FM ya tiene estos valores.",
    refused: (label, reason) => `${label}: ${reason}`,
    rereadFailed: (reason) => `No se han podido volver a leer los valores: ${reason}`,
    dismiss: "Cerrar",
  },

  changes: {
    nav: "Cambios",
    title: "Cambios de esta sesión",
    swappedWith: (name) => `Intercambiado por ${name}`,
    fee: (amount) => `Traspaso: ${amount}`,
    joins: (date) => `Se incorpora el ${date}`,
    healed: (count) => (count === 1 ? "1 lesión curada" : `${format(count)} lesiones curadas`),
    injuryAdded: "Lesión añadida",
    lifted: (count) => (count === 1 ? "1 sanción levantada" : `${format(count)} sanciones levantadas`),
    keptPlaying: (date) => (date === null ? "Seguirá jugando" : `Retirada del ${date} evitada`),
    count: (total, undone) => {
      const count = changeCount(total);
      if (undone === 0) {
        return count;
      }
      return `${count} · ${undone === 1 ? "1 deshecho" : `${format(undone)} deshechos`}`;
    },
    empty:
      "Aún no hay cambios. Abre un jugador, un miembro del personal o un club y elige Editar, o usa Edición " +
      "masiva en una lista.",
    columns: {
      time: "Hora",
      name: "Nombre",
      field: "Campo",
      change: "Cambio",
      status: "Estado",
    },
    kinds: { player: "Jugador", staff: "Personal", club: "Club", nation: "País", official: "Árbitro" },
    stored: (change) => `valor interno ${change}`,
    undone: (time) => `Deshecho a las ${time}`,
    earlierGame: "Partida anterior",
    undo: "Deshacer",
    undoTitle: (label) => `Volver a escribir en el juego el valor anterior de ${label}`,
    batch: "Edición masiva",
    batchCount: (total, remaining) =>
      remaining === 0 ? `${changes(total)} · todos deshechos` : `${changes(total)} · ${format(remaining)} sin deshacer`,
    showChanges: "Mostrar cambios",
    hideChanges: "Ocultar cambios",
    undoBatch: "Deshacer edición masiva",
    undoBatchTitle: (remaining) =>
      "Volver a escribir en el juego los valores anteriores de esta edición masiva " +
      (remaining === 1 ? "(1 aún vigente)" : `(${format(remaining)} aún vigentes)`),

    // Páginas
    pages: "Páginas de la lista",
    batchPages: "Páginas de los cambios de esta edición masiva",
    previous: "Anterior",
    next: "Siguiente",
    range: (first, last, total) => `${format(first)}–${format(last)} de ${format(total)}`,
  },

  export: {
    button: "Exportar",
    buttonTitle:
      "Escribir los jugadores que muestra la lista en un archivo CSV o JSON, para una hoja de cálculo o un script",
    title: "Exportar jugadores",
    scope: (count) =>
      count === 0
        ? "Ningún jugador coincide con la búsqueda y los filtros."
        : `${count === 1 ? "1 jugador" : `${format(count)} jugadores`}: lo que seleccionan la búsqueda y los ` +
          "filtros de la lista, en su orden.",
    formatLabel: "Formato",
    formats: {
      csv: "CSV, separado por comas",
      csvSemicolon: "CSV, separado por punto y coma",
      json: "JSON",
    },
    formatHints: {
      csv: "Para la mayoría de hojas de cálculo y scripts",
      csvSemicolon: "Para Excel donde los decimales se escriben con coma: en español, turco o alemán, por ejemplo",
      json: "Para scripts: las posiciones, los atributos y la personalidad como objetos propios",
    },
    contents:
      "Habilidades, posiciones, atributos (también los ocultos), personalidad, reputación, partidos " +
      "internacionales y contratos. El dinero va en libras.",
    export: "Exportar",
    exporting: "Exportando…",
    done: (count, file) =>
      `${count === 1 ? "1 jugador exportado" : `${format(count)} jugadores exportados`} a ${file}`,
    folder: (folder) => `en ${folder}`,
    skipped: (count) =>
      `${count === 1 ? "1 jugador cambió" : `${format(count)} jugadores cambiaron`} en el juego mientras se ` +
      "leían, y se dejaron fuera.",
    open: "Abrir",
    openTitle: "Abrir el archivo con la aplicación que tu sistema usa para él",
    show: "Mostrar en la carpeta",
    showTitle: "Mostrar el archivo en su carpeta",
    close: "Cerrar",
  },

  massEdit: {
    button: "Edición masiva",
    buttonTitle: "Cambiar valores de todo lo que muestra la lista, con una vista previa antes",
    title: {
      player: "Edición masiva de jugadores",
      staff: "Edición masiva de personal",
      club: "Edición masiva de clubes",
    },

    // A qué se aplica
    scope: (entity, total) =>
      total === 1
        ? `El ${nouns[entity].one} que muestra ahora la lista (búsqueda y filtros)`
        : `Los ${entityCount(entity, total)} que muestra ahora la lista (búsqueda y filtros)`,
    scopeAll: (shown) => `Son todas las coincidencias, no solo las ${format(shown)} primeras filas en pantalla.`,
    scopeNone: (entity) =>
      `Ningún ${nouns[entity].one} coincide con la búsqueda y los filtros, así que no hay nada que cambiar.`,
    scopeTooMany: (entity, total, limit) =>
      `Los ${entityCount(entity, total)} que muestra la lista son más de los que admite una edición masiva ` +
      `(${format(limit)}). Acota antes la búsqueda o los filtros.`,
    loadingFields: "Leyendo los campos…",
    fieldsFailed: (reason) => `No se han podido leer los campos: ${reason}`,

    // Los campos que cambiar
    groups: {
      ability: "Habilidad",
      technical: "Atributos técnicos",
      mental: "Atributos mentales",
      physical: "Atributos físicos",
      goalkeeping: "Atributos de portero",
      hidden: "Atributos ocultos",
      feet: "Pies",
      coaching: "Atributos de entrenamiento",
      knowledge: "Atributos de conocimiento",
      medical: "Atributos médicos",
      positions: "Posiciones",
      personality: "Personalidad",
      reputation: "Reputación",
      international: "Internacional",
      contract: "Contrato",
      facilities: "Instalaciones",
      finances: "Finanzas",
      stadium: "Estadio",
      traits: "Características",
      health: "Médico",
      other: "Otros",
    },
    fieldsLabel: "Campos que cambiar",
    row: (position) => `Cambio ${position}`,
    field: "Campo",
    operation: "Operación",
    operations: { set: "Fijar en", add: "Sumar", scale: "Escalar al %" },
    values: { set: "Valor", add: "Cantidad", scale: "Porcentaje" },
    addTitle: "Se suma a cada valor tal como se muestra; un número negativo resta",
    addPointsTitle: "Puntos porcentuales sumados a cada valor (70 % más 10 es 80 %); un número negativo resta",
    rangeHint: (min, max) => `${format(min)}–${format(max)}`,
    amountHint: (max) => `±${format(max)}`,
    ofCurrent: "% del valor actual",
    percentTitle:
      "Un porcentaje del valor actual: 100 lo mantiene, 110 lo sube una décima parte, 50 lo reduce a la mitad",
    invalidAdd: (min, max) => `Introduce un número entero de ${format(min)} a ${format(max)}`,
    invalidPercent: (min, max) => `Introduce un porcentaje entero de ${min} a ${max}`,
    dateSetOnly: "Una fecha solo se puede fijar",
    addField: "Añadir un campo",
    addFieldFull: (max) => `Una edición masiva cambia hasta ${max} campos`,
    remove: "Quitar este campo",
    removeLast: "Una edición masiva necesita al menos un campo",

    // La vista previa
    preview: "Vista previa",
    previewing: "Generando la vista previa…",
    previewBlocked: "Rellena cada campo con un valor válido para ver la vista previa",
    summary: (entity, preview) =>
      [
        preview.changes === 0
          ? "Ningún cambio"
          : `${changes(preview.changes)} en ${format(preview.targets - preview.unchanged)} de ` +
            entityCount(entity, preview.targets),
        preview.unchanged > 0 &&
          (preview.unchanged === 1
            ? "1 ya tiene estos valores"
            : `${format(preview.unchanged)} ya tienen estos valores`),
        preview.skippedCount > 0 && valuesLeftAlone(preview.skippedCount),
      ]
        .filter(Boolean)
        .join(" · "),
    tableLabel: "Cambios que haría la edición masiva",
    columns: { name: "Nombre", field: "Campo", change: "Cambio", reason: "Motivo" },
    more: (count) => `y ${format(count)} más`,
    skippedHeading: valuesLeftAlone,
    skippedLabel: "Valores que la edición masiva deja sin tocar",

    // Aplicar y deshacer
    apply: "Aplicar",
    applying: "Aplicando…",
    applyTitle: (count) => `Escribir ${changes(count)} en el juego`,
    applyFirst: "Genera antes la vista previa de la edición masiva",
    applyNothing: "La vista previa no tiene cambios que escribir",
    hint: "Nada cambia en FM hasta que pulsas Aplicar.",
    applied: (count) =>
      count === 0
        ? "No se ha escrito ningún cambio"
        : count === 1
          ? "1 cambio aplicado"
          : `${format(count)} cambios aplicados`,
    failure: (name, label, reason) => `${name} · ${label}: ${reason}`,
    undo: "Deshacer esta edición masiva",
    undoing: "Deshaciendo…",
    undoTitle: "Volver a escribir en el juego los valores anteriores de esta edición masiva",
    undone: (count) =>
      count === 0
        ? "No se ha deshecho nada"
        : count === 1
          ? "1 cambio deshecho"
          : `${format(count)} cambios deshechos`,
    undoFailure: (who, reason) => `${who}: ${reason}`,
    changeNumber: (id) => `Cambio ${id}`,
    close: "Cerrar",
  },

  comparison: {
    compare: "Comparar",
    add: "Añadir a la comparación",
    remove: "Quitar de la comparación",
    full: (max) => `Una comparación admite hasta ${max} jugadores. Quita uno para añadir a este jugador.`,

    // La bandeja bajo la lista de jugadores
    trayLabel: "Jugadores que comparar",
    removePlayer: (name) => `Quitar de la comparación: ${name}`,
    clear: "Vaciar",
    open: (count) => `Comparar (${count})`,

    // El diálogo
    title: "Comparación",
    hint: "Se resalta el mejor valor de cada fila.",
    tooFew: "Añade al menos dos jugadores para compararlos.",
    loading: "Cargando los jugadores…",
    tableLabel: "Valores de los jugadores comparados",
    highest: "el más alto",
    lowest: "el más bajo",
    profile: "Perfil",
    close: "Cerrar",
  },

  move: {
    button: "Traspasar",
    buttonTitle: "Traspasar a este jugador a otro club en el juego, por un precio si quieres",

    // El diálogo
    title: "Traspaso",
    from: "Origen",
    to: "Destino",

    modeLabel: "Tipo de movimiento",
    modeMove: "Traspasar a un club",
    modeSwap: "Intercambiar por un jugador",
    modeLoan: "Ceder a un club",

    // El club
    searchLabel: "Buscar el club al que traspasar",
    resultsLabel: "Clubes encontrados",
    searching: "Buscando clubes…",
    searchFailed: (reason) => `No se han podido buscar los clubes: ${reason}`,
    more: (count) => `y ${format(count)} más; escribe para acotar la búsqueda`,
    change: "Elegir otro club",

    // El precio
    feeHeading: "Precio",
    fee: "Precio del traspaso",
    feeHint: "Déjalo vacío para un traspaso gratuito",
    feeInvalid: (max) => `Introduce un importe entero, de 0 a ${max}`,
    pays: (club, fee, balance, budget) =>
      `${club} paga ${fee}: saldo ${balance}${budget === null ? "" : `, presupuesto de fichajes ${budget}`}`,
    receives: (club, fee, balance) => `${club} recibe ${fee}: saldo ${balance}`,
    noFinances: (club) => `${club} no tiene finanzas en FM, así que su dinero no cambia`,

    // El contrato
    wageInvalid: "Introduce un importe entero, 0 o más",
    expiresInvalid: "Introduce una fecha",

    // El traspaso
    chooseClub: "Elige el club al que traspasar al jugador.",
    fixTerms: "Corrige antes el precio o los valores del contrato.",
    checking: "Comprobando el traspaso…",
    route: (from, to) => `${from} → ${to}`,
    doesHeading: "Qué hace el traspaso",
    does: [
      "Se une al primer equipo del nuevo club",
      "Contrato con fecha del día del juego; se le quita el dorsal",
      "Sale de las listas de transferibles y cedibles",
      "El salario y el fin de contrato solo cambian si fijas otros nuevos",
      "El precio sale del saldo y del presupuesto de fichajes del comprador, y entra en el saldo del vendedor",
      "Cualquier capitanía en el club anterior queda vacante",
      "El historial de traspasos del juego aún no lo recoge",
      "Aparece en Cambios, donde deshacerlo revierte de una vez el traspaso y el precio",
    ],

    // El intercambio
    swapTitle: "Intercambiar por un jugador",
    swapWith: "Intercambiar por",
    playerSearchLabel: "Buscar el jugador por el que intercambiar",
    playerSearch: "Buscar jugadores de este club por nombre",
    playersLabel: "Jugadores encontrados",
    playersSearching: "Buscando jugadores…",
    playersSearchFailed: (reason) => `No se han podido buscar los jugadores: ${reason}`,
    playersEmpty: (query) =>
      query === "" ? "Este club no tiene jugadores." : `Ningún jugador de este club coincide con «${query}».`,
    changePlayer: "Elegir otro jugador",

    swapContract: "Cada jugador conserva su contrato; los salarios y los fines de contrato no cambian.",
    // Mover a un miembro del personal
    staffButtonTitle: "Mover a este miembro del personal a otro club en el juego",
    staffChooseClub: "Elige el club al que mover a este miembro del personal.",
    staffContract: "Conserva el puesto, el salario y el fin de contrato; el contrato lleva la fecha del día del juego.",
    staffDoes: [
      "Se une al nuevo club en los departamentos en los que trabaja (médico, técnico, ojeo)",
      "Mismo puesto, salario y fin de contrato; el contrato lleva la fecha del día del juego",
      "Del mánager de un equipo, al que apunta el propio equipo, se encarga el juego",
      "Aparece en Cambios, donde se puede deshacer",
    ],
    swapChooseClub: "Elige el club del jugador por el que intercambiar.",
    swapChoosePlayer: "Elige el jugador por el que intercambiar.",
    swapChecking: "Comprobando el intercambio…",
    swapRoute: (player, from, to, other) => `${player}: ${from} → ${to}\n${other}: ${to} → ${from}`,
    swapDoesHeading: "Qué hace el intercambio",
    swapDoes: [
      "Cada uno se une al primer equipo del club del otro",
      "Contratos con fecha del día del juego; se les quitan los dorsales",
      "Ambos salen de las listas de transferibles y cedibles",
      "Cualquier capitanía en sus clubes anteriores queda vacante",
      "No se paga ningún precio; la trayectoria no se actualiza",
      "Aparece en Cambios como un solo cambio, que deshace los dos movimientos",
    ],

    // El pie
    hint: "Nada cambia en FM hasta que pulsas Traspasar.",
    move: "Traspasar",
    moving: "Traspasando…",
    cancel: "Cancelar",
    swapHint: "Nada cambia en el juego hasta que pulsas Intercambiar.",
    swap: "Intercambiar",
    swapping: "Intercambiando…",
    loanTitle: "Cesión",
    loanChooseClub: "Elige el club al que cederlo.",
    loanEndsAfterToday: "Elige una fecha posterior a hoy",
    joinsFromToday: "Elige hoy o una fecha posterior",
    loanDoes: [
      "FM inicia la cesión, desde hoy hasta el fin de la cesión",
      "Mantiene su contrato con su club",
      "Deshacer en Cambios pone el fin de la cesión en hoy. FM la termina al día siguiente",
    ],
    loanDoesEnding: [
      "FM inicia la cesión, desde hoy hasta el fin de la cesión",
      "Mantiene su contrato con su club",
      "Deshacer en Cambios termina la cesión y vuelve a su club",
    ],
    loanHint: "Nada cambia en FM hasta que pulses Ceder.",
    loan: "Ceder",
    loaning: "Cediendo…",
    signButton: "Fichar",
    signButtonTitle: "Ficharlo por un club",
    signTitle: "Fichaje",
    signChooseClub: "Elige el club que lo ficha.",
    signDoes: [
      "FM lo ficha él mismo, con sus propias condiciones",
      "El sueldo o el fin de contrato que pongas sustituye al de FM",
      "Deshacer en Cambios lo deja libre de nuevo",
    ],
    signLaterDoes: [
      "FM cierra el fichaje hoy y se incorpora ese día",
      "FM fija su contrato ese día, con sus propias condiciones",
      "Deshacer en Cambios cancela el fichaje",
    ],
    signHint: "Nada cambia en FM hasta que pulses Fichar.",
    sign: "Fichar",
    signing: "Fichando…",
  },

  ties: {
    heading: "Nacionalidad y formación local",
    nationalities: "Nacionalidades secundarias",
    trainedInNation: "Formado en el país",
    trainedAtClub: "Formado en el club",
    none: "Ninguna",
    rules: {
      1: "Formado localmente 15-21",
      2: "Formado localmente 0-21",
      5: "Formado localmente 15-21 (sin cesiones)",
      10: "Formado localmente 0-19 (1 año)",
    },
    rule: (code) => `Regla de formación local ${format(code)}`,

    // El botón y su diálogo
    change: "Cambiar",
    changeTitle: "Cambiar las nacionalidades secundarias y la formación local de este jugador en el juego",
    title: "Nacionalidad y formación local",
    hint: "Cada cambio llega a FM al momento. Puedes deshacerlo en Cambios.",
    full:
      "El juego hizo la lista de este jugador justo del tamaño de lo que contiene: se puede cambiar o quitar una " +
      "nacionalidad o una formación, pero no añadir.",
    nationOf: (name) => `País en lugar de ${name}`,
    ruleOf: (name) => `Regla de formación local para ${name}`,
    remove: "Quitar",
    removeTitle: (name) => `Quitar ${name}`,
    addNationality: "Añadir una nacionalidad…",
    addNation: "Añadir un país…",
    newRule: "Regla de formación local del nuevo país",
    add: "Añadir",
    clubNote: "A un club se le puede dar otra regla o quitarlo; los clubes los añade el propio juego.",
    working: "Escribiendo en el juego…",
    close: "Cerrar",
  },

  lists: {
    likesTitle: "Cambiar en el juego cuánto le gusta o disgusta cada persona y club",
    strengthOf: (name) => `Intensidad para ${name}`,
    languagesTitle: "Cambiar en el juego cómo de bien habla cada idioma",
    levelOf: (name) => `Nivel de ${name}`,
    raisedBack: "FM lo vuelve a subir por su cuenta",
    injuriesTitle: "Cambiar cuántos días dura cada lesión",
    daysOut: "Días de baja",
    daysOf: (name) => `Días de baja por ${name}`,
    save: "Guardar",
  },

  clauses: {
    change: "Cambiar",
    changeTitle: "Cambia en el juego las primas y cláusulas de este jugador",
    title: "Primas y cláusulas",
    hint: "Cada cambio llega a FM al momento. Puedes deshacerlo en Cambios.",
    full:
      "El juego hizo la lista de este contrato justo del tamaño de lo que contiene: se puede cambiar o quitar una " +
      "prima o cláusula, pero no añadir una cláusula de rescisión.",
    amountOf: (name) => `Importe de ${name}`,
    conditionOf: (name) => `Condición de ${name}`,
    save: "Guardar",
    remove: "Quitar",
    removeTitle: (name) => `Quitar ${name}`,
    addRelease: "Añadir una cláusula de rescisión",
    releaseAmount: "Importe de la nueva cláusula de rescisión",
    add: "Añadir",
    outOfRange: (max) => `Escribe un número entero de 0 a ${max}.`,
    working: "Escribiendo en el juego…",
    close: "Cerrar",
  },

  templates: {
    button: "Clonar y plantillas",
    title: "Clonar y plantillas",
    groups: {
      ability: "CA / PA",
      attributes: "Atributos (también los ocultos)",
      personality: "Personalidad",
      positions: "Posiciones",
      traits: "Características",
    },
    copyHeading: "Copiar de un jugador",
    findPlayer: "Buscar jugador",
    found: "Jugadores encontrados",
    freeAgent: "Libre",
    capture: (name) => (name ? `Copiar a ${name}` : "Copiar jugador"),
    libraryHeading: "Plantillas guardadas",
    library: "Plantilla",
    choose: "Elige una plantilla",
    noneSaved: "No hay plantillas guardadas",
    name: "Nombre",
    save: "Guardar",
    remove: "Eliminar",
    fieldCount: (count) => (count === 1 ? "1 campo" : `${format(count)} campos`),
    jsonHeading: "Importar o exportar JSON",
    json: "JSON de la plantilla",
    loadJson: "Cargar JSON",
    showJson: "Ver JSON",
    importFile: "Importar archivo",
    applyHeading: (total, query) =>
      `Aplicar a ${total === 1 ? "1 jugador" : `${format(total)} jugadores`}${query ? ` que coinciden con «${query}»` : ""}`,
    limit: "Solo estos ID de jugador",
    limitPlaceholder: "Todos",
    preview: "Vista previa",
    previewLabel: "Vista previa de la plantilla",
    summary: (targets, changes, skipped, unchanged) =>
      `${targets === 1 ? "1 jugador" : `${format(targets)} jugadores`} · ${changeCount(changes)} · ` +
      `${format(skipped)} omitidos · ${format(unchanged)} ya puestos`,
    tableLabel: "Cambios que se aplicarán",
    columns: { player: "Jugador", uid: "ID", field: "Campo", change: "Cambio" },
    firstRows: (count) => `Se muestran los primeros ${format(count)} cambios.`,
    skipped: "Omitidos",
    apply: (count) => (count === 0 ? "Aplicar" : `Aplicar ${changes(count)}`),
    applied: (count) => (count === 0 ? "No ha cambiado nada." : `${changes(count)} aplicados.`),
    undo: "Deshacer",
    undone: (count) => (count === 0 ? "No se ha deshecho nada." : `${changes(count)} deshechos.`),
    working: "Trabajando…",
    close: "Cerrar",
    savedNotice: "Plantilla guardada.",
    loadedNotice: "Plantilla cargada. Guárdala para conservarla.",
    removedNotice: "Plantilla eliminada.",
    nameTaken: "Ya hay una plantilla con ese nombre. Elige otro.",
    libraryFull: (max) => `Puedes guardar hasta ${max} plantillas. Elimina una antes.`,
    tooBig: "Los archivos de plantilla deben ocupar menos de 128 KB.",
    invalid: "No es una plantilla de jugador de FM Lens.",
    badIds: "Escribe los ID de jugador separados por comas o espacios.",
  },

  release: {
    button: "Rescindir",
    buttonTitle: "Rescindir el contrato de este jugador con su club en el juego: pasa a ser agente libre",

    // El diálogo
    title: "Rescisión",
    from: "Sale de",
    checking: "Comprobando la rescisión…",
    ready: (club) => `${club} → agente libre`,
    doesHeading: "Qué hace la rescisión",
    does: [
      "Sale de todos los equipos del club y su contrato termina: es agente libre y cualquier club puede ficharlo",
      "Nadie cobra nada",
      "Cualquier capitanía en el club queda vacante",
      "El historial de traspasos del juego no lo recoge",
      "Aparece en Cambios, donde deshacerla devuelve al jugador con el mismo contrato",
    ],

    // El pie
    hint: "Nada cambia en FM hasta que pulsas Rescindir.",
    release: "Rescindir",
    releasing: "Rescindiendo…",
    cancel: "Cancelar",
  },

  endLoan: {
    button: "Terminar cesión",
    buttonTitle: "Termina su cesión. Vuelve a su club.",

    // El diálogo
    title: "Terminar cesión",
    from: "Cedido en",
    checking: "Comprobando la cesión…",
    ready: (from, to) => `${from} → ${to}`,
    doesHeading: "Qué pasa",
    does: [
      "FM termina la cesión, hoy mismo",
      "Vuelve a su club, con el contrato que tiene allí",
      "FM publica su noticia del fin de la cesión",
      "Deshacer en Cambios vuelve a iniciar la cesión hasta su fin anterior",
    ],

    // El pie
    hint: "Nada cambia en FM hasta que pulsas Terminar cesión.",
    end: "Terminar cesión",
    ending: "Terminando…",
    cancel: "Cancelar",
  },

  cancelTransfer: {
    button: "Cancelar traspaso",
    buttonTitle: "Cancela el traspaso que FM acordó para más adelante.",

    // El diálogo
    title: "Cancelar traspaso",
    from: "Se incorpora a",
    checking: "Comprobando el traspaso…",
    ready: (dates) => `Previsto para ${dates}`,
    doesHeading: "Qué pasa",
    does: ["FM cancela el acuerdo él mismo, como su propio editor", "Se queda donde está", "No se puede deshacer"],

    // El pie
    hint: "Nada cambia en FM hasta que pulsas Cancelar traspaso.",
    confirm: "Cancelar traspaso",
    cancelling: "Cancelando…",
    cancel: "Mantenerlo",
  },

  squad: {
    teamsLabel: "Equipo",
    teams: {
      first: "Primer equipo",
      b: "Equipo B",
      age: (limit) => `Sub-${limit}`,
      other: (place) => `Equipo ${place}`,
    },
    noTeams: "Este club no tiene equipos.",
    loading: "Leyendo la plantilla…",
    empty: "No hay jugadores en este equipo.",

    // Sobre la tabla
    players: (count) => entityCount("player", count),
    averageAge: (age) => `edad media ${age}`,
    captains: (captain, viceCaptain) => `Capitán: ${captain} · Vicecapitán: ${viceCaptain}`,

    // Las acciones sobre todo el equipo
    actionsLabel: "Acciones sobre todo el equipo",
    healAll: (injured) =>
      injured === 0
        ? "Curar a todos"
        : `Curar a todos (${injured === 1 ? "1 lesionado" : `${format(injured)} lesionados`})`,
    healAllTitle: "Curar a todo el equipo",
    healNone: "Nadie en este equipo está lesionado",
    liftAll: (banned) =>
      banned === 0
        ? "Levantar sanciones"
        : `Levantar sanciones (${banned === 1 ? "1 sancionado" : `${format(banned)} sancionados`})`,
    liftAllTitle: "Levantar todas las sanciones del equipo",
    liftNone: "Nadie en este equipo está sancionado",
    inspireAll: "Motivar a todos",
    inspireAllTitle: "Moral al máximo para todos",
    refreshAll: "Recuperar a todos",
    refreshAllTitle:
      "Energía y ritmo de competición al máximo, y todos totalmente descansados",
    maxCohesion: "Cohesión al máximo",
    maxCohesionTitle: "Todos los jugadores totalmente familiarizados con el club (experimental)",
    maxTactics: "Táctica al máximo",
    maxTacticsTitle: "Todos los jugadores totalmente familiarizados con la táctica del equipo",
    maxAll: "Atributos al máximo",
    maxAllTitle:
      "Todos los atributos a 20 para todos (propensión a lesiones y juego sucio a 1)",
    hint:
      "Incluye a los cedidos. Puedes deshacerlo en Cambios.",

    // Lo que hizo una acción
    written: (count) =>
      count === 0
        ? "No se ha escrito ningún cambio"
        : count === 1
          ? "1 cambio escrito"
          : `${format(count)} cambios escritos`,
    refused: (name, reason) => `${name}: ${reason}`,
    undo: "Deshacer",
    undoTitle: "Volver a escribir en el juego los valores anteriores de estos cambios",

    // Capitanes
    captainShort: "C",
    viceCaptainShort: "VC",
    menuLabel: (name) => `Capitanía de ${name}`,
    menuTitle: "Capitanía",
    makeCaptain: "Nombrar capitán",
    makeViceCaptain: "Nombrar vicecapitán",
    nowCaptain: (name) => `${name} es ahora el capitán`,
    nowViceCaptain: (name) => `${name} es ahora el vicecapitán`,
    noCaptain: "Ahora nadie es capitán",
    noViceCaptain: "Ahora nadie es vicecapitán",

    // La tabla
    tableLabel: (team) => `Jugadores del equipo: ${team}`,
    columns: {
      name: "Nombre",
      position: "Pos.",
      age: "Edad",
      currentAbility: "HA",
      potentialAbility: "HP",
      condition: "Energía",
      matchSharpness: "Ritmo",
      jadedness: "Fatiga",
      morale: "Moral",
      actions: "Capitanía",
    },
    sortBy: (by) => `Ordenar por ${by}`,
    sortNames: {
      name: "nombre",
      position: "posición",
      age: "edad",
      currentAbility: "habilidad actual",
      potentialAbility: "habilidad potencial",
      condition: "energía",
      matchSharpness: "ritmo de competición",
      jadedness: "fatiga",
      morale: "moral",
    },

    // Las etiquetas tras un nombre
    injured: "Lesionado",
    injuredTitle: (count) => (count === 1 ? "1 lesión" : `${format(count)} lesiones`),
    banned: "Sancionado",
    bannedTitle: (count) => (count === 1 ? "1 sanción" : `${format(count)} sanciones`),
    onLoan: "Cedido",
    onLoanTitle: "Cedido a otro club",
    loanee: "En préstamo",
    loaneeTitle: "Aquí cedido por otro club",
    elsewhere: "En otro equipo",
    elsewhereTitle: "Juega en otro equipo del club",
  },

  game: {
    name: "Football Manager",
    storefronts: {
      gamePass: "Game Pass",
      steam: "Steam",
      epic: "Epic Games",
      unknown: "Tienda desconocida",
    },
    steamBuild: (id) => `(compilación ${id})`,
  },

  errors,
};
