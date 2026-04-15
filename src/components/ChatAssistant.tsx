import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Bot, User, ChevronDown, RotateCcw, Mail, Instagram } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import type { Language } from '../lib/translations';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
}

interface FAQ {
  question: string;
  answer: string;
}

const faqData: Record<Language, FAQ[]> = {
  nl: [
    {
      question: 'Hoe kan ik tickets kopen?',
      answer: 'Je kunt tickets kopen via onze website. Ga naar de "Tickets" pagina, kies het gewenste evenement en tickettype, en volg het bestelproces. Betaling is mogelijk via verschillende online betaalmethoden.',
    },
    {
      question: 'Kan ik mijn ticket annuleren?',
      answer: 'Annuleringen zijn mogelijk tot 14 dagen voor het evenement. Neem hiervoor contact met ons op via de contactpagina of stuur een e-mail met je ordernummer. Na deze termijn is annulering helaas niet meer mogelijk.',
    },
    {
      question: 'Hoe kan ik mijn ticket overdragen?',
      answer: 'Wil je je ticket overdragen aan iemand anders? Stuur ons een e-mail met je ordernummer en de volledige naam en e-mailadres van de nieuwe tickethouder. Wij regelen de overdracht voor je.',
    },
    {
      question: 'Ik heb geen bevestigingsmail ontvangen',
      answer: 'Controleer eerst je spam/ongewenste mail folder. De bevestigingsmail wordt direct na de betaling verzonden. Heb je na 15 minuten nog niets ontvangen? Neem dan contact met ons op met je ordernummer.',
    },
    {
      question: 'Mijn QR-code werkt niet',
      answer: 'Zorg ervoor dat je QR-code goed zichtbaar is op je scherm (helderheid omhoog). Gebruik bij voorkeur de originele e-mail of het digitale ticket. Maak geen screenshot van een screenshot. Bij aanhoudende problemen, neem contact op vóór het evenement.',
    },
    {
      question: 'Wat zijn de betaalmethoden?',
      answer: 'Wij accepteren diverse online betaalmethoden waaronder Bancontact, iDEAL, creditcard (Visa/Mastercard) en andere gangbare betaalmethoden. Alle transacties verlopen beveiligd.',
    },
    {
      question: 'Waar vinden de evenementen plaats?',
      answer: 'Onze evenementen vinden plaats in Genk. Ga naar de "Locatie" pagina op onze website voor het exacte adres, routebeschrijving en parkeermogelijkheden.',
    },
    {
      question: 'Kan ik mijn bestelling wijzigen?',
      answer: 'Wijzigingen aan je bestelling (zoals tickettype) zijn mogelijk tot 14 dagen voor het evenement, afhankelijk van beschikbaarheid. Neem contact met ons op met je ordernummer en de gewenste wijziging.',
    },
    {
      question: 'Hoe neem ik contact op?',
      answer: 'Je kunt contact met ons opnemen via de contactpagina op onze website. Vul het contactformulier in of stuur ons een e-mail. We reageren zo snel mogelijk, meestal binnen 24 uur.',
    },
    {
      question: 'Wat zijn de algemene voorwaarden?',
      answer: 'Onze algemene voorwaarden vind je op de pagina "Algemene Voorwaarden" onderaan onze website. Hier staan alle regels over tickets, annuleringen, aansprakelijkheid en meer.',
    },
  ],
  tr: [
    {
      question: 'Bilet nasıl satın alabilirim?',
      answer: 'Web sitemiz üzerinden bilet satın alabilirsiniz. "Biletler" sayfasına gidin, istediğiniz etkinlik ve bilet türünü seçin ve sipariş sürecini takip edin. Çeşitli online ödeme yöntemleriyle ödeme yapabilirsiniz.',
    },
    {
      question: 'Biletimi iptal edebilir miyim?',
      answer: 'İptaller etkinlikten 14 gün öncesine kadar mümkündür. Bunun için iletişim sayfamız üzerinden veya sipariş numaranızla birlikte e-posta göndererek bize ulaşın. Bu süre sonrasında maalesef iptal mümkün değildir.',
    },
    {
      question: 'Biletimi başkasına devredebilir miyim?',
      answer: 'Biletinizi başka birine devretmek mi istiyorsunuz? Sipariş numaranız ve yeni bilet sahibinin tam adı ve e-posta adresiyle bize e-posta gönderin. Devir işlemini sizin için hallederiz.',
    },
    {
      question: 'Onay e-postası almadım',
      answer: 'Önce spam/istenmeyen posta klasörünüzü kontrol edin. Onay e-postası ödeme sonrası hemen gönderilir. 15 dakika sonra hâlâ almadıysanız, sipariş numaranızla bizimle iletişime geçin.',
    },
    {
      question: 'QR kodum çalışmıyor',
      answer: 'QR kodunuzun ekranınızda net göründüğünden emin olun (parlaklığı artırın). Orijinal e-postayı veya dijital bileti kullanın. Ekran görüntüsünün ekran görüntüsünü çekmeyin. Sorun devam ederse etkinlik öncesi bizimle iletişime geçin.',
    },
    {
      question: 'Ödeme yöntemleri nelerdir?',
      answer: 'Bancontact, iDEAL, kredi kartı (Visa/Mastercard) ve diğer yaygın ödeme yöntemlerini kabul ediyoruz. Tüm işlemler güvenli olarak gerçekleştirilir.',
    },
    {
      question: 'Etkinlikler nerede düzenleniyor?',
      answer: 'Etkinliklerimiz Genk\'te düzenlenmektedir. Tam adres, yol tarifi ve park olanakları için web sitemizdeki "Konum" sayfasını ziyaret edin.',
    },
    {
      question: 'Siparişimi değiştirebilir miyim?',
      answer: 'Siparişinizdeki değişiklikler (bilet türü gibi) etkinlikten 14 gün öncesine kadar, müsaitlik durumuna bağlı olarak mümkündür. Sipariş numaranız ve istediğiniz değişiklikle bizimle iletişime geçin.',
    },
    {
      question: 'Nasıl iletişime geçebilirim?',
      answer: 'Web sitemizdeki iletişim sayfası üzerinden bizimle iletişime geçebilirsiniz. İletişim formunu doldurun veya bize e-posta gönderin. En kısa sürede, genellikle 24 saat içinde yanıt veririz.',
    },
    {
      question: 'Genel şartlar nelerdir?',
      answer: 'Genel şartlarımızı web sitemizin alt kısmındaki "Genel Şartlar" sayfasında bulabilirsiniz. Burada biletler, iptaller, sorumluluk ve daha fazlası hakkındaki tüm kurallar yer almaktadır.',
    },
  ],
  fr: [
    {
      question: 'Comment acheter des tickets ?',
      answer: 'Vous pouvez acheter des tickets via notre site web. Rendez-vous sur la page "Tickets", choisissez l\'événement et le type de ticket souhaité, puis suivez le processus de commande. Le paiement est possible via différentes méthodes de paiement en ligne.',
    },
    {
      question: 'Puis-je annuler mon ticket ?',
      answer: 'Les annulations sont possibles jusqu\'à 14 jours avant l\'événement. Contactez-nous via la page de contact ou envoyez un e-mail avec votre numéro de commande. Passé ce délai, l\'annulation n\'est malheureusement plus possible.',
    },
    {
      question: 'Comment transférer mon ticket ?',
      answer: 'Vous souhaitez transférer votre ticket à quelqu\'un d\'autre ? Envoyez-nous un e-mail avec votre numéro de commande ainsi que le nom complet et l\'adresse e-mail du nouveau titulaire. Nous nous occupons du transfert.',
    },
    {
      question: 'Je n\'ai pas reçu d\'e-mail de confirmation',
      answer: 'Vérifiez d\'abord votre dossier spam/courrier indésirable. L\'e-mail de confirmation est envoyé immédiatement après le paiement. Si vous n\'avez rien reçu après 15 minutes, contactez-nous avec votre numéro de commande.',
    },
    {
      question: 'Mon QR code ne fonctionne pas',
      answer: 'Assurez-vous que votre QR code est bien visible sur votre écran (augmentez la luminosité). Utilisez de préférence l\'e-mail original ou le ticket numérique. Ne faites pas de capture d\'écran d\'une capture d\'écran. En cas de problème persistant, contactez-nous avant l\'événement.',
    },
    {
      question: 'Quels sont les modes de paiement ?',
      answer: 'Nous acceptons divers modes de paiement en ligne, notamment Bancontact, iDEAL, carte de crédit (Visa/Mastercard) et d\'autres méthodes courantes. Toutes les transactions sont sécurisées.',
    },
    {
      question: 'Où se déroulent les événements ?',
      answer: 'Nos événements se déroulent à Genk. Consultez la page "Lieu" de notre site web pour l\'adresse exacte, l\'itinéraire et les possibilités de stationnement.',
    },
    {
      question: 'Puis-je modifier ma commande ?',
      answer: 'Les modifications de votre commande (comme le type de ticket) sont possibles jusqu\'à 14 jours avant l\'événement, sous réserve de disponibilité. Contactez-nous avec votre numéro de commande et la modification souhaitée.',
    },
    {
      question: 'Comment vous contacter ?',
      answer: 'Vous pouvez nous contacter via la page de contact de notre site web. Remplissez le formulaire de contact ou envoyez-nous un e-mail. Nous répondons le plus rapidement possible, généralement dans les 24 heures.',
    },
    {
      question: 'Quelles sont les conditions générales ?',
      answer: 'Nos conditions générales sont disponibles sur la page "Conditions Générales" en bas de notre site web. Vous y trouverez toutes les règles concernant les tickets, annulations, responsabilité et plus encore.',
    },
  ],
  de: [
    {
      question: 'Wie kann ich Tickets kaufen?',
      answer: 'Sie können Tickets über unsere Website kaufen. Gehen Sie zur Seite "Tickets", wählen Sie die gewünschte Veranstaltung und den Tickettyp und folgen Sie dem Bestellvorgang. Die Zahlung ist über verschiedene Online-Zahlungsmethoden möglich.',
    },
    {
      question: 'Kann ich mein Ticket stornieren?',
      answer: 'Stornierungen sind bis 14 Tage vor der Veranstaltung möglich. Kontaktieren Sie uns über die Kontaktseite oder senden Sie eine E-Mail mit Ihrer Bestellnummer. Nach diesem Zeitraum ist eine Stornierung leider nicht mehr möglich.',
    },
    {
      question: 'Wie kann ich mein Ticket übertragen?',
      answer: 'Möchten Sie Ihr Ticket an jemand anderen übertragen? Senden Sie uns eine E-Mail mit Ihrer Bestellnummer und dem vollständigen Namen und der E-Mail-Adresse des neuen Ticketinhabers. Wir kümmern uns um die Übertragung.',
    },
    {
      question: 'Ich habe keine Bestätigungs-E-Mail erhalten',
      answer: 'Überprüfen Sie zuerst Ihren Spam-/Junk-Mail-Ordner. Die Bestätigungs-E-Mail wird sofort nach der Zahlung gesendet. Wenn Sie nach 15 Minuten nichts erhalten haben, kontaktieren Sie uns mit Ihrer Bestellnummer.',
    },
    {
      question: 'Mein QR-Code funktioniert nicht',
      answer: 'Stellen Sie sicher, dass Ihr QR-Code auf Ihrem Bildschirm gut sichtbar ist (Helligkeit erhöhen). Verwenden Sie vorzugsweise die Original-E-Mail oder das digitale Ticket. Machen Sie keinen Screenshot von einem Screenshot. Bei anhaltenden Problemen kontaktieren Sie uns vor der Veranstaltung.',
    },
    {
      question: 'Welche Zahlungsmethoden gibt es?',
      answer: 'Wir akzeptieren verschiedene Online-Zahlungsmethoden, darunter Bancontact, iDEAL, Kreditkarte (Visa/Mastercard) und andere gängige Zahlungsmethoden. Alle Transaktionen sind gesichert.',
    },
    {
      question: 'Wo finden die Veranstaltungen statt?',
      answer: 'Unsere Veranstaltungen finden in Genk statt. Besuchen Sie die Seite "Standort" auf unserer Website für die genaue Adresse, Wegbeschreibung und Parkmöglichkeiten.',
    },
    {
      question: 'Kann ich meine Bestellung ändern?',
      answer: 'Änderungen an Ihrer Bestellung (wie Tickettyp) sind bis 14 Tage vor der Veranstaltung möglich, je nach Verfügbarkeit. Kontaktieren Sie uns mit Ihrer Bestellnummer und der gewünschten Änderung.',
    },
    {
      question: 'Wie kann ich Sie kontaktieren?',
      answer: 'Sie können uns über die Kontaktseite auf unserer Website kontaktieren. Füllen Sie das Kontaktformular aus oder senden Sie uns eine E-Mail. Wir antworten so schnell wie möglich, in der Regel innerhalb von 24 Stunden.',
    },
    {
      question: 'Was sind die Allgemeinen Geschäftsbedingungen?',
      answer: 'Unsere AGB finden Sie auf der Seite "Allgemeine Geschäftsbedingungen" am Ende unserer Website. Dort finden Sie alle Regeln zu Tickets, Stornierungen, Haftung und mehr.',
    },
  ],
  en: [
    {
      question: 'How can I buy tickets?',
      answer: 'You can buy tickets through our website. Go to the "Tickets" page, choose the event and ticket type you want, and follow the order process. Payment is possible via various online payment methods.',
    },
    {
      question: 'Can I cancel my ticket?',
      answer: 'Cancellations are possible up to 14 days before the event. Contact us via the contact page or send an email with your order number. After this period, cancellation is unfortunately no longer possible.',
    },
    {
      question: 'How can I transfer my ticket?',
      answer: 'Want to transfer your ticket to someone else? Send us an email with your order number and the full name and email address of the new ticket holder. We\'ll take care of the transfer.',
    },
    {
      question: 'I didn\'t receive a confirmation email',
      answer: 'First check your spam/junk mail folder. The confirmation email is sent immediately after payment. If you haven\'t received anything after 15 minutes, contact us with your order number.',
    },
    {
      question: 'My QR code doesn\'t work',
      answer: 'Make sure your QR code is clearly visible on your screen (turn up brightness). Preferably use the original email or digital ticket. Don\'t take a screenshot of a screenshot. If the problem persists, contact us before the event.',
    },
    {
      question: 'What payment methods are available?',
      answer: 'We accept various online payment methods including Bancontact, iDEAL, credit card (Visa/Mastercard) and other common payment methods. All transactions are secure.',
    },
    {
      question: 'Where do the events take place?',
      answer: 'Our events take place in Genk. Visit the "Location" page on our website for the exact address, directions and parking options.',
    },
    {
      question: 'Can I change my order?',
      answer: 'Changes to your order (such as ticket type) are possible up to 14 days before the event, depending on availability. Contact us with your order number and the desired change.',
    },
    {
      question: 'How can I contact you?',
      answer: 'You can contact us via the contact page on our website. Fill in the contact form or send us an email. We respond as quickly as possible, usually within 24 hours.',
    },
    {
      question: 'What are the terms and conditions?',
      answer: 'Our terms and conditions can be found on the "Terms & Conditions" page at the bottom of our website. There you\'ll find all rules regarding tickets, cancellations, liability and more.',
    },
  ],
};

