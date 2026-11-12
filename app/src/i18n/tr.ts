import { knownFormationName } from "../formationNames";
// The Turkish text of the UI: the same shape as `en.ts` (a missing or extra key fails the build), worded the way the
// Turkish edition of Football Manager words things. The comments in `en.ts` say what each string is for.
//
// Turkish has no plural after a number ("3 değişiklik"), and its case endings follow the word they end, not a
// number, so the sentences are built to put an ending on a noun ("oyuncunun"), never on a figure.

import type { Entity, MassEntity, MassOperationKind, MassPreview, PlayerSort, SquadSort, Storefront } from "../types";
import { PERCENT_CLAUSES, RELEASE_CLAUSES } from "../clauseKinds";
import type { ErrorTexts, Strings } from "./en";
import { fieldName } from "./fieldNames";

const numbers = new Intl.NumberFormat("tr-TR");
const percents = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

/** A count or an amount with the thousands separators of the language: "12.345". */
const format = (value: number) => numbers.format(value);

/** "3 değişiklik", "12.345 değişiklik". */
const changes = (count: number) => `${format(count)} değişiklik`;

/** For the places that say how many changes there are, which may be none: "Değişiklik yok", "3 değişiklik". */
const changeCount = (count: number) => (count === 0 ? "Değişiklik yok" : changes(count));

/** "12 değere dokunulmadı": the ending is on the noun, so the same words do for one and for many. */
const toFreeze = (frozen: boolean, count: number) =>
  frozen ? `${format(count)} dondurulacak` : `${format(count)} için dondurma kaldırılacak`;

const valuesLeftAlone = (count: number) => `${format(count)} değere dokunulmadı`;

/** What each list holds, as the sentences need it: the noun itself, "of the" (genitive) and "in" (locative). */
const nouns: Record<MassEntity, { plain: string; of: string; in: string }> = {
  player: { plain: "oyuncu", of: "oyuncunun", in: "oyuncuda" },
  staff: { plain: "personel", of: "personelin", in: "personelde" },
  club: { plain: "kulüp", of: "kulübün", in: "kulüpte" },
};

/** "237 oyuncu", "1 personel", "12 kulüp". */
const entityCount = (entity: MassEntity, count: number) => `${format(count)} ${nouns[entity].plain}`;

const SQUAD_STATUSES: Partial<Record<number, string>> = {
  1: "Yıldız oyuncu",
  2: "Önemli oyuncu",
  3: "Düzenli ilk 11 oyuncusu",
  4: "Kadro oyuncusu",
  5: "Etkili yedek",
  7: "Kenarda kalan oyuncu",
  9: "Acil durum yedeği",
  10: "Yükselen yetenek",
  11: "Geleceğin yeteneği",
  13: "Genç oyuncu",
  15: "Birinci kaleci",
  16: "Kupa kalecisi",
  17: "Yerel kupa kalecisi",
  20: "Yedek",
  21: "Acil durum yedeği",
  22: "Gözden çıkarılmış",
};

/** The name of the field a failure names. The sentences put no ending on it: "için" and a colon need none. */
const field = (key: string | undefined) => fieldName(tr, key ?? "");

/** The noun of the kind of record a failure names, or "kayıt" when it names none. */
const recordNoun = (entity: string | undefined) =>
  entity === "player" || entity === "staff" || entity === "club" ? nouns[entity].plain : "kayıt";

/** The reasons the Rust side gives for a field that cannot be changed some way. */
const UNSUPPORTED: Partial<Record<string, string>> = {
  "a date can only be set": "bir tarih yalnızca doğrudan ayarlanabilir",
  "it is changed one person at a time": "bu alan kişi kişi değiştirilir",
  "the new value is not one of the game's own records of that kind":
    "yeni değer, oyunun bu türdeki kendi kayıtlarından biri değil",
  "it holds a value the editor cannot name": "düzenleyicinin adlandıramadığı bir değer tutuyor",
};

const reload = "verileri yeniden okuyup tekrar deneyin";

/** The departments of a club's staff, as `staff.noRoom` names them. */
const STAFF_DEPARTMENTS: Partial<Record<string, string>> = {
  medical: "sağlık ekibi",
  coaching: "antrenör",
  scouting: "gözlemci",
};

/** What a check is about, from the key a failure gives, with a capital. */
const checkName = (key: string | undefined) => {
  const name = (tr.checks as Partial<Record<string, string>>)[key ?? ""] ?? key ?? "";
  return name.charAt(0).toLocaleUpperCase("tr") + name.slice(1);
};

/** The name of a job code a failure gives, as `jobs` below has it. */
const jobName = (code: string | undefined) => (tr.jobs as Partial<Record<number, string>>)[Number(code)] ?? code;

const errors: ErrorTexts = {
  "edit.unknownField": (p) => `Burada “${p.field}” adında düzenlenebilir bir alan yok.`,
  "edit.outOfRange": (p) => `${field(p.field)} için ${p.value} geçersiz: ${p.min} ile ${p.max} arasında olmalı.`,
  "edit.notADate": (p) => `${p.value}, ${field(p.field)} için geçerli bir tarih değil.`,
  "edit.notAChoice": (p) => `${p.value}, ${field(p.field)} için seçilebilecek değerlerden biri değil.`,
  "edit.taken": (p) => `${p.value} numaralı formayı takımda ${p.name ?? "başka bir oyuncu"} giyiyor.`,
  "edit.unsupported": (p) => `${field(p.field)} bu şekilde değiştirilemez: ${UNSUPPORTED[p.reason] ?? p.reason}.`,
  "edit.moved": (p) => `Bu ${recordNoun(p.entity)} oyunun belleğinde yer değiştirmiş; ${reload}.`,
  "edit.noRecord": (p) => `${field(p.field)} burada değiştirilemez: kaydı yok ya da doğrulanamadı.`,
  "edit.unset": (p) => `${field(p.field)} oyunda ayarlanmamış, bu yüzden dokunulmadı.`,
  "edit.implausible": (p) =>
    `${field(p.field)} şu an ${p.value} okunuyor ve bu alan böyle bir değer alamaz; güvenlik için dokunulmadı.`,
  "edit.notApplied": (p) => `${field(p.field)}: ${p.wrote} yazıldı ama geri ${p.read} okundu.`,
  "edit.conflict": (p) => `${field(p.field)} şu an ${p.found}, ${p.expected} değil: oyun o zamandan beri değiştirmiş.`,
  "move.moved": () => `Oyuncu oyunun belleğinde yer değiştirmiş; ${reload}.`,
  "move.notAClub": () => "Bu kulübün oyuncunun katılabileceği bir A takımı yok.",
  "move.freeAgent": () => "Oyuncunun kulübü yok; serbest oyuncular henüz taşınamıyor.",
  "move.sameClub": () => "Oyuncu zaten bu kulüpte.",
  "move.onLoan": () => "Oyuncu kiralık; kiralık oyuncular henüz taşınamıyor.",
  "move.playerCoach": () => "Oyuncu-antrenörler taşınamıyor: aynı zamanda personel olarak da çalışıyorlar.",
  "move.unusualContract": () => "Oyuncunun sözleşmesi olağan bir oyuncu sözleşmesi değil.",
  "move.humanClub": () => "Senin kulübünde oynuyor. Transferini FM'de yap.",
  "move.you": () => "Bu sensin. Kulüp değişikliğini FM'de yap.",
  "move.menAndWomen": () => "Kulüplerden biri erkek, diğeri kadın kulübü.",
  "move.notListed": () => "Kadro listeleri oyuncuyu olması gereken yerde tutmuyor.",
  "move.noRoom": (p) =>
    `Kulübün kadro listesinde bir oyuncuya daha yer yok (şu an ${p.players} oyuncu) ve düzenleyici listeyi büyütemez.`,
  "move.outOfRange": (p) => `${field(p.field)} için ${p.value} geçersiz: ${p.min} ile ${p.max} arasında olmalı.`,
  "move.changed": () => `Oyun bu belleği o zamandan beri değiştirmiş; ${reload}.`,
  "move.notApplied": () => "Belleğe yazıldı ama geri okunan farklı çıktı.",
  "heal.notInjured": () => "Oyuncunun iyileştirilecek bir sakatlığı yok.",
  "ban.notBanned": () => "Oyuncunun kaldırılacak bir cezası yok.",
  "call.unavailable": () => "FM bu sürümde bu değişikliği yapamıyor.",
  "call.declined": () => "FM değişikliği yapmadı.",
  "loan.futureFee": () =>
    "Bu kiralamada gelecek bonservis bedeli var. Erken bitirmek FM'in transferi tamamlamasına yol açar.",
  "loan.joinedOther": (p) => `FM kiralamayı bitirdi, ama oyuncu geri dönmek yerine ${p.club} kulübüne katıldı.`,
  "injury.already": () => "Zaten sakat. Önce iyileştir.",
  "injury.noKind": () => "FM'de böyle bir sakatlık yok.",
  "cohesion.none": () => "FM ona henüz bu kulübe bir alışkınlık vermedi.",
  "cohesion.changed": (p) =>
    `Kulübe alışkınlığı şu an ${p.found}: oyun o zamandan beri değiştirmiş, bu yüzden dokunulmadı.`,
  "tactics.changed": () => "Oyun o zamandan beri taktiğe alışkınlığını değiştirmiş, bu yüzden dokunulmadı.",
  "list.missing": () => `Bu kayıt artık listede yok; ${reload}.`,
  "retirement.unknown": () => "Düzenleyici, oyunun bu sürümünde planlanan emeklilikleri bulamıyor.",
  "guard.unknownBuild": () =>
    "FM Lens oyunun bu sürümünde doğrulanmadı. Bu sürüm doğrulanana kadar düzenleme kapalı kalır.",
  "guard.careerChanged": () => "FM, FM Lens okuduktan sonra verilerini taşıdı. Verileri yeniden oku'ya basıp tekrar deneyin.",
  "guard.failed": (p) =>
    `${checkName(p.check)} oyunun bu sürümünde denetimden geçmedi, bu yüzden FM Lens onları değiştirmiyor.`,
  "retirement.none": () => "Oyun bu oyuncunun emekliliğini planlamamış ve oyuncu zaten oynamaya devam etmek istiyor.",
  "clause.noContract": () => "Oyuncunun sözleşmesi yok.",
  "clause.missing": () => `Sözleşmede bu madde artık yok; ${reload}.`,
  "clause.notInClause": (p) => `Bu maddenin değiştirilecek bir ${p.field === "clause.amount" ? "tutarı" : "koşulu"} yok.`,
  "clause.same": () => "Sözleşmede bu zaten var.",
  "clause.noRoom": () =>
    "Sözleşmenin madde listesinde yer yok ve düzenleyici listeyi büyütemiyor; bunun yerine bir maddeyi değiştirin.",
  "relation.missing": () => `Oyuncunun listesinde bu uyruk ya da yetiştiği yer artık yok; ${reload}.`,
  "relation.noRoom": () =>
    "Oyuncunun listesinde yer yok ve düzenleyici listeyi büyütemiyor; bunun yerine kayıtlardan birini değiştirin.",
  "relation.target": () => "Bu, bu kaydın alabileceği türde oyundaki bir ülke ya da kulüp değil.",
  "relation.same": () => "Oyuncuda bu zaten var.",
  "preference.target": () => "Kulübün yerine bir kulüp, kişinin yerine başka bir kişi seç.",
  "preference.same": () => "Bu zaten listede.",
  "relation.rule": (p) => `${p.rule} numaralı yerli kuralı, düzenleyicinin yazdığı kurallardan değil.`,
  "staff.you": () => "Bu sizsiniz, yönettiğiniz teknik direktör.",
  "staff.unemployed": () => "Bu personelin bir kulübü yok.",
  "staff.role": () =>
    "Kulüp ya da takımlarından biri bu personele doğrudan işaret ediyor (bir takımın teknik direktörü gibi); onu oyun kendisi taşır.",
  "staff.notListed": () => "Kulübün personel listeleri onu olması gereken yerde tutmuyor.",
  "staff.noRoom": (p) =>
    `Kulübün ${STAFF_DEPARTMENTS[p.department] ?? p.department} listesinde bir kişiye daha yer yok (şu an ${p.staff}) ve düzenleyici listeyi büyütemez.`,
  "staff.job": (p) => `Düzenleyici, görevi ${jobName(p.job)} olan personeli henüz taşıyamıyor ve bu görevi veremiyor.`,
  "squad.noTeam": () => `Kulübün böyle bir takımı yok ya da takım doğrulanamadı; ${reload}.`,
  "captain.notInTeam": () => "Oyuncu bu takımda oynamıyor; kaptan ancak takımın kendi oyuncularından seçilebilir.",
  "captain.unchanged": () => "Oyuncu bu görevi zaten üstleniyor.",
  "session.notRunning": () => "Football Manager 27 çalışmıyor. Oyunu başlatıp bir kayıt yükleyin, sonra tekrar deneyin.",
  "session.noSuchProcess": () => "FM27 kapatıldı ya da yeniden başlatıldı. Bir kayıt yükleyin, ardından yeniden bağlanın.",
  "session.noCareer": () => "FM27'de yüklü bir kariyer yok. Bir kayıt yükleyin, ardından bağlanın.",
  "attributes.level": () => "1 ile 20 arasında bir değer seçin.",
  "session.playersNotFound": () => "FM27'de yüklü bir kariyer yok. Bir kayıt yükleyin, ardından bağlanın.",
  "session.severalRunning": (p) => `${p.exe ?? "fm.exe"} için ${p.count} kopya çalışıyor (${p.pids}); birini seçin.`,
  "session.pluginNotLoaded": () => "Oyunun verisi henüz yüklenmedi; ana menüyü bekleyip tekrar deneyin.",
  "session.unsupportedEdition": (p) => `FM${p.edition} henüz desteklenmiyor.`,
  "session.unknownEdition": () => "Bunun hangi Football Manager olduğu anlaşılamadı.",
  "memory.win32": (p) => `Windows bir işlemi reddetti (${p.operation}, hata ${p.code}).`,
  "memory.read": (p) => `Oyunun belleği okunamadı (sistem hatası ${p.code}).`,
  "memory.write": (p) => `Oyunun belleğine yazılamadı (sistem hatası ${p.code}).`,
  "memory.readOnly": () => "Oyun yalnızca okunmak üzere açıldı; Windows yazmaya izin vermedi.",
  "memory.notWritable": () => "Bu adres oyunun yazılabilir veri belleğinde değil, bu yüzden yazılmadı.",
  "memory.invalidPe": () => "Oyunun modülü okunamadı.",
  "memory.invalidMachO": () => "Oyunun modülü okunamadı.",
  "memory.mach": (p) => `macOS bir işlemi reddetti (${p.operation}, hata ${p.code}).`,
  "memory.posix": (p) => `macOS bir işlemi reddetti (${p.operation}, errno ${p.code}).`,
  "memory.noBridge": () =>
    "FM27, FM Lens yardımcısı olmadan başlatılmış. Kurulum bittiyse FM27'yi kapatıp Steam'den yeniden " +
    "başlatın.",
  "memory.bridge": (p) => `Oyundaki FM Lens köprüsü belleği vermedi (${p.reason}).`,
  "setup.steamRunning": () =>
    "Yardımcı kuruldu, ancak Steam açık olduğu için başlatma seçeneği ayarlanmadı. Steam'i kapatıp yeniden Kur'a " +
    "tıklayın ya da başlatma seçeneğini kendiniz girin.",
  "setup.noSteamAccount": () => "Bu Mac'te bir Steam hesabı bulunamadı; Steam'i bir kez açıp giriş yapın.",
  "setup.noLibrary": (p) => `Köprü kütüphanesi uygulamada eksik: ${p.path}`,
  "setup.unknownConfig": (p) => `${p.path} FM Lens'ın tanıdığı biçimde değil, bu yüzden dokunulmadı.`,
  "setup.io": (p) => `${p.path}: ${p.error}`,
  "app.internal": () => "Uygulamada beklenmeyen bir hata oluştu.",
  "app.notConnected": () => "Oyuna bağlı değil.",
  "app.notFound": (p) => `Listelerde ${p.uid} kimlikli bir ${recordNoun(p.entity)} yok; verileri yeniden okuyun.`,
  "app.dataChanged": () => `Bu veriler oyunda değişti; ${reload}.`,
  "app.noChange": (p) => `${p.id} numaralı bir değişiklik yok.`,
  "app.alreadyUndone": () => "Bu değişiklik zaten geri alındı.",
  "app.permanent": () => "Bu değişiklik geri alınamaz.",
  "app.earlierGame": () => "Bu değişiklik FM kapanmadan ya da bir kayıt yüklenmeden önce yapıldı; artık geri alınamaz.",
  "export.failed": (p) => `Dosya yazılamadı: ${p.reason}`,
  "export.notAllowed": (p) =>
    `FM Lens ${p.folder} klasörüne yazamıyor. macOS, Belgeler klasörünü kullanıp kullanamayacağını sorduysa ` +
    "Sistem Ayarları › Gizlilik ve Güvenlik › Dosyalar ve Klasörler'den izin verin, sonra yeniden dışa aktarın.",
  "export.blocked": (p) =>
    `FM Lens ${p.folder} klasörüne kaydedemiyor. Windows Güvenliği engelliyorsa Fidye yazılımına karşı koruma › ` +
    "Denetimli klasör erişimi aracılığıyla bir uygulamaya izin ver bölümünden FM Lens'e izin verin, sonra yeniden " +
    "dışa aktarın.",
  "export.noFolder": () => "Dışa aktarılacak bir klasör yok.",
  "export.notExported": () => "Bu, FM Lens'ün dışa aktardığı bir dosya değil.",
  "export.openFailed": (p) => `Açılamadı: ${p.reason}`,
  "mass.noOperations": () => "Değiştirilecek en az bir alan seçin.",
  "mass.tooMany": (p) =>
    `${p.count} sonuç var. Toplu düzenleme için aramayı ya da filtreleri en fazla ${p.limit} sonuca daraltın.`,
  "mass.outOfDate": () => "Bu önizleme eskidi. Toplu düzenlemeyi yeniden önizleyin.",
};

