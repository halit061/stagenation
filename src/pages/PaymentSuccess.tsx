import { useEffect, useState } from 'react';
import { CheckCircle, Clock, XCircle, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useLanguage } from '../contexts/LanguageContext';
import { localeMap, txt } from '../lib/translations';

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  payer_email: string;
  payer_name: string;
  paid_at: string | null;
  email_sent: boolean;
  email_sent_at: string | null;
  email_error: string | null;
  event_id: string;
  created_at: string;
}

interface Event {
  id: string;
  name: string;
  start_date: string;
  location: string;
  location_address: string;
  slug?: string;
}

interface Ticket {
  id: string;
  ticket_number: string;
  holder_name: string;
  status: string;
  ticket_types: {
    name: string;
  };
}

export default function PaymentSuccess() {
  const { language } = useLanguage();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [, setPollingCount] = useState(0);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [pendingAttempts, setPendingAttempts] = useState(0);
  const [orderMetadata, setOrderMetadata] = useState<any>(null);

  // SECURITY: Validate order_id format to prevent injection
  const isValidUUID = (id: string): boolean => {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  };

  const getOrderIdFromUrl = (): string | null => {
    const searchParams = new URLSearchParams(window.location.search).get('order_id');
    if (searchParams) return searchParams;
    // Fallback: check sessionStorage for refresh resilience
    const stored = sessionStorage.getItem('payment_order_id');
    if (stored) return stored;
    return null;
  };

  useEffect(() => {
    const urlOrderId = getOrderIdFromUrl();

    if (!urlOrderId) {
      window.location.replace('/tickets');
      return;
    }

    // SECURITY: Validate order_id format before using it
    if (!isValidUUID(urlOrderId)) {
      setError('Invalid order reference');
      setLoading(false);
      return;
    }

    setOrderId(urlOrderId);
    // Persist order_id so page survives refresh
    sessionStorage.setItem('payment_order_id', urlOrderId);

    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let cancelled = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 20;
    const BASE_DELAY = 2000;
    const MAX_DELAY = 15000;

    const poll = async () => {
      if (cancelled || attempt >= MAX_ATTEMPTS) return;
      attempt++;
      setPollingCount(attempt);
      const shouldStop = await fetchOrderDetails();

      // Stop polling once order reaches a terminal state
      if (shouldStop || cancelled || attempt >= MAX_ATTEMPTS) return;

      const delay = Math.min(BASE_DELAY * Math.pow(1.4, attempt - 1), MAX_DELAY);
      setTimeout(poll, delay);
    };

    poll();

    return () => { cancelled = true; };
  }, [orderId]);

  // Returns true if polling should stop (terminal state reached or error)
  const fetchOrderDetails = async (): Promise<boolean> => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, payer_email, payer_name, payer_phone, paid_at, email_sent, email_sent_at, email_error, event_id, created_at, product_type, metadata, billing_street, billing_number, billing_postal_code, billing_city, billing_country')
        .eq('id', orderId)
        .maybeSingle();

      if (orderError || !orderData) {
        setError('Order not found');
        setLoading(false);
        return true;
      }

      if ((orderData as any).product_type === 'seat') {
        sessionStorage.removeItem('payment_order_id');
        window.location.replace(`/seat-confirmation?event=${orderData.event_id}&order=${orderData.id}`);
        return true;
      }

      setOrder(orderData);
      setOrderMetadata(orderData);
      setLoading(false);

      if (orderData.status === 'pending') {
        setPendingAttempts((n) => n + 1);
      }

      const { data: eventData } = await supabase
        .from('events')
        .select('*')
        .eq('id', orderData.event_id)
        .single();

      if (eventData) {
        setEvent(eventData);
      }

      const { data: ticketsData } = await supabase
        .from('tickets')
        .select('*, ticket_types(name)')
        .eq('order_id', orderId)
        .limit(10000);

      if (ticketsData) {
        setTickets(ticketsData);
      }

      // Stop polling once order reaches a terminal state
      const terminalStatuses = ['paid', 'failed', 'cancelled', 'payment_failed', 'payment_canceled', 'payment_expired'];
      if (terminalStatuses.includes(orderData.status)) {
        setLoading(false);
        // Clean up sessionStorage on terminal state
        sessionStorage.removeItem('payment_order_id');
        return true;
      }

      return false;
    } catch (err) {
      console.error('Error fetching order:', err);
      setError('Failed to load order details');
      setLoading(false);
      return true;
    }
  };

  const handleBackToCheckout = () => {
    try {
      const cart = orderMetadata?.metadata?.cart;
      const eventId = orderMetadata?.event_id;
      if (Array.isArray(cart) && cart.length > 0) {
        sessionStorage.setItem('restored_cart', JSON.stringify(
          cart.map((item: any) => ({
            ticket_type_id: item.ticket_type_id,
            quantity: item.quantity,
          }))
        ));
      }
      if (orderMetadata) {
        sessionStorage.setItem('restored_customer', JSON.stringify({
          name: orderMetadata.payer_name || '',
          email: orderMetadata.payer_email || '',
          phone: orderMetadata.payer_phone || '',
          street: orderMetadata.billing_street || '',
          number: orderMetadata.billing_number || '',
          postalCode: orderMetadata.billing_postal_code || '',
          city: orderMetadata.billing_city || '',
          country: orderMetadata.billing_country || 'Belgium',
        }));
      }
    } catch (_) { /* ignore */ }
    sessionStorage.removeItem('payment_order_id');
    const slug = (event && event.slug) ? `&event=${event.slug}` : '';
    window.location.replace(`/#/tickets?payment=canceled${slug}`);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language ? localeMap[language] : 'nl-BE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(language ? localeMap[language] : 'nl-BE', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: number) => {
    return (amount / 100).toFixed(2);
  };

  // SECURITY: Client-side rate limit for email resend to prevent abuse
  const [lastResendTime, setLastResendTime] = useState(0);
  const RESEND_COOLDOWN_MS = 60_000; // 1 minute between resend attempts

  const handleResendEmail = async () => {
    if (!orderId) return;

    // SECURITY: Enforce cooldown between resend attempts
    const now = Date.now();
    if (now - lastResendTime < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - lastResendTime)) / 1000);
      setResendError(`Please wait ${waitSec} seconds before trying again`);
      return;
    }

    setResendingEmail(true);
    setResendSuccess(false);
    setResendError(null);
    setLastResendTime(now);

    try {
      // SECURITY: Use Supabase client to get a proper session token if available,
      // otherwise use the service-role pathway via the Supabase client
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-ticket-email`, {
        method: 'POST',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, resend: true, source: 'payment_success' }),
      });

      const result = await response.json();

      if (response.ok && result.ok) {
        setResendSuccess(true);
        setResendError(null);
        fetchOrderDetails();
        setTimeout(() => setResendSuccess(false), 5000);
      } else {
        const errorMsg = result.message || result.error || result.code || 'Unknown error';
        let fullError = errorMsg;

        if (result.code === 'RATE_LIMIT') {
          fullError = txt(language, {
            nl: `Te snel opnieuw verzonden. ${errorMsg}`,
            tr: `Too many attempts. ${errorMsg}`,
            fr: `Trop de tentatives. ${errorMsg}`,
            de: `Zu viele Versuche. ${errorMsg}`,
          });
        } else if (result.code === 'ORDER_NOT_PAID') {
          fullError = txt(language, {
            nl: 'Bestelling is nog niet betaald',
            tr: 'Order is not paid yet',
            fr: 'La commande n\'est pas encore payée',
            de: 'Bestellung ist noch nicht bezahlt',
          });
        } else if (result.code === 'ALREADY_SENT') {
          fullError = txt(language, {
            nl: 'Email is al verzonden',
            tr: 'Email was already sent',
            fr: 'L\'email a déjà été envoyé',
            de: 'E-Mail wurde bereits gesendet',
          });
        }

        console.error('Email resend failed:', result);
        setResendError(fullError);
        setTimeout(() => setResendError(null), 10000);
      }
    } catch (err) {
      console.error('Error resending email:', err);
      const errorMessage = err instanceof Error ? err.message : 'Network error - please try again';
      setResendError(errorMessage);
      setTimeout(() => setResendError(null), 10000);
    } finally {
      setResendingEmail(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full bg-white rounded-xl shadow-2xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-red-100 rounded-full p-4">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">
            {txt(language, { nl: 'Fout', tr: 'Error', fr: 'Erreur', de: 'Fehler' })}
          </h1>
          <p className="text-slate-600 mb-4">{error}</p>
          {error.includes('Current URL:') && (
            <div className="bg-slate-100 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs font-mono text-slate-700 break-all">
                {error.split('Current URL: ')[1]}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {txt(language, {
                  nl: 'Verwachte URL-formaat: .../#/payment-success?order_id=...',
                  tr: 'Expected URL format: .../#/payment-success?order_id=...',
                  fr: 'Format d\'URL attendu : .../#/payment-success?order_id=...',
                  de: 'Erwartetes URL-Format: .../#/payment-success?order_id=...',
                })}
              </p>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.replace('/#/tickets')}
              className="inline-block bg-cyan-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-cyan-700 transition-colors"
            >
              {txt(language, { nl: 'Terug naar Tickets', tr: 'Back to Tickets', fr: 'Retour aux Billets', de: 'Zurück zu Tickets' })}
            </button>
            <button
              onClick={() => window.location.replace('/#/home')}
              className="inline-block bg-slate-200 text-slate-700 px-6 py-3 rounded-lg font-semibold hover:bg-slate-300 transition-colors"
            >
              {txt(language, { nl: 'Naar Home', tr: 'Go to Home', fr: 'Aller à l\'accueil', de: 'Zur Startseite' })}
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-6">
            {txt(language, {
              nl: 'Als je net hebt betaald, controleer dan je email voor de bestelbevestiging.',
              tr: 'If you just paid, please check your email for the order confirmation.',
              fr: 'Si vous venez de payer, veuillez vérifier votre email pour la confirmation de commande.',
              de: 'Wenn Sie gerade bezahlt haben, überprüfen Sie bitte Ihre E-Mail auf die Bestellbestätigung.',
            })}
          </p>
        </div>
      </div>
    );
  }

  if (loading || !order) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-cyan-100 rounded-full p-4">
              <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">
            {txt(language, { nl: 'Betaling Verwerken...', tr: 'Processing Payment...', fr: 'Traitement du paiement...', de: 'Zahlung wird verarbeitet...' })}
          </h1>
          <p className="text-slate-600">
            {txt(language, {
              nl: 'Een moment geduld, we verwerken je betaling.',
              tr: 'Please wait, we are processing your payment.',
              fr: 'Veuillez patienter, nous traitons votre paiement.',
              de: 'Bitte warten Sie, wir verarbeiten Ihre Zahlung.',
            })}
          </p>
        </div>
      </div>
    );
  }

  if (order.status === 'pending') {
    const showBackOption = pendingAttempts >= 3;
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-yellow-100 rounded-full p-4">
              <Clock className="w-12 h-12 text-yellow-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">
            {txt(language, { nl: 'Betaling In Behandeling', tr: 'Payment Processing', fr: 'Paiement en cours', de: 'Zahlung in Bearbeitung' })}
          </h1>
          <p className="text-slate-600 mb-6">
            {txt(language, {
              nl: 'Je betaling wordt nog verwerkt. Dit kan een paar minuten duren.',
              tr: 'Your payment is being processed. This may take a few minutes.',
              fr: 'Votre paiement est en cours de traitement. Cela peut prendre quelques minutes.',
              de: 'Ihre Zahlung wird noch verarbeitet. Dies kann einige Minuten dauern.',
            })}
          </p>
          <div className="bg-slate-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-slate-700 mb-2">
              <strong>{txt(language, { nl: 'Ordernummer:', tr: 'Order Number:', fr: 'Numéro de commande :', de: 'Bestellnummer:' })}</strong>
            </p>
            <p className="font-mono text-lg text-cyan-600">{order.order_number}</p>
          </div>

          {showBackOption ? (
            <div className="border-t border-slate-200 pt-6 mt-2">
              <p className="text-sm text-slate-700 mb-4">
                {txt(language, {
                  nl: 'Heb je de betaling niet voltooid? Ga terug naar de checkout, je geselecteerde tickets blijven bewaard.',
                  tr: 'Did you not complete the payment? Go back to checkout, your selected tickets will be kept.',
                  fr: 'Vous n\'avez pas finalisé le paiement ? Retournez à la caisse, vos billets sélectionnés sont conservés.',
                  de: 'Haben Sie die Zahlung nicht abgeschlossen? Zurück zur Kasse, Ihre ausgewählten Tickets bleiben erhalten.',
                })}
              </p>
              <button
                onClick={handleBackToCheckout}
                className="w-full bg-cyan-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-cyan-700 transition-colors mb-3"
              >
                {txt(language, {
                  nl: 'Terug naar checkout',
                  tr: 'Back to checkout',
                  fr: 'Retour au paiement',
                  de: 'Zurück zur Kasse',
                })}
              </button>
              <p className="text-xs text-slate-500">
                {txt(language, {
                  nl: 'Als je net hebt betaald, blijf op deze pagina; we wachten op de bevestiging.',
                  tr: 'If you just paid, stay on this page; we are waiting for confirmation.',
                  fr: 'Si vous venez de payer, restez sur cette page ; nous attendons la confirmation.',
                  de: 'Wenn Sie gerade bezahlt haben, bleiben Sie auf dieser Seite; wir warten auf die Bestätigung.',
                })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {txt(language, {
                nl: 'Je ontvangt een bevestigingsmail zodra de betaling is voltooid.',
                tr: 'You will receive a confirmation email once the payment is complete.',
                fr: 'Vous recevrez un email de confirmation une fois le paiement effectué.',
                de: 'Sie erhalten eine Bestätigungs-E-Mail, sobald die Zahlung abgeschlossen ist.',
              })}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (order.status === 'failed' || order.status === 'cancelled' || order.status === 'payment_failed' || order.status === 'payment_canceled' || order.status === 'payment_expired') {
    const statusKey = order.status;
    const headings: Record<string, Record<string, string>> = {
      payment_failed: { nl: 'Betaling mislukt', tr: 'Payment Failed', fr: 'Paiement échoué', de: 'Zahlung fehlgeschlagen' },
      payment_expired: { nl: 'Betaling verlopen', tr: 'Payment Expired', fr: 'Paiement expiré', de: 'Zahlung abgelaufen' },
      payment_canceled: { nl: 'Betaling geannuleerd', tr: 'Payment Canceled', fr: 'Paiement annulé', de: 'Zahlung storniert' },
      failed: { nl: 'Betaling mislukt', tr: 'Payment Failed', fr: 'Paiement échoué', de: 'Zahlung fehlgeschlagen' },
      cancelled: { nl: 'Betaling geannuleerd', tr: 'Payment Canceled', fr: 'Paiement annulé', de: 'Zahlung storniert' },
    };
    const messages: Record<string, Record<string, string>> = {
      payment_failed: { nl: 'Betaling mislukt. Probeer opnieuw.', tr: 'Payment failed. Please try again.', fr: 'Paiement échoué. Veuillez réessayer.', de: 'Zahlung fehlgeschlagen. Bitte versuchen Sie es erneut.' },
      payment_expired: { nl: 'Betaling verlopen. Start opnieuw.', tr: 'Payment expired. Please start again.', fr: 'Paiement expiré. Veuillez recommencer.', de: 'Zahlung abgelaufen. Bitte starten Sie erneut.' },
      payment_canceled: { nl: 'Betaling geannuleerd.', tr: 'Payment was canceled.', fr: 'Paiement annulé.', de: 'Zahlung wurde storniert.' },
      failed: { nl: 'Betaling mislukt. Probeer opnieuw.', tr: 'Payment failed. Please try again.', fr: 'Paiement échoué. Veuillez réessayer.', de: 'Zahlung fehlgeschlagen. Bitte versuchen Sie es erneut.' },
      cancelled: { nl: 'Betaling geannuleerd.', tr: 'Payment was canceled.', fr: 'Paiement annulé.', de: 'Zahlung wurde storniert.' },
    };
    const heading = headings[statusKey] || headings.failed;
    const message = messages[statusKey] || messages.failed;

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-red-100 rounded-full p-4">
              <XCircle className="w-12 h-12 text-red-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">
            {txt(language, heading as any)}
          </h1>
          <p className="text-slate-600 mb-6">
            {txt(language, message as any)}
          </p>
          <button
            onClick={() => window.location.replace('/#/tickets')}
            className="inline-block bg-cyan-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-cyan-700 transition-colors"
          >
            {txt(language, { nl: 'Probeer Opnieuw', tr: 'Try Again', fr: 'Réessayer', de: 'Erneut versuchen' })}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-8 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-white rounded-full p-3">
                <CheckCircle className="w-16 h-16 text-green-500" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              {txt(language, { nl: 'Betaling Geslaagd!', tr: 'Payment Successful!', fr: 'Paiement réussi !', de: 'Zahlung erfolgreich!' })}
            </h1>
            <p className="text-green-50 text-lg">
              {txt(language, { nl: 'Bedankt voor je aankoop!', tr: 'Thank you for your purchase!', fr: 'Merci pour votre achat !', de: 'Vielen Dank für Ihren Einkauf!' })}
            </p>
          </div>

          <div className="p-8">
            <div className="mb-8">
              {order.email_sent ? (
                <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-green-900 mb-1">
                      {txt(language, { nl: '✅ Email Verstuurd', tr: '✅ Email Sent', fr: '✅ Email envoyé', de: '✅ E-Mail gesendet' })}
                    </p>
                    <p className="text-sm text-green-700">
                      {txt(language, {
                        nl: `Je tickets zijn verstuurd naar ${order.payer_email}`,
                        tr: `Your tickets have been sent to ${order.payer_email}`,
                        fr: `Vos billets ont été envoyés à ${order.payer_email}`,
                        de: `Ihre Tickets wurden an ${order.payer_email} gesendet`,
                      })}
                    </p>
                    {order.email_sent_at && (
                      <p className="text-xs text-green-600 mt-1">
                        {txt(language, { nl: 'Verstuurd om', tr: 'Sent at', fr: 'Envoyé à', de: 'Gesendet um' })}{' '}
                        {new Date(order.email_sent_at).toLocaleTimeString()}
                      </p>
                    )}
                    {resendSuccess && (
                      <p className="text-xs text-green-700 font-semibold mt-2">
                        {txt(language, { nl: '✓ Email opnieuw verstuurd!', tr: '✓ Email resent successfully!', fr: '✓ Email renvoyé avec succès !', de: '✓ E-Mail erneut gesendet!' })}
                      </p>
                    )}
                    {resendError && (
                      <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs">
                        <p className="text-red-700 font-mono break-all">{resendError}</p>
                      </div>
                    )}
                    <button
                      onClick={handleResendEmail}
                      disabled={resendingEmail}
                      className="mt-3 flex items-center gap-2 text-green-700 hover:text-green-900 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendingEmail ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {txt(language, { nl: 'Versturen...', tr: 'Sending...', fr: 'Envoi...', de: 'Senden...' })}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          {txt(language, { nl: 'Niet ontvangen? Opnieuw versturen', tr: 'Not received? Resend email', fr: 'Pas reçu ? Renvoyer', de: 'Nicht erhalten? Erneut senden' })}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : order.email_error ? (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900 mb-1">
                      {txt(language, { nl: 'Email Niet Verstuurd', tr: 'Email Not Sent', fr: 'Email non envoyé', de: 'E-Mail nicht gesendet' })}
                    </p>
                    <p className="text-sm text-red-700 mb-2">
                      {txt(language, {
                        nl: 'Er is een fout opgetreden bij het versturen van je tickets email.',
                        tr: 'There was an error sending your tickets email.',
                        fr: 'Une erreur s\'est produite lors de l\'envoi de l\'email de vos billets.',
                        de: 'Beim Senden Ihrer Ticket-E-Mail ist ein Fehler aufgetreten.',
                      })}
                    </p>
                    <details className="text-xs text-red-600 mb-3 cursor-pointer">
                      <summary className="font-medium hover:underline">
                        {txt(language, { nl: 'Technische details', tr: 'Technical details', fr: 'Détails techniques', de: 'Technische Details' })}
                      </summary>
                      <p className="mt-1 font-mono bg-red-100 p-2 rounded text-xs break-all">
                        {order.email_error}
                      </p>
                    </details>
                    <button
                      onClick={handleResendEmail}
                      disabled={resendingEmail}
                      className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendingEmail ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {txt(language, { nl: 'Versturen...', tr: 'Sending...', fr: 'Envoi en cours...', de: 'Wird gesendet...' })}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-4 h-4" />
                          {txt(language, { nl: 'Email Opnieuw Versturen', tr: 'Resend Email', fr: 'Renvoyer l\'email', de: 'E-Mail erneut senden' })}
                        </>
                      )}
                    </button>
                    {resendSuccess && (
                      <p className="text-xs text-green-700 font-semibold mt-2 bg-green-50 p-2 rounded">
                        {txt(language, { nl: '✓ Email opnieuw verstuurd!', tr: '✓ Email resent successfully!', fr: '✓ Email renvoyé avec succès !', de: '✓ E-Mail erneut gesendet!' })}
                      </p>
                    )}
                    {resendError && (
                      <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs">
                        <p className="text-red-900 font-semibold mb-1">
                          {txt(language, { nl: '✗ Fout bij opnieuw versturen:', tr: '✗ Resend failed:', fr: '✗ Échec du renvoi :', de: '✗ Erneutes Senden fehlgeschlagen:' })}
                        </p>
                        <p className="text-red-700 font-mono break-all">{resendError}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <CheckCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      {txt(language, { nl: 'Controleer je mailbox', tr: 'Check your email', fr: 'Vérifiez votre boîte mail', de: 'Überprüfen Sie Ihr Postfach' })}
                    </p>
                    <p className="text-sm text-blue-700">
                      {txt(language, {
                        nl: `Je tickets worden verstuurd naar ${order.payer_email}. Controleer ook je spam/ongewenste map.`,
                        tr: `Your tickets will be sent to ${order.payer_email}. Please also check your spam/junk folder.`,
                        fr: `Vos billets seront envoyés à ${order.payer_email}. Vérifiez également votre dossier spam/indésirables.`,
                        de: `Ihre Tickets werden an ${order.payer_email} gesendet. Bitte überprüfen Sie auch Ihren Spam-Ordner.`,
                      })}
                    </p>
                    {resendSuccess && (
                      <p className="text-xs text-green-700 font-semibold mt-2 bg-green-50 p-2 rounded">
                        {txt(language, { nl: '✓ Email opnieuw verstuurd!', tr: '✓ Email resent successfully!', fr: '✓ Email renvoyé avec succès !', de: '✓ E-Mail erneut gesendet!' })}
                      </p>
                    )}
                    {resendError && (
                      <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs">
                        <p className="text-red-700 font-mono break-all">{resendError}</p>
                      </div>
                    )}
                    <button
                      onClick={handleResendEmail}
                      disabled={resendingEmail}
                      className="mt-3 flex items-center gap-2 text-blue-700 hover:text-blue-900 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendingEmail ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {txt(language, { nl: 'Versturen...', tr: 'Sending...', fr: 'Envoi...', de: 'Senden...' })}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          {txt(language, { nl: 'Niet ontvangen? Opnieuw versturen', tr: 'Not received? Resend email', fr: 'Pas reçu ? Renvoyer', de: 'Nicht erhalten? Erneut senden' })}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-6 mb-6">
              <h2 className="text-xl font-bold text-slate-900 mb-4">
                {txt(language, { nl: 'Bestelgegevens', tr: 'Order Details', fr: 'Détails de la commande', de: 'Bestelldetails' })}
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">{txt(language, { nl: 'Ordernummer:', tr: 'Order Number:', fr: 'Numéro de commande :', de: 'Bestellnummer:' })}</span>
                  <span className="font-mono font-semibold text-slate-900">{order.order_number}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">{txt(language, { nl: 'Totaal Bedrag:', tr: 'Total Amount:', fr: 'Montant total :', de: 'Gesamtbetrag:' })}</span>
                  <span className="font-semibold text-slate-900">&euro;{formatAmount(order.total_amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">{txt(language, { nl: 'Betaald op:', tr: 'Paid on:', fr: 'Payé le :', de: 'Bezahlt am:' })}</span>
                  <span className="text-slate-900">
                    {order.paid_at ? new Date(order.paid_at).toLocaleString() : '-'}
                  </span>
                </div>
              </div>
            </div>

            {event && (
              <div className="border-t border-slate-200 pt-6 mb-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">
                  {txt(language, { nl: 'Event Informatie', tr: 'Event Information', fr: 'Informations sur l\'événement', de: 'Veranstaltungsinformationen' })}
                </h2>
                <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                  <h3 className="font-bold text-lg text-slate-900">{event.name}</h3>
                  <p className="text-slate-700">
                    <strong>{txt(language, { nl: 'Datum:', tr: 'Date:', fr: 'Date :', de: 'Datum:' })}</strong> {formatDate(event.start_date)}
                  </p>
                  <p className="text-slate-700">
                    <strong>{txt(language, { nl: 'Tijd:', tr: 'Time:', fr: 'Heure :', de: 'Uhrzeit:' })}</strong> {formatTime(event.start_date)}
                  </p>
                  <p className="text-slate-700">
                    <strong>{txt(language, { nl: 'Locatie:', tr: 'Location:', fr: 'Lieu :', de: 'Ort:' })}</strong> {event.location}
                  </p>
                  {event.location_address && (
                    <p className="text-sm text-slate-600">{event.location_address}</p>
                  )}
                </div>
              </div>
            )}

            {tickets.length > 0 && (
              <div className="border-t border-slate-200 pt-6">
                <h2 className="text-xl font-bold text-slate-900 mb-4">
                  {txt(language, { nl: 'Je Tickets', tr: 'Your Tickets', fr: 'Vos billets', de: 'Ihre Tickets' })}
                </h2>
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <div key={ticket.id} className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-slate-900">{ticket.ticket_types?.name}</p>
                          <p className="text-sm text-slate-600">{ticket.holder_name}</p>
                          <p className="text-xs text-slate-500 font-mono mt-1">{ticket.ticket_number}</p>
                        </div>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            ticket.status === 'valid'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {ticket.status === 'valid'
                            ? txt(language, { nl: 'Geldig', tr: 'Valid', fr: 'Valide', de: 'Gültig' })
                            : txt(language, { nl: 'In Behandeling', tr: 'Processing', fr: 'En cours', de: 'In Bearbeitung' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 pt-6 mt-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-900 leading-relaxed">
                  <strong>
                    {txt(language, { nl: '⚠️ Belangrijk:', tr: '⚠️ Important:', fr: '⚠️ Important :', de: '⚠️ Wichtig:' })}
                  </strong>{' '}
                  {txt(language, {
                    nl: 'Bewaar de email met je tickets. Je hebt deze nodig bij de ingang. Je kunt de QR-code op je telefoon tonen of de tickets afdrukken.',
                    tr: 'Keep the email with your tickets safe. You will need them at the entrance. You can show the QR code on your phone or print the tickets.',
                    fr: 'Conservez l\'email avec vos billets. Vous en aurez besoin à l\'entrée. Vous pouvez montrer le code QR sur votre téléphone ou imprimer les billets.',
                    de: 'Bewahren Sie die E-Mail mit Ihren Tickets auf. Sie benötigen diese am Eingang. Sie können den QR-Code auf Ihrem Telefon zeigen oder die Tickets ausdrucken.',
                  })}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => {
                    window.location.replace('/#/home');
                  }}
                  className="flex-1 bg-cyan-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-cyan-700 transition-colors text-center"
                >
                  {txt(language, { nl: 'Terug naar Home', tr: 'Back to Home', fr: 'Retour à l\'accueil', de: 'Zurück zur Startseite' })}
                </button>
                <button
                  onClick={() => {
                    window.location.replace('/#/tickets');
                  }}
                  className="flex-1 bg-slate-200 text-slate-700 px-6 py-3 rounded-lg font-semibold hover:bg-slate-300 transition-colors text-center"
                >
                  {txt(language, { nl: 'Meer Tickets Kopen', tr: 'Buy More Tickets', fr: 'Acheter plus de billets', de: 'Mehr Tickets kaufen' })}
                </button>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-500">
                {txt(language, { nl: 'Vragen? Neem contact op via', tr: 'Questions? Contact us at', fr: 'Des questions ? Contactez-nous à', de: 'Fragen? Kontaktieren Sie uns unter' })}{' '}
                <a href="mailto:info@stagenation.be" className="text-cyan-600 hover:underline">
                  info@stagenation.be
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
