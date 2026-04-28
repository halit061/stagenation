import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Bot, User, ChevronDown, RotateCcw, Mail, Instagram, Facebook } from 'lucide-react';
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
      answer: 'Ga naar stagenation.be, kies het evenement en klik op "Tickets Boeken". Kies je tickettype, selecteer je stoelen op de plattegrond en reken af via Bancontact, iDEAL of creditcard. Na betaling ontvang je direct een bevestigingsmail met je tickets en QR-codes.',
    },
    {
      question: 'Kan ik mijn ticket annuleren of terugbetalen?',
      answer: 'Nee, tickets worden niet terugbetaald. Volgens de Europese consumentenwetgeving geldt geen herroepingsrecht voor evenementen met een vaste datum. Je aankoop is definitief na betaling. In uitzonderlijke gevallen (zoals overlijden of hospitalisatie) kun je een verzoek indienen via info@stagenation.be met officieel bewijs.',
    },
    {
      question: 'Kan ik mijn stoel kiezen?',
      answer: 'Ja! Bij evenementen met een zaalplan kun je via ons pick-a-seat systeem zelf je stoelen kiezen op de plattegrond. Je ziet direct welke stoelen beschikbaar zijn.',
    },
    {
      question: 'Ik heb geen bevestigingsmail ontvangen',
      answer: 'Check eerst je spam/junk map. De mail komt van tickets@stagenation.be. Als je na 15 minuten nog niets hebt ontvangen, neem dan contact op via info@stagenation.be met je naam en het e-mailadres waarmee je besteld hebt. We sturen je tickets dan opnieuw.',
    },
    {
      question: 'Hoe werkt de QR-code?',
      answer: 'Elke ticket bevat een unieke QR-code. Toon deze bij de ingang op je telefoon of geprint. De QR-code wordt gescand en kan slechts één keer worden gebruikt. Deel je QR-code dus niet met anderen.',
    },
    {
      question: 'Kan ik mijn ticket overdragen aan iemand anders?',
      answer: 'Ja, je kunt je ticket eenmalig en kosteloos overdragen aan een andere persoon. Stuur de QR-code door naar die persoon. Commerciële doorverkoop of doorverkoop boven de oorspronkelijke prijs is niet toegestaan.',
    },
    {
      question: 'Wat zijn de betaalmethoden?',
      answer: 'Je kunt betalen met Bancontact, iDEAL en creditcard (Visa/Mastercard). Alle betalingen verlopen via de beveiligde betalingsprovider Mollie.',
    },
    {
      question: 'Het evenement is verplaatst. Wat nu?',
      answer: 'Bij verplaatsing blijven je tickets automatisch geldig voor de nieuwe datum. Je hoeft niets te doen. Je ontvangt een e-mail met de nieuwe datum.',
    },
    {
      question: 'Hoe neem ik contact op?',
      answer: 'Je kunt ons bereiken via e-mail: info@stagenation.be. We proberen alle berichten zo snel mogelijk te beantwoorden.',
    },
  ],
  tr: [
    {
      question: 'Bilet nasıl satın alabilirim?',
      answer: 'stagenation.be adresine gidin, etkinliği seçin ve "Bilet Al" butonuna tıklayın. Bilet türünüzü seçin, oturma planından koltuğunuzu belirleyin ve Bancontact, iDEAL veya kredi kartıyla ödeme yapın. Ödeme sonrası biletleriniz ve QR kodlarınız e-posta ile gönderilir.',
    },
    {
      question: 'Biletimi iptal edebilir miyim?',
      answer: 'Hayır, biletler iade edilmez. Avrupa tüketici mevzuatına göre, belirli bir tarihte gerçekleşen etkinlikler için cayma hakkı bulunmamaktadır. Satın alma işlemi ödeme sonrası kesinleşir. İstisnai durumlarda (vefat veya hastaneye yatış gibi) resmi belge ile info@stagenation.be adresine başvurabilirsiniz.',
    },
    {
      question: 'Koltuğumu seçebilir miyim?',
      answer: 'Evet! Salon planı olan etkinliklerde pick-a-seat sistemimiz ile haritadan kendi koltuğunuzu seçebilirsiniz. Hangi koltukların müsait olduğunu anında görebilirsiniz.',
    },
    {
      question: 'Onay e-postası almadım',
      answer: 'Önce spam/istenmeyen posta klasörünüzü kontrol edin. E-posta tickets@stagenation.be adresinden gelir. 15 dakika sonra hâlâ almadıysanız, adınız ve sipariş e-posta adresinizle info@stagenation.be adresine ulaşın. Biletlerinizi tekrar göndeririz.',
    },
    {
      question: 'QR kodu nasıl çalışır?',
      answer: 'Her bilet benzersiz bir QR kodu içerir. Girişte telefonunuzdan veya çıktı olarak gösterin. QR kodu taranır ve yalnızca bir kez kullanılabilir. QR kodunuzu başkalarıyla paylaşmayın.',
    },
    {
      question: 'Biletimi başkasına devredebilir miyim?',
      answer: 'Evet, biletinizi bir kereye mahsus ve ücretsiz olarak başka birine devredebilirsiniz. QR kodunu o kişiye iletin. Ticari amaçlı satış veya orijinal fiyatın üzerinde satış yasaktır.',
    },
    {
      question: 'Ödeme yöntemleri nelerdir?',
      answer: 'Bancontact, iDEAL ve kredi kartı (Visa/Mastercard) ile ödeme yapabilirsiniz. Tüm ödemeler güvenli ödeme sağlayıcısı Mollie üzerinden gerçekleştirilir.',
    },
    {
      question: 'Etkinlik ertelendi. Ne yapmalıyım?',
      answer: 'Erteleme durumunda biletleriniz yeni tarih için otomatik olarak geçerli kalır. Herhangi bir işlem yapmanıza gerek yoktur. Yeni tarih hakkında e-posta ile bilgilendirilirsiniz.',
    },
    {
      question: 'Nasıl iletişime geçebilirim?',
      answer: 'Bize e-posta ile ulaşabilirsiniz: info@stagenation.be. Tüm mesajları en kısa sürede yanıtlamaya çalışıyoruz.',
    },
  ],
  fr: [
    {
      question: 'Comment acheter des tickets ?',
      answer: 'Rendez-vous sur stagenation.be, choisissez l\'événement et cliquez sur "Acheter des tickets". Sélectionnez votre type de ticket, choisissez vos places sur le plan de salle et payez par Bancontact, iDEAL ou carte de crédit. Après paiement, vous recevez immédiatement un e-mail de confirmation avec vos tickets et codes QR.',
    },
    {
      question: 'Puis-je annuler ou me faire rembourser ?',
      answer: 'Non, les tickets ne sont pas remboursables. Conformément à la législation européenne sur la protection des consommateurs, le droit de rétractation ne s\'applique pas aux événements à date fixe. Votre achat est définitif après paiement. Dans des cas exceptionnels (décès ou hospitalisation), vous pouvez soumettre une demande à info@stagenation.be avec un justificatif officiel.',
    },
    {
      question: 'Puis-je choisir ma place ?',
      answer: 'Oui ! Pour les événements avec plan de salle, vous pouvez choisir vos places vous-même sur le plan grâce à notre système pick-a-seat. Vous voyez immédiatement quelles places sont disponibles.',
    },
    {
      question: 'Je n\'ai pas reçu d\'e-mail de confirmation',
      answer: 'Vérifiez d\'abord votre dossier spam/courrier indésirable. L\'e-mail provient de tickets@stagenation.be. Si vous n\'avez rien reçu après 15 minutes, contactez-nous à info@stagenation.be avec votre nom et l\'adresse e-mail utilisée pour la commande. Nous vous renverrons vos tickets.',
    },
    {
      question: 'Comment fonctionne le code QR ?',
      answer: 'Chaque ticket contient un code QR unique. Présentez-le à l\'entrée sur votre téléphone ou imprimé. Le code QR est scanné et ne peut être utilisé qu\'une seule fois. Ne partagez donc pas votre code QR avec d\'autres personnes.',
    },
    {
      question: 'Puis-je transférer mon ticket ?',
      answer: 'Oui, vous pouvez transférer votre ticket une fois et gratuitement à une autre personne. Transmettez le code QR à cette personne. La revente commerciale ou au-dessus du prix original n\'est pas autorisée.',
    },
    {
      question: 'Quels sont les modes de paiement ?',
      answer: 'Vous pouvez payer par Bancontact, iDEAL et carte de crédit (Visa/Mastercard). Tous les paiements sont traités via le prestataire de paiement sécurisé Mollie.',
    },
    {
      question: 'L\'événement a été reporté. Que faire ?',
      answer: 'En cas de report, vos tickets restent automatiquement valables pour la nouvelle date. Vous n\'avez rien à faire. Vous recevrez un e-mail avec la nouvelle date.',
    },
    {
      question: 'Comment nous contacter ?',
      answer: 'Vous pouvez nous joindre par e-mail : info@stagenation.be. Nous essayons de répondre à tous les messages dans les plus brefs délais.',
    },
  ],
  de: [
    {
      question: 'Wie kann ich Tickets kaufen?',
      answer: 'Gehen Sie zu stagenation.be, wählen Sie die Veranstaltung und klicken Sie auf "Tickets buchen". Wählen Sie Ihren Tickettyp, wählen Sie Ihre Plätze auf dem Saalplan und bezahlen Sie mit Bancontact, iDEAL oder Kreditkarte. Nach der Zahlung erhalten Sie sofort eine Bestätigungs-E-Mail mit Ihren Tickets und QR-Codes.',
    },
    {
      question: 'Kann ich mein Ticket stornieren oder erstatten lassen?',
      answer: 'Nein, Tickets werden nicht erstattet. Gemäß dem europäischen Verbraucherrecht gilt kein Widerrufsrecht für Veranstaltungen mit festem Datum. Ihr Kauf ist nach der Zahlung endgültig. In Ausnahmefällen (wie Todesfall oder Krankenhausaufenthalt) können Sie einen Antrag mit offiziellem Nachweis an info@stagenation.be senden.',
    },
    {
      question: 'Kann ich meinen Sitzplatz wählen?',
      answer: 'Ja! Bei Veranstaltungen mit Saalplan können Sie über unser Pick-a-Seat-System Ihre Plätze selbst auf dem Plan auswählen. Sie sehen sofort, welche Plätze verfügbar sind.',
    },
    {
      question: 'Ich habe keine Bestätigungs-E-Mail erhalten',
      answer: 'Überprüfen Sie zuerst Ihren Spam-/Junk-Ordner. Die E-Mail kommt von tickets@stagenation.be. Wenn Sie nach 15 Minuten nichts erhalten haben, kontaktieren Sie uns unter info@stagenation.be mit Ihrem Namen und der E-Mail-Adresse, mit der Sie bestellt haben. Wir senden Ihnen Ihre Tickets erneut zu.',
    },
    {
      question: 'Wie funktioniert der QR-Code?',
      answer: 'Jedes Ticket enthält einen einzigartigen QR-Code. Zeigen Sie diesen am Eingang auf Ihrem Telefon oder ausgedruckt vor. Der QR-Code wird gescannt und kann nur einmal verwendet werden. Teilen Sie Ihren QR-Code nicht mit anderen.',
    },
    {
      question: 'Kann ich mein Ticket übertragen?',
      answer: 'Ja, Sie können Ihr Ticket einmalig und kostenlos an eine andere Person übertragen. Leiten Sie den QR-Code an diese Person weiter. Kommerzieller Weiterverkauf oder Verkauf über dem Originalpreis ist nicht gestattet.',
    },
    {
      question: 'Welche Zahlungsmethoden gibt es?',
      answer: 'Sie können mit Bancontact, iDEAL und Kreditkarte (Visa/Mastercard) bezahlen. Alle Zahlungen werden über den sicheren Zahlungsanbieter Mollie abgewickelt.',
    },
    {
      question: 'Die Veranstaltung wurde verschoben. Was nun?',
      answer: 'Bei Verschiebung bleiben Ihre Tickets automatisch für das neue Datum gültig. Sie müssen nichts unternehmen. Sie erhalten eine E-Mail mit dem neuen Datum.',
    },
    {
      question: 'Wie kann ich Sie kontaktieren?',
      answer: 'Sie können uns per E-Mail erreichen: info@stagenation.be. Wir versuchen, alle Nachrichten so schnell wie möglich zu beantworten.',
    },
  ],
  en: [
    {
      question: 'How can I buy tickets?',
      answer: 'Go to stagenation.be, choose the event and click "Buy Tickets". Select your ticket type, choose your seats on the seating plan and pay with Bancontact, iDEAL or credit card. After payment, you\'ll immediately receive a confirmation email with your tickets and QR codes.',
    },
    {
      question: 'Can I cancel or get a refund?',
      answer: 'No, tickets are non-refundable. Under European consumer legislation, the right of withdrawal does not apply to events with a fixed date. Your purchase is final after payment. In exceptional cases (such as death or hospitalisation), you can submit a request to info@stagenation.be with official documentation.',
    },
    {
      question: 'Can I choose my seat?',
      answer: 'Yes! For events with a seating plan, you can choose your own seats on the map using our pick-a-seat system. You can see which seats are available in real time.',
    },
    {
      question: 'I didn\'t receive a confirmation email',
      answer: 'First check your spam/junk folder. The email comes from tickets@stagenation.be. If you haven\'t received anything after 15 minutes, contact us at info@stagenation.be with your name and the email address you used to order. We\'ll resend your tickets.',
    },
    {
      question: 'How does the QR code work?',
      answer: 'Each ticket contains a unique QR code. Show it at the entrance on your phone or printed. The QR code is scanned and can only be used once. Don\'t share your QR code with others.',
    },
    {
      question: 'Can I transfer my ticket to someone else?',
      answer: 'Yes, you can transfer your ticket once and free of charge to another person. Forward the QR code to that person. Commercial resale or resale above the original price is not permitted.',
    },
    {
      question: 'What payment methods are available?',
      answer: 'You can pay with Bancontact, iDEAL and credit card (Visa/Mastercard). All payments are processed through the secure payment provider Mollie.',
    },
    {
      question: 'The event has been rescheduled. What now?',
      answer: 'In case of rescheduling, your tickets automatically remain valid for the new date. You don\'t need to do anything. You\'ll receive an email with the new date.',
    },
    {
      question: 'How can I contact you?',
      answer: 'You can reach us by email: info@stagenation.be. We try to respond to all messages as quickly as possible.',
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
    greeting: 'Hallo! Ich bin der StageNation Assistent. Wählen Sie eine Frage und ich helfe Ihnen gerne!',
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
          href="https://www.instagram.com/stagenation.be"
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 hover:scale-110 transition-all duration-200"
          aria-label="Instagram"
        >
          <Instagram className="w-5 h-5 text-white" />
        </a>

        {/* Facebook icon */}
        <a
          href="https://www.facebook.com/profile.php?id=61588941385113"
          target="_blank"
          rel="noopener noreferrer"
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/20 hover:scale-110 transition-all duration-200"
          aria-label="Facebook"
        >
          <Facebook className="w-5 h-5 text-white" />
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
