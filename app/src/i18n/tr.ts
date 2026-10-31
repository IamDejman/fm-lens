// The Turkish text of the UI: the same shape as `en.ts` (a missing or extra key fails the build), worded the way the
// Turkish edition of Football Manager words things. The comments in `en.ts` say what each string is for.
//
// Turkish has no plural after a number ("3 değişiklik"), and its case endings follow the word they end, not a
// number, so the sentences are built to put an ending on a noun ("oyuncunun"), never on a figure.

import type { Entity, MassOperationKind, MassPreview, PlayerSort, Storefront } from "../types";
import type { Strings } from "./en";

const numbers = new Intl.NumberFormat("tr-TR");
const percents = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

/** A count or an amount with the thousands separators of the language: "12.345". */
const format = (value: number) => numbers.format(value);

/** "3 değişiklik", "12.345 değişiklik". */
const changes = (count: number) => `${format(count)} değişiklik`;

/** For the places that say how many changes there are, which may be none: "Değişiklik yok", "3 değişiklik". */
const changeCount = (count: number) => (count === 0 ? "Değişiklik yok" : changes(count));

/** "12 değere dokunulmadı": the ending is on the noun, so the same words do for one and for many. */
const valuesLeftAlone = (count: number) => `${format(count)} değere dokunulmadı`;

/** What each list holds, as the sentences need it: the noun itself, "of the" (genitive) and "in" (locative). */
const nouns: Record<Entity, { plain: string; of: string; in: string }> = {
  player: { plain: "oyuncu", of: "oyuncunun", in: "oyuncuda" },
  staff: { plain: "personel", of: "personelin", in: "personelde" },
  club: { plain: "kulüp", of: "kulübün", in: "kulüpte" },
};

/** "237 oyuncu", "1 personel", "12 kulüp". */
const entityCount = (entity: Entity, count: number) => `${format(count)} ${nouns[entity].plain}`;

const SQUAD_STATUSES: Partial<Record<number, string>> = {
  1: "Yıldız oyuncu",
  2: "Önemli oyuncu",
  5: "Etkili yedek",
};