const TRAIT_NAMES_TR: readonly string[] = [
  "Topla sol kanattan ilerler",
  "Topla sağ kanattan ilerler",
  "Topla merkezden ilerler",
  "Rakip ceza sahasına girer",
  "Boşluklara koşar",
  "Fırsat buldukça ileri çıkar",
  "Kısa ve basit paslar atar",
  "Sık sık öldürücü pas dener",
  "Uzaktan şut çeker",
  "Sert şut çeker",
  "Plase vuruş yapar",
  "Topa falso verir",
  "Kaleciyi çalımlamayı sever",
  "Ofsayt tuzağını bozmaya çalışır",
  "Dış ayakla vurur",
  "Rakibini sıkı markaja alır",
  "Rakibini kışkırtır",
  "Hakemlerle tartışır",
  "Sırtı dönük oynar",
  "Topu almak için geriye gelir",
  "Ver-kaç oynar",
  "Kaleciye aşırtma yapmayı sever",
  "Oyunun temposunu belirler",
  "Rövaşata dener",
  "Şut yerine pas arar",
  "Ara pası atmaz",
  "Oyunu durdurur",
  "Topu rakibin yanından geçirir",
  "Çalımdan önce topu sağ ayağına alır",
  "Çalımdan önce topu sol ayağına alır",
  "Topu fazla tutar",
  "Ceza sahasına geç girer",
  "Sıkışınca oynayarak çıkmaya çalışır",
  "Her zaman geride kalır",
  "Zayıf ayağını kullanmaktan kaçınır",
  "Çalım numaraları dener",
  "Uzak mesafeden serbest vuruş dener",
  "Kayarak müdahale eder",
  "Kayarak müdahaleye girmez",
  "İçeri kat eder",
  "Çizgiye yakın oynar",
  "Taraftarı coşturur",
  "Gelişine şut dener",
  "Uzun paslar dener",
  "Topun ayağına gelmesini sever",
  "Serbest vuruşları sert kullanır",
  "Rakibini tekrar tekrar çalımlamayı sever",
  "Topu diğer kanada aktarmayı sever",
  "Zirvedeyken emekli olur",
  "Olabildiğince uzun futbol oynar",
  "Uzun ve düz taç atar",
  "Topla sık koşar",
  "Topla nadiren koşar",
  "Zayıf ayağını geliştirmeye çalışır",
  "Sabit hedef santrfor",
  "Kontra atak için uzun taç kullanır",
  "Uzaktan şut çekmekten kaçınır",
  "Sol kanattan içeri kat eder",
  "Sağ kanattan içeri kat eder",
  "Erken orta yapar",
  "Topu savunmadan çıkarır",
  // Bits 61 and 62 are no trait in FM27: the game shows nothing for them.
  "",
  "",
  "Topu ayaklarıyla oynar"
];

const PROMISE_NAMES_TR: Partial<Record<number, string>> = {
  1: "Oynama süresi",
  208: "Tercih ettiği mevki ve rol",
};

const CONCERN_MOTIVES_TR: Partial<Record<number, string>> = {
  570: "Soyunma odasındaki kötü havadan endişeli",
  596: "Bir turnuvanın kadrosuna alınmadı",
  652: "Daha fazla maça ilk on birde başlamak istiyor",
  808: "Bir takım arkadaşına haksızlık yapıldığını düşünüyor",
  811: "Soyunma odasındaki kötü havanın düzeltilmesi gerektiği konusunda bir takım arkadaşının haklı olduğunu düşünüyor",
  926: "Bir takım arkadaşının istediği forma süresini hak etmediğini düşünüyor",
};

