import { useLanguage } from '../contexts/LanguageContext';
import { FileText, Shield, AlertCircle, Scale, Ban, Camera, Cloud, Building2 } from 'lucide-react';

export function TermsAndConditions() {
  const { language } = useLanguage();

  const content = {
    nl: {
      title: 'Algemene Voorwaarden',
      lastUpdate: 'Laatste update: 25 februari 2026',
      sections: [
        {
          icon: Building2,
          title: 'Bedrijfsinformatie',
          content: [
            'StageNation is een ticketingplatform dat wordt uitgebaat door:',
            '',
            'Lumetrix BV',
            'Exelgaarden 20',
            '3550 Heusden-Zolder',
            'België',
            '',
            'BTW-nummer: BE1029.601.154',
            '',
            'Contact:',
            'Email: info@stagenation.be',
            'Telefoon: +32 493 94 46 31',
          ],
        },
        {
          icon: FileText,
          title: '1. Toepassingsgebied',
          content: [
            'Deze algemene voorwaarden zijn van toepassing op alle ticketverkopen, evenementen en diensten aangeboden via www.stagenation.be en bijhorende applicaties.',
            'Door een ticket te kopen of een evenement te betreden, verklaart de koper zich akkoord met deze voorwaarden.',
          ],
        },
        {
          icon: Shield,
          title: '2. Tickets & Toegang',
          content: [
            'Elk ticket is geldig voor één persoon en éénmalige toegang tot het evenement.',
            'Tickets worden digitaal geleverd en bevatten een unieke QR-code.',
            'De QR-code mag slechts één keer gescand worden.',
            'De organisator behoudt zich het recht voor tickets ongeldig te verklaren bij fraude, duplicatie of misbruik.',
            'De organisator kan identiteitscontrole uitvoeren.',
          ],
        },
        {
          icon: AlertCircle,
          title: '3. Annulatie & Teruggave',
          content: [
            'Tickets worden niet terugbetaald, behalve in uitzonderlijke omstandigheden.',
            '',
            '✓ Terugbetaling kan enkel bij:',
            '  • overlijden van een familielid in eerste graad',
            '  • ernstige ziekte of hospitalisatie van de ticketkoper',
            '  In deze gevallen dient officieel bewijs te worden aangeleverd (bv. doktersattest of overlijdensbericht).',
            '',
            '✗ Geen terugbetaling bij:',
            '  • niet opdagen',
            '  • te laat aankomen',
            '  • wijziging van persoonlijke plannen',
            '  • slechte weersomstandigheden',
            '  • verlies of diefstal van ticket',
            '  • wijziging van zit- of staanplaats zonder waardeverlies',
            '',
            'De organisator behoudt het exclusieve recht om de geldigheid van een terugbetalingsaanvraag te beoordelen.',
          ],
        },
        {
          icon: FileText,
          title: '4. Annulatie of Wijziging van het Event',
          content: [
            'Indien het evenement wordt geannuleerd door de organisator, heeft de koper recht op:',
            '  • terugbetaling van het ticketbedrag, of',
            '  • behoud van het ticket voor een nieuwe datum.',
            '',
            'Wijzigingen in line-up, artiesten, programma, timing of locatie binnen dezelfde regio geven geen recht op terugbetaling.',
          ],
        },
        {
          icon: Ban,
          title: '5. Doorverkoop & Fraude',
          content: [
            'Het is verboden tickets commercieel door te verkopen zonder toestemming van de organisator.',
            'Tickets verkregen via niet-officiële verkoopkanalen kunnen ongeldig worden verklaard.',
          ],
        },
        {
          icon: Shield,
          title: '6. Aansprakelijkheid',
          content: [
            'De organisator is niet aansprakelijk voor:',
            '  • verlies, diefstal of schade aan persoonlijke eigendommen',
            '  • lichamelijk letsel, behalve in geval van bewezen zware fout of opzet',
            '  • schade veroorzaakt door derden',
            '',
            'Bezoekers betreden het evenement op eigen risico.',
          ],
        },
        {
          icon: AlertCircle,
          title: '7. Gedrag & Veiligheid',
          content: [
            'De organisator behoudt zich het recht voor bezoekers te weigeren of te verwijderen bij:',
            '  • agressief of storend gedrag',
            '  • niet-naleving van veiligheidsvoorschriften',
            '  • bezit van verboden voorwerpen of middelen',
            '',
            'Instructies van personeel en security dienen steeds te worden gevolgd.',
          ],
        },
        {
          icon: Camera,
          title: '8. Beeld- en Geluidsopnames',
          content: [
            'Tijdens evenementen kunnen foto- en video-opnames worden gemaakt voor promotionele doeleinden.',
            'Door het evenement te betreden, stemt de bezoeker in met mogelijk gebruik van zijn/haar beeltenis.',
          ],
        },
        {
          icon: Shield,
          title: '9. Privacy & Gegevensbescherming',
          content: [
            'Persoonsgegevens worden verwerkt conform de GDPR-wetgeving.',
            'Gegevens worden uitsluitend gebruikt voor:',
            '  • ticketverwerking',
            '  • klantenservice',
            '  • eventcommunicatie',
            '',
            'Meer informatie is beschikbaar in het privacybeleid.',
          ],
        },
        {
          icon: Cloud,
          title: '10. Overmacht',
          content: [
            'De organisator kan niet aansprakelijk worden gesteld bij annulatie of wijzigingen veroorzaakt door overmacht, waaronder maar niet beperkt tot:',
            '  • extreme weersomstandigheden',
            '  • overheidsmaatregelen',
            '  • veiligheidsdreigingen',
            '  • pandemieën',
            '  • technische storingen buiten controle',
            '',
            'In dergelijke gevallen kan een alternatieve datum of tegoedbon worden aangeboden.',
          ],
        },
        {
          icon: Scale,
          title: '11. Toepasselijk Recht',
          content: [
            'Op deze voorwaarden is het Belgisch recht van toepassing.',
            'Geschillen vallen onder de bevoegde rechtbank van het arrondissement waar de organisator gevestigd is.',
          ],
        },
      ],
    },
    tr: {
      title: 'Genel Şartlar ve Koşullar',
      lastUpdate: 'Son güncelleme: 25 Şubat 2026',
      sections: [
        {
          icon: Building2,
          title: 'Şirket Bilgileri',
          content: [
            'StageNation, aşağıdaki şirket tarafından işletilen bir bilet platformudur:',
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
            'Telefon: +32 493 94 46 31',
          ],
        },
        {
          icon: FileText,
          title: '1. Kapsam',
          content: [
            'Bu genel şartlar, www.stagenation.be ve bağlı uygulamalar üzerinden sunulan tüm bilet satışları, etkinlikler ve hizmetler için geçerlidir.',
            'Bilet satın alan veya etkinliğe katılan kişi, bu şartları kabul etmiş sayılır.',
          ],
        },
        {
          icon: Shield,
          title: '2. Biletler ve Giriş',
          content: [
            'Her bilet tek kişi ve tek seferlik etkinlik girişi için geçerlidir.',
            'Biletler dijital olarak teslim edilir ve benzersiz bir QR kodu içerir.',
            'QR kodu yalnızca bir kez taranabilir.',
            'Organizatör, sahtecilik, kopyalama veya kötüye kullanım durumunda biletleri geçersiz kılma hakkını saklı tutar.',
            'Organizatör kimlik kontrolü yapabilir.',
          ],
        },
        {
          icon: AlertCircle,
          title: '3. İptal ve İade',
          content: [
            'Biletler iade edilemez; yalnızca istisnai durumlarda iade mümkündür.',
            '',
            '✓ İade yalnızca şu durumlarda yapılır:',
            '  • Birinci derece aile ferdinin vefatı',
            '  • Bilet sahibinin ciddi hastalığı veya hastaneye yatışı',
            '  Bu durumlarda resmi belge sunulması zorunludur (doktor raporu veya ölüm belgesi).',
            '',
            '✗ Aşağıdaki durumlarda iade yapılmaz:',
            '  • Etkinliğe katılmama',
            '  • Geç gelme',
            '  • Kişisel plan değişikliği',
            '  • Olumsuz hava koşulları',
            '  • Biletin kaybolması veya çalınması',
            '  • Değer kaybı olmaksızın oturma veya ayakta durma yerinin değiştirilmesi',
            '',
            'Organizatör, iade taleplerinin geçerliliğini değerlendirme konusunda münhasır hakka sahiptir.',
          ],
        },
        {
          icon: FileText,
          title: '4. Etkinliğin İptali veya Değiştirilmesi',
          content: [
            'Etkinlik organizatör tarafından iptal edilirse, alıcının hakkı şunlardan oluşur:',
            '  • Bilet bedelinin iadesi veya',
            '  • Biletin yeni bir tarihe taşınması.',
            '',
            'Sanatçı kadrosu, program, zamanlama veya aynı bölgedeki konum değişiklikleri iade hakkı doğurmaz.',
          ],
        },
        {
          icon: Ban,
          title: '5. Yeniden Satış ve Sahtecilik',
          content: [
            'Biletlerin organizatörün izni olmaksızın ticari amaçla yeniden satılması yasaktır.',
            'Resmi olmayan satış kanallarından elde edilen biletler geçersiz sayılabilir.',
          ],
        },
        {
          icon: Shield,
          title: '6. Sorumluluk',
          content: [
            'Organizatör şunlardan sorumlu değildir:',
            '  • Kişisel eşyaların kaybolması, çalınması veya hasar görmesi',
            '  • İspatlanan ağır ihmal veya kasıt dışında bedensel yaralanma',
            '  • Üçüncü şahısların neden olduğu zararlar',
            '',
            'Ziyaretçiler etkinliğe kendi sorumlulukları altında katılır.',
          ],
        },
        {
          icon: AlertCircle,
          title: '7. Davranış ve Güvenlik',
          content: [
            'Organizatör şu durumlarda ziyaretçileri reddetme veya çıkarma hakkını saklı tutar:',
            '  • Saldırgan veya rahatsız edici davranış',
            '  • Güvenlik kurallarına uyulmaması',
            '  • Yasaklı nesne veya madde bulundurmak',
            '',
            'Personel ve güvenlik görevlilerinin talimatlarına her zaman uyulmalıdır.',
          ],
        },
        {
          icon: Camera,
          title: '8. Görüntü ve Ses Kayıtları',
          content: [
            'Etkinlikler sırasında tanıtım amaçlı fotoğraf ve video çekimleri yapılabilir.',
            'Etkinliğe giren ziyaretçi, görüntüsünün kullanılmasına onay vermiş sayılır.',
          ],
        },
        {
          icon: Shield,
          title: '9. Gizlilik ve Kişisel Verilerin Korunması',
          content: [
            'Kişisel veriler GDPR mevzuatına uygun olarak işlenir.',
            'Veriler yalnızca şu amaçlarla kullanılır:',
            '  • Bilet işlemleri',
            '  • Müşteri hizmetleri',
            '  • Etkinlik iletişimi',
            '',
            'Daha fazla bilgi gizlilik politikasında mevcuttur.',
          ],
        },
        {
          icon: Cloud,
          title: '10. Mücbir Sebepler',
          content: [
            'Organizatör, aşağıdakiler de dahil olmak üzere mücbir sebeplerden kaynaklanan iptal veya değişikliklerden sorumlu tutulamaz:',
            '  • Aşırı hava koşulları',
            '  • Resmi makam kararları',
            '  • Güvenlik tehditleri',
            '  • Salgın hastalıklar',
            '  • Kontrol dışı teknik arızalar',
            '',
            'Bu durumlarda alternatif bir tarih veya hediye çeki sunulabilir.',
          ],
        },
        {
          icon: Scale,
          title: '11. Uygulanacak Hukuk',
          content: [
            'Bu şartlara Belçika hukuku uygulanır.',
            'Uyuşmazlıklar, organizatörün bulunduğu yargı çevresinin yetkili mahkemesinde çözüme kavuşturulur.',
          ],
        },
      ],
    },
    fr: {
      title: 'Conditions Générales',
      lastUpdate: 'Dernière mise à jour : 25 février 2026',
      sections: [
        {
          icon: Building2,
          title: 'Informations sur l\'entreprise',
          content: [
            'StageNation est une plateforme de billetterie exploitée par :',
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
            'Téléphone : +32 493 94 46 31',
          ],
        },
        {
          icon: FileText,
          title: '1. Champ d\'application',
          content: [
            'Les présentes conditions générales s\'appliquent à toutes les ventes de billets, événements et services proposés via www.stagenation.be et les applications associées.',
            'En achetant un billet ou en accédant à un événement, l\'acheteur accepte ces conditions.',
          ],
        },
        {
          icon: Shield,
          title: '2. Billets & Accès',
          content: [
            'Chaque billet est valable pour une seule personne et un seul accès à l\'événement.',
            'Les billets sont fournis numériquement et contiennent un code QR unique.',
            'Le code QR ne peut être scanné qu\'une seule fois.',
            'L\'organisateur se réserve le droit d\'invalider les billets en cas de fraude, duplication ou abus.',
            'L\'organisateur peut effectuer un contrôle d\'identité.',
          ],
        },
        {
          icon: AlertCircle,
          title: '3. Annulation & Remboursement',
          content: [
            'Les billets ne sont pas remboursables, sauf dans des circonstances exceptionnelles.',
            '',
            '✓ Un remboursement est possible uniquement en cas de :',
            '  • décès d\'un membre de la famille au premier degré',
            '  • maladie grave ou hospitalisation de l\'acheteur du billet',
            '  Une preuve officielle doit être fournie (ex. certificat médical ou acte de décès).',
            '',
            '✗ Aucun remboursement dans les cas suivants :',
            '  • absence à l\'événement',
            '  • arrivée tardive',
            '  • modification des plans personnels',
            '  • mauvaises conditions météorologiques',
            '  • perte ou vol du billet',
            '  • changement de place assise ou debout sans perte de valeur',
            '',
            'L\'organisateur conserve le droit exclusif d\'évaluer la validité de toute demande de remboursement.',
          ],
        },
        {
          icon: FileText,
          title: '4. Annulation ou Modification de l\'Événement',
          content: [
            'Si l\'événement est annulé par l\'organisateur, l\'acheteur a droit à :',
            '  • un remboursement du montant du billet, ou',
            '  • le maintien du billet pour une nouvelle date.',
            '',
            'Les modifications du line-up, des artistes, du programme, des horaires ou du lieu dans la même région ne donnent pas droit à remboursement.',
          ],
        },
        {
          icon: Ban,
          title: '5. Revente & Fraude',
          content: [
            'Il est interdit de revendre des billets à des fins commerciales sans l\'autorisation de l\'organisateur.',
            'Les billets obtenus via des canaux de vente non officiels peuvent être invalidés.',
          ],
        },
        {
          icon: Shield,
          title: '6. Responsabilité',
          content: [
            'L\'organisateur n\'est pas responsable de :',
            '  • la perte, le vol ou les dommages aux effets personnels',
            '  • les blessures corporelles, sauf en cas de faute grave ou d\'intention prouvée',
            '  • les dommages causés par des tiers',
            '',
            'Les visiteurs accèdent à l\'événement à leurs propres risques.',
          ],
        },
        {
          icon: AlertCircle,
          title: '7. Comportement & Sécurité',
          content: [
            'L\'organisateur se réserve le droit de refuser ou d\'expulser les visiteurs en cas de :',
            '  • comportement agressif ou perturbateur',
            '  • non-respect des consignes de sécurité',
            '  • possession d\'objets ou de substances interdits',
            '',
            'Les instructions du personnel et de la sécurité doivent toujours être respectées.',
          ],
        },
        {
          icon: Camera,
          title: '8. Enregistrements Photos et Vidéos',
          content: [
            'Des photos et vidéos peuvent être réalisées lors des événements à des fins promotionnelles.',
            'En accédant à l\'événement, le visiteur consent à l\'utilisation éventuelle de son image.',
          ],
        },
        {
          icon: Shield,
          title: '9. Confidentialité & Protection des Données',
          content: [
            'Les données personnelles sont traitées conformément au RGPD.',
            'Les données sont utilisées exclusivement pour :',
            '  • le traitement des billets',
            '  • le service client',
            '  • la communication événementielle',
            '',
            'Plus d\'informations sont disponibles dans la politique de confidentialité.',
          ],
        },
        {
          icon: Cloud,
          title: '10. Force Majeure',
          content: [
            'L\'organisateur ne peut être tenu responsable des annulations ou modifications causées par un cas de force majeure, notamment :',
            '  • conditions météorologiques extrêmes',
            '  • mesures gouvernementales',
            '  • menaces à la sécurité',
            '  • pandémies',
            '  • pannes techniques hors contrôle',
            '',
            'Dans ces cas, une date alternative ou un bon d\'achat pourra être proposé.',
          ],
        },
        {
          icon: Scale,
          title: '11. Droit Applicable',
          content: [
            'Les présentes conditions sont régies par le droit belge.',
            'Les litiges relèvent du tribunal compétent de l\'arrondissement où l\'organisateur est établi.',
          ],
        },
      ],
    },
    de: {
      title: 'Allgemeine Geschäftsbedingungen',
      lastUpdate: 'Letzte Aktualisierung: 25. Februar 2026',
      sections: [
        {
          icon: Building2,
          title: 'Unternehmensinformationen',
          content: [
            'StageNation ist eine Ticketing-Plattform, die betrieben wird von:',
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
            'Telefon: +32 493 94 46 31',
          ],
        },
        {
          icon: FileText,
          title: '1. Geltungsbereich',
          content: [
            'Diese Allgemeinen Geschäftsbedingungen gelten für alle Ticketverkäufe, Veranstaltungen und Dienstleistungen, die über www.stagenation.be und zugehörige Anwendungen angeboten werden.',
            'Durch den Kauf eines Tickets oder den Zutritt zu einer Veranstaltung erklärt der Käufer sein Einverständnis mit diesen Bedingungen.',
          ],
        },
        {
          icon: Shield,
          title: '2. Tickets & Zutritt',
          content: [
            'Jedes Ticket ist für eine Person und einen einmaligen Zutritt zur Veranstaltung gültig.',
            'Tickets werden digital geliefert und enthalten einen einzigartigen QR-Code.',
            'Der QR-Code darf nur einmal gescannt werden.',
            'Der Veranstalter behält sich das Recht vor, Tickets bei Betrug, Vervielfältigung oder Missbrauch für ungültig zu erklären.',
            'Der Veranstalter kann eine Identitätsprüfung durchführen.',
          ],
        },
        {
          icon: AlertCircle,
          title: '3. Stornierung & Rückerstattung',
          content: [
            'Tickets sind nicht erstattungsfähig, außer unter außergewöhnlichen Umständen.',
            '',
            '✓ Eine Rückerstattung ist nur möglich bei:',
            '  • Tod eines Familienmitglieds ersten Grades',
            '  • schwerer Erkrankung oder Krankenhausaufenthalt des Ticketkäufers',
            '  In diesen Fällen ist ein offizieller Nachweis erforderlich (z. B. ärztliches Attest oder Sterbeurkunde).',
            '',
            '✗ Keine Rückerstattung bei:',
            '  • Nichterscheinen',
            '  • Zu spätem Erscheinen',
            '  • Änderung persönlicher Pläne',
            '  • Schlechten Wetterbedingungen',
            '  • Verlust oder Diebstahl des Tickets',
            '  • Änderung des Sitz- oder Stehplatzes ohne Wertverlust',
            '',
            'Der Veranstalter behält sich das ausschließliche Recht vor, die Gültigkeit eines Rückerstattungsantrags zu beurteilen.',
          ],
        },
        {
          icon: FileText,
          title: '4. Absage oder Änderung der Veranstaltung',
          content: [
            'Wird die Veranstaltung vom Veranstalter abgesagt, hat der Käufer Anspruch auf:',
            '  • Rückerstattung des Ticketpreises, oder',
            '  • Übertragung des Tickets auf ein neues Datum.',
            '',
            'Änderungen am Line-up, den Künstlern, dem Programm, den Zeiten oder dem Veranstaltungsort in derselben Region begründen keinen Rückerstattungsanspruch.',
          ],
        },
        {
          icon: Ban,
          title: '5. Weiterverkauf & Betrug',
          content: [
            'Der gewerbliche Weiterverkauf von Tickets ohne Genehmigung des Veranstalters ist verboten.',
            'Tickets, die über nicht offizielle Verkaufskanäle erworben wurden, können für ungültig erklärt werden.',
          ],
        },
        {
          icon: Shield,
          title: '6. Haftung',
          content: [
            'Der Veranstalter haftet nicht für:',
            '  • Verlust, Diebstahl oder Beschädigung persönlicher Gegenstände',
            '  • Körperverletzung, außer bei nachgewiesenem grob fahrlässigem oder vorsätzlichem Handeln',
            '  • Schäden, die durch Dritte verursacht wurden',
            '',
            'Besucher betreten die Veranstaltung auf eigenes Risiko.',
          ],
        },
        {
          icon: AlertCircle,
          title: '7. Verhalten & Sicherheit',
          content: [
            'Der Veranstalter behält sich das Recht vor, Besucher bei Folgendem abzuweisen oder zu entfernen:',
            '  • aggressives oder störendes Verhalten',
            '  • Nichteinhaltung der Sicherheitsvorschriften',
            '  • Besitz verbotener Gegenstände oder Substanzen',
            '',
            'Anweisungen des Personals und des Sicherheitsdienstes sind stets zu befolgen.',
          ],
        },
        {
          icon: Camera,
          title: '8. Bild- und Tonaufnahmen',
          content: [
            'Während der Veranstaltungen können Foto- und Videoaufnahmen zu Werbezwecken gemacht werden.',
            'Mit dem Betreten der Veranstaltung stimmt der Besucher einer möglichen Verwendung seines Bildnisses zu.',
          ],
        },
        {
          icon: Shield,
          title: '9. Datenschutz & Datensicherheit',
          content: [
            'Personenbezogene Daten werden gemäß der DSGVO verarbeitet.',
            'Daten werden ausschließlich verwendet für:',
            '  • Ticketabwicklung',
            '  • Kundenservice',
            '  • Veranstaltungskommunikation',
            '',
            'Weitere Informationen sind in der Datenschutzrichtlinie verfügbar.',
          ],
        },
        {
          icon: Cloud,
          title: '10. Höhere Gewalt',
          content: [
            'Der Veranstalter kann nicht für Absagen oder Änderungen haftbar gemacht werden, die durch höhere Gewalt verursacht werden, einschließlich, aber nicht beschränkt auf:',
            '  • extreme Wetterbedingungen',
            '  • behördliche Maßnahmen',
            '  • Sicherheitsbedrohungen',
            '  • Pandemien',
            '  • unkontrollierbare technische Störungen',
            '',
            'In solchen Fällen kann ein alternatives Datum oder ein Gutschein angeboten werden.',
          ],
        },
        {
          icon: Scale,
          title: '11. Anwendbares Recht',
          content: [
            'Für diese Bedingungen gilt belgisches Recht.',
            'Streitigkeiten fallen unter die zuständige Gerichtsbarkeit des Bezirks, in dem der Veranstalter ansässig ist.',
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
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {currentContent.title}
          </h1>
          <p className="text-slate-400 text-sm">
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
                {{ nl: 'Vragen over deze voorwaarden?', tr: 'Bu şartlar hakkında sorularınız mı var?', fr: 'Des questions sur ces conditions ?', de: 'Fragen zu diesen Bedingungen?' }[language || 'nl']}
              </h3>
              <p className="text-slate-300 mb-4">
                {{ nl: 'Neem gerust contact met ons op via email of telefoon.', tr: 'E-posta veya telefon ile bizimle iletişime geçmekten çekinmeyin.', fr: "N'hésitez pas à nous contacter par e-mail ou téléphone.", de: 'Kontaktieren Sie uns gerne per E-Mail oder Telefon.' }[language || 'nl']}
              </p>
              <div className="space-y-2 text-sm text-slate-400">
                <p>Email: info@stagenation.be</p>
                <p>
                  {{ nl: 'Telefoon: ', tr: 'Telefon: ', fr: 'Téléphone : ', de: 'Telefon: ' }[language || 'nl']}
                  +32 493 94 46 31
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
