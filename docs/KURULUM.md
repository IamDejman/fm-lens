# FMLibreEditor: kurulum ve kullanım

FMLibreEditor, Football Manager 27 açıkken oyuncuları, personeli ve kulüpleri anında
düzenlemenizi sağlayan ücretsiz bir programdır. Windows 10 ve 11'de, oyunun **Xbox / Game
Pass** ve **Steam** sürümleriyle, Mac'te ise **Steam** sürümüyle çalışır (bkz.
[Mac'te](#macte)).

*English: [INSTALL.md](INSTALL.md)*

## 1. İndirin

Aşağıdaki bağlantıya tıklayın; indirme hemen başlar. GitHub hesabı gerekmez, bağlantı her
zaman en son sürümü indirir.

### **[⬇ FMLibreEditor'ı indir (FMLibreEditor-Setup.exe)](https://github.com/tozmoz/FMLibreEditor/releases/latest/download/FMLibreEditor-Setup.exe)**

Kurulum yapmak istemiyorsanız taşınabilir sürümü indirin:
[FMLibreEditor-portable.zip](https://github.com/tozmoz/FMLibreEditor/releases/latest/download/FMLibreEditor-portable.zip).
Zip'e sağ tıklayıp **Tümünü ayıkla** deyin ve klasördeki **FMLibreEditor.exe**'yi
çalıştırın.

## 2. Kurun

1. İndirilenler klasörünüzdeki **FMLibreEditor-Setup.exe**'ye çift tıklayın.
2. Windows mavi bir pencerede "**Windows kişisel bilgisayarınızı korudu**" diyebilir. Bunun
   sebebi programın henüz dijital olarak imzalanmamış olmasıdır; virüs olduğu anlamına
   gelmez. **Ek bilgi**'ye, ardından **Yine de çalıştır**'a tıklayın.
3. Kurulum dilini seçin, sonra **İleri** ve **Yükle**'ye basın.
   - Yönetici izni gerekmez; program yalnızca sizin kullanıcı hesabınıza kurulur.
   - Bilgisayarınızda WebView2 yoksa kurulum onu da kurar. Windows 10 ve 11'de genellikle
     zaten vardır.
4. Başlat menüsünde **FMLibreEditor** kısayolu oluşur.

## 3. Kullanın

1. **Football Manager 27**'yi açın ve bir **kayıt yükleyin**. Ana menü yetmez: oyunun
   veritabanı ancak bir kayıt yüklenince hazır olur.
2. **FMLibreEditor**'ı açın. Program çalışan oyunu kendisi bulur; **Bağlan** düğmesine
   basın.
3. Oyuncular listesi açılır. Aramak, süzmek ve sıralamak için üstteki kutuyu ve
   **Filtreler**'i kullanın. Bir oyuncuya tıklayınca profili açılır.
4. Profilde **Düzenle**'ye basın, değerleri değiştirin, **Gözden geçir** ile neyin
   değişeceğini görün ve **Uygula** ile oyuna yazın.
5. **Kulüpler** bölümünde bir kulübü açıp **Kadro** sekmesine geçin:
   - takımın oyuncularını, enerjilerini, maç kondisyonlarını ve morallerini görürsünüz;
   - kaptanı seçebilirsiniz;
   - **Hepsini iyileştir**, **Hepsine moral ver** ve **Hepsini dinlendir** ile bütün takımı
     bir kerede düzenleyebilirsiniz.

![Kulübün kadro sekmesi](images/kadro.png)

## Mac'te

FMLibreEditor, Apple silicon ya da Intel işlemcili Mac'lerde FM27'nin **Steam** sürümüyle
çalışır. macOS hiçbir uygulamayı başka bir uygulamanın belleğine sokmaz; bu yüzden FM27
belleğini kendisi açar: Steam onu bir başlatma seçeneğiyle başlattığında FMLibreEditor'ın
küçük köprü kütüphanesini yükler. Uygulama bunu sizin için ayarlar; Sistem Bütünlüğü Koruması
(SIP) hep açık kalır.

1. **İndirin:**
   [FMLibreEditor-macOS.zip](https://github.com/tozmoz/FMLibreEditor/releases/latest/download/FMLibreEditor-macOS.zip).
   Tarayıcınız açmadıysa zip'i açın ve **FMLibreEditor**'ı **Uygulamalar** klasörüne
   sürükleyin.
2. **İlk kez açın.** macOS, FMLibreEditor'ı doğrulayamadığını söyleyebilir; çünkü uygulama
   henüz Apple'ın onayından (notarization) geçmedi. **Bitti**'ye basın, **Sistem Ayarları ›
   Gizlilik ve Güvenlik**'i açın ve FMLibreEditor'ın yanındaki **Yine de Aç**'a basın.
3. **Köprüyü bir kez kurun.** Steam'den tamamen çıkın (menü çubuğundaki **Steam**
   menüsünden; penceresini kapatmak yetmez), sonra FMLibreEditor'da **Köprüyü kur**'a basın.
   Uygulama köprüyü `~/Library/Application Support/FMLibreEditor` klasörüne kopyalar ve
   Steam'de FM27'ye bir başlatma seçeneği ekler.
   - Steam hâlâ açıksa uygulama seçeneği size gösterir. Steam'de Football Manager 27'ye sağ
     tıklayıp **Özellikler › Genel › Başlatma Seçenekleri**'ne yapıştırın.
4. **FM27'yi Steam'den başlatın** ve **bir kayıt yükleyin**. FM27 zaten açıksa kapatıp
   yeniden başlatın. Ardından FMLibreEditor'da **Bağlan**'a basın. Sonrası yukarıdaki 3.
   adımdaki gibidir.

Köprüyü kaldırmak için Steam'den çıkın ve uygulamada **Köprüyü kaldır**'a basın.
`~/Library/Application Support/FMLibreEditor` içindeki dosyaları elle silmeyin: başlatıcısı
olmayan bir başlatma seçeneğiyle Steam oyunu başlatamaz.

## Bilmeniz gerekenler

- **Önce kaydınızı yedekleyin.** Düzenleyici oyunun belleğine yazar; değişiklikler, oyunda
  kaydettiğinizde kayıt dosyasına geçer. Denemeden önce oyunda kaydınızı farklı bir adla
  kaydedin.
- **Değişiklikler Devam'dan sonra görünür.** Oyunun ekranları verinin bir kopyasını
  gösterir ve bu kopyayı oyun ilerleyince tazeler. Değişiklik bellekte hemen olur ama
  ekranda oyunda bir kez **Devam**'a bastıktan sonra görünür.
- **Her şey geri alınabilir.** **Değişiklikler** bölümü yaptığınız her şeyi listeler;
  **Geri al** eski değeri geri yazar. Toplu işlemler tek seferde geri alınır.
- **Antivirüs uyarısı.** Başka bir programın belleğini okuyup yazan araçlar (FMRTE ve Cheat
  Engine gibi) bazen antivirüslerce yanlışlıkla işaretlenir. FMLibreEditor açık kaynaktır;
  kodunu bu depoda herkes inceleyebilir. Uyarı alırsanız programı antivirüsünüzün izin
  listesine ekleyebilirsiniz.

## Güncelleme ve kaldırma

- **Güncellemek için** yukarıdaki indirme bağlantısını yeniden kullanıp kurun; yeni sürüm
  eskisinin üzerine kurulur.
- **Kaldırmak için:** Windows Ayarlar → Uygulamalar → FMLibreEditor → Kaldır.
- **Mac'te güncellemek için** zip'i yeniden indirin ve yeni FMLibreEditor'ı
  Uygulamalar'daki eskisinin yerine koyun. Bir sürümün notlarında köprünün değiştiği
  yazıyorsa, Steam kapalıyken uygulamada önce **Köprüyü kaldır**'a, sonra **Köprüyü kur**'a
  da basın.
- **Mac'te kaldırmak için** Steam kapalıyken **Köprüyü kaldır**'a basın, sonra
  FMLibreEditor'ı Uygulamalar'dan Çöp Sepeti'ne taşıyın.

## Sık sorulanlar

- **"Football Manager 27 çalışmıyor" diyor.** Oyunu açıp bir kayıt yükleyin ve tekrar
  deneyin.
- **"Oyuncu listesi bulunamadı" diyor.** Oyun ana menüde; bir kayıt yükleyin.
- **Program yalnızca okuma modunda açıldı.** Windows oyuna yazmaya izin vermemiş. Programı
  kapatıp yeniden açın; olmazsa sağ tıklayıp **Yönetici olarak çalıştır** deyin.
- **Mac'te oyuna giremiyor.** FM27'yi Steam'in başlatma seçeneğiyle başlatması gerekir:
  FM27'yi kapatıp Steam'den yeniden başlatın. Bağlantı paneli başlatma seçeneğinin ayarlı
  olmadığını söylüyorsa Steam kapalıyken köprüyü yeniden kurun.
- **macOS uygulamanın hasarlı olduğunu ve açılamayacağını söylüyor.** macOS bunu, kontrol
  edemediği indirilmiş uygulamalar için söyleyebilir. Terminal'de
  `xattr -dr com.apple.quarantine /Applications/FMLibreEditor.app` komutu indirme işaretini
  kaldırır ve uygulama açılır.
- **Hangi sürümler destekleniyor?** FM27'nin Windows'taki Xbox / Game Pass ve Steam
  sürümleri ile Mac'teki Steam sürümü. Epic henüz desteklenmiyor.
- **Ücretli mi?** Hayır. FMLibreEditor ücretsiz ve açık kaynaklıdır (GNU GPL, sürüm 3 ya da
  sonrası).
