import { Music, Clock, Star, Info as InfoIcon } from 'lucide-react';
import { useDocumentHead } from '../hooks/useDocumentHead';

export function Info() {
  useDocumentHead({
    title: 'Evenement Info',
    description: 'Programma, FAQ en praktische informatie over StageNation evenementen.',
    path: '/info',
  });
  const schedule = [
    { time: '21:00', activity: 'Deuren open' },
    { time: '21:30', activity: 'Welkomstdrink' },
    { time: '22:00', activity: 'Live DJ Set - Opening' },
    { time: '23:30', activity: 'Speciale Performance' },
    { time: '00:00', activity: 'Countdown & Vuurwerk' },
    { time: '00:30', activity: 'DJ Set vervolg' },
    { time: '03:00', activity: 'After Party' },
    { time: '04:00', activity: 'Einde' },
  ];

  const faq = [
    {
      question: 'Wat is de minimum leeftijd?',
      answer: 'Het evenement is toegankelijk voor personen vanaf 18 jaar. ID-controle is verplicht bij binnenkomst.',
    },
    {
      question: 'Kan ik mijn ticket doorverkopen?',
      answer: 'Ja, tickets kunnen worden overgedragen via ons ticketsysteem. Neem contact op met onze support voor assistentie.',
    },
    {
      question: 'Is er parkeergelegenheid?',
      answer: 'Ja, er is voldoende gratis parking beschikbaar op het terrein.',
    },
    {
      question: 'Wat zijn de betaalmogelijkheden?',
      answer: 'We accepteren alle gangbare betaalmethoden via Mollie: iDEAL, Bancontact, creditcard, Apple Pay en Google Pay.',
    },
    {
      question: 'Is er garderobe beschikbaar?',
      answer: 'Ja, er is een beveiligde garderobe aanwezig in de venue tegen een kleine vergoeding.',
    },
  ];

  return (
    <div className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Event <span className="text-cyan-400">Informatie</span>
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Alles wat je moet weten over onze New Year's Eve Spectacular
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-20">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-bold">Programma</h2>
            </div>

            <div className="space-y-4">
              {schedule.map((item, index) => (
                <div key={index} className="flex items-start space-x-4 group">
                  <div className="flex-shrink-0 w-16 pt-1">
                    <span className="text-cyan-400 font-bold">{item.time}</span>
                  </div>
                  <div className="flex-1 pb-4 border-b border-slate-700 group-last:border-0">
                    <span className="text-slate-200">{item.activity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <Music className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-bold">Line-up</h2>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <div className="flex items-center space-x-3 mb-2">
                  <Star className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-xl font-bold">DJ Headliner</h3>
                </div>
                <p className="text-slate-400">
                  Internationale top DJ voor een onvergetelijke avond vol energie
                </p>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-xl font-bold mb-2">Special Guest Performance</h3>
                <p className="text-slate-400">
                  Live muziekact tijdens het hoogtepunt van de avond
                </p>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-xl font-bold mb-2">Resident DJ's</h3>
                <p className="text-slate-400">
                  Onze vaste DJ's zorgen voor de perfecte sfeer de hele nacht door
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 mb-12">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
              <InfoIcon className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-bold">Belangrijke Informatie</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-300">
            <div>
              <h3 className="font-semibold text-white mb-2">Dresscode</h3>
              <p className="text-sm">Smart casual - Glitter en glamour welkom!</p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">Leeftijd</h3>
              <p className="text-sm">18+ met geldig identiteitsbewijs</p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">Deuren</h3>
              <p className="text-sm">Open vanaf 21:00 uur</p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">Einde</h3>
              <p className="text-sm">04:00 uur (1 januari 2026)</p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-bold mb-8 text-center">
            Veelgestelde <span className="text-cyan-400">Vragen</span>
          </h2>

          <div className="space-y-4 max-w-3xl mx-auto">
            {faq.map((item, index) => (
              <div
                key={index}
                className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 hover:border-cyan-500/50 transition-all"
              >
                <h3 className="text-lg font-semibold text-cyan-400 mb-2">
                  {item.question}
                </h3>
                <p className="text-slate-300">{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