const chatLabels: Record<Language, {
  title: string;
  subtitle: string;
  greeting: string;
  suggestedTitle: string;
  backToFaq: string;
  poweredBy: string;
}> = {
  nl: {
    title: 'StageNation Assistent',
    subtitle: 'Hoe kunnen we je helpen?',
    greeting: 'Hallo! Ik ben de StageNation assistent. Kies een vraag hieronder en ik help je graag verder!',
    suggestedTitle: 'Kies een vraag:',
    backToFaq: 'Terug naar vragen',
    poweredBy: 'AI Assistent',
  },
  tr: {
    title: 'StageNation Asistan',
    subtitle: 'Size nasıl yardımcı olabiliriz?',
    greeting: 'Merhaba! Ben StageNation asistanıyım. Aşağıdan bir soru seçin, size yardımcı olayım!',
    suggestedTitle: 'Bir soru seçin:',
    backToFaq: 'Sorulara dön',
    poweredBy: 'AI Asistan',
  },
  fr: {
    title: 'Assistant StageNation',
    subtitle: 'Comment pouvons-nous vous aider ?',
    greeting: 'Bonjour ! Je suis l\'assistant StageNation. Choisissez une question ci-dessous et je vous aiderai !',
    suggestedTitle: 'Choisissez une question :',
    backToFaq: 'Retour aux questions',
    poweredBy: 'Assistant IA',
  },
  de: {
    title: 'StageNation Assistent',
    subtitle: 'Wie können wir Ihnen helfen?',
    greeting: 'Hallo! Ich bin der StageNation Assistent. Wählen Sie eine Frage unten und ich helfe Ihnen gerne!',
    suggestedTitle: 'Wählen Sie eine Frage:',
    backToFaq: 'Zurück zu den Fragen',
    poweredBy: 'KI-Assistent',
  },
  en: {
    title: 'StageNation Assistant',
    subtitle: 'How can we help you?',
    greeting: 'Hello! I\'m the StageNation assistant. Choose a question below and I\'ll be happy to help!',
    suggestedTitle: 'Choose a question:',
    backToFaq: 'Back to questions',
    poweredBy: 'AI Assistant',
  },
};