const CLAUSE_NAMES_TR: Partial<Record<number, string>> = {
  0: "Serbest kalma maddesi",
  1: "Küme düşmede serbest kalma maddesi",
  2: "Yükselemezse serbest kalma maddesi",
  3: "Yıllık maaş artışı",
  4: "Yükselmede maaş artışı",
  5: "Küme düşmede maaş indirimi",
  6: "Teknik görev teklifinde serbest kalma maddesi",
  7: "Her an serbest kalma",
  8: "Gelecek satıştan pay yüzdesi",
  9: "Gelecek satış kârından pay",
  10: "Sezonluk gol hedefi primi",
  11: "Lig maçlarından sonra bir yıl uzatma",
  12: "En yüksek ücretliyle eşitleme",
  13: "Kulüp lig maçı sayısına ulaşınca maaş",
  14: "Üst lige yükselmede maaş artışı",
  15: "Üst ligden düşmede maaş indirimi",
  16: "Serbest kalma maddesi (yabancı kulüpler)",
  17: "Serbest kalma maddesi (üst ligdeki kulüpler)",
  18: "Serbest kalma maddesi (yerli kulüpler)",
  19: "Milli maç sayısına ulaşınca maaş",
  20: "Sponsorun ödediği maaş",
  21: "Bilet gelirinden pay",
  22: "Kulübün tek taraflı uzatma opsiyonu",
  23: "Teknik direktörlük teklifinde tazminatsız ayrılık",
  24: "Ayrılmak için gereken tazminat",
  25: "Yükselirse bir yıl uzatma",
  26: "Küme düşmezse bir yıl uzatma",
  27: "Serbest kalma maddesi (Şampiyonlar Kupası'ndaki kulüpler)",
  28: "Garantili sözleşme",
  29: "Yükselirse otomatik uzatma",
  30: "Sakatlıkta serbest kalma maddesi",
  31: "Serbest kalma maddesi (kıta kupalarındaki kulüpler)",
  32: "Maç başına ücret",
  33: "Gol primi",
  34: "Gol yememe primi",
  37: "Milli maç primi",
  38: "Oynamayan yedek ücreti",
  39: "Asist primi",
  40: "Sezonluk asist hedefi primi",
  41: "Sezonluk birleşik gol ve asist hedefi primi",
  55: "Küme düşmede etkin serbest kalma maddesi",
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

  nationStyle: {
    depth: "Derinlik",
    directness: "Direkt Oyun",
    flamboyancy: "Gösteriş",
    flexibility: "Esneklik",
    free_roles: "Serbest Roller",
    marking: "Markaj",
    offside: "Ofsayt",
    pressing: "Pres",
    sitting_back: "Geride Durma",
    tempo: "Tempo",
    playmaker: "Oyun Kurucu Kullanımı",
    width: "Genişlik",
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
    8: "Genel Müdür",
    10: "Futbol Direktörü",
    12: "Fizyoterapist",
    14: "Gözlemci",
    16: "Teknik Direktör",
    20: "Yardımcı Antrenör",
    22: "Duran Top Antrenörü",
    24: "Genel Menajer",
    26: "Kondisyoner",
    34: "Kaleci Antrenörü",
    38: "Baş Doktor",
    40: "Spor Bilimi Sorumlusu",
    44: "Baş Gözlemci",
    46: "Doktor",
    48: "Spor Bilimci",
    50: "Baş Fizyoterapist",
    58: "Transfer Analisti",
    60: "Performans Analisti",
    62: "Baş Performans Analisti",
    64: "Altyapı Sorumlusu",
    66: "Kulüp Sahibi",
    // Code 4 is "Başkan" already: the two are told apart, as a job select with two of the same name would not be.
    70: "Kulüp Başkanı",
    86: "Kiralık Oyuncu Sorumlusu",
    88: "Teknik Yönetici",
  },

  fields: {
    current_ability: "Mevcut yetenek",
    potential_ability: "Potansiyel yetenek",
    height: "Boy (cm)",
    date_of_birth: "Doğum tarihi",
    asking_price: "İstenen bedel",
    nation: "Uyruk",
    "reputation.home": "Yerel itibar",
    "reputation.current": "Güncel itibar",
    "reputation.world": "Dünya itibarı",
    "international.caps": "Milli maç",
    "international.goals": "Milli gol",
    "international.u21_caps": "U21 maç",
    "international.u21_goals": "U21 gol",
    condition: "Enerji",
    match_sharpness: "Maç kondisyonu",
    jadedness: "Yorgunluk",
    morale: "Moral",
    "contract.wage": "Haftalık maaş",
    "contract.loyalty_bonus": "Haftalık sadakat primi",
    "contract.happiness": "Mutluluk",
    "contract.playing_time_happiness": "Forma süresi mutluluğu",
    "contract.unhappiness": "Mutsuzluk nedenleri",
    "contract.expires": "Sözleşme bitişi",
    "loan.wage": "Kiralayan kulübün ödediği maaş",
    "loan.ends": "Kiralık bitişi",
    "transfer.joins": "Katılış tarihi",
    future_transfer: "Anlaşılmış transfer",
    loan: "Kiralık",
    "contract.squad_number": "Forma numarası",
    "contract.squad_status": "Forma süresi",
    "contract.transfer_listed": "Transfer listesinde",
    "contract.loan_listed": "Kiralık listesinde",
    "contract.job": "Görev",
    coaching_licence: "Antrenörlük lisansı",
    "formation.in_possession": "Topa sahipken",
    "formation.out_of_possession": "Topa sahip değilken",
    "manager.unsackable": "Kovulamaz",
    "manager.registration_anytime": "Kadroyu her zaman kaydet",
    "tie.nationality": "İkinci uyruk",
    "tie.trainedInNation": "Yetiştiği ülke",
    "tie.trainedAtClub": "Yetiştiği kulüp",
    "preference.favouredClub": "Sevdiği kulüp",
    "preference.dislikedClub": "Sevmediği kulüp",
    "preference.favouredPerson": "Sevdiği kişi",
    "preference.dislikedPerson": "Sevmediği kişi",
    strength: "Derece",
    language: "Dil",
    level: "Seviye",
    club: "Kulüp",
    injuries: "Sakatlıklar",
    injury: "Sakatlık",
    work_permit: "Çalışma izni",
    bans: "Cezalar",
    promise: "Söz",
    cohesion: "Kulübe alışkınlık",
    tactics: "Taktiğe alışkınlık",
    retirement: "Emeklilik",
    clause: "Sözleşme maddesi",
    "clause.amount": "Madde tutarı",
    "clause.condition": "Madde koşulu",
    captain: "Kaptan",
    vice_captain: "Yardımcı kaptan",
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
    "stadium.capacity": "Stadyum kapasitesi",
    "stadium.seating": "Oturma kapasitesi",
    "stadium.used": "Kullanılan kapasite",
    "stadium.expansion": "Genişleme kapasitesi",
    population: "Nüfus",
    dual_nationality: "Çifte vatandaşlık",
    naturalisation: "Vatandaşlık için yıl",
    youth_rating: "Altyapı puanı",
    "women.reputation": "Kadın takımı itibarı",
    "women.youth_rating": "Kadın altyapı puanı",
    game_importance: "Oyunun önemi",
    attendance: "Seyirci ilgisi",
    "women.game_importance": "Kadın futbolunda oyunun önemi",
    "women.attendance": "Kadın futbolunda seyirci ilgisi",
    points: "FIFA puanı",
  },

  profile: {
    close: "Profili kapat",
    sections: "Bölümler",
    top: "En üst",
    loading: "Profil yükleniyor…",
    resize: "Profil panelini boyutlandır",
    resizeHint: "Boyutu değiştirmek için sürükleyin. Sıfırlamak için çift tıklayın.",
    widen: "Paneli genişlet",
    usualWidth: "Panel genişliğini sıfırla",
    none: "-",

    // Header
    freeAgent: "Serbest",
    born: "Doğum",
    height: (cm) => `${cm} cm`,
    heightUnit: "cm",
    uid: "UID",
    currentAbility: "Mevcut yetenek",
    currentAbilityShort: "MY",
    potentialAbility: "Potansiyel yetenek",
    potentialAbilityShort: "PY",
    potentialRange: "Potansiyel bir aralık olarak belirlenmiş",
    suggestedAbility: (value) => `Önerilen MY ${value}`,
    personalDetails: "Kişisel bilgiler",
    fullNameLabel: "Tam ad",
    heightLabel: "Boy",

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
    positionRatings: "Pozisyon puanları",
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
    converted: "FM'in kuruyla",
    fmShowsWage: (amount) => `FM'de ${amount} görünür`,
    signed: "İmza tarihi",
    expires: "Bitiş tarihi",
    loan: "Kiralık",
    loanFrom: "Asıl kulübü",
    loanWage: "Kiralayan kulübün haftalık ödediği",
    loanStarts: "Kiralık başlangıcı",
    loanEnds: "Kiralık bitişi",
    loanFutureFee: "Gelecek bonservis bedeli",
    futureTransfer: "Anlaşılmış transfer",
    futureClub: "Kulüp",
    futureJoins: "Katılış tarihi",
    workPermit: "Çalışma izni",
    permitActive: "Aktif",
    permitEsc: (date: string) => `${date} tarihinden beri ESC kontenjanı`,
    permitNone: "Yok",
    permitNotNeeded: "Gerekmiyor",
    requestPermit: "İzin talep et",
    permitNotIssued: "FM izin vermedi. Mevcut kurallara göre bu oyuncunun izne ihtiyacı olmayabilir.",
    revokePermit: "Geri al",
    joined: "Katılım tarihi",
    squadStatus: "Forma süresi",
    squadStatusName: (status) => SQUAD_STATUSES[status] ?? "Bilinmeyen durum",
    qualifications: "Yeterlilikler",
    formations: "Dizilişler",
    coachingLicence: "Antrenörlük lisansı",
    licenceName: (level: number): string =>
      ({
        1: "Kıtasal Pro Lisansı",
        2: "Kıtasal A Lisansı",
        3: "Kıtasal B Lisansı",
        4: "Kıtasal C Lisansı",
        5: "Ulusal A Lisansı",
        6: "Ulusal B Lisansı",
        7: "Ulusal C Lisansı",
      })[level] ?? "Yok",
    squadNumber: "Forma numarası",
    transferListed: "Transfer listesinde",
    loanListed: "Kiralık listesinde",

    // Career
    career: "Kariyer",
    internationalCaps: "Milli maç",
    internationalGoals: "Milli gol",
    u21Caps: "U21 maç",
    u21Goals: "U21 gol",
    transferValue: "Temel transfer değeri",
    transferUnavailable: "Kullanılamıyor",
    askingPrice: "İstenen bedel",
    notSet: "Belirlenmedi",
    reputation: "İtibar",
    reputationHome: "Yerel",
    reputationCurrent: "Güncel",
    reputationWorld: "Dünya",
    retirement: "Emeklilik",
    retires: "Emeklilik planı",
    preferences: "Sevdikleri ve sevmedikleri",
    languages: "Diller",
    /** How well a person speaks a language (0 to 10), in the words of FM's profile (see en.ts). */
    languageLevel: (level: number): string =>
      level >= 7 ? "Akıcı" : level >= 5 ? "İyi" : level >= 2 ? "Temel" : "Konuşmuyor",
    languageLevelTitle: (level: number) => `${level}/10`,
    rivals: "Rakipler",
    linkedClubs: "Bağlı kulüpler",
    preferenceKinds: {
      favouredClub: "Sevdiği kulüpler",
      dislikedClub: "Sevmediği kulüpler",
      favouredPerson: "Sevdiği kişiler",
      dislikedPerson: "Sevmediği kişiler",
    },
    noRetirement: "Oyun emekliliğini planlamamış",
    keepPlaying: "Emekli olmasını engelle",
    keepingPlaying: "Engelleniyor…",
    keepPlayingTitle:
      "Emekliliğini iptal eder. Değişiklikler'den geri alabilirsiniz.",

    // Medical
    morale: (value) => `${value} / 20`,
    traits: "Özellikler",
    noTraits: "Özelliği yok",
    traitName: (bit) => TRAIT_NAMES_TR[bit] || "Bilinmeyen özellik",
    traitGroups: {
      movement: "Hareket",
      passing: "Pas",
      finishing: "Bitiricilik",
      discipline: "Disiplin",
      defending: "Savunma",
      technique: "Teknik",
      career: "Kariyer",
    },
    unhappiness: "Mutsuzluk",
    noUnhappiness: "Onu mutsuz eden bir şey yok",
    removeUnhappiness: "Hepsini kaldır",
    removingUnhappiness: "Kaldırılıyor…",
    removeUnhappinessTitle: "Tüm mutsuzluk nedenlerini kaldırır.",
    concernSince: (date) => `${date} tarihinden beri`,
    concernKind: (kind) => (kind === 1 ? "Endişeli" : kind === 2 ? "İçsel" : ""),
    concernMotive: (motive) => CONCERN_MOTIVES_TR[motive] ?? "Bilinmeyen neden",
    clauses: "Primler ve maddeler",
    noClauses: "Prim ya da madde yok",
    loyaltyBonus: "Sadakat primi",
    happiness: "Mutluluk",
    playingTimeHappiness: "Forma süresi mutluluğu",
    moodTitle: "-100 ile 100 arasında.",
    clauseName: (kind) => CLAUSE_NAMES_TR[kind] ?? "Bilinmeyen madde",
    clauseCondition: (kind, value) => {
      if (RELEASE_CLAUSES.has(kind)) {
        return null;
      }
      if (PERCENT_CLAUSES.has(kind)) {
        return `%${value}`;
      }
      switch (kind) {
        case 10:
          return `${value} gol`;
        case 40:
          return `${value} asist`;
        case 41:
          return `${value} gol ve asist`;
        case 11:
        case 13:
          return `${value} lig maçı`;
        case 19:
          return `${value} milli maç`;
        case 22:
          return `${value} yıl`;
        default:
          return String(value);
      }
    },
    moraleTitle: "10 Memnun. 15 ve üstü Aşırı Mutlu.",
    jaded: "Yıpranmış",
    jadednessTitle: (stored) => `Değer ${stored}. 400 üstü yıpranmış, -500 tamamen dinlenmiş.`,
    noInjuries: "Sakatlığı yok",
    unknownInjury: "Bilinmeyen sakatlık",
    unknownClub: "Bilinmeyen kulüp",
    unknownNation: "Bilinmeyen ülke",
    unknownPerson: "Bilinmeyen kişi",
    unknownName: "Bilinmiyor",
    injuryStarted: (date) => `Başlangıç: ${date}`,
    injuryBack: (dates) => `Beklenen dönüş: ${dates}`,
    heal: "İyileştir",
    healTitle: "Tüm sakatlıklarını iyileştir",
    addInjury: "Sakatlık ekle",
    injuryKind: "Sakatlık",
    noBans: "Cezası yok",
    banMatches: (matches) => `${format(matches)} maç`,
    banStarted: (date) => `Başlangıç: ${date}`,
    liftBans: "Kaldır",
    liftBansTitle: "Tüm cezalarını kaldır",
    promises: "Sözler",
    formationName: (id) => id === 0 ? "Yok" : knownFormationName(id) ?? "Bilinmeyen diziliş",
    promiseName: (id) => PROMISE_NAMES_TR[id] ?? "Bilinmeyen söz",
    promiseMade: (date) => `Verildi: ${date}`,
    promiseDue: (date) => `Son tarih: ${date}`,
    promiseEnded: (date) => `Bitti: ${date}`,
    closePromise: "Kapat",
    closePromiseTitle: "Bu sözü ona karşı sayılmadan bitir",

    // Above the attributes, while the profile is read
    tools: "Araçlar",
    tabsLabel: "Oyuncu bölümleri",
    tabs: { attributes: "Özellikler", mood: "Moral", contract: "Sözleşme", medical: "Sağlık", career: "Kariyer" },
    staffTabsLabel: "Personel bölümleri",
    staffTabs: { attributes: "Özellikler", contract: "Sözleşme", career: "Kariyer" },
    statusLabel: "Durum",
    injured: "Sakat",
    banned: "Cezalı",
    concerns: (count: number) => `${format(count)} şikâyet`,
    contractTo: (date: string) => `Sözleşme ${date} tarihine kadar`,
    moraleAndHappiness: "Moral ve mutluluk",
    fitness: "Kondisyon",
    international: "Milli takım",
    noPromises: "Söz yok",
    promisesUnavailable: "FM'in bu sürümünde kullanılamıyor",
    noContract: "Sözleşmesi yok",
    setAttributes: "Bütün özellikleri şuna ayarla:",
    setAttributesButton: "Uygula",
    setAttributesDone: (count, level) =>
      count === 0
        ? "Bütün özellikleri zaten bu değerde"
        : `${changes(count)} yazıldı. Sakatlık eğilimi ve sertlik ${21 - level}${level === 20 ? ", MY ve PY 200" : ""} oldu.`,
    setAttributesUndone: (count) => (count === 0 ? "Hiçbir şey geri alınmadı" : `${changes(count)} geri alındı`),
    undoSetAttributes: "Geri al",
    undoSetAttributesTitle: "Eski özelliklerini geri getir",
    freezeAttributes: "Özellikleri dondur",
    freezeAttributesNote: "FM Lens bağlıyken özellikleri düşemez.",

    // Staff
    you: "Siz",
    youTitle: "Bu kayıtta yönettiğiniz teknik direktör",
    id: "ID",
    job: "Görev",
    changeJob: "Görevi değiştir",
    changeJobTitle: "Görevini değiştir",
    newJob: "Yeni görev",
    applyJob: "Uygula",
    cancelJob: "Vazgeç",
    unemployed: "İşsiz",
    nationalTeam: (nation, ageLimit, women) =>
      `${nation}${women ? " Kadın" : ""}${ageLimit === null ? "" : ` U${ageLimit}`}`,
    coaching: "Antrenörlük",
    knowledge: "Bilgi",
    medical: "Sağlık",
    playerCoach: (job) => `${job} (oyuncu-antrenör)`,
    unknownJob: "Bilinmeyen görev",
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
      minCurrentAbilityTitle: "En düşük mevcut yetenek",
      minPotentialAbilityTitle: "En düşük potansiyel yetenek",
      nation: "Uyruk",
      club: "Kulüp",
      freeAgentsOnly: "Yalnızca serbest oyuncular",
      contractEndsBy: "Sözleşme bitişi (en geç)",
      transferListedOnly: "Yalnızca transfer listesindekiler",
      loanListedOnly: "Yalnızca kiralık listesindekiler",
      maxCurrentAbilityTitle: "En yüksek mevcut yetenek",
      maxPotentialAbilityTitle: "En yüksek potansiyel yetenek",
      height: "Boy (cm)",
      minHeight: "En kısa boy",
      maxHeight: "En uzun boy",
      wage: "Haftalık maaş",
      minWage: "En düşük maaş",
      maxWage: "En yüksek maaş",
      value: "Temel değer",
      minValue: "En düşük değer",
      maxValue: "En yüksek değer",
      trait: "Özellik",
      chips: "Etkin filtreler",
      removeChip: (label: string) => `Kaldır: ${label}`,
      attributes: {
        heading: "Özellikler",
        attribute: "Özellik",
        pick: "Özellik seçin",
        min: (name) => (name ? `En az ${name}` : "En az"),
        max: (name) => (name ? `En çok ${name}` : "En çok"),
        add: "Özellik ekle",
        remove: (name) => (name ? `${name} satırını kaldır` : "Bu satırı kaldır"),
      },
      saved: {
        save: "Kaydet",
        saveTitle: "Bu filtreleri ve sıralamayı kaydet",
        name: "Kayıtlı filtrenin adı",
        namePlaceholder: "Filtre adı",
        ok: "Tamam",
        cancel: "İptal",
        select: "Kayıtlı filtreler",
        delete: "Sil",
        // The name stays as the user typed it, so the ending is not put on it: "Kayıtlı filtreyi sil: …".
        deleteTitle: (name) => `Kayıtlı filtreyi sil: ${name}`,
        replaceQuestion: (name) => `“${name}” adında bir kayıtlı filtre zaten var. Değiştirilsin mi?`,
        replace: "Değiştir",
        full: (max) =>
          `En fazla ${max} filtre kaydedilebilir. Önce birini silin ya da ` +
          "değiştirmek için kayıtlı bir filtrenin adını kullanın.",
      },
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
      humanOnly: "Yalnızca sen",
      age: "Yaş",
      minAge: "En düşük yaş",
      maxAge: "En yüksek yaş",
      minPlaceholder: "Min",
      maxPlaceholder: "Maks",
      nation: "Uyruk",
      club: "Kulüp",
    },
  },

  clubProfile: {
    // Header
    womensClub: "Kadın kulübü",
    founded: (year) => `Kuruluş ${year}`,
    reputationShort: "İtibar",
    reputationTitle: "İtibar",

    // The tabs under the header
    tabsLabel: "Kulüp bölümleri",
    tabs: { overview: "Genel", squad: "Kadro", staff: "Personel" },
    squadLocked: "Kadroyu açmak için düzenlemeyi bitirin",
    staffLocked: "Personeli açmak için düzenlemeyi bitirin",
    staffLoading: "Personel okunuyor…",
    noStaff: "Bu kulübün personeli yok.",
    staffTableLabel: (club, team) => `${club} ${team} personeli`,

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
    wageBudget: "Kullanılan maaş bütçesi",
    totalWageBudget: "Toplam maaş bütçesi",
    ticketPrice: "Ortalama bilet fiyatı",
    perWeek: "/hafta",
    noFinances: "FM, parayı yalnızca oynanabilir liglerdeki kulüpler için tutar.",
    freeze: "Parayı dondur",
    freezeNote: "FM Lens bağlıyken bakiye düşemez.",

    // Club info
    stadium: "Stadyum",
    capacity: "Kapasite",
    seating: "Oturma",
    used: "Kullanılan",
    usedAll: "Tamamı",
    usedTitle: "Oyunun kapasitenin ne kadarını kullandığı. 0 tamamı demektir.",
    expansion: "Genişleyebileceği",
    owner: "Sahibi",
    noStadium: "Bu kulübün stadyumu okunamadı.",
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
        return filtered ? "Bu filtrelere uyan kulüp yok." : "Kulüp bulunamadı.";
      }
      return filtered
        ? `“${query}” aramasına ve bu filtrelere uyan kulüp yok.`
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
      reputation: "İtibar",
      minReputation: "En düşük itibar",
      maxReputation: "En yüksek itibar",
      minPlaceholder: "Min",
      maxPlaceholder: "Maks",
      founded: "Kuruluş",
      foundedFrom: "Kuruluş (en erken)",
      foundedTo: "Kuruluş (en geç)",
      yearPlaceholder: "Yıl",
    },
  },

  officialList: {
    nav: "Hakemler",
    search: "Hakemleri isim veya UID ile ara",
    summary: (total, shown) =>
      total > shown ? `${format(total)} hakem · en iyi ${shown}` : `${format(total)} hakem`,
    empty: (query, filtered) => {
      if (query === "" && !filtered) {
        return "FM'in bu sürümünde hakemler okunamadı.";
      }
      if (query === "") {
        return "Bu filtrelere uyan hakem yok.";
      }
      return filtered
        ? `“${query}” aramasına ve bu filtrelere uyan hakem yok.`
        : `“${query}” aramasına uyan hakem yok.`;
    },
    columns: { name: "İsim", nation: "Ülke", age: "Yaş", ca: "MY", pa: "PY", reputation: "İtibar", uid: "UID" },
    filters: {
      age: "Yaş",
      minAge: "En düşük yaş",
      maxAge: "En yüksek yaş",
      nation: "Ülke",
    },
    reputation: "İtibar",
  },

  competitionList: {
    nav: "Turnuvalar",
    search: "Turnuvaları isim veya UID ile ara",
    summary: (total, shown) =>
      total > shown ? `${format(total)} turnuva · itibarı en yüksek ${shown}` : `${format(total)} turnuva`,
    empty: (query, filtered) => {
      if (query === "" && !filtered) {
        return "FM'in bu sürümünde turnuvalar okunamadı.";
      }
      if (query === "") {
        return "Bu filtrelere uyan turnuva yok.";
      }
      return filtered
        ? `“${query}” aramasına ve bu filtrelere uyan turnuva yok.`
        : `“${query}” aramasına uyan turnuva yok.`;
    },
    columns: { name: "İsim", nation: "Ülke", continent: "Kıta", reputation: "İtibar", uid: "UID" },
    filters: {
      kind: "Gösterilecek turnuvalar",
      all: "Tümü",
      men: "Erkek",
      women: "Kadın",
      nation: "Ülke",
      continent: "Kıta",
      reputation: "İtibar",
      minReputation: "En düşük itibar",
      maxReputation: "En yüksek itibar",
    },
    shortName: "Kısa isim",
    reputation: "İtibar",
    women: "Kadın",
    rules: "Kurallar",
    ruleNames: {
      level: "Seviye",
      max_squad_size: "En Fazla Kadro",
      min_squad_size: "En Az Kadro",
      recommended_squad_size: "Önerilen Kadro",
      max_prelim_squad_size: "En Fazla Ön Kadro",
      min_foreign_players: "En Az Yabancı Oyuncu",
      max_foreign_players: "En Fazla Yabancı Oyuncu",
      foreign_trialists_can_play: "Denemedeki Yabancılar Oynayabilir",
      subs_allowed: "Oyuncu Değişikliği Hakkı",
      max_subs: "Yedek Sayısı",
      extended_injury_time: "Uzatılmış Ek Süre",
      daylight_offside_rule: "Açık Ofsayt Kuralı",
      yellow_cards_for_fine: "Para Cezası İçin Sarı Kart",
      min_games_for_medal: "Madalya İçin Maç",
      number_of_medals: "Madalya Sayısı",
      min_stadium_capacity: "En Az Stat Kapasitesi",
      min_stadium_seating: "En Az Oturma Kapasitesi",
      requires_grass_pitch: "Çim Saha Şartı",
      requires_undersoil_heating: "Zemin Isıtma Şartı",
    },
  },

  awardList: {
    nav: "Ödüller",
    search: "Ödülleri isim, turnuva veya UID ile ara",
    summary: (total, shown) =>
      total > shown ? `${format(total)} ödül · prestiji en yüksek ${shown}` : `${format(total)} ödül`,
    empty: (query, filtered) => {
      if (query === "" && !filtered) {
        return "FM'in bu sürümünde ödüller okunamadı.";
      }
      if (query === "") {
        return "Bu filtrelere uyan ödül yok.";
      }
      return filtered
        ? `“${query}” aramasına ve bu filtrelere uyan ödül yok.`
        : `“${query}” aramasına uyan ödül yok.`;
    },
    columns: { name: "İsim", competition: "Turnuva", nation: "Ülke", prestige: "Prestij", uid: "UID" },
    filters: {
      kind: "Gösterilecek ödüller",
      all: "Tümü",
      men: "Erkek",
      women: "Kadın",
      nation: "Ülke",
      recipients: "Kime",
      anyone: "Herkes",
      prestige: "Prestij",
      minPrestige: "En düşük prestij",
      maxPrestige: "En yüksek prestij",
    },
    competition: "Turnuva",
    prestige: "Prestij",
    period: "Veriliş sıklığı",
    periodName: (code) =>
      ({
        1: "Her hafta",
        2: "Her ay",
        3: "Her sezon",
        4: "Turnuva sonunda",
        5: "Her takvim yılı",
        6: "Her yıl",
        7: "Her tur",
      })[code] ?? null,
    recipients: "Kime",
    recipientName: (code) => ({ 1: "Bir oyuncuya", 2: "Bir teknik direktöre", 7: "Bir oyuncu takımına" })[code] ?? null,
    goalkeepersOnly: "Sadece kaleciler",
    ageLimit: "Yaş sınırı",
    ageLimitValue: (age) => `${age} yaş ve altı`,
    women: "Kadın",
  },

  stadiumList: {
    nav: "Stadyumlar",
    search: "İsim veya kulüple stadyum ara",
    summary: (total, shown) =>
      total > shown
        ? `${format(total)} stadyum · kapasiteye göre ilk ${shown} gösteriliyor`
        : `${format(total)} stadyum`,
    empty: (query, filtered) => {
      if (query === "" && !filtered) {
        return "Stadyum okunamadı.";
      }
      if (query === "") {
        return "Bu filtrelere uyan stadyum yok.";
      }
      return filtered
        ? `“${query}” aramasına ve bu filtrelere uyan stadyum yok.`
        : `“${query}” aramasına uyan stadyum yok.`;
    },
    columns: {
      name: "Stadyum",
      club: "Kulüp",
      capacity: "Kapasite",
      seating: "Oturmalı",
      expansion: "Büyüyebileceği",
    },
    /** The clubs that play at a stadium, in its profile. */
    clubs: "Kulüpler",
    filters: {
      kind: "Gösterilecek stadyumlar",
      all: "Tümü",
      men: "Erkek",
      women: "Kadın",
      capacity: "Kapasite",
      minCapacity: "En düşük kapasite",
      maxCapacity: "En yüksek kapasite",
      minPlaceholder: "Min",
      maxPlaceholder: "Maks",
    },
  },

  nationList: {
    nav: "Ülkeler",
    search: "İsimle ülke ara",
    summary: (total, shown) =>
      total > shown ? `${format(total)} ülke · ilk ${shown} gösteriliyor` : `${format(total)} ülke`,
    empty: (query, filtered) => {
      if (query === "") {
        return filtered ? "Bu filtrelere uyan ülke yok." : "Ülke bulunamadı.";
      }
      return filtered
        ? `“${query}” aramasına ve bu filtrelere uyan ülke yok.`
        : `“${query}” aramasına uyan ülke yok.`;
    },
    columns: { name: "Ülke", continent: "Kıta", uid: "UID" },
    filters: {
      continent: "Kıta",
    },
    uid: "UID",
    noUid: "UID yok",
    nation: "Ülke",
    capital: "Başkent",
    population: "Nüfus",
    languages: "Diller",
    dualNationality: "Çifte vatandaşlık",
    allowed: "Serbest",
    notAllowed: "Yasak",
    naturalisation: "Vatandaşlık için yıl",
    never: "Hiçbir zaman",
    fifa: "FIFA",
    ranking: "Dünya sıralaması",
    points: "Puan",
    founded: "Federasyon kuruluşu",
    joinedFifa: "FIFA üyeliği",
    joinedContinental: "Konfederasyon üyeliği",
    youthRating: "Altyapı puanı",
    gameImportance: "Oyunun önemi",
    attendance: "Seyirci ilgisi",
    women: "Kadın futbolu",
    style: "Oyun Tarzı",
    womenStyle: "Kadın Futbolunda Oyun Tarzı",
    teamName: (ageLimit) => (ageLimit === null ? "A Milli Takım" : `U${ageLimit}`),
    womenTeamName: (ageLimit) => (ageLimit === null ? "Kadın A Milli Takımı" : `Kadınlar U${ageLimit}`),
    manager: "Teknik direktör",
    captain: "Kaptan",
    viceCaptain: "İkinci kaptan",
    reputation: "İtibar",
    squad: (count) => `Kadro (${count})`,
  },

  app: {
    lists: "Listeler",
    settingsLabel: "Ayarlar",
    general: "Genel",
    languageLabel: "Dil",
    currencyLabel: "Para birimi",
    theme: "Tema",
    privacy: "Gizlilik",
    about: "Hakkında",
    done: "Tamam",
    zoomLabel: "Yakınlaştırma",
    usageLabel: "Anonim kullanım verisi paylaş",
    appearance: "Görünüm",
    themes: { system: "Sistem", light: "Açık", dark: "Koyu" },
    tour: {
      label: "Tanıtım",
      skip: "Geç",
      back: "Geri",
      next: "İleri",
      done: "Bitti",
      progress: (step: number, total: number) => `${step} / ${total}`,
      steps: {
        brand: {
          title: "FM Lens",
          body: "Kaydınızdaki her şeyi görün ve değiştirin. Önce bir kopyada deneyin.",
        },
        tabs: {
          title: "Bölümler",
          body: "Oyuncular, personel ve kulüpler. Ülkeler, stadyumlar ve dahası Listeler altında.",
        },
        search: {
          title: "Arama ve filtreler",
          body: "Bir isim ya da kimlik yazın.",
        },
        settings: {
          title: "Ayarlar",
          body: "Dil, para birimi, açık ya da koyu mod ve yakınlaştırma.",
        },
        status: {
          title: "Bağlantı",
          body: "FM'ye bağlı olup olmadığınızı gösterir.",
        },
      },
      exercise: {
        list: { title: "Bir düzenleme deneyin", body: "Listeden birini açın." },
        edit: { title: "Düzenle", body: "Düzenle'ye basın ya da bir değere tıklayın." },
        profile: { title: "Bir değeri değiştirin", body: "Yeni bir değer yazın." },
        apply: { title: "Uygula", body: "Uygula değişikliği FM'ye gönderir. Vazgeç onu bırakır." },
        changes: { title: "Değişiklikler", body: "Uygulanan her değişiklik, geri almaya hazır." },
      },
    },

    noteEditable: "Düzenleme açık",
    noteReadOnly: "Salt okunur",
    noteUnknownBuild: "Salt okunur: bu FM sürümü henüz desteklenmiyor",
    noteReloadRequired: "FM verilerini taşıdı. Düzenlemek için verileri yeniden okuyun.",

    notConnected: "Bağlı değil",
    connected: "Bağlı",
    reportProblem: "Sorun bildir",
    wishlist: "İstek listesi",
    more: "Daha fazla",
    debugTag: "DEBUG",
    previewTag: "tarayıcı önizlemesi · örnek veriler",
    noDate: "Oyun içi tarih yok",
    noDateTitle: "Oyun içi tarih okunamadı, bu yüzden yaşlar gizli.",
    reload: "Verileri yeniden oku",
    detecting: "Football Manager aranıyor…",
    connecting: "Kayıt yükleniyor…",
    loadingView: "Yükleniyor…",
    reloading: "Kayıt yükleniyor…",

    refrozen: {
      title: "Geçen seferden yeniden donduruldu",
      waitingTitle: "Dondurulanlar şimdilik bekliyor",
      players: (names) => `Özellikler: ${names}`,
      clubs: (names) => `Para: ${names}`,
      more: (count) => `ve ${format(count)} tane daha`,
      waiting: (count) =>
        `${format(count)} tanesi hatırlanıyor ama şu an dondurulmadı: FM Lens oyunun bu sürümüne henüz yazamıyor.`,
      dismiss: "Kapat",
    },

    email: {
      title: "FM Lens'i kullanmak için e-posta adresinizi girin",
      intro: "FM Lens, güncellemeleri e-postayla bildirir.",
      button: "Devam",
      sending: "Denetleniyor…",
      refused: "Olmadı. Adresi denetleyip yeniden deneyin.",
      failed: "Olmadı. Bağlantınızı denetleyip yeniden deneyin.",
    },

    connect: {
      title: "Football Manager 27'ye bağlan",
      intro: "FM'de bir kayıt yükleyin, ardından bağlanın.",
      notRunning: "Football Manager 27 çalışmıyor.",
      openFailed: (error) => `FM açılamadı: ${error}`,
      stillLoading: "FM hâlâ açılıyor. Ana menüyü bekleyin.",
      several: "Birden fazla FM açık. İlki kullanılıyor.",
      button: "Bağlan",

      bridge: {
        title: "Tek seferlik kurulum",
        intro: "Kaydedip FM'yi, ardından Steam'i kapatın.",
        library: "Yardımcı",
        installed: "Kurulu",
        missing: "Kurulu değil",
        launchOption: "Steam başlatma seçeneği",
        set: "Ayarlı",
        notSet: "Ayarlı değil",
        steamRunning: "Steam açık. Önce Steam'i kapatın ya da başlatma seçeneğini kendiniz girin.",
        setUp: "Kur",
        remove: "Yardımcıyı kaldır",
        manual:
          "Ya da Steam'de Football Manager 27'ye sağ tıklayıp Özellikler › Genel › Başlatma Seçenekleri'ne şunu girin:",
        copy: "Kopyala",
        copied: "Kopyalandı",
      },
    },
  },

  compatibility: {
    unknownBuild: (game) => `FM Lens henüz ${game} ile denenmedi`,
    unknownBuildText: "Değerler yanlış olabilir, bu yüzden düzenleme kapalı.",
    allowedText: "Denetimlerin geçtiği yerlerde düzenleme açık. Kaydınızı yedekleyin.",
    failedTitle: "Bazı veriler yanlış görünüyor",
    reloadHint: "Kayıt hâlâ yükleniyorduysa Verileri yeniden oku'ya basın.",
    noDate: "Oyun içi tarih okunamadı, bu yüzden yaşlar gösterilmiyor.",
    failed: (names) => `Salt okunur bırakılanlar: ${names}.`,
    join: (names) =>
      names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} ve ${names[names.length - 1]}`,
    allow: "Yine de düzenle",
    allowTitle: "Önce kayıt dosyanızı yedekleyin.",
  },

  checks: {
    gameDate: "oyun içi tarih",
    players: "oyuncu bilgileri",
    positions: "mevkiler",
    attributes: "nitelikler",
    personality: "kişilik",
    liveValues: "enerji, maç keskinliği, yorgunluk ve moral",
    contracts: "sözleşmeler",
    teams: "takımlar",
    staff: "personel",
    clubs: "kulüpler",
    nations: "ülkeler",
    officials: "hakemler",
  },

  update: {
    relaunch: "Güncellemek için yeniden başlat",
    available: (version) => `FM Lens ${version} yayımlandı`,
    download: "İndir",
    installFailed: (reason) => `Güncellenemedi: ${reason}. Bunun yerine sayfasından indirin.`,
    later: "Sonra",
    checkForUpdates: "Güncellemeleri Denetle…",
    check: "Güncellemeleri denetle",
    checking: "Güncellemeler denetleniyor…",
    upToDate: "FM Lens güncel.",
    checkFailed: "Güncellemeler denetlenemedi.",
    whatsNew: (version) => `FM Lens ${version} sürümündeki yenilikler`,
    releaseNotes: "Sürüm notları",
    dismiss: "Kapat",
    changes: {
      "0.7.8": [
        "FM27'nin 12 Kasım Steam güncellemesiyle çalışır.",
        "Her listeyi sıralayın, oyuncuları maaşa, değere, boya ve kişiliğe göre filtreleyin.",
        "Personelin doğum tarihini ve bir oyuncunun bütün özelliklerini düzenleyin.",
      ],
      "0.7.7": [
        "Mutsuzluğu kaldır kalıcı: nedenler Devam’dan sonra geri gelmez.",
        "Mutluluk düzenlemesi yerinde kalır: moral de onunla ayarlanır.",
        "Toplu düzenleme listedeki her şeyi dondurabilir ya da dondurmayı kaldırabilir.",
      ],
      "0.7.6": [
        "Personel sekmesi her takımın kendi personelini gösterir: A takımı, U21, U18.",
      ],
      "0.7.5": [
        "Kulüp profillerinde Personel sekmesi var: tüm personel, göreve göre, MY ve PY ile.",
        "Pencerenin altındaki İstek listesi ile özellik isteyin.",
      ],
      "0.7.4": [
        "Herhangi bir oyuncunun kartını profilinden paylaşın: Gönderi veya Hikâye olarak kopyalayın ya da kaydedin.",
        "Sözleşme sekmesi oyuncunun temel transfer değerini gösterir.",
        "Uzun kariyerler düzenlenebilir kalır: 2020'den sonra doğan oyuncular artık oyuncuları ve personeli kilitlemiyor.",
        "Doğum tarihini oyunun tarihine kadar girebilirsiniz.",
        "Sorun bildir, geçmeyen kontrolleri de gönderir.",
        "FM Lens her bilgisayarda e-posta adresinizi bir kez ister.",
      ],
      "0.7.3": ["FM27 27.0.1 ile, oyunun ilk yamasıyla çalışır: tüm düzenlemeler ve işlemler geri geldi."],
      "0.7.2": ["Windows'ta Transfer, Takas ve Kiralama artık LoadLibraryW hatası vermiyor."],
      "0.7.1": [
        "Genç transferler U21'e değil, A takımınıza katılır.",
        "Tarihleri rakamlarla yazın ya da oyunun tarihini izleyen yeni takvimden seçin.",
        "FM'in izin vermeyeceği yerde Çalışma izni, Gerekmiyor yazar.",
        "Özellikleri tamamla, MY ve PY'yi 200'e çıkarır.",
        "Değişiklikler, Cezaları kaldır gibi kadro işlemlerini adıyla gösterir.",
        "Profilde Düzenle, siz düzenlerken Bitti olur.",
      ],
      "0.7.0": [
        "Transfer, Takas ve Serbest bırakma artık FM'in kendisiyle yapılıyor: bonservisi ve transfer geçmişiyle gerçek transferler.",
        "Intel Mac'ler, FM'in içinde çalışan tüm işlemlere kavuşuyor.",
        "Windows'ta bir oyuncuya verilen sözleri Moral sekmesinde görün ve kapatın.",
        "Sözler, dizilişler ve mutsuzluk nedenleri için sayılar değil, FM'in kendi adları.",
        "Tüm arama sonuçlarını görün ve her listeyi filtreleyin.",
        "Dondurduklarınız uzun tatillerde de yerinde kalır.",
      ],
      "0.6.2": [
        "FM Lens artık Windows'ta. getfmlens.com adresinden indirin.",
        "Windows'ta güncellemeler arka planda iner ve Güncellemek için yeniden başlat'a bastığınızda kurulur.",
        "Windows'ta Güncellemeleri Denetle, Ayarlar > Hakkında bölümündedir.",
        "Aynı anda yalnızca bir FM Lens çalışır: yeniden açtığınızda penceresi öne gelir.",
      ],
      "0.6.1": [
        "Yeni oyuncu profili: Özellikler, Moral, Sözleşme, Sağlık ve Kariyer sekmeleri ve adın altında bunları açan durum etiketleri.",
        "Ayarlar artık kendi penceresinde açılır: dişli simgesi veya Cmd+,.",
        "Her listede Filtreler var; etkin her filtre kaldırabileceğiniz bir etiket olarak görünür.",
        "FM Lens’in sayı gösterdiği yerlerde FM’nin kendi adları: personel görevleri, Altyapı adayları ve Yıpranmış.",
        "İmza penceresi, bir oyuncuyu imzalamak anlaşılmış bir transferini iptal edecekse sizi uyarır.",
      ],
      "0.6.0": [
        "FM Lens güncellemeleri, FM içinde çalışan yardımcıyı kullanmaya devam eder. Desteklenen özellikler oyunu yeniden başlatmadan çalışır.",
        "Eski bir yardımcı FM ekranlarını hemen yenileyemeyebilir veya yeni bir işlemi desteklemeyebilir. FM’yi bir sonraki başlatışınızda güncellenir.",
        "Kadro işlemlerini ve profil araçlarını bulmak artık daha kolay.",
      ],
      "0.5.11": [
        "Sevdikleri ve sevmedikleri: bir kulübü veya kişiyi başkasıyla değiştirin.",
        "FM Lens güncellenirken FM açıksa, FM'i Steam'den yeniden başlatana kadar düzenleme kapalı kalır.",
        "Rapor dosyaları siz raporu gönderene kadar gizli kalır ve CSV dışa aktarımları artık formül çalıştırmaz.",
        "FM Lens artık kaydınızdan ad veya değer almadan anonim kullanımı sayar. Ayarlar'dan kapatabilirsiniz.",
      ],
      "0.5.10": [
        "Intel Mac’lerde tamamlanan her Uygula ve Geri Al işleminden sonra FM’den düzenlenen kaydı ve açık ekranları Devam’a basmadan yenilemesi istenir.",
        "Yeni yardımcıyı yüklemek için güncellemeden sonra FM’yi bir kez yeniden başlatın.",
      ],
      "0.5.9": [
        "Sorun bildir artık ekran görüntüsü ve video alıyor: ekle, yapıştır ya da sürükle.",
        "FM bir şeyi değiştirdiyse Geri al ve söz kapatma durur. FM Lens'in adlandıramadığı bir diziliş olduğu gibi kalır.",
      ],
      "0.5.8": [
        "Apple Silicon’da tamamlanan her Uygula ve Geri Al işleminden sonra FM’den düzenlenen kaydı ve açık ekranları Devam’a basmadan yenilemesi istenir.",
        "Yeni yardımcıyı yüklemek için güncellemeden sonra FM’yi bir kez yeniden başlatın.",
      ],
      "0.5.7": [
        "Apple Silicon’da Uygula ve Geri Al, Devam’a basmadan FM’deki özellikleri ve sözleşme bitiş tarihini yeniler.",
        "Yeni yardımcıyı yüklemek için güncellemeden sonra FM’yi bir kez yeniden başlatın.",
      ],
      "0.5.6": [
        "Sorun bildir artık FM Lens içinde, pencerenin altında açılıyor. Ne olduğunu yaz ve Gönder'e bas.",
        "Güncellemeleri Denetle… FM Lens menüsünde.",
        "Uygulama genelinde daha kısa ve sade metinler; transfer pencereleri de dahil.",
      ],
      "0.5.5": [
        "Kendi kulübünüzden oyuncu transfer edin. FM transferi yapar ve bedeli aktarır.",
      ],
      "0.5.4": [
        "Bir sakatlığın süresini değiştirin ya da tek bir sakatlığı kaldırın.",
        "Bir teknik direktörün topa sahipken ve topa sahip değilken dizilişlerini görün ve değiştirin.",
        "Bir ülkenin oyun tarzı puanlarını görün ve değiştirin.",
        "Bir turnuvanın kurallarını görün.",
        "Bir oyuncuya verilen sözleri görün ve açık bir sözü kapatın.",
        "Kulüp değiştir: başka bir kulübün teknik direktörü olun.",
      ],
      "0.5.3": [
        "Dosyalar, ayarlar ve Steam yardımcısı artık FM Lens adını kullanıyor. Kurulumunuz aktarıldı.",
      ],
      "0.5.2": [
        "Ayarlar'daki Sorun bildir, sürümleriniz ve değişiklikleriniz doldurulmuş bir hata raporu açar.",
        "FM verilerini taşıdığında FM Lens oyunu kendiliğinden yeniden okur: artık Verileri yeniden oku'ya basmanız gerekmez.",
        "Güncellemeler arka planda kurulur. Size uygun olduğunda pencerenin altındaki Güncellemek için yeniden başlat'a basın.",
      ],
    },
  },

  star: {
    ask: "FM Lens ücretsiz ve açık kaynak, hep öyle kalacak. GitHub'da bir yıldız beni cesaretlendirir.",
    button: "GitHub'da yıldız ver",
    notNow: "Şimdi değil",
  },

  edit: {
    appliedTitle: "Uygulandı",
    unknownNation: "Bilinmeyen ülke",
    edit: "Düzenle",
    editTitle: "Bu profili düzenle",
    startFailed: (reason) => `Düzenleme başlatılamadı: ${reason}`,
    positionRating: (position) => `${position} puanı`,
    womenStyle: (style) => `Kadın futbolunda ${style.toLocaleLowerCase("tr")}`,
    was: (value) => `önceki: ${value}`,
    invalid: (min, max) => `${min} ile ${max} arasında bir tam sayı girin`,
    least: (value) => `En az: ${value}`,
    most: (value) => `En çok: ${value}`,
    invalidDate: (from, to) => `${from} ile ${to} arasında bir tarih girin`,
    dateParts: { day: "gg", month: "aa", year: "yyyy" },
    pickDate: "Takvim",
    previousMonth: "Önceki ay",
    nextMonth: "Sonraki ay",
    previousYear: "Önceki yıl",
    nextYear: "Sonraki yıl",
    wageDisplay: (amount) => `FM haftalık yaklaşık ${amount} gösterebilir; girilen tutar kaydedilir.`,
    invalidMoney: (from, to) => `${from} ile ${to} arasında tam bir tutar girin`,
    invalidPercentage: (from, to) => `${from} ile ${to} arasında tam sayı bir yüzde girin`,
    invalidDecimal: (from, to) => `${from} ile ${to} arasında en fazla iki ondalık basamaklı bir sayı girin`,
    percent: "%",
    yes: "Evet",
    no: "Hayır",
    none: "yok",

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
    applied: (count) => `${changes(count)} uygulandı.`,
    nothingToChange: "Değiştirilecek bir şey yok. FM'de bu değerler zaten var.",
    refused: (label, reason) => `${label}: ${reason}`,
    rereadFailed: (reason) => `Değerler geri okunamadı: ${reason}`,
    dismiss: "Kapat",
  },

  changes: {
    nav: "Değişiklikler",
    title: "Bu oturumdaki değişiklikler",
    swappedWith: (name) => `Takas: ${name}`,
    fee: (amount) => `Bedel ${amount}`,
    joins: (date) => `Katılış: ${date}`,
    healed: (count) => `${format(count)} sakatlık iyileştirildi`,
    injuryAdded: "Sakatlık eklendi",
    lifted: (count) => `${format(count)} ceza kaldırıldı`,
    promiseClosed: (name) => `Söz kapatıldı: ${name}`,
    keptPlaying: (date) => (date === null ? "Oynamaya devam edecek" : `${date} tarihli emeklilik engellendi`),
    count: (total, undone) => {
      const count = changeCount(total);
      return undone === 0 ? count : `${count} · ${undone} geri alındı`;
    },
    empty: "Henüz değişiklik yok.",
    columns: {
      time: "Saat",
      name: "İsim",
      field: "Alan",
      change: "Değişiklik",
      status: "Durum",
    },
    kinds: { player: "Oyuncu", staff: "Personel", club: "Kulüp", nation: "Ülke", official: "Hakem" } satisfies Record<Entity, string>,
    stored: (change) => `saklanan ${change}`,
    undone: (time) => `Geri alındı: ${time}`,
    earlierGame: "Önceki oyun",
    undo: "Geri al",
    undoTitle: (label) => `Eski değeri oyuna geri yaz: ${label}`,
    batch: "Toplu düzenleme",
    batchCount: (total, remaining) =>
      remaining === 0
        ? `${changes(total)} · hepsi geri alındı`
        : `${changes(total)} · ${format(remaining)} tanesi geri alınmadı`,
    showChanges: "Değişiklikleri göster",
    hideChanges: "Değişiklikleri gizle",
    undoBatch: "Toplu düzenlemeyi geri al",
    undoAll: "Tümünü geri al",
    undoBatchTitle: (remaining) =>
      `Bu toplu düzenlemenin eski değerlerini oyuna geri yaz (${changes(remaining)} hâlâ yerinde)`,

    pages: "Liste sayfaları",
    batchPages: "Bu toplu düzenlemenin değişiklik sayfaları",
    previous: "Önceki",
    next: "Sonraki",
    range: (first, last, total) => `${format(first)}–${format(last)} / ${format(total)}`,
  },

  export: {
    button: "Dışa aktar",
    buttonTitle: "CSV veya JSON olarak dışa aktar",
    title: "Oyuncuları dışa aktar",
    scope: (count) => (count === 0 ? "Arama ve filtrelere uyan oyuncu yok." : `${format(count)} oyuncu`),
    formatLabel: "Biçim",
    formats: {
      csv: "CSV, virgülle ayrılmış",
      csvSemicolon: "CSV, noktalı virgülle ayrılmış",
      json: "JSON",
    },
    contents: "Paralar sterlin.",
    export: "Dışa aktar",
    exporting: "Dışa aktarılıyor…",
    done: (count, file) => `${format(count)} oyuncu ${file} dosyasına aktarıldı`,
    folder: (folder) => `Klasör: ${folder}`,
    skipped: (count) => `${format(count)} oyuncu okunurken oyunda değişti ve dışarıda bırakıldı.`,
    open: "Aç",
    openTitle: "Dosyayı sisteminizin onu açtığı uygulamada aç",
    show: "Klasörde göster",
    showTitle: "Dosyayı klasöründe göster",
    close: "Kapat",
  },

  share: {
    button: "Paylaş",
    buttonTitle: "Bu oyuncunun kartını paylaş",
    title: "Kartı paylaş",
    formatLabel: "Boyut",
    formats: { post: "Gönderi", story: "Hikâye" },
    showAbility: "MY ve PY göster",
    preview: (name: string) => `${name} kartı`,
    drawFailed: "Kart çizilemedi.",
    copyImage: "Görseli kopyala",
    copied: "Görsel kopyalandı",
    copyFailed: "Panoya kopyalanamadı.",
    save: "PNG kaydet",
    saved: (file: string) => `${file} kaydedildi`,
    show: "Klasörde göster",
    copyCaption: "Metni kopyala",
    captionCopied: "Metin kopyalandı",
    close: "Kapat",
    age: (age: number) => `${age} yaşında`,
    value: "Değer",
    wage: "Maaş",
    perWeek: "/hafta",
    footer: "FM Lens ile keşfedildi · getfmlens.com",
    caption: (young: boolean) =>
      young ? "FM27 kariyerimde bu genç yeteneği buldum" : "FM27 kariyerimde bu oyuncuyu buldum",
  },

  massEdit: {
    button: "Toplu düzenleme",
    buttonTitle: "Listedeki herkesi düzenle",
    title: {
      player: "Oyuncuları toplu düzenle",
      staff: "Personeli toplu düzenle",
      club: "Kulüpleri toplu düzenle",
    } satisfies Record<MassEntity, string>,

    // What it applies to
    scope: (entity, total) => `Listenin şu an gösterdiği ${entityCount(entity, total)} (arama ve filtreler)`,
    scopeNone: (entity) =>
      `Aramaya ve filtrelere uyan ${nouns[entity].plain} yok, bu yüzden değiştirilecek bir şey yok.`,
    scopeTooMany: (entity, total, limit) =>
      `Listenin gösterdiği ${entityCount(entity, total)}, ` +
      `bir toplu düzenlemenin kaldırabileceğinden (${format(limit)}) fazla. ` +
      "Önce aramayı veya filtreleri daraltın.",
    loadingFields: "Alanlar okunuyor…",
    fieldsFailed: (reason) => `Alanlar okunamadı: ${reason}`,
    toFreeze,
    frozenCount: (frozen, count) =>
      frozen ? `${format(count)} donduruldu` : `${format(count)} için dondurma kaldırıldı`,
    freezeFailed: (count, reason) => `${format(count)} dondurulamadı: ${reason}`,

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
      stadium: "Stadyum",
      traits: "Özellikler",
      health: "Sağlık",
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
    addTitle: "Negatif sayı çıkarır.",
    addPointsTitle: "%70 + 10 = %80. Negatif sayı çıkarır.",
    rangeHint: (min, max) => `${format(min)}–${format(max)}`,
    amountHint: (max) => `±${format(max)}`,
    ofCurrent: "% (mevcut değerin)",
    percentTitle: "100 korur, 50 yarıya indirir",
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
    summary: (entity: MassEntity, preview: MassPreview) => {
      const noun = nouns[entity];
      const affected = preview.targets - preview.unchanged;
      return [
        preview.changes === 0
          ? !preview.freeze?.count && "Değişiklik yok"
          : affected === preview.targets
            ? `${format(preview.targets)} ${noun.plain} için ${changes(preview.changes)}`
            : `${format(preview.targets)} ${noun.of} ${format(affected)} tanesi için ${changes(preview.changes)}`,
        preview.unchanged > 0 && `${format(preview.unchanged)} ${noun.in} bu değerler zaten var`,
        preview.skippedCount > 0 && valuesLeftAlone(preview.skippedCount),
        !!preview.freeze?.count && toFreeze(preview.freeze.frozen, preview.freeze.count),
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

  comparison: {
    compare: "Karşılaştır",
    add: "Karşılaştırmaya ekle",
    remove: "Karşılaştırmadan çıkar",
    full: (max) => `Karşılaştırma en fazla ${max} oyuncu alır. Bu oyuncuyu eklemek için birini çıkarın.`,

    // The tray under the player list
    trayLabel: "Karşılaştırılacak oyuncular",
    // The name stays as the game has it, so the ending is not put on it: "Karşılaştırmadan çıkar: …".
    removePlayer: (name) => `Karşılaştırmadan çıkar: ${name}`,
    clear: "Temizle",
    open: (count) => `Karşılaştır (${count})`,

    // The dialog
    title: "Karşılaştırma",
    tooFew: "Karşılaştırmak için en az iki oyuncu ekleyin.",
    loading: "Oyuncular yükleniyor…",
    tableLabel: "Karşılaştırılan oyuncuların değerleri",
    highest: "en yüksek",
    lowest: "en düşük",
    profile: "Profil",
    close: "Kapat",
  },

  move: {
    button: "Transfer",
    buttonTitle: "Transfer et, takas et ya da kirala",

    // The dialog
    title: "Transfer",
    from: "Mevcut kulüp",
    to: "Yeni kulüp",

    // The switch at the top of the dialog
    modeLabel: "Hareket türü",
    modeMove: "Kulübe transfer et",
    modeSwap: "Oyuncuyla takas et",
    modeLoan: "Bir kulübe kiralık ver",

    // Choosing the club
    searchLabel: "Transfer edileceği kulübü ara",
    resultsLabel: "Bulunan kulüpler",
    searching: "Kulüpler aranıyor…",
    searchFailed: (reason) => `Kulüpler aranamadı: ${reason}`,
    more: (count) => `ve ${format(count)} tane daha`,
    change: "Başka kulüp seç",

    // The fee
    feeHeading: "Bedel",
    fee: "Bonservis bedeli",
    feeInvalid: (max) => `0 ile ${max} arasında tam bir tutar girin`,
    pays: (club, fee, balance, budget) =>
      `${club} öder: ${fee}. Bakiye ${balance}${budget === null ? "" : `, transfer bütçesi ${budget}`}`,
    receives: (club, fee, balance) => `${club} alır: ${fee}. Bakiye ${balance}`,
    gameFee: (buyer, seller, fee) => `${buyer} öder, ${seller} alır: ${fee}`,
    noFinances: (club) => `${club} için FM'de finans kaydı yok, parası değişmez`,

    // The contract
    wageInvalid: "0 veya daha büyük, tam bir tutar girin",
    expiresInvalid: "Bir tarih girin",

    // What the dialog says about the move itself
    chooseClub: "Oyuncunun transfer edileceği kulübü seçin.",
    fixTerms: "Önce bedeli ya da sözleşme değerlerini düzeltin.",
    checking: "Transfer kontrol ediliyor…",
    route: (from, to) => `${from} → ${to}`,
    permanent: "Geri alınamaz.",

    // Swapping with a player of the club instead
    swapTitle: "Oyuncuyla takas et",
    swapWith: "Takas edilecek oyuncu",
    playerSearchLabel: "Takas edilecek oyuncuyu ara",
    playerSearch: "Bu kulübün oyuncularını isimle ara",
    playersLabel: "Bulunan oyuncular",
    playersSearching: "Oyuncular aranıyor…",
    playersSearchFailed: (reason) => `Oyuncular aranamadı: ${reason}`,
    playersEmpty: (query) =>
      query === "" ? "Bu kulübün oyuncusu yok." : `Bu kulüpte “${query}” aramasına uyan oyuncu yok.`,
    changePlayer: "Başka oyuncu seç",

    // What the dialog says about the swap
    swapContract: "Her oyuncu kendi sözleşmesini korur.",
    staffButtonTitle: "Başka bir kulübe taşı",
    staffChooseClub: "Personelin taşınacağı kulübü seçin.",
    staffContract: "Görev ve sözleşme aynı kalır.",
    managerButton: "Kulüp değiştir",
    managerButtonTitle: "Başka bir kulübün teknik direktörü ol",
    managerTitle: "Kulüp değiştir",
    managerContract: "Oyun sana kendi koşullarıyla bir teknik direktör sözleşmesi yapar.",
    managerDisplaced: (name) => `${name} işini kaybeder`,
    managerMove: "Kulüp değiştir",
    managerMoving: "Kulüp değiştiriliyor…",
    swapChooseClub: "Takas edilecek oyuncunun kulübünü seçin.",
    swapChoosePlayer: "Takas edilecek oyuncuyu seçin.",
    swapChecking: "Takas kontrol ediliyor…",
    swapRoute: (player, from, to, other) => `${player}: ${from} → ${to}\n${other}: ${to} → ${from}`,

    // The foot
    move: "Transfer et",
    moving: "Transfer ediliyor…",
    cancel: "İptal",
    swap: "Takas et",
    swapping: "Takas ediliyor…",
    loanTitle: "Kiralık",
    loanChooseClub: "Kiralık verilecek kulübü seç.",
    loanEndsAfterToday: "Bugünden sonraki bir tarih seç",
    joinsFromToday: "Bugünü ya da sonraki bir tarihi seç",
    loan: "Kirala",
    loaning: "Kiralanıyor…",
    signButton: "İmzala",
    signButtonTitle: "Onu bir kulübe imzalat",
    signTitle: "İmza",
    signChooseClub: "İmzalayacağı kulübü seç.",
    sign: "İmzala",
    signing: "İmzalanıyor…",
    replacesMove: (club, date) => `${club} ile ${date} tarihli anlaşmasının yerine geçer`,
  },

  ties: {
    heading: "Uyruk ve yetiştiği yer",
    nationalities: "İkinci uyruklar",
    trainedInNation: "Yetiştiği ülke",
    trainedAtClub: "Yetiştiği kulüp",
    none: "Yok",
    rules: {
      1: "Yerli 15-21",
      2: "Yerli 0-21",
      5: "Yerli 15-21 (kiralıklar hariç)",
      10: "Yerli 0-19 (1 yıl)",
    },
    rule: (code) => `Yerli kuralı ${format(code)}`,

    // The button under the group, and the dialog it opens
    change: "Değiştir",
    changeTitle: "Diğer uyruklarını ve yerli statüsünü değiştir",
    title: "Uyruk ve yetiştiği yer",
    hint: "Değişiklikler FM'ye hemen gider.",
    full: "Listesi dolu, yeni bir şey eklenemez.",
    nationOf: (name) => `${name} yerine ülke`,
    ruleOf: (name) => `${name} için yerli kuralı`,
    remove: "Kaldır",
    removeTitle: (name) => `${name} kaydını kaldır`,
    addNationality: "Uyruk ekle…",
    addNation: "Ülke ekle…",
    newRule: "Yeni ülkenin yerli kuralı",
    add: "Ekle",
    working: "Oyuna yazılıyor…",
    close: "Kapat",
  },

  lists: {
    likesTitle: "Sevdiği ve sevmediği kişileri ve kulüpleri değiştir",
    strengthOf: (name) => `${name} için derece`,
    languagesTitle: "Her dili ne kadar iyi konuştuğunu değiştir",
    levelOf: (name) => `${name} seviyesi`,
    raisedBack: "FM bunu kendisi yeniden yükseltir",
    injuriesTitle: "Her sakatlığın kaç gün süreceğini değiştir",
    daysOut: "Sahalardan uzak kalacağı gün",
    daysOf: (name) => `${name} için gün sayısı`,
    save: "Kaydet",
    replace: "Değiştir",
    replaceTitle: (name) => `${name} yerine başkasını seç`,
    insteadOf: (name) => `${name} yerine`,
    searchClubs: "Kulüp ara",
    searchPeople: "Oyuncu ve personel ara",
    searching: "Aranıyor…",
    searchFailed: (reason) => `Arama yapılamadı: ${reason}`,
    noMatch: (query) => (query === "" ? "Hiçbir şey bulunamadı." : `“${query}” aramasına uyan yok.`),
    back: "Geri",
  },

  clauses: {
    change: "Değiştir",
    changeTitle: "Primlerini ve maddelerini değiştir",
    title: "Primler ve maddeler",
    hint: "Değişiklikler FM'ye hemen gider.",
    full: "Bu sözleşmede serbest kalma maddesine yer yok.",
    amountOf: (name) => `${name} tutarı`,
    conditionOf: (name) => `${name} koşulu`,
    save: "Kaydet",
    remove: "Kaldır",
    removeTitle: (name) => `${name} kaldır`,
    addRelease: "Serbest kalma maddesi ekle",
    releaseAmount: "Yeni serbest kalma maddesinin tutarı",
    add: "Ekle",
    outOfRange: (max) => `0 ile ${max} arasında bir tam sayı girin.`,
    working: "Oyuna yazılıyor…",
    close: "Kapat",
  },

  templates: {
    button: "Kopyala ve şablonlar",
    title: "Kopyala ve şablonlar",
    groups: {
      ability: "CA / PA",
      attributes: "Özellikler (gizliler dahil)",
      personality: "Kişilik",
      positions: "Pozisyonlar",
      traits: "Davranışlar",
    },
    copyHeading: "Bir oyuncudan kopyala",
    findPlayer: "Oyuncu bul",
    found: "Bulunan oyuncular",
    freeAgent: "Serbest",
    capture: (name) => (name ? `${name} oyuncusunu kopyala` : "Oyuncuyu kopyala"),
    libraryHeading: "Kayıtlı şablonlar",
    library: "Şablon",
    choose: "Bir şablon seçin",
    noneSaved: "Kayıtlı şablon yok",
    name: "Ad",
    save: "Kaydet",
    remove: "Sil",
    fieldCount: (count) => `${format(count)} alan`,
    jsonHeading: "JSON içe veya dışa aktar",
    json: "Şablon JSON",
    loadJson: "JSON yükle",
    showJson: "JSON göster",
    importFile: "Dosya içe aktar",
    applyHeading: (total, query) =>
      `${query ? `“${query}” ile eşleşen ` : ""}${format(total)} oyuncuya uygula`,
    limit: "Yalnızca bu oyuncu kimlikleri",
    limitPlaceholder: "Hepsi",
    preview: "Önizle",
    previewLabel: "Şablon önizlemesi",
    summary: (targets, changes, skipped, unchanged) =>
      `${format(targets)} oyuncu · ${changeCount(changes)} · ${format(skipped)} atlandı · ` +
      `${format(unchanged)} zaten aynı`,
    tableLabel: "Uygulanacak değişiklikler",
    columns: { player: "Oyuncu", uid: "Kimlik", field: "Alan", change: "Değişiklik" },
    firstRows: (count) => `İlk ${format(count)} değişiklik gösteriliyor.`,
    skipped: "Atlananlar",
    apply: (count) => (count === 0 ? "Uygula" : `${changes(count)} uygula`),
    applied: (count) => (count === 0 ? "Hiçbir şey değişmedi." : `${changes(count)} uygulandı.`),
    undo: "Geri al",
    undone: (count) => (count === 0 ? "Hiçbir şey geri alınmadı." : `${changes(count)} geri alındı.`),
    working: "Çalışıyor…",
    close: "Kapat",
    savedNotice: "Şablon kaydedildi.",
    loadedNotice: "Şablon yüklendi. Saklamak için kaydedin.",
    removedNotice: "Şablon silindi.",
    nameTaken: "Bu adda bir şablon zaten var. Başka bir ad seçin.",
    libraryFull: (max) => `En fazla ${max} şablon saklayabilirsiniz. Önce birini silin.`,
    tooBig: "Şablon dosyaları 128 KB'tan küçük olmalı.",
    invalid: "Bu bir FM Lens oyuncu şablonu değil.",
    badIds: "Oyuncu kimliklerini virgül veya boşlukla ayırarak yazın.",
  },

  report: {
    title: "Sorun bildir",
    what: "Ne oldu?",
    sentWith: "Herkese açık paylaşılır; sürümlerin ve son değişikliklerin de eklenir.",
    attach: "Ekle",
    files: "Dosyalar",
    video: "Video",
    remove: (name: string) => `${name} dosyasını kaldır`,
    fileProblem: {
      type: "Yalnızca görseller ve MP4 ya da MOV videolar.",
      count: "En fazla 5 görsel ve 1 video.",
      size: "Görseller en fazla 10\u00a0MB, videolar en fazla 50\u00a0MB.",
    },
    send: "Gönder",
    sending: "Gönderiliyor…",
    cancel: "İptal",
    sent: "Gönderildi. Teşekkürler.",
    close: "Kapat",
    tooMany: "Buradan çok fazla rapor gönderildi. Bir saat sonra yeniden dene.",
    failed: "Gönderilemedi. Daha sonra yeniden dene.",
  },
  wish: {
    title: "İstek listesi",
    what: "FM Lens bundan sonra ne yapsın?",
    sentWith: "Herkese açık paylaşılır; FM Lens sürümün de eklenir.",
    tooMany: "Buradan çok fazla gönderildi. Bir saat sonra yeniden dene.",
  },

  release: {
    button: "Serbest bırak",
    buttonTitle: "Serbest bırak. Serbest oyuncu olur.",

    // The dialog
    title: "Serbest bırak",
    from: "Ayrıldığı kulüp",
    checking: "Serbest bırakma kontrol ediliyor…",
    ready: (club) => `${club} → serbest oyuncu`,

    // The foot
    release: "Serbest bırak",
    releasing: "Serbest bırakılıyor…",
    cancel: "İptal",
  },

  endLoan: {
    button: "Kiralığı bitir",
    buttonTitle: "Kulübüne döner.",

    // The dialog
    title: "Kiralığı bitir",
    from: "Kiralık olduğu kulüp",
    checking: "Kiralık kontrol ediliyor…",
    ready: (from, to) => `${from} → ${to}`,

    // The foot
    end: "Kiralığı bitir",
    ending: "Bitiriliyor…",
    cancel: "İptal",
  },

  cancelTransfer: {
    button: "Transferi iptal et",
    buttonTitle: "FM'in ileri bir tarih için anlaştığı transferi iptal et.",

    // The dialog
    title: "Transferi iptal et",
    from: "Katılacağı kulüp",
    checking: "Transfer kontrol ediliyor…",
    ready: (dates) => `Tarih: ${dates}`,

    // The foot
    hint: "Geri alınamaz.",
    confirm: "Transferi iptal et",
    cancelling: "İptal ediliyor…",
    cancel: "İptal",
  },

  squad: {
    // The switch between the club's teams
    teamsLabel: "Takım",
    // The first team is the A team; the others are told apart by their age limit, or by their place in the club's list.
    teams: {
      first: "A takımı",
      b: "B takımı",
      age: (limit) => `U${limit}`,
      youth: "Altyapı adayları",
      other: (place) => `Takım ${place}`,
    },
    noTeams: "Bu kulübün takımı yok.",
    loading: "Kadro okunuyor…",
    empty: "Bu takımda oyuncu yok.",

    // Above the table
    players: (count) => `${format(count)} oyuncu`,
    averageAge: (age) => `yaş ortalaması ${age}`,
    captains: (captain, viceCaptain) => `Kaptan: ${captain} · Yardımcı kaptan: ${viceCaptain}`,

    // The actions on the whole team
    actionsLabel: "Takımın tamamına yönelik işlemler",
    healAll: "İyileştir",
    injuredCount: (injured) => `${format(injured)} sakat`,
    healAllTitle: "Takımdaki herkesi iyileştir",
    healNone: "Bu takımda sakat oyuncu yok",
    liftAll: "Cezaları kaldır",
    bannedCount: (banned) => `${format(banned)} cezalı`,
    liftAllTitle: "Takımdaki tüm cezaları kaldır",
    liftNone: "Bu takımda cezalı oyuncu yok",
    refreshAll: "Kondisyonu yenile",
    refreshAllTitle: "Herkese tam enerji, tam maç kondisyonu ve tam dinlenme",
    removeUnhappiness: "Mutsuzluğu kaldır",
    unhappyCount: (unhappy) => `${format(unhappy)} mutsuz`,
    removeUnhappinessTitle: "Takımdaki bütün mutsuzluk nedenlerini kaldır",
    unhappyNone: "Bu takımda mutsuz oyuncu yok",
    moreLabel: "Takımın tamamına yönelik diğer işlemler",
    maxMorale: "Morali tamamla",
    maxMoraleTitle: "Herkesin morali en üste",
    maxCohesion: "Uyumu tamamla",
    maxCohesionTitle: "Bütün oyuncular kulübe tamamen alışkın",
    maxTactics: "Taktiği tamamla",
    maxTacticsTitle: "Bütün oyuncular takımın taktiğine tamamen alışkın",
    maxAll: "Özellikleri tamamla…",
    maxAllTitle:
      "Herkesin bütün özellikleri 20, MY ve PY 200 (sakatlık eğilimi ve sertlik 1)",
    maxAllAsk: (count) => `${format(count)} oyuncunun bütün özellikleri tamamlansın mı?`,
    maxAllConfirm: "Özellikleri tamamla",
    cancel: "İptal",

    // What an action did, under the buttons
    written: (count) => (count === 0 ? "Hiçbir değişiklik yazılmadı" : `${changes(count)} yazıldı`),
    refused: (name, reason) => `${name}: ${reason}`,
    undo: "Geri al",
    undoTitle: "Bu değişikliklerin eski değerlerini oyuna geri yaz",

    // Captains
    captainShort: "K",
    viceCaptainShort: "YK",
    menuLabel: (name) => `Kaptanlık: ${name}`,
    menuTitle: "Kaptanlık",
    makeCaptain: "Kaptan yap",
    makeViceCaptain: "Yardımcı kaptan yap",
    nowCaptain: (name) => `${name} artık kaptan`,
    nowViceCaptain: (name) => `${name} artık yardımcı kaptan`,
    noCaptain: "Artık kaptan yok",
    noViceCaptain: "Artık yardımcı kaptan yok",

    // The table
    tableLabel: (team) => `Oyuncular: ${team}`,
    columns: {
      name: "İsim",
      position: "Poz",
      age: "Yaş",
      currentAbility: "MY",
      potentialAbility: "PY",
      condition: "Enerji",
      matchSharpness: "Maç kond.",
      jadedness: "Yorgunluk",
      morale: "Moral",
      actions: "Kaptanlık",
    } satisfies Record<SquadSort | "actions", string>,
    sortBy: (by) => `Sırala: ${by}`,
    // Said as "Sırala: …", so they stand as plain nouns.
    sortNames: {
      name: "isim",
      position: "pozisyon",
      age: "yaş",
      currentAbility: "mevcut yetenek",
      potentialAbility: "potansiyel yetenek",
      condition: "enerji",
      matchSharpness: "maç kondisyonu",
      jadedness: "yorgunluk",
      morale: "moral",
    } satisfies Record<SquadSort, string>,

    // The tags after a name
    injured: "Sakat",
    injuredTitle: (count) => `${format(count)} sakatlık`,
    banned: "Cezalı",
    bannedTitle: (count) => `${format(count)} ceza`,
    onLoan: "Kirada",
    onLoanTitle: "Başka bir kulübe kiralık gönderildi",
    loanee: "Kiralık",
    loaneeTitle: "Başka bir kulüpten kiralık geldi",
    elsewhere: "Başka takımda",
    elsewhereTitle: "Kulübün başka bir takımında oynuyor",
  },

  game: {
    name: "Football Manager",
    storefronts: {
      gamePass: "Game Pass",
      steam: "Steam",
      epic: "Epic Games",
      unknown: "Bilinmeyen mağaza",
    } satisfies Record<Storefront, string>,
    steamBuild: (id) => `derleme ${id}`,
  },

  listFeedback: { failed: "Arama başarısız", searching: "Aranıyor…", retry: "Yeniden dene" },

  errors,
};
