import { useLanguage } from '../contexts/LanguageContext';
import { FileText, Shield, AlertCircle, Scale, Ban, Camera, Cloud, Building2 } from 'lucide-react';

export function TermsAndConditions() {
  const { language } = useLanguage();

  const content = {
    nl: {
      title: 'Algemene Voorwaarden',
      subtitle: 'StageNation \u2014 Evenementen & Ticketing',
      lastUpdate: 'Laatst bijgewerkt: april 2026',
      sections: [
        {
          icon: Building2,
          title: 'Bedrijfsinformatie',
          content: [
            'StageNation is een evenementorganisator en ticketverkoper, uitgebaat door:',
            '',
            'Lumetrix BV',
            'Exelgaarden 20',
            '3550 Heusden-Zolder, Belgi\u00eb',
            'Ondernemingsnummer: BE 1029.601.154',
            'E-mail: info@stagenation.be',
          ],
        },
        {
          icon: FileText,
          title: '1. Toepassingsgebied',
          content: [
            'Deze algemene voorwaarden (hierna \u201cVoorwaarden\u201d) zijn van toepassing op alle ticketverkopen, reserveringen, evenementen, diensten en digitale interacties aangeboden via www.stagenation.be, bijhorende mobiele applicaties, het betreden van een evenementlocatie of het op enige andere wijze gebruik maken van de diensten en communicatiekanalen van StageNation.',
            'Door het bezoeken van de website, het aanmaken van een account, het kopen van een ticket, het gebruik van een promotiecode, het betreden van een evenementlocatie of het op enige andere wijze gebruik maken van de diensten van StageNation, verklaart de gebruiker zich uitdrukkelijk en onherroepelijk akkoord met deze Voorwaarden.',
            'StageNation behoudt zich het recht voor deze Voorwaarden op elk moment te wijzigen. Wijzigingen treden in werking vanaf publicatie op de website. Het is de verantwoordelijkheid van de gebruiker om regelmatig kennis te nemen van de meest recente versie.',
            'Kennelijke prijs-, druk-, technische of publicatiefouten op de website, in e-mails, op tickets, op sociale media of andere communicatiekanalen binden StageNation niet en kunnen geen grond vormen voor enige vordering.',
            'Indien voor een specifiek evenement aanvullende of afwijkende voorwaarden gelden, hebben deze voorrang op de onderhavige Voorwaarden. In geval van tegenstrijdigheid prevaleren de evenement-specifieke voorwaarden.',
            'De eventuele nietigheid of ongeldigheid van een bepaling uit deze Voorwaarden tast de geldigheid van de overige bepalingen niet aan. De ongeldige bepaling zal worden vervangen door een geldige bepaling die de oorspronkelijke intentie zo dicht mogelijk benadert.',
          ],
        },
        {
          icon: Scale,
          title: '2. Herroepingsrecht',
          content: [
            'Overeenkomstig artikel VI.53, 12\u00b0 van het Belgisch Wetboek van Economisch Recht en de Europese Richtlijn 2011/83/EU inzake consumentenrechten, is het herroepingsrecht van 14 dagen uitdrukkelijk uitgesloten voor overeenkomsten betreffende vrijetijdsbesteding wanneer in de overeenkomst een bepaalde datum of periode van uitvoering is voorzien.',
            'Ticketaankopen via StageNation vallen onder deze uitzondering en zijn daarom onherroepelijk en definitief na voltooiing van de betaling. De koper erkent hiervan uitdrukkelijk op de hoogte te zijn v\u00f3\u00f3r het afronden van de aankoop.',
          ],
        },
        {
          icon: Shield,
          title: '3. Tickets & Toegang',
          content: [
            'Elk ticket is geldig voor één persoon en éénmalige toegang tot het evenement.',
            'Tickets worden digitaal geleverd en bevatten een unieke QR-code of barcode.',
            'Elke QR-code of barcode kan slechts één keer geldig gescand worden.',
            'Bij duplicatie van een ticket geldt enkel de eerste scan als geldig.',
            'De organisator is niet verantwoordelijk voor verlies, diefstal, beschadiging of onrechtmatig delen van tickets, QR-codes of barcodes.',
            'Tickets blijven eigendom van de organisator totdat de volledige betaling succesvol werd ontvangen.',
            'De organisator behoudt zich het recht voor tickets ongeldig te verklaren bij fraude, manipulatie, duplicatie, misbruik of onvolledige betaling.',
            'De organisator kan identiteitscontrole uitvoeren bij toegang tot het evenement.',
          ],
        },
        {
          icon: AlertCircle,
          title: '4. Annulatie & Teruggave',
          content: [
            'Tickets worden in principe niet terugbetaald.',
            'Een terugbetaling kan enkel in uitzonderlijke omstandigheden worden overwogen.',
            '',
            '✓ Mogelijke uitzonderingen:',
            '  • overlijden van een familielid in eerste graad',
            '  • ernstige ziekte of hospitalisatie van de ticketkoper',
            '  In deze gevallen moet officieel bewijs worden aangeleverd (bijvoorbeeld doktersattest of overlijdensbericht).',
            '',
            '✗ Geen terugbetaling bij:',
            '  • niet opdagen',
            '  • te laat aankomen',
            '  • wijziging van persoonlijke plannen',
            '  • slechte weersomstandigheden',
            '  • verlies of diefstal van tickets',
            '  • ziekte zonder officieel bewijs',
            '  • wijzigingen in line-up, artiesten of programma',
            '  • wijziging van zit- of staanplaats zonder waardeverlies',
            '  • verwijdering wegens overtreding van huisregels',
            '',
            'Eventuele terugbetalingen kunnen beperkt zijn tot de nominale ticketprijs. Servicekosten, transactiekosten en administratiekosten worden niet terugbetaald.',
            'De organisator behoudt het exclusieve recht om de geldigheid van een terugbetalingsaanvraag te beoordelen.',
            'Door een ticket te kopen erkent de koper dat betwisting van de betaling via chargeback zonder geldige reden kan leiden tot annulering van het ticket en eventuele bijkomende administratieve kosten.',
          ],
        },
        {
          icon: FileText,
          title: '5. Annulatie of Wijziging van het Event',
          content: [
            'Indien het evenement volledig wordt geannuleerd door de organisator kan de koper recht hebben op:',
            '  • terugbetaling van de ticketprijs, of',
            '  • behoud van het ticket voor een nieuwe datum.',
            '',
            'Indien een evenement wordt verplaatst naar een andere datum blijven tickets automatisch geldig voor de nieuwe datum.',
            '',
            'Wijzigingen in:',
            '  • line-up',
            '  • artiesten',
            '  • programma',
            '  • timing',
            '  • productie',
            '  • locatie binnen redelijke afstand',
            'geven geen automatisch recht op terugbetaling.',
          ],
        },
        {
          icon: Ban,
          title: '6. Doorverkoop & Fraude',
          content: [
            'Tickets mogen kosteloos worden overgedragen aan derden.',
            'Het is verboden tickets commercieel door te verkopen zonder toestemming van de organisator.',
            'Het is verboden tickets door te verkopen boven de oorspronkelijke ticketprijs.',
            'Tickets verkregen via niet-officiële verkoopkanalen kunnen ongeldig worden verklaard.',
            'De organisator kan de geldigheid van tickets afkomstig van externe doorverkoop niet garanderen.',
          ],
        },
        {
          icon: Shield,
          title: '7. Aansprakelijkheid',
          content: [
            'De organisator is niet aansprakelijk voor:',
            '  • verlies, diefstal of schade aan persoonlijke eigendommen',
            '  • lichamelijk letsel, behalve in geval van bewezen zware fout of opzet',
            '  • schade veroorzaakt door derden',
            '',
            'Behoudens opzet of zware fout is de aansprakelijkheid van de organisator in elk geval beperkt tot de nominale waarde van het ticket.',
            'Bezoekers betreden het evenement op eigen risico.',
          ],
        },
        {
          icon: AlertCircle,
          title: '8. Gedrag & Veiligheid',
          content: [
            'De organisator behoudt zich het recht voor bezoekers te weigeren of te verwijderen bij:',
            '  • agressief of storend gedrag',
            '  • niet-naleving van veiligheidsvoorschriften',
            '  • bezit van verboden voorwerpen of middelen',
            '',
            'Verboden voorwerpen kunnen onder meer zijn:',
            '  • wapens',
            '  • drugs',
            '  • vuurwerk',
            '  • eigen drank',
            '',
            'Bezoekers kunnen onderworpen worden aan veiligheidscontroles of fouillering.',
            'Instructies van personeel en security dienen steeds te worden gevolgd.',
            'Toegangsweigering of verwijdering geeft geen recht op terugbetaling.',
          ],
        },
        {
          icon: Camera,
          title: '9. Beeld- en Geluidsopnames',
          content: [
            'Tijdens evenementen kunnen foto- en video-opnames worden gemaakt voor promotionele, redactionele en marketingdoeleinden.',
            'Bezoekers kunnen hierbij incidentieel in beeld komen.',
          ],
        },
        {
          icon: Shield,
          title: '10. Privacy & Gegevensbescherming',
          content: [
            'Persoonsgegevens worden verwerkt conform de GDPR-wetgeving.',
            'Gegevens worden uitsluitend verwerkt voor onder meer:',
            '  • ticketverwerking',
            '  • klantenservice',
            '  • eventcommunicatie',
            '  • fraudepreventie en beveiliging',
            '',
            'Meer informatie is beschikbaar in het privacybeleid.',
          ],
        },
        {
          icon: Cloud,
          title: '11. Overmacht',
          content: [
            'De organisator kan niet aansprakelijk worden gesteld voor annulatie of wijzigingen veroorzaakt door overmacht.',
            '',
            'Voorbeelden van overmacht zijn:',
            '  • extreme weersomstandigheden',
            '  • overheidsmaatregelen',
            '  • veiligheidsdreigingen',
            '  • pandemieën',
            '  • stakingen',
            '  • technische storingen buiten controle',
            '',
            'In dergelijke gevallen kan een alternatieve datum, voucher of andere compensatie worden aangeboden.',
          ],
        },
        {
          icon: Scale,
          title: '12. Toepasselijk Recht',
          content: [
            'Op deze voorwaarden is het Belgisch recht van toepassing.',
            'Geschillen vallen onder de bevoegde rechtbanken volgens de Belgische wetgeving.',
          ],
        },
      ],
    },
    tr: {
      title: 'Genel \u015Eartlar ve Ko\u015Fullar',
      subtitle: 'StageNation \u2014 Etkinlikler & Biletleme',
      lastUpdate: 'Son g\u00fcncelleme: Nisan 2026',
      sections: [
        {
          icon: Building2,
          title: 'Şirket Bilgileri',
          content: [
            'StageNation, aşağıdaki şirket tarafından işletilen bir etkinlik organizatörü ve bilet satış hizmetidir:',
            '',
            'Lumetrix BV',
            'Exelgaarden 20',
            '3550 Heusden-Zolder',
            'Belçika',
            '',
            'KDV numarası: BE1029.601.154',
            '',
            'İletişim:',
            'E-posta: info@stagenation.be',
          ],
        },
        {
          icon: FileText,
          title: '1. Kapsam',
          content: [
            'Bu genel şartlar, www.stagenation.be ve bağlı uygulamalar üzerinden sunulan tüm bilet satışları, etkinlikler ve hizmetler için geçerlidir.',
            'Bilet satın alan veya etkinliğe katılan kişi, bu şartları tamamen kabul etmiş sayılır.',
            'Web sitesindeki veya diğer iletişim kanallarındaki açık fiyat hataları, teknik hatalar veya yayın hataları organizatörü bağlamaz.',
            'Belirli bir etkinlik için ek şartlar varsa, bu şartlar öncelikli olarak uygulanır.',
          ],
        },
        {
          icon: Scale,
          title: '2. Cayma Hakkı',
          content: [
            'Avrupa tüketici mevzuatına göre belirli bir tarihe sahip boş zaman etkinlikleri için alınan biletlerde 14 günlük cayma hakkı geçerli değildir.',
            'Bu nedenle StageNation üzerinden yapılan bilet alımları ödeme sonrası kesindir.',
          ],
        },
        {
          icon: Shield,
          title: '3. Biletler ve Giriş',
          content: [
            'Her bilet tek kişi ve tek seferlik giriş için geçerlidir.',
            'Biletler dijital olarak teslim edilir ve benzersiz bir QR kodu veya barkod içerir.',
            'Her QR kodu veya barkod yalnızca bir kez geçerli şekilde okutulabilir.',
            'Bir biletin kopyalanması halinde yalnızca ilk okutma geçerli sayılır.',
            'Organizatör; biletlerin, QR kodlarının veya barkodların kaybı, çalınması, zarar görmesi veya yetkisiz paylaşılmasından sorumlu değildir.',
            'Tam ödeme başarılı şekilde alınana kadar biletler organizatörün mülkiyetinde kalır.',
            'Organizatör; sahtecilik, manipülasyon, kopyalama, kötüye kullanım veya eksik ödeme durumunda biletleri geçersiz kılma hakkını saklı tutar.',
            'Organizatör girişte kimlik kontrolü yapabilir.',
          ],
        },
        {
          icon: AlertCircle,
          title: '4. İptal ve İade',
          content: [
            'Biletler kural olarak iade edilmez.',
            'İade yalnızca istisnai durumlarda değerlendirilebilir.',
            '',
            '✓ Olası istisnalar:',
            '  • birinci derece aile ferdinin vefatı',
            '  • bilet sahibinin ciddi hastalığı veya hastaneye yatışı',
            '  Bu durumlarda resmi belge sunulmalıdır (örneğin doktor raporu veya ölüm belgesi).',
            '',
            '✗ Aşağıdaki durumlarda iade yapılmaz:',
            '  • etkinliğe gelmeme',
            '  • geç gelme',
            '  • kişisel plan değişikliği',
            '  • kötü hava koşulları',
            '  • biletlerin kaybolması veya çalınması',
            '  • resmi belge olmadan hastalık',
            '  • sanatçı kadrosu, sanatçılar veya programdaki değişiklikler',
            '  • değer kaybı olmaksızın oturma veya ayakta durma yerinin değiştirilmesi',
            '  • kurallara aykırılık nedeniyle etkinlikten çıkarılma',
            '',
            'Olası iadeler yalnızca nominal bilet bedeli ile sınırlı olabilir. Hizmet bedelleri, işlem ücretleri ve idari ücretler iade edilmez.',
            'Organizatör, iade talebinin geçerliliğini değerlendirme konusunda münhasır hakka sahiptir.',
            'Bilet satın alan kişi, geçerli bir neden olmaksızın chargeback yoluyla ödemeye itiraz etmesinin biletin iptaline ve ek idari masraflara yol açabileceğini kabul eder.',
          ],
        },
        {
          icon: FileText,
          title: '5. Etkinliğin İptali veya Değiştirilmesi',
          content: [
            'Etkinlik organizatör tarafından tamamen iptal edilirse alıcı aşağıdaki haklardan birine sahip olabilir:',
            '  • bilet bedelinin iadesi, veya',
            '  • biletin yeni bir tarih için geçerli sayılması.',
            '',
            'Bir etkinlik başka bir tarihe ertelenirse biletler otomatik olarak yeni tarih için geçerli kalır.',
            '',
            'Aşağıdaki değişiklikler otomatik iade hakkı doğurmaz:',
            '  • sanatçı kadrosu',
            '  • sanatçılar',
            '  • program',
            '  • zamanlama',
            '  • prodüksiyon',
            '  • makul mesafe içindeki mekan değişikliği',
          ],
        },
        {
          icon: Ban,
          title: '6. Yeniden Satış ve Sahtecilik',
          content: [
            'Biletler ücretsiz olarak üçüncü kişilere devredilebilir.',
            'Organizatörün izni olmadan biletlerin ticari amaçla yeniden satılması yasaktır.',
            'Biletlerin orijinal satış fiyatının üzerinde yeniden satılması yasaktır.',
            'Resmi olmayan satış kanallarından elde edilen biletler geçersiz sayılabilir.',
            'Organizatör, dış yeniden satış kaynaklarından gelen biletlerin geçerliliğini garanti etmez.',
          ],
        },
        {
          icon: Shield,
          title: '7. Sorumluluk',
          content: [
            'Organizatör aşağıdakilerden sorumlu değildir:',
            '  • kişisel eşyaların kaybolması, çalınması veya zarar görmesi',
            '  • yalnızca ağır kusur veya kasıt ispat edilmediği sürece bedensel yaralanma',
            '  • üçüncü kişiler tarafından verilen zararlar',
            '',
            'Kasıt veya ağır kusur halleri dışında organizatörün sorumluluğu her durumda biletin nominal değeri ile sınırlıdır.',
            'Ziyaretçiler etkinliğe kendi sorumlulukları altında katılır.',
          ],
        },
        {
          icon: AlertCircle,
          title: '8. Davranış ve Güvenlik',
          content: [
            'Organizatör şu durumlarda ziyaretçileri reddetme veya çıkarma hakkını saklı tutar:',
            '  • saldırgan veya rahatsız edici davranış',
            '  • güvenlik kurallarına uyulmaması',
            '  • yasaklı nesne veya maddelerin bulundurulması',
            '',
            'Yasaklı nesneler arasında şunlar bulunabilir:',
            '  • silahlar',
            '  • uyuşturucular',
            '  • havai fişekler',
            '  • dışarıdan getirilen içecekler',
            '',
            'Ziyaretçiler güvenlik kontrolüne veya üst aramasına tabi tutulabilir.',
            'Personel ve güvenlik görevlilerinin talimatlarına her zaman uyulmalıdır.',
            'Girişin reddedilmesi veya etkinlikten çıkarılma iade hakkı doğurmaz.',
          ],
        },
        {
          icon: Camera,
          title: '9. Görüntü ve Ses Kayıtları',
          content: [
            'Etkinlikler sırasında tanıtım, editoryal ve pazarlama amaçlı fotoğraf ve video çekimleri yapılabilir.',
            'Ziyaretçiler bu çekimlerde tesadüfi olarak görüntülenebilir.',
          ],
        },
        {
          icon: Shield,
          title: '10. Gizlilik ve Kişisel Verilerin Korunması',
          content: [
            'Kişisel veriler GDPR mevzuatına uygun şekilde işlenir.',
            'Veriler yalnızca şu amaçlarla işlenir:',
            '  • bilet işlemleri',
            '  • müşteri hizmetleri',
            '  • etkinlik iletişimi',
            '  • dolandırıcılığın önlenmesi ve güvenlik',
            '',
            'Daha fazla bilgi gizlilik politikasında yer almaktadır.',
          ],
        },
        {
          icon: Cloud,
          title: '11. Mücbir Sebepler',
          content: [
            'Organizatör, mücbir sebeplerden kaynaklanan iptal veya değişikliklerden sorumlu tutulamaz.',
            '',
            'Mücbir sebeplere örnek olarak şunlar verilebilir:',
            '  • aşırı hava koşulları',
            '  • resmi makam kararları',
            '  • güvenlik tehditleri',
            '  • pandemiler',
            '  • grevler',
            '  • kontrol dışı teknik arızalar',
            '',
            'Bu durumlarda alternatif bir tarih, voucher veya başka bir telafi şekli sunulabilir.',
          ],
        },
        {
          icon: Scale,
          title: '12. Uygulanacak Hukuk',
          content: [
            'Bu şartlara Belçika hukuku uygulanır.',
            'Uyuşmazlıklar Belçika mevzuatına göre yetkili mahkemelerde çözümlenir.',
          ],
        },
      ],
    },
    fr: {
      title: 'Conditions G\u00e9n\u00e9rales',
      subtitle: 'StageNation \u2014 \u00c9v\u00e9nements & Billetterie',
      lastUpdate: 'Derni\u00e8re mise \u00e0 jour : avril 2026',
      sections: [
        {
          icon: Building2,
          title: "Informations sur l'entreprise",
          content: [
            'StageNation est un organisateur d’événements et vendeur de billets exploité par :',
            '',
            'Lumetrix BV',
            'Exelgaarden 20',
            '3550 Heusden-Zolder',
            'Belgique',
            '',
            'Numéro de TVA : BE1029.601.154',
            '',
            'Contact :',
            'Email : info@stagenation.be',
          ],
        },
        {
          icon: FileText,
          title: "1. Champ d'application",
          content: [
            'Les présentes conditions générales s’appliquent à toutes les ventes de billets, événements et services proposés via www.stagenation.be et les applications associées.',
            "En achetant un billet ou en accédant à un événement, l’acheteur accepte pleinement les présentes conditions.",
            'Les erreurs manifestes de prix, erreurs techniques ou erreurs de publication sur le site web ou sur d’autres canaux de communication ne lient pas l’organisateur.',
            'Si des conditions complémentaires s’appliquent à un événement spécifique, celles-ci prévalent.',
          ],
        },
        {
          icon: Scale,
          title: '2. Droit de rétractation',
          content: [
            'Conformément à la législation européenne sur la consommation, le droit de rétractation de 14 jours ne s’applique pas à l’achat de billets pour des activités de loisirs à date déterminée.',
            'Les achats de billets via StageNation sont donc définitifs après paiement.',
          ],
        },
        {
          icon: Shield,
          title: '3. Billets & Accès',
          content: [
            'Chaque billet est valable pour une seule personne et un seul accès à l’événement.',
            'Les billets sont fournis sous forme numérique et contiennent un code QR ou un code-barres unique.',
            'Chaque code QR ou code-barres ne peut être scanné valablement qu’une seule fois.',
            'En cas de duplication d’un billet, seul le premier scan est considéré comme valable.',
            "L’organisateur n’est pas responsable en cas de perte, de vol, de détérioration ou de partage non autorisé des billets, codes QR ou codes-barres.",
            "Les billets restent la propriété de l’organisateur jusqu’à réception complète du paiement.",
            "L’organisateur se réserve le droit d’invalider les billets en cas de fraude, manipulation, duplication, abus ou paiement incomplet.",
            "L’organisateur peut procéder à un contrôle d’identité à l’entrée de l’événement.",
          ],
        },
        {
          icon: AlertCircle,
          title: '4. Annulation & Remboursement',
          content: [
            'Les billets ne sont en principe pas remboursables.',
            'Un remboursement ne peut être envisagé que dans des circonstances exceptionnelles.',
            '',
            '✓ Exceptions possibles :',
            "  • décès d’un membre de la famille au premier degré",
            "  • maladie grave ou hospitalisation de l’acheteur du billet",
            '  Dans ces cas, une preuve officielle doit être fournie (par exemple certificat médical ou acte de décès).',
            '',
            '✗ Aucun remboursement dans les cas suivants :',
            "  • absence à l’événement",
            '  • arrivée tardive',
            '  • modification des plans personnels',
            '  • mauvaises conditions météorologiques',
            '  • perte ou vol des billets',
            '  • maladie sans preuve officielle',
            '  • modifications du line-up, des artistes ou du programme',
            '  • modification de place assise ou debout sans perte de valeur',
            '  • expulsion pour non-respect du règlement',
            '',
            'Tout remboursement éventuel peut être limité à la valeur nominale du billet. Les frais de service, frais de transaction et frais administratifs ne sont pas remboursés.',
            "L’organisateur conserve le droit exclusif d’apprécier la validité d’une demande de remboursement.",
            'En achetant un billet, l’acheteur reconnaît qu’une contestation du paiement par chargeback sans motif valable peut entraîner l’annulation du billet et d’éventuels frais administratifs supplémentaires.',
          ],
        },
        {
          icon: FileText,
          title: "5. Annulation ou Modification de l'Événement",
          content: [
            "Si l’événement est entièrement annulé par l’organisateur, l’acheteur peut avoir droit à :",
            '  • un remboursement du prix du billet, ou',
            '  • le maintien du billet pour une nouvelle date.',
            '',
            'Si un événement est reporté à une autre date, les billets restent automatiquement valables pour la nouvelle date.',
            '',
            'Les modifications concernant :',
            '  • le line-up',
            '  • les artistes',
            '  • le programme',
            '  • l’horaire',
            '  • la production',
            '  • le lieu dans un rayon raisonnable',
            'ne donnent pas automatiquement droit à un remboursement.',
          ],
        },
        {
          icon: Ban,
          title: '6. Revente & Fraude',
          content: [
            'Les billets peuvent être transférés gratuitement à des tiers.',
            "Il est interdit de revendre des billets à des fins commerciales sans l’autorisation de l’organisateur.",
            'Il est interdit de revendre des billets à un prix supérieur au prix d’origine.',
            'Les billets obtenus via des canaux non officiels peuvent être déclarés invalides.',
            "L’organisateur ne peut garantir la validité des billets provenant de reventes externes.",
          ],
        },
        {
          icon: Shield,
          title: '7. Responsabilité',
          content: [
            "L’organisateur n’est pas responsable de :",
            '  • la perte, le vol ou les dommages aux effets personnels',
            '  • les blessures corporelles, sauf en cas de faute lourde ou dol prouvé',
            '  • les dommages causés par des tiers',
            '',
            "Sauf en cas de dol ou de faute lourde, la responsabilité de l’organisateur est en tout état de cause limitée à la valeur nominale du billet.",
            'Les visiteurs accèdent à l’événement à leurs propres risques.',
          ],
        },
        {
          icon: AlertCircle,
          title: '8. Comportement & Sécurité',
          content: [
            "L’organisateur se réserve le droit de refuser ou d’expulser les visiteurs en cas de :",
            '  • comportement agressif ou perturbateur',
            '  • non-respect des consignes de sécurité',
            '  • possession d’objets ou substances interdits',
            '',
            'Les objets interdits peuvent notamment inclure :',
            '  • armes',
            '  • drogues',
            '  • feux d’artifice',
            '  • boissons apportées de l’extérieur',
            '',
            'Les visiteurs peuvent être soumis à des contrôles de sécurité ou à une fouille.',
            'Les instructions du personnel et de la sécurité doivent toujours être respectées.',
            'Le refus d’accès ou l’expulsion ne donnent droit à aucun remboursement.',
          ],
        },
        {
          icon: Camera,
          title: '9. Enregistrements Photos et Vidéos',
          content: [
            'Des photos et vidéos peuvent être réalisées lors des événements à des fins promotionnelles, éditoriales et marketing.',
            'Les visiteurs peuvent apparaître de manière incidente dans ces images.',
          ],
        },
        {
          icon: Shield,
          title: '10. Confidentialité & Protection des Données',
          content: [
            'Les données personnelles sont traitées conformément au RGPD.',
            'Les données sont traitées notamment pour :',
            '  • le traitement des billets',
            '  • le service client',
            "  • la communication liée à l’événement",
            '  • la prévention de la fraude et la sécurité',
            '',
            'Plus d’informations sont disponibles dans la politique de confidentialité.',
          ],
        },
        {
          icon: Cloud,
          title: '11. Force Majeure',
          content: [
            "L’organisateur ne peut être tenu responsable des annulations ou modifications causées par un cas de force majeure.",
            '',
            'Des exemples de force majeure sont notamment :',
            '  • conditions météorologiques extrêmes',
            '  • mesures gouvernementales',
            '  • menaces pour la sécurité',
            '  • pandémies',
            '  • grèves',
            '  • pannes techniques hors contrôle',
            '',
            'Dans de tels cas, une nouvelle date, un voucher ou une autre compensation peut être proposée.',
          ],
        },
        {
          icon: Scale,
          title: '12. Droit Applicable',
          content: [
            'Les présentes conditions sont régies par le droit belge.',
            'Les litiges relèvent des juridictions compétentes conformément à la législation belge.',
          ],
        },
      ],
    },
    de: {
      title: 'Allgemeine Gesch\u00e4ftsbedingungen',
      subtitle: 'StageNation \u2014 Veranstaltungen & Ticketing',
      lastUpdate: 'Letzte Aktualisierung: April 2026',
      sections: [
        {
          icon: Building2,
          title: 'Unternehmensinformationen',
          content: [
            'StageNation ist ein Veranstalter und Ticketverkäufer, betrieben von:',
            '',
            'Lumetrix BV',
            'Exelgaarden 20',
            '3550 Heusden-Zolder',
            'Belgien',
            '',
            'USt-IdNr.: BE1029.601.154',
            '',
            'Kontakt:',
            'E-Mail: info@stagenation.be',
          ],
        },
        {
          icon: FileText,
          title: '1. Geltungsbereich',
          content: [
            'Diese Allgemeinen Geschäftsbedingungen gelten für alle Ticketverkäufe, Veranstaltungen und Dienstleistungen, die über www.stagenation.be und zugehörige Anwendungen angeboten werden.',
            'Mit dem Kauf eines Tickets oder dem Betreten einer Veranstaltung erklärt sich der Käufer vollständig mit diesen Bedingungen einverstanden.',
            'Offensichtliche Preisfehler, technische Fehler oder Veröffentlichungsfehler auf der Website oder in anderen Kommunikationskanälen binden den Veranstalter nicht.',
            'Sofern für eine bestimmte Veranstaltung zusätzliche Bedingungen gelten, haben diese Vorrang.',
          ],
        },
        {
          icon: Scale,
          title: '2. Widerrufsrecht',
          content: [
            'Nach dem europäischen Verbraucherrecht besteht kein 14-tägiges Widerrufsrecht für den Kauf von Tickets für Freizeitveranstaltungen mit festem Termin.',
            'Ticketkäufe über StageNation sind daher nach Zahlung endgültig.',
          ],
        },
        {
          icon: Shield,
          title: '3. Tickets & Zutritt',
          content: [
            'Jedes Ticket ist für eine Person und einen einmaligen Zutritt zur Veranstaltung gültig.',
            'Tickets werden digital geliefert und enthalten einen eindeutigen QR-Code oder Barcode.',
            'Jeder QR-Code oder Barcode kann nur einmal gültig gescannt werden.',
            'Bei Duplikaten eines Tickets gilt ausschließlich der erste Scan als gültig.',
            'Der Veranstalter haftet nicht für Verlust, Diebstahl, Beschädigung oder unbefugte Weitergabe von Tickets, QR-Codes oder Barcodes.',
            'Tickets bleiben bis zum vollständigen erfolgreichen Zahlungseingang Eigentum des Veranstalters.',
            'Der Veranstalter behält sich das Recht vor, Tickets bei Betrug, Manipulation, Duplikation, Missbrauch oder unvollständiger Zahlung für ungültig zu erklären.',
            'Der Veranstalter kann beim Zutritt eine Identitätskontrolle durchführen.',
          ],
        },
        {
          icon: AlertCircle,
          title: '4. Stornierung & Rückerstattung',
          content: [
            'Tickets sind grundsätzlich nicht erstattungsfähig.',
            'Eine Rückerstattung kann nur in Ausnahmefällen geprüft werden.',
            '',
            '✓ Mögliche Ausnahmen:',
            '  • Tod eines Familienmitglieds ersten Grades',
            '  • schwere Erkrankung oder Krankenhausaufenthalt des Ticketkäufers',
            '  In diesen Fällen ist ein offizieller Nachweis vorzulegen (zum Beispiel ärztliches Attest oder Sterbeurkunde).',
            '',
            '✗ Keine Rückerstattung bei:',
            '  • Nichterscheinen',
            '  • verspätetem Erscheinen',
            '  • Änderung persönlicher Pläne',
            '  • schlechten Wetterbedingungen',
            '  • Verlust oder Diebstahl von Tickets',
            '  • Krankheit ohne offiziellen Nachweis',
            '  • Änderungen im Line-up, bei Künstlern oder im Programm',
            '  • Änderung des Sitz- oder Stehplatzes ohne Wertverlust',
            '  • Verweisung wegen Verstoßes gegen die Hausordnung',
            '',
            'Etwaige Rückerstattungen können auf den Nennwert des Tickets beschränkt werden. Servicegebühren, Transaktionskosten und Verwaltungskosten werden nicht erstattet.',
            'Der Veranstalter behält sich das ausschließliche Recht vor, die Gültigkeit eines Rückerstattungsantrags zu beurteilen.',
            'Mit dem Kauf eines Tickets erkennt der Käufer an, dass eine Zahlungsanfechtung per Chargeback ohne gültigen Grund zur Stornierung des Tickets und zu zusätzlichen Verwaltungskosten führen kann.',
          ],
        },
        {
          icon: FileText,
          title: '5. Absage oder Änderung der Veranstaltung',
          content: [
            'Wird die Veranstaltung vom Veranstalter vollständig abgesagt, kann der Käufer Anspruch haben auf:',
            '  • Rückerstattung des Ticketpreises, oder',
            '  • Beibehaltung des Tickets für ein neues Datum.',
            '',
            'Wird eine Veranstaltung auf ein anderes Datum verlegt, bleiben Tickets automatisch für das neue Datum gültig.',
            '',
            'Änderungen in Bezug auf:',
            '  • Line-up',
            '  • Künstler',
            '  • Programm',
            '  • Zeitplan',
            '  • Produktion',
            '  • Veranstaltungsort in angemessener Entfernung',
            'begründen keinen automatischen Rückerstattungsanspruch.',
          ],
        },
        {
          icon: Ban,
          title: '6. Weiterverkauf & Betrug',
          content: [
            'Tickets dürfen kostenlos an Dritte übertragen werden.',
            'Der gewerbliche Weiterverkauf von Tickets ohne Zustimmung des Veranstalters ist verboten.',
            'Es ist verboten, Tickets über dem ursprünglichen Ticketpreis weiterzuverkaufen.',
            'Tickets aus nicht offiziellen Verkaufskanälen können für ungültig erklärt werden.',
            'Der Veranstalter kann die Gültigkeit von Tickets aus externem Weiterverkauf nicht garantieren.',
          ],
        },
        {
          icon: Shield,
          title: '7. Haftung',
          content: [
            'Der Veranstalter haftet nicht für:',
            '  • Verlust, Diebstahl oder Beschädigung persönlicher Gegenstände',
            '  • Körperverletzung, außer bei nachgewiesenem Vorsatz oder grober Fahrlässigkeit',
            '  • Schäden, die durch Dritte verursacht wurden',
            '',
            'Außer bei Vorsatz oder grober Fahrlässigkeit ist die Haftung des Veranstalters in jedem Fall auf den Nennwert des Tickets begrenzt.',
            'Besucher betreten die Veranstaltung auf eigenes Risiko.',
          ],
        },
        {
          icon: AlertCircle,
          title: '8. Verhalten & Sicherheit',
          content: [
            'Der Veranstalter behält sich das Recht vor, Besucher in folgenden Fällen abzuweisen oder zu entfernen:',
            '  • aggressives oder störendes Verhalten',
            '  • Nichteinhaltung von Sicherheitsvorschriften',
            '  • Besitz verbotener Gegenstände oder Stoffe',
            '',
            'Verbotene Gegenstände können unter anderem sein:',
            '  • Waffen',
            '  • Drogen',
            '  • Feuerwerk',
            '  • mitgebrachte Getränke',
            '',
            'Besucher können Sicherheitskontrollen oder Durchsuchungen unterzogen werden.',
            'Anweisungen von Personal und Security sind stets zu befolgen.',
            'Zutrittsverweigerung oder Verweisung begründen keinen Anspruch auf Rückerstattung.',
          ],
        },
        {
          icon: Camera,
          title: '9. Bild- und Tonaufnahmen',
          content: [
            'Während der Veranstaltungen können Foto- und Videoaufnahmen zu werblichen, redaktionellen und Marketingzwecken gemacht werden.',
            'Besucher können dabei beiläufig im Bild erscheinen.',
          ],
        },
        {
          icon: Shield,
          title: '10. Datenschutz & Datensicherheit',
          content: [
            'Personenbezogene Daten werden gemäß der DSGVO verarbeitet.',
            'Daten werden unter anderem verarbeitet für:',
            '  • Ticketabwicklung',
            '  • Kundenservice',
            '  • Veranstaltungskommunikation',
            '  • Betrugsprävention und Sicherheit',
            '',
            'Weitere Informationen sind in der Datenschutzerklärung verfügbar.',
          ],
        },
        {
          icon: Cloud,
          title: '11. Höhere Gewalt',
          content: [
            'Der Veranstalter kann für Absagen oder Änderungen aufgrund höherer Gewalt nicht haftbar gemacht werden.',
            '',
            'Beispiele für höhere Gewalt sind:',
            '  • extreme Wetterbedingungen',
            '  • behördliche Maßnahmen',
            '  • Sicherheitsbedrohungen',
            '  • Pandemien',
            '  • Streiks',
            '  • technische Störungen außerhalb der Kontrolle',
            '',
            'In solchen Fällen kann ein alternatives Datum, ein Gutschein oder eine andere Form der Kompensation angeboten werden.',
          ],
        },
        {
          icon: Scale,
          title: '12. Anwendbares Recht',
          content: [
            'Für diese Bedingungen gilt belgisches Recht.',
            'Streitigkeiten unterliegen den zuständigen Gerichten nach belgischem Recht.',
          ],
        },
      ],
    },
  };

  const currentContent = content[language as keyof typeof content] || content.nl;

  return (
    <div className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Scale className="w-12 h-12 text-cyan-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-3">
            {currentContent.title}
          </h1>
          {currentContent.subtitle && (
            <p className="text-slate-300 text-base mb-1">
              {currentContent.subtitle}
            </p>
          )}
          <p className="text-slate-400 text-sm italic">
            {currentContent.lastUpdate}
          </p>
        </div>

        <div className="space-y-8">
          {currentContent.sections.map((section, index) => {
            const Icon = section.icon;
            return (
              <div
                key={index}
                className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8"
              >
                <div className="flex items-start space-x-4 mb-4">
                  <div className="flex-shrink-0">
                    <Icon className="w-6 h-6 text-cyan-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">{section.title}</h2>
                </div>
                <div className="pl-10 space-y-3">
                  {section.content.map((paragraph, pIndex) => (
                    <p
                      key={pIndex}
                      className={`text-slate-300 leading-relaxed ${
                        paragraph === '' ? 'h-2' : ''
                      } ${
                        paragraph.startsWith('  ') ? 'pl-4' : ''
                      }`}
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-8">
          <div className="flex items-start space-x-4">
            <Shield className="w-8 h-8 text-cyan-400 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-xl font-bold mb-2 text-cyan-400">
                {{
                  nl: 'Vragen over deze voorwaarden?',
                  tr: 'Bu \u015Fartlar hakk\u0131nda sorular\u0131n\u0131z m\u0131 var?',
                  fr: 'Des questions sur ces conditions ?',
                  de: 'Fragen zu diesen Bedingungen?',
                  en: 'Questions about these terms?'
                }[language || 'nl']}
              </h3>
              <p className="text-slate-300 mb-4">
                {{
                  nl: 'Neem gerust contact met ons op via e-mail.',
                  tr: 'E-posta ile bizimle ileti\u015Fime ge\u00e7mekten \u00e7ekinmeyin.',
                  fr: "N'h\u00e9sitez pas \u00e0 nous contacter par e-mail.",
                  de: 'Kontaktieren Sie uns gerne per E-Mail.',
                  en: 'Feel free to contact us via email.'
                }[language || 'nl']}
              </p>
              <div className="space-y-2 text-sm text-slate-400">
                <p>E-mail: info@stagenation.be</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}