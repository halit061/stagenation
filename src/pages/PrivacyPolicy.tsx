import { useLanguage } from '../contexts/LanguageContext';
import { Building2, Database, Target, CreditCard, Clock, Users, Lock, UserCheck, Cookie, File as FileEdit, Shield } from 'lucide-react';

export function PrivacyPolicy() {
  const { language } = useLanguage();

  const content = {
    nl: {
      title: 'Privacybeleid',
      lastUpdate: 'Laatst bijgewerkt: 2026',
      intro: 'StageNation respecteert de privacy van alle gebruikers van haar platform en zorgt ervoor dat de persoonlijke informatie die u ons verschaft vertrouwelijk wordt behandeld.',
      sections: [
        {
          icon: Building2,
          title: '1. Bedrijfsinformatie',
          content: [
            'StageNation is een platform van:',
            '',
            'Lumetrix BV',
            'Exelgaarden 20',
            '3550 Heusden-Zolder',
            'België',
            '',
            'BTW-nummer: BE1029.601.154',
            'E-mail: info@lumetrix.be',
          ],
        },
        {
          icon: Database,
          title: '2. Persoonsgegevens die wij verzamelen',
          content: [
            'Wanneer u tickets koopt via stagenation.be kunnen wij de volgende gegevens verzamelen:',
            '  • Naam en voornaam',
            '  • E-mailadres',
            '  • Betaalgegevens (via onze betaalprovider)',
            '  • Ticketinformatie en aankoopgegevens',
            '  • IP-adres en browserinformatie',
          ],
        },
        {
          icon: Target,
          title: '3. Doel van gegevensverwerking',
          content: [
            'Uw gegevens worden gebruikt voor:',
            '  • verwerking van ticketbestellingen',
            '  • verzending van digitale tickets',
            '  • klantenservice en ondersteuning',
            '  • fraudepreventie en beveiliging',
            '  • wettelijke verplichtingen',
          ],
        },
        {
          icon: CreditCard,
          title: '4. Betalingen',
          content: [
            'Betalingen op StageNation worden verwerkt via onze betaalpartner Mollie B.V. Mollie verwerkt uw betaalgegevens volgens hun eigen privacybeleid.',
          ],
        },
        {
          icon: Clock,
          title: '5. Bewaartermijn',
          content: [
            'Persoonsgegevens worden niet langer bewaard dan noodzakelijk voor de uitvoering van onze diensten en om te voldoen aan wettelijke verplichtingen.',
          ],
        },
        {
          icon: Users,
          title: '6. Delen van gegevens',
          content: [
            'Uw gegevens worden niet verkocht aan derden. Gegevens kunnen enkel gedeeld worden met:',
            '  • betalingsproviders',
            '  • ticketing- en eventpartners indien nodig voor toegang tot evenementen',
            '  • wettelijke instanties indien wettelijk vereist',
          ],
        },
        {
          icon: Lock,
          title: '7. Beveiliging',
          content: [
            'StageNation neemt passende technische en organisatorische maatregelen om uw persoonsgegevens te beschermen tegen verlies, misbruik of ongeautoriseerde toegang.',
          ],
        },
        {
          icon: UserCheck,
          title: '8. Uw rechten',
          content: [
            'U heeft het recht om:',
            '  • inzage te vragen in uw persoonsgegevens',
            '  • correctie of verwijdering van uw gegevens te verzoeken',
            '  • bezwaar te maken tegen bepaalde verwerkingen',
            '',
            'Verzoeken kunnen gestuurd worden naar: info@lumetrix.be',
          ],
        },
        {
          icon: Cookie,
          title: '9. Cookies',
          content: [
            'StageNation kan cookies gebruiken om de werking van de website te verbeteren en het gebruik van de website te analyseren.',
          ],
        },
        {
          icon: FileEdit,
          title: '10. Wijzigingen',
          content: [
            'StageNation behoudt zich het recht voor om dit privacybeleid te wijzigen. De meest recente versie zal altijd beschikbaar zijn op deze pagina.',
          ],
        },
      ],
      contact: {
        title: 'Vragen over uw privacy?',
        description: 'Neem gerust contact met ons op via email.',
        email: 'E-mail: info@lumetrix.be',
      },
    },
    tr: {
      title: 'Gizlilik Politikası',
      lastUpdate: 'Son güncelleme: 2026',
      intro: 'StageNation, platformunun tüm kullanıcılarının gizliliğine saygı duyar ve bize sağladığınız kişisel bilgilerin gizli tutulmasını sağlar.',
      sections: [
        {
          icon: Building2,
          title: '1. Şirket Bilgileri',
          content: [
            'StageNation bir platformdur:',
            '',
            'Lumetrix BV',
            'Exelgaarden 20',
            '3550 Heusden-Zolder',
            'Belçika',
            '',
            'KDV numarası: BE1029.601.154',
            'E-posta: info@lumetrix.be',
          ],
        },
        {
          icon: Database,
          title: '2. Topladığımız Kişisel Veriler',
          content: [
            'stagenation.be üzerinden bilet satın aldığınızda aşağıdaki verileri toplayabiliriz:',
            '  • Ad ve soyad',
            '  • E-posta adresi',
            '  • Ödeme bilgileri (ödeme sağlayıcımız aracılığıyla)',
            '  • Bilet bilgileri ve satın alma verileri',
            '  • IP adresi ve tarayıcı bilgileri',
          ],
        },
        {
          icon: Target,
          title: '3. Veri İşleme Amacı',
          content: [
            'Verileriniz şu amaçlarla kullanılır:',
            '  • bilet siparişlerinin işlenmesi',
            '  • dijital biletlerin gönderilmesi',
            '  • müşteri hizmetleri ve destek',
            '  • dolandırıcılık önleme ve güvenlik',
            '  • yasal yükümlülükler',
          ],
        },
        {
          icon: CreditCard,
          title: '4. Ödemeler',
          content: [
            'StageNation üzerindeki ödemeler, ödeme ortağımız Mollie B.V. aracılığıyla işlenir. Mollie, ödeme verilerinizi kendi gizlilik politikasına göre işler.',
          ],
        },
        {
          icon: Clock,
          title: '5. Saklama Süresi',
          content: [
            'Kişisel veriler, hizmetlerimizin yürütülmesi ve yasal yükümlülüklere uyum sağlanması için gerekli olandan daha uzun süre saklanmaz.',
          ],
        },
        {
          icon: Users,
          title: '6. Verilerin Paylaşılması',
          content: [
            'Verileriniz üçüncü taraflara satılmaz. Veriler yalnızca şu taraflarla paylaşılabilir:',
            '  • ödeme sağlayıcıları',
            '  • etkinliklere erişim için gerekli olan bilet ve etkinlik ortakları',
            '  • yasal olarak gerekli olması halinde yasal makamlar',
          ],
        },
        {
          icon: Lock,
          title: '7. Güvenlik',
          content: [
            'StageNation, kişisel verilerinizi kayıp, kötüye kullanım veya yetkisiz erişime karşı korumak için uygun teknik ve organizasyonel önlemler alır.',
          ],
        },
        {
          icon: UserCheck,
          title: '8. Haklarınız',
          content: [
            'Şu haklara sahipsiniz:',
            '  • kişisel verilerinize erişim talep etme',
            '  • verilerinizin düzeltilmesini veya silinmesini isteme',
            '  • belirli işlemlere itiraz etme',
            '',
            'Talepler şu adrese gönderilebilir: info@lumetrix.be',
          ],
        },
        {
          icon: Cookie,
          title: '9. Çerezler',
          content: [
            'StageNation, web sitesinin işleyişini iyileştirmek ve web sitesi kullanımını analiz etmek için çerezler kullanabilir.',
          ],
        },
        {
          icon: FileEdit,
          title: '10. Değişiklikler',
          content: [
            'StageNation bu gizlilik politikasını değiştirme hakkını saklı tutar. En güncel sürüm her zaman bu sayfada mevcut olacaktır.',
          ],
        },
      ],
      contact: {
        title: 'Gizliliğiniz hakkında sorularınız mı var?',
        description: 'E-posta ile bizimle iletişime geçmekten çekinmeyin.',
        email: 'E-posta: info@lumetrix.be',
      },
    },
    fr: {
      title: 'Politique de Confidentialité',
      lastUpdate: 'Dernière mise à jour : 2026',
      intro: 'StageNation respecte la vie privée de tous les utilisateurs de sa plateforme et veille à ce que les informations personnelles que vous nous fournissez soient traitées de manière confidentielle.',
      sections: [
        {
          icon: Building2,
          title: '1. Informations sur l\'entreprise',
          content: [
            'StageNation est une plateforme de :',
            '',
            'Lumetrix BV',
            'Exelgaarden 20',
            '3550 Heusden-Zolder',
            'Belgique',
            '',
            'Numéro de TVA : BE1029.601.154',
            'E-mail : info@lumetrix.be',
          ],
        },
        {
          icon: Database,
          title: '2. Données personnelles collectées',
          content: [
            'Lorsque vous achetez des billets via stagenation.be, nous pouvons collecter les données suivantes :',
            '  • Nom et prénom',
            '  • Adresse e-mail',
            '  • Données de paiement (via notre prestataire de paiement)',
            '  • Informations sur les billets et données d\'achat',
            '  • Adresse IP et informations du navigateur',
          ],
        },
        {
          icon: Target,
          title: '3. Finalité du traitement des données',
          content: [
            'Vos données sont utilisées pour :',
            '  • le traitement des commandes de billets',
            '  • l\'envoi de billets numériques',
            '  • le service client et l\'assistance',
            '  • la prévention de la fraude et la sécurité',
            '  • les obligations légales',
          ],
        },
        {
          icon: CreditCard,
          title: '4. Paiements',
          content: [
            'Les paiements sur StageNation sont traités via notre partenaire de paiement Mollie B.V. Mollie traite vos données de paiement conformément à sa propre politique de confidentialité.',
          ],
        },
        {
          icon: Clock,
          title: '5. Durée de conservation',
          content: [
            'Les données personnelles ne sont pas conservées plus longtemps que nécessaire pour l\'exécution de nos services et le respect des obligations légales.',
          ],
        },
        {
          icon: Users,
          title: '6. Partage des données',
          content: [
            'Vos données ne sont pas vendues à des tiers. Les données ne peuvent être partagées qu\'avec :',
            '  • les prestataires de paiement',
            '  • les partenaires de billetterie et d\'événements si nécessaire pour l\'accès aux événements',
            '  • les autorités légales si la loi l\'exige',
          ],
        },
        {
          icon: Lock,
          title: '7. Sécurité',
          content: [
            'StageNation prend des mesures techniques et organisationnelles appropriées pour protéger vos données personnelles contre la perte, l\'utilisation abusive ou l\'accès non autorisé.',
          ],
        },
        {
          icon: UserCheck,
          title: '8. Vos droits',
          content: [
            'Vous avez le droit de :',
            '  • demander l\'accès à vos données personnelles',
            '  • demander la correction ou la suppression de vos données',
            '  • vous opposer à certains traitements',
            '',
            'Les demandes peuvent être envoyées à : info@lumetrix.be',
          ],
        },
        {
          icon: Cookie,
          title: '9. Cookies',
          content: [
            'StageNation peut utiliser des cookies pour améliorer le fonctionnement du site web et analyser l\'utilisation du site.',
          ],
        },
        {
          icon: FileEdit,
          title: '10. Modifications',
          content: [
            'StageNation se réserve le droit de modifier cette politique de confidentialité. La version la plus récente sera toujours disponible sur cette page.',
          ],
        },
      ],
      contact: {
        title: 'Des questions sur votre vie privée ?',
        description: 'N\'hésitez pas à nous contacter par e-mail.',
        email: 'E-mail : info@lumetrix.be',
      },
    },
    de: {
      title: 'Datenschutzrichtlinie',
      lastUpdate: 'Letzte Aktualisierung: 2026',
      intro: 'StageNation respektiert die Privatsphäre aller Nutzer seiner Plattform und stellt sicher, dass die persönlichen Informationen, die Sie uns zur Verfügung stellen, vertraulich behandelt werden.',
      sections: [
        {
          icon: Building2,
          title: '1. Unternehmensinformationen',
          content: [
            'StageNation ist eine Plattform von:',
            '',
            'Lumetrix BV',
            'Exelgaarden 20',
            '3550 Heusden-Zolder',
            'Belgien',
            '',
            'USt-IdNr.: BE1029.601.154',
            'E-Mail: info@lumetrix.be',
          ],
        },
        {
          icon: Database,
          title: '2. Erhobene personenbezogene Daten',
          content: [
            'Wenn Sie Tickets über stagenation.be kaufen, können wir folgende Daten erheben:',
            '  • Vor- und Nachname',
            '  • E-Mail-Adresse',
            '  • Zahlungsdaten (über unseren Zahlungsanbieter)',
            '  • Ticketinformationen und Kaufdaten',
            '  • IP-Adresse und Browserinformationen',
          ],
        },
        {
          icon: Target,
          title: '3. Zweck der Datenverarbeitung',
          content: [
            'Ihre Daten werden verwendet für:',
            '  • die Abwicklung von Ticketbestellungen',
            '  • den Versand digitaler Tickets',
            '  • Kundenservice und Support',
            '  • Betrugsprävention und Sicherheit',
            '  • gesetzliche Verpflichtungen',
          ],
        },
        {
          icon: CreditCard,
          title: '4. Zahlungen',
          content: [
            'Zahlungen auf StageNation werden über unseren Zahlungspartner Mollie B.V. abgewickelt. Mollie verarbeitet Ihre Zahlungsdaten gemäß ihrer eigenen Datenschutzrichtlinie.',
          ],
        },
        {
          icon: Clock,
          title: '5. Aufbewahrungsfrist',
          content: [
            'Personenbezogene Daten werden nicht länger aufbewahrt als für die Erbringung unserer Dienstleistungen und die Erfüllung gesetzlicher Verpflichtungen erforderlich.',
          ],
        },
        {
          icon: Users,
          title: '6. Weitergabe von Daten',
          content: [
            'Ihre Daten werden nicht an Dritte verkauft. Daten können nur geteilt werden mit:',
            '  • Zahlungsanbietern',
            '  • Ticketing- und Eventpartnern, wenn dies für den Zugang zu Veranstaltungen erforderlich ist',
            '  • Behörden, wenn dies gesetzlich vorgeschrieben ist',
          ],
        },
        {
          icon: Lock,
          title: '7. Sicherheit',
          content: [
            'StageNation trifft angemessene technische und organisatorische Maßnahmen, um Ihre personenbezogenen Daten vor Verlust, Missbrauch oder unbefugtem Zugriff zu schützen.',
          ],
        },
        {
          icon: UserCheck,
          title: '8. Ihre Rechte',
          content: [
            'Sie haben das Recht:',
            '  • Einsicht in Ihre personenbezogenen Daten zu verlangen',
            '  • die Berichtigung oder Löschung Ihrer Daten zu beantragen',
            '  • bestimmten Verarbeitungen zu widersprechen',
            '',
            'Anfragen können gesendet werden an: info@lumetrix.be',
          ],
        },
        {
          icon: Cookie,
          title: '9. Cookies',
          content: [
            'StageNation kann Cookies verwenden, um die Funktionsweise der Website zu verbessern und die Nutzung der Website zu analysieren.',
          ],
        },
        {
          icon: FileEdit,
          title: '10. Änderungen',
          content: [
            'StageNation behält sich das Recht vor, diese Datenschutzrichtlinie zu ändern. Die aktuellste Version wird immer auf dieser Seite verfügbar sein.',
          ],
        },
      ],
      contact: {
        title: 'Fragen zu Ihrer Privatsphäre?',
        description: 'Kontaktieren Sie uns gerne per E-Mail.',
        email: 'E-Mail: info@lumetrix.be',
      },
    },
  };

  const currentContent = content[language as keyof typeof content] || content.nl;

  return (
    <div className="py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Shield className="w-12 h-12 text-cyan-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {currentContent.title}
          </h1>
          <p className="text-slate-400 text-sm mb-6">
            {currentContent.lastUpdate}
          </p>
          <p className="text-slate-300 max-w-2xl mx-auto leading-relaxed">
            {currentContent.intro}
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
                {currentContent.contact.title}
              </h3>
              <p className="text-slate-300 mb-4">
                {currentContent.contact.description}
              </p>
              <div className="text-sm text-slate-400">
                <p>{currentContent.contact.email}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