export function ChatAssistant() {
  const { language } = useLanguage();
  const lang = language || 'nl';
  const labels = chatLabels[lang];
  const faqs = faqData[lang];

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showFaq, setShowFaq] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'greeting',
          text: labels.greeting,
          sender: 'bot',
        },
      ]);
    }
  }, [isOpen, labels.greeting, messages.length]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, showFaq]);

  const simulateTyping = useCallback((answer: string) => {
    setIsTyping(true);
    const delay = Math.min(500 + answer.length * 5, 2000);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          text: answer,
          sender: 'bot',
        },
      ]);
    }, delay);
  }, []);

  const handleFaqClick = useCallback((faq: FAQ) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        text: faq.question,
        sender: 'user',
      },
    ]);
    setShowFaq(false);
    simulateTyping(faq.answer);
  }, [simulateTyping]);

  const handleBackToFaq = useCallback(() => {
    setShowFaq(true);
  }, []);

  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback(() => {
    if (chatBodyRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatBodyRef.current;
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < 40);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <>
      {/* Right side floating bar: mail + instagram on top, AI button at bottom with pulse */}
      <div className="fixed right-4 bottom-6 z-50 flex flex-col items-center gap-3">
        {/* Mail icon */}
        <button
          onClick={() => { window.history.pushState({}, '', '/contact'); window.dispatchEvent(new PopStateEvent('popstate')); }}
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 hover:scale-110 transition-all duration-200"
          aria-label="Contact"
        >
          <Mail className="w-5 h-5 text-white" />
        </button>

        {/* Instagram icon */}
        <a
          href="https://www.instagram.com/stagenation/"
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 hover:scale-110 transition-all duration-200"
          aria-label="Instagram"
        >
          <Instagram className="w-5 h-5 text-white" />
        </a>

        {/* AI Chat button - at bottom with pulse */}
        <div className="relative">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 relative z-10 ${
              isOpen
                ? 'bg-slate-700 hover:bg-slate-600'
                : 'bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500'
            }`}
            aria-label="Chat assistant"
          >
            {isOpen ? (
              <X className="w-6 h-6 text-white" />
            ) : (
              <>
                <Bot className="w-6 h-6 text-white" />
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-black" />
              </>
            )}
          </button>
          {!isOpen && (
            <div className="absolute inset-0 w-14 h-14 rounded-full bg-amber-500/30 animate-ping pointer-events-none" />
          )}
        </div>
      </div>

      {/* Chat window */}
      {isOpen && (
        <div className="fixed bottom-6 right-20 z-50 w-[360px] max-w-[calc(100vw-6rem)] h-[520px] max-h-[calc(100vh-4rem)] bg-slate-900 rounded-2xl shadow-2xl border border-slate-700/50 flex flex-col overflow-hidden animate-in">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm truncate">{labels.title}</h3>
              <p className="text-amber-100/80 text-xs truncate">{labels.subtitle}</p>
            </div>
            <div className="flex items-center gap-1.5 bg-white/15 px-2 py-1 rounded-full">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-white/80 text-[10px] font-medium">Online</span>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={chatBodyRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#475569 transparent' }}
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    msg.sender === 'user'
                      ? 'bg-amber-500/20'
                      : 'bg-slate-700'
                  }`}
                >
                  {msg.sender === 'user' ? (
                    <User className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-amber-500 text-white rounded-br-md'
                      : 'bg-slate-800 text-slate-200 rounded-bl-md border border-slate-700/50'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-slate-700">
                  <Bot className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            {/* FAQ list */}
            {showFaq && !isTyping && (
              <div className="pt-2">
                <p className="text-slate-500 text-xs font-medium mb-2 px-1">{labels.suggestedTitle}</p>
                <div className="space-y-1.5">
                  {faqs.map((faq, i) => (
                    <button
                      key={i}
                      onClick={() => handleFaqClick(faq)}
                      className="w-full text-left px-3 py-2.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/40 hover:border-amber-500/30 rounded-xl text-xs text-slate-300 hover:text-white transition-all duration-200 flex items-center gap-2"
                    >
                      <span className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                        <span className="text-amber-400 text-[10px] font-bold">{i + 1}</span>
                      </span>
                      {faq.question}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Back to FAQ button */}
            {!showFaq && !isTyping && (
              <div className="pt-2 flex justify-center">
                <button
                  onClick={handleBackToFaq}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 hover:border-amber-500/30 rounded-full text-xs text-slate-400 hover:text-amber-400 transition-all duration-200"
                >
                  <RotateCcw className="w-3 h-3" />
                  {labels.backToFaq}
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Scroll to bottom button */}
          {!isAtBottom && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-12 left-1/2 -translate-x-1/2 w-8 h-8 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center shadow-lg border border-slate-600 transition-colors"
            >
              <ChevronDown className="w-4 h-4 text-slate-300" />
            </button>
          )}

          {/* Footer */}
          <div className="px-3 py-2 border-t border-slate-700/50 bg-slate-900/80 shrink-0">
            <p className="text-center text-[10px] text-slate-600">
              {labels.poweredBy} &bull; StageNation
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes animate-in {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-in {
          animation: animate-in 0.25s ease-out;
        }
      `}</style>
    </>
  );
}
