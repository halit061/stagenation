import { Mail, Phone, MapPin, MessageSquare, Send } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useToast } from '../components/Toast';
import { useDocumentHead } from '../hooks/useDocumentHead';

export function Contact() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  useDocumentHead({
    title: 'Contact',
    description: 'Neem contact op met StageNation. Vragen over tickets, evenementen of samenwerking? Stuur ons een bericht.',
    path: '/contact',
  });
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    website: '', // honeypot field - should remain empty
  });
  const [sending, setSending] = useState(false);
  const [formLoadTime] = useState(Date.now());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // SECURITY: Bot detection - honeypot field
    if (formData.website) {
      // Bot filled in the hidden field - silently reject
      showToast(t('contact.thankYou'), 'success');
      setFormData({ name: '', email: '', subject: '', message: '', website: '' });
      return;
    }

    // SECURITY: Bot detection - timing check (form submitted too fast)
    if (Date.now() - formLoadTime < 2000) {
      showToast(t('contact.thankYou'), 'success');
      setFormData({ name: '', email: '', subject: '', message: '', website: '' });
      return;
    }

    // SECURITY: Input validation
    const name = formData.name.trim();
    const email = formData.email.trim();
    const subject = formData.subject.trim();
    const message = formData.message.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast('Invalid email address', 'error');
      return;
    }
    if (name.length < 2 || name.length > 100) {
      showToast('Name must be between 2 and 100 characters', 'error');
      return;
    }
    if (subject.length < 2 || subject.length > 200) {
      showToast('Subject must be between 2 and 200 characters', 'error');
      return;
    }
    if (message.length < 10 || message.length > 5000) {
      showToast('Message must be between 10 and 5000 characters', 'error');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase
        .from('contact_messages')
        .insert({ name, email, subject, message });
      if (error) throw error;
      showToast(t('contact.thankYou'), 'success');
      setFormData({ name: '', email: '', subject: '', message: '', website: '' });
    } catch {
      showToast(t('contact.sendError') || 'Something went wrong', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {t('contact.subtitle')} <span className="text-cyan-400">{t('contact.title')}</span>
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            {t('contact.subtitleDesc')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 hover:border-cyan-500/50 transition-all text-center">
            <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Mail className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="font-bold mb-2">{t('contact.email')}</h3>
            <p className="text-slate-400 text-sm mb-2">{t('contact.emailDesc')}</p>
            <a
              href="mailto:info@stagenation.be"
              className="text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              info@stagenation.be
            </a>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 hover:border-cyan-500/50 transition-all text-center">
            <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Phone className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="font-bold mb-2">{t('contact.phone')}</h3>
            <p className="text-slate-400 text-sm mb-2">{t('contact.phoneHours')}</p>
            <a
              href="tel:+32493944631"
              className="text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              0493 94 46 31
            </a>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 hover:border-cyan-500/50 transition-all text-center">
            <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-6 h-6 text-cyan-400" />
            </div>
            <h3 className="font-bold mb-2">{t('contact.location')}</h3>
            <p className="text-slate-400 text-sm mb-2">{t('contact.locationDesc')}</p>
            <p className="text-cyan-400">
              Genk, België
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-bold">{t('contact.sendMessage')}</h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Honeypot field - hidden from users, visible to bots */}
              <div style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input
                  type="text"
                  id="website"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                />
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                  {t('contact.name')}
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                  required
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  {t('contact.email')}
                </label>
                <input
                  type="email"
                  id="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                  required
                />
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-slate-300 mb-2">
                  {t('contact.subject')}
                </label>
                <input
                  type="text"
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white"
                  required
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
                  {t('contact.message')}
                </label>
                <textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  rows={5}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-cyan-500 text-white resize-none"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 rounded-lg font-semibold transition-all shadow-lg shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>{sending ? '...' : t('contact.send')}</span>
                {!sending && <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-2xl font-bold">{t('contact.ticketSupport')}</h2>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="font-semibold mb-2 text-cyan-400">{t('contact.orderQuestion')}</h3>
                <p className="text-slate-400 text-sm">
                  {t('contact.orderQuestionDesc')}
                </p>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="font-semibold mb-2 text-cyan-400">{t('contact.ticketNotWorking')}</h3>
                <p className="text-slate-400 text-sm">
                  {t('contact.ticketNotWorkingDesc')}
                </p>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="font-semibold mb-2 text-cyan-400">{t('contact.ticketTransfer')}</h3>
                <p className="text-slate-400 text-sm">
                  {t('contact.ticketTransferDesc')}
                </p>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-6 border border-slate-700">
                <h3 className="font-semibold mb-2 text-cyan-400">{t('contact.cancelChange')}</h3>
                <p className="text-slate-400 text-sm">
                  {t('contact.cancelChangeDesc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