export const tr: Strings = {
  attributes: {
    // Teknik
    corners: "Korner",
    crossing: "Orta",
    dribbling: "Top Sürme",
    finishing: "Bitiricilik",
    first_touch: "İlk Kontrol",
    free_kicks: "Serbest Vuruş",
    heading: "Kafa Vuruşu",
    long_shots: "Uzaktan Şut",
    long_throws: "Uzun Taç",
    marking: "Markaj",
    passing: "Pas",
    penalty_taking: "Penaltı Kullanma",
    tackling: "Top Kapma",
    technique: "Teknik",
    // Zihinsel
    aggression: "Agresiflik",
    anticipation: "Önsezi",
    bravery: "Cesaret",
    composure: "Soğukkanlılık",
    concentration: "Konsantrasyon",
    decisions: "Karar Alma",
    determination: "Kararlılık",
    flair: "Yaratıcılık",
    leadership: "Liderlik",
    off_the_ball: "Topsuz Alan",
    positioning: "Pozisyon Alma",
    teamwork: "Takım Oyunu",
    vision: "Vizyon",
    work_rate: "Çalışkanlık",
    // Fiziksel
    acceleration: "Hızlanma",
    agility: "Çeviklik",
    balance: "Denge",
    jumping_reach: "Zıplama",
    natural_fitness: "Doğal Kondisyon",
    pace: "Hız",
    stamina: "Dayanıklılık",
    strength: "Güç",
    // Kalecilik (ilk kontrol ve pas Teknik ile ortaktır)
    aerial_reach: "Hava Hakimiyeti",
    command_of_area: "Alan Hakimiyeti",
    communication: "İletişim",
    eccentricity: "Eksantriklik",
    handling: "Top Tutma",
    kicking: "Vuruş",
    one_on_ones: "Bire Bir",
    punching: "Yumrukla Uzaklaştırma (Eğilim)",
    reflexes: "Refleksler",
    rushing_out: "Kaleyi Terk Etme (Eğilim)",
    throwing: "Atış",
    // Gizli
    consistency: "İstikrar",
    dirtiness: "Sertlik",
    important_matches: "Büyük Maçlar",
    injury_proneness: "Sakatlık Eğilimi",
    versatility: "Çok Yönlülük",
    // Ayaklar
    left_foot: "Sol Ayak",
    right_foot: "Sağ Ayak",
  },

  staffAttributes: {
    // Antrenörlük
    attacking: "Hücum",
    defending: "Savunma",
    fitness: "Kondisyon",
    goalkeeping: "Kalecilik",
    possession: "Top Kontrolü",
    set_pieces: "Duran Toplar",
    tactical: "Taktik",
    technical: "Teknik",
    working_with_youngsters: "Gençlerle Çalışma",
    // Zihinsel
    authority: "Otorite",
    determination: "Kararlılık",
    motivating: "Motivasyon",
    people_management: "İnsan Yönetimi",
    // Bilgi
    data_analysis: "Veri Analizi",
    judging_ability: "Oyuncu Yeteneğini Değerlendirme",
    judging_potential: "Oyuncu Potansiyelini Değerlendirme",
    judging_staff: "Personel Değerlendirme",
    negotiating: "Pazarlık",
    tactical_knowledge: "Taktik Bilgisi",
    // Sağlık
    physiotherapy: "Fizyoterapi",
    sports_science: "Spor Bilimi",
  },

  personality: {
    adaptability: "Uyum",
    ambition: "Hırs",
    loyalty: "Sadakat",
    pressure: "Baskıya Dayanıklılık",
    professionalism: "Profesyonellik",
    sportsmanship: "Sportmenlik",
    temperament: "Mizaç",
    controversy: "Tartışmacılık",
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
    training: "Antrenman",
    youth_facilities: "Altyapı Tesisleri",
    youth_coaching: "Altyapı Antrenörlüğü",
    youth_recruitment: "Altyapı Oyuncu Bulma",
    corporate: "Kurumsal",
  },

  supporterTraits: {
    loyalty: "Sadakat",
    passion: "Tutku",
    patience: "Sabır",
    affluence: "Zenginlik",
    temperament: "Mizaç",
    expectations: "Beklentiler",
  },

  supporterMix: {
    hardcore: "Fanatik",
    core: "Çekirdek",
    family: "Aile",
    fair_weather: "Fırsatçı",
    casual: "Ara sıra",
    other: "Diğer",
  },

  jobs: {
    1: "Oyuncu",
    2: "Antrenör",
    4: "Başkan",
    6: "Yönetici",
    12: "Fizyoterapist",
    14: "Gözlemci",
    16: "Teknik Direktör",
    20: "Yardımcı Antrenör",
    22: "Duran Top Antrenörü",
    26: "Kondisyoner",
    34: "Kaleci Antrenörü",
    40: "Spor Bilimi Sorumlusu",
    44: "Baş Gözlemci",
    48: "Spor Bilimci",
    50: "Baş Fizyoterapist",
    58: "Transfer Analisti",
    60: "Performans Analisti",
    64: "Altyapı Sorumlusu",
    // Code 4 is "Başkan" already: the two are told apart, as a job select with two of the same name would not be.
    70: "Kulüp Başkanı",
    86: "Kiralık Oyuncu Sorumlusu",
    88: "Teknik Yönetici",
  },

  fields: {
    current_ability: "Mevcut yetenek",
    potential_ability: "Potansiyel yetenek",
    height: "Boy (cm)",
    "reputation.home": "Yerel itibar",
    "reputation.current": "Güncel itibar",
    "reputation.world": "Dünya itibarı",
    "international.caps": "Milli maç",
    "international.goals": "Milli gol",
    "international.u21_caps": "U21 maç",
    "international.u21_goals": "U21 gol",
    "contract.wage": "Haftalık maaş",
    "contract.expires": "Sözleşme bitişi",
    reputation: "İtibar",
    "facilities.training": "Antrenman tesisleri",
    "facilities.youth_facilities": "Altyapı tesisleri",
    "facilities.youth_coaching": "Altyapı antrenörlüğü",
    "facilities.youth_recruitment": "Altyapı oyuncu bulma",
    "facilities.corporate": "Kurumsal tesisler",
    "finance.balance": "Bakiye",
    "finance.transfer_budget": "Transfer bütçesi",
    "finance.wage_budget": "Maaş bütçesi",
    "finance.total_wage_budget": "Toplam maaş bütçesi",
  },

  profile: {
    close: "Profili kapat",
    loading: "Profil yükleniyor…",
    none: "—",

    // Header
    freeAgent: "Serbest",
    born: "Doğum",
    height: (cm) => `${cm} cm`,
    uid: "UID",
    currentAbility: "Mevcut yetenek",
    currentAbilityShort: "MY",
    potentialAbility: "Potansiyel yetenek",
    potentialAbilityShort: "PY",
    potentialRange: "Potansiyel bir aralık olarak belirlenmiş",

    // Attributes
    technical: "Teknik",
    goalkeeping: "Kalecilik",
    mental: "Zihinsel",
    physical: "Fiziksel",
    hidden: "Gizli",
    feet: "Ayaklar",
    personality: "Kişilik",
    raw: (raw, scale = 100) => `ham ${raw} / ${scale}`,
    lowerIsBetter: "düşük olan daha iyi",
    age: (age) => `${age} yaş`,

    // Positions
    positions: "Pozisyonlar",
    positionsSummary: (best) => `Pozisyon puanları: ${best}`,
    positionTiers: {
      natural: "Doğal",
      accomplished: "Usta",
      competent: "Yeterli",
      unconvincing: "Yetersiz",
      ineffective: "Etkisiz",
    },
    positionTooltip: (position, rating, tier) => `${position} · ${rating} · ${tier}`,

    // Contract
    contract: "Sözleşme",
    wage: "Haftalık maaş",
    wageNote: "sterlin olarak saklanır; FM seçtiğiniz para birimini gösterir",
    signed: "İmza tarihi",
    expires: "Bitiş tarihi",
    joined: "Katılım tarihi",
    squadStatus: "Kadro durumu",
    squadStatusName: (status) => SQUAD_STATUSES[status] ?? `Durum ${status}`,
    squadNumber: "Forma numarası",
    transferListed: "Transfer listesinde",
    loanListed: "Kiralık listesinde",

    // Career
    career: "Kariyer",
    internationalCaps: "Milli maç",
    internationalGoals: "Milli gol",
    u21Caps: "U21 maç",
    u21Goals: "U21 gol",
    askingPrice: "İstenen bedel",
    notSet: "Belirlenmedi",
    reputation: "İtibar",
    reputationHome: "Yerel",
    reputationCurrent: "Güncel",
    reputationWorld: "Dünya",

    // Staff
    you: "Siz",
    youTitle: "Bu kayıtta yönettiğiniz teknik direktör",
    id: "ID",
    job: "Görev",
    unemployed: "İşsiz",
    coaching: "Antrenörlük",
    knowledge: "Bilgi",
    medical: "Sağlık",
    playerCoach: (job) => `${job} (oyuncu-antrenör)`,
    unknownJob: (code) => `Görev ${code}`,
  },

  playerList: {
    nav: "Oyuncular",
    count: (total) => `${format(total)} oyuncu`,
    search: "İsim veya UID ile oyuncu ara",
    summary: (total, shown, sorted) => {
      const count = `${format(total)} oyuncu`;
      if (total <= shown) {
        return count;
      }
      return sorted === null
        ? `${count} · mevcut yeteneğe göre ilk ${shown} gösteriliyor`
        : `${count} · ilk ${shown} gösteriliyor, sıralama: ${sorted.by} (${sorted.ascending ? "artan" : "azalan"})`;
    },
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Bu filtrelere uyan oyuncu yok." : "Oyuncu bulunamadı.";
      }
      return filtered
        ? `“${query}” aramasına ve bu filtrelere uyan oyuncu yok.`
        : `“${query}” aramasına uyan oyuncu yok.`;
    },
    columns: {
      name: "İsim",
      age: "Yaş",
      positions: "Pozisyonlar",
      nation: "Uyruk",
      club: "Kulüp",
      contractExpires: "Sözleşme",
      born: "Doğum",
      currentAbility: "MY",
      potentialAbility: "PY",
      uid: "UID",
    } satisfies Record<PlayerSort | "positions" | "born" | "uid", string>,
    sortBy: (by) => `Sırala: ${by}`,
    // Said as "sıralama: …" and "Sırala: …", so they stand as plain nouns.
    sortNames: {
      currentAbility: "mevcut yetenek",
      potentialAbility: "potansiyel yetenek",
      age: "yaş",
      name: "isim",
      nation: "uyruk",
      club: "kulüp",
      contractExpires: "sözleşme bitişi",
    } satisfies Record<PlayerSort, string>,
    filters: {
      toggle: "Filtreler",
      toggleActive: (count) => `Filtreler, ${count} etkin`,
      clear: "Temizle",
      any: "Tümü",
      position: "Pozisyon",
      age: "Yaş",
      minAge: "En düşük yaş",
      maxAge: "En yüksek yaş",
      minPlaceholder: "Min",
      maxPlaceholder: "Maks",
      minCurrentAbility: "Min MY",
      minCurrentAbilityTitle: "En düşük mevcut yetenek",
      minPotentialAbility: "Min PY",
      minPotentialAbilityTitle: "En düşük potansiyel yetenek",
      abilityPlaceholder: "1–200",
      nation: "Uyruk",
      club: "Kulüp",
      freeAgentsOnly: "Yalnızca serbest oyuncular",
      contractEndsBy: "Sözleşme bitişi (en geç)",
    },
  },

  staffList: {
    nav: "Personel",
    count: (total) => `${format(total)} personel`,
    search: "İsim veya ID ile personel ara",
    summary: (total, shown) =>
      total > shown
        ? `${format(total)} personel · mevcut yeteneğe göre ilk ${shown} gösteriliyor`
        : `${format(total)} personel`,
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Bu filtrelere uyan personel yok." : "Personel bulunamadı.";
      }
      return filtered
        ? `“${query}” aramasına ve bu filtrelere uyan personel yok.`
        : `“${query}” aramasına uyan personel yok.`;
    },
    columns: {
      name: "İsim",
      age: "Yaş",
      job: "Görev",
      club: "Kulüp",
      nation: "Uyruk",
      born: "Doğum",
      currentAbility: "MY",
      potentialAbility: "PY",
      id: "ID",
    },
    filters: {
      job: "Görev",
      anyJob: "Tümü",
      unemployedOnly: "Yalnızca işsizler",
    },
  },

  clubProfile: {
    // Header
    womensClub: "Kadın kulübü",
    founded: (year) => `Kuruluş ${year}`,
    reputationShort: "İtibar",
    reputationTitle: "İtibar",

    facilities: "Tesisler",

    // Supporters
    supporters: "Taraftarlar",
    supporterMix: "Taraftar dağılımı",
    percent: (value) => `%${percents.format(value)}`,
    mixTooltip: (kind, percent) => `${kind} · ${percent}`,

    // Finances
    finances: "Finans",
    balance: "Bakiye",
    transferBudget: "Transfer bütçesi",
    wageBudget: "Maaş bütçesi (harcama)",
    totalWageBudget: "Toplam maaş bütçesi",
    ticketPrice: "Ortalama bilet fiyatı",
    perWeek: "haftalık",
    noFinances: "FM, finansı yalnızca oynanan liglerdeki kulüpler için tutar.",

    // Club info
    info: "Kulüp bilgisi",
    seasonTickets: "Sezonluk biletler",
    socialMedia: "Sosyal medya takipçileri",
  },

  clubList: {
    nav: "Kulüpler",
    count: (total) => `${format(total)} kulüp`,
    search: "İsim veya UID ile kulüp ara",
    summary: (total, shown) =>
      total > shown
        ? `${format(total)} kulüp · itibara göre ilk ${shown} gösteriliyor`
        : `${format(total)} kulüp`,
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Bu filtreye uyan kulüp yok." : "Kulüp bulunamadı.";
      }
      return filtered
        ? `“${query}” aramasına ve bu filtreye uyan kulüp yok.`
        : `“${query}” aramasına uyan kulüp yok.`;
    },
    women: "Kadın",
    columns: {
      name: "İsim",
      reputation: "İtibar",
      founded: "Kuruluş",
      uid: "UID",
    },
    filters: {
      kind: "Gösterilecek kulüpler",
      all: "Tüm kulüpler",
      men: "Erkek kulüpleri",
      women: "Kadın kulüpleri",
    },
  },

  app: {
    stage: "alfa öncesi",
    languageLabel: "Dil",

    noteEditable: "Düzenlemeler yalnızca uyguladığınızda oyuna işlenir. Önce kayıt dosyanızı yedekleyin.",
    noteReadOnly: "Salt okunur: Windows, FMLibreEditor'ın oyuna yazmasına izin vermedi.",
    noteNotConnected: "Siz düzenleyip uygulamadan oyunda hiçbir şey değişmez.",

    notConnected: "Bağlı değil",
    previewTag: "tarayıcı önizlemesi · örnek veriler",
    reload: "Verileri yeniden oku",
    refresh: "Yenile",
    detecting: "Football Manager aranıyor…",
    connecting: "Oyuncular, personel ve kulüpler okunuyor…",
    reloading: "Oyuncular, personel ve kulüpler yeniden okunuyor…",

    connect: {
      title: "Football Manager 27'ye bağlan",
      intro:
        "FMLibreEditor, oyun çalışırken oyunun belleğini okur. " +
        "Oyunu başlatıp bir kayıt yükleyin, ardından bağlanın.",
      notRunning: "Football Manager 27 çalışmıyor.",
      openFailed: (error) => `Oyun açılamadı: ${error}`,
      game: "Oyun",
      gameData: "Oyun verisi",
      loaded: "Yüklendi",
      stillLoading: "Hâlâ yükleniyor; ana menüyü bekleyin",
      process: "İşlem",
      pid: (pid) => `pid ${pid}`,
      several: "Oyunun birden fazla kopyası çalışıyor; ilki kullanılıyor.",
      button: "Bağlan ve oyuncuları, personeli ve kulüpleri oku",
    },
  },

  edit: {
    edit: "Düzenle",
    editTitle: "Bu profilin değerlerini oyunda değiştir",
    startFailed: (reason) => `Düzenleme başlatılamadı: ${reason}`,
    ability: "Yetenek",
    positionRatings: "Pozisyon puanları",
    positionRating: (position) => `${position} puanı`,
    was: (value) => `önceki: ${value}`,
    invalid: (min, max) => `${min} ile ${max} arasında bir tam sayı girin`,
    invalidDate: (from, to) => `${from} ile ${to} arasında bir tarih girin`,
    invalidMoney: (from, to) => `${from} ile ${to} arasında tam sayı bir sterlin tutarı girin`,
    pounds: "£",

    // The footer
    footer: "Düzenleme",
    changes: changeCount,
    invalidCount: (count) => `${count} geçersiz`,
    review: "Gözden geçir",
    reviewList: "Uygulanacak değişiklikler",
    discard: "Vazgeç",
    apply: "Uygula",
    applying: "Uygulanıyor…",
    applyBlocked: "Önce geçersiz değerleri düzeltin",
    done: "Bitti",
    confirmDiscard: (count) => `${format(count)} değişiklikten vazgeçilsin mi?`,
    keepEditing: "Düzenlemeye devam et",

    // After Apply
    applied: (count) => `${changes(count)} uygulandı`,
    nothingToChange: "Değiştirilecek bir şey yok: oyunda bu değerler zaten var.",
    refused: (label, reason) => `${label}: ${reason}`,
    rereadFailed: (reason) => `Değerler geri okunamadı: ${reason}`,
    dismiss: "Kapat",
  },

  changes: {
    nav: "Değişiklikler",
    title: "Bu oturumdaki değişiklikler",
    hint: "En yeniler üstte. Bir değişiklik yalnızca oyun yazdığı değeri hâlâ tutuyorsa geri alınabilir.",
    count: (total, undone) => {
      const count = changeCount(total);
      return undone === 0 ? count : `${count} · ${undone} geri alındı`;
    },
    empty:
      "Henüz değişiklik yok. Bir oyuncu, personel veya kulüp açıp Düzenle düğmesine basın " +
      "ya da bir listede Toplu düzenleme düğmesini kullanın.",
    columns: {
      time: "Saat",
      name: "İsim",
      field: "Alan",
      change: "Değişiklik",
      status: "Durum",
    },
    kinds: { player: "Oyuncu", staff: "Personel", club: "Kulüp" } satisfies Record<Entity, string>,
    stored: (change) => `saklanan ${change}`,
    undone: (time) => `Geri alındı: ${time}`,
    undo: "Geri al",
    undoTitle: (label) => `Eski değeri oyuna geri yaz: ${label}`,
    batch: "Toplu düzenleme",
    batchTitle: (count) => `${changes(count)} yapan bir toplu düzenlemenin parçası`,
    undoBatch: "Toplu düzenlemeyi geri al",
    undoBatchTitle: (remaining) =>
      `Bu toplu düzenlemenin eski değerlerini oyuna geri yaz (${changes(remaining)} hâlâ yerinde)`,
  },

  massEdit: {
    button: "Toplu düzenleme",
    buttonTitle: "Listenin gösterdiği her şeyin değerlerini, önce önizleme yaparak değiştir",
    title: {
      player: "Oyuncuları toplu düzenle",
      staff: "Personeli toplu düzenle",
      club: "Kulüpleri toplu düzenle",
    } satisfies Record<Entity, string>,

    // What it applies to
    scope: (entity, total) => `Listenin şu an gösterdiği ${entityCount(entity, total)} (arama ve filtreler)`,
    scopeAll: (shown) => `Yalnızca ekrandaki ilk ${format(shown)} satır değil, eşleşen her kayıt kapsanır.`,
    scopeNone: (entity) =>
      `Aramaya ve filtrelere uyan ${nouns[entity].plain} yok, bu yüzden değiştirilecek bir şey yok.`,
    scopeTooMany: (entity, total, limit) =>
      `Listenin gösterdiği ${entityCount(entity, total)}, ` +
      `bir toplu düzenlemenin kaldırabileceğinden (${format(limit)}) fazla. ` +
      "Önce aramayı veya filtreleri daraltın.",
    loadingFields: "Alanlar okunuyor…",
    fieldsFailed: (reason) => `Alanlar okunamadı: ${reason}`,

    // The fields to change
    groups: {
      ability: "Yetenek",
      technical: "Teknik özellikler",
      mental: "Zihinsel özellikler",
      physical: "Fiziksel özellikler",
      goalkeeping: "Kalecilik özellikleri",
      hidden: "Gizli özellikler",
      feet: "Ayaklar",
      coaching: "Antrenörlük özellikleri",
      knowledge: "Bilgi özellikleri",
      medical: "Sağlık özellikleri",
      positions: "Pozisyonlar",
      personality: "Kişilik",
      reputation: "İtibar",
      international: "Milli takım",
      contract: "Sözleşme",
      facilities: "Tesisler",
      finances: "Finans",
      other: "Diğer",
    },
    fieldsLabel: "Değiştirilecek alanlar",
    row: (position) => `Değişiklik ${position}`,
    field: "Alan",
    operation: "İşlem",
    operations: { set: "Ayarla", add: "Ekle", scale: "Ölçekle (%)" } satisfies Record<
      MassOperationKind["op"],
      string
    >,
    values: { set: "Değer", add: "Miktar", scale: "Yüzde" } satisfies Record<MassOperationKind["op"], string>,
    addTitle: "Her değere, gösterildiği gibi eklenir; negatif sayı çıkarır",
    rangeHint: (min, max) => `${format(min)}–${format(max)}`,
    amountHint: (max) => `±${format(max)}`,
    ofCurrent: "% (mevcut değerin)",
    percentTitle: "Mevcut değerin yüzdesi: 100 değeri korur, 110 onda bir artırır, 50 yarıya indirir",
    invalidAdd: (min, max) => `${format(min)} ile ${format(max)} arasında bir tam sayı girin`,
    invalidPercent: (min, max) => `${min} ile ${max} arasında tam sayı bir yüzde girin`,
    dateSetOnly: "Tarih yalnızca ayarlanabilir",
    addField: "Alan ekle",
    addFieldFull: (max) => `Bir toplu düzenleme en fazla ${max} alanı değiştirir`,
    remove: "Bu alanı kaldır",
    removeLast: "Bir toplu düzenleme için en az bir alan gerekir",

    // The preview
    preview: "Önizle",
    previewing: "Önizleniyor…",
    previewBlocked: "Önizlemek için her alanı geçerli bir değerle doldurun",
    // "237 oyuncunun 140 tanesi için 312 değişiklik · 97 oyuncuda bu değerler zaten var · 12 değere dokunulmadı";
    // with every target changed: "237 oyuncu için 312 değişiklik".
    summary: (entity: Entity, preview: MassPreview) => {
      const noun = nouns[entity];
      const affected = preview.targets - preview.unchanged;
      return [
        preview.changes === 0
          ? "Değişiklik yok"
          : affected === preview.targets
            ? `${format(preview.targets)} ${noun.plain} için ${changes(preview.changes)}`
            : `${format(preview.targets)} ${noun.of} ${format(affected)} tanesi için ${changes(preview.changes)}`,
        preview.unchanged > 0 && `${format(preview.unchanged)} ${noun.in} bu değerler zaten var`,
        preview.skippedCount > 0 && valuesLeftAlone(preview.skippedCount),
      ]
        .filter(Boolean)
        .join(" · ");
    },
    tableLabel: "Toplu düzenlemenin yapacağı değişiklikler",
    columns: { name: "İsim", field: "Alan", change: "Değişiklik", reason: "Neden" },
    more: (count) => `ve ${format(count)} tane daha`,
    skippedHeading: valuesLeftAlone,
    skippedLabel: "Toplu düzenlemenin dokunmadığı değerler",

    // Apply and undo
    apply: "Uygula",
    applying: "Uygulanıyor…",
    applyTitle: (count) => `Oyuna ${changes(count)} yaz`,
    applyFirst: "Önce toplu düzenlemeyi önizleyin",
    applyNothing: "Önizlemede yazılacak değişiklik yok",
    hint: "Siz uygulamadan oyunda hiçbir şey değişmez.",
    applied: (count) => (count === 0 ? "Hiçbir değişiklik yazılmadı" : `${changes(count)} uygulandı`),
    failure: (name, label, reason) => `${name} · ${label}: ${reason}`,
    undo: "Bu toplu düzenlemeyi geri al",
    undoing: "Geri alınıyor…",
    undoTitle: "Bu toplu düzenlemenin eski değerlerini oyuna geri yaz",
    undone: (count) => (count === 0 ? "Hiçbir şey geri alınmadı" : `${changes(count)} geri alındı`),
    undoFailure: (who, reason) => `${who}: ${reason}`,
    changeNumber: (id) => `Değişiklik ${id}`,
    close: "Kapat",
  },

  game: {
    name: "Football Manager",
    storefronts: {
      gamePass: "Game Pass",
      steam: "Steam",
      epic: "Epic Games",
      unknown: "Bilinmeyen mağaza",
    } satisfies Record<Storefront, string>,
  },
};
