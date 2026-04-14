import { useState, useEffect } from 'react';
import { Mail, Download, RefreshCw, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from '../components/Toast';

interface MailingListEntry {
  id: string;
  email: string;
  source: string;
  consent_timestamp: string;
  created_at: string;
}

export function MailingList() {
  const { showToast } = useToast();
  const [emails, setEmails] = useState<MailingListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadMailingList();
  }, []);

  async function loadMailingList() {
    try {
      const { data, error } = await supabase
        .from('mailing_list')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error) throw error;
      setEmails(data || []);
    } catch (error) {
      console.error('Error loading mailing list:', error);
    } finally {
      setLoading(false);
    }
  }

  async function exportToCSV() {
    setExporting(true);
    try {
      const csvContent = [
        ['Email', 'Source', 'Consent Date', 'Added Date'].join(','),
        ...emails.map((entry) =>
          [
            entry.email,
            entry.source,
            new Date(entry.consent_timestamp).toISOString(),
            new Date(entry.created_at).toISOString(),
          ].join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mailing-list-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      showToast('Export mislukt', 'error');
    } finally {
      setExporting(false);
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('nl-BE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="py-20 px-4 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400">Mailinglist laden...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-20 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-bold mb-2">
              <span className="text-cyan-400">Mailing</span> List
            </h1>
            <p className="text-slate-400">
              Alle e-mailadressen met marketing opt-in van klanten
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={loadMailingList}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Ververs</span>
            </button>
            <button
              onClick={exportToCSV}
              disabled={exporting || emails.length === 0}
              className="flex items-center space-x-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? 'Exporteren...' : 'Export CSV'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Mail className="w-8 h-8 text-cyan-400" />
              <span className="text-xs text-slate-400">TOTAAL</span>
            </div>
            <div className="text-3xl font-bold mb-1">{emails.length}</div>
            <div className="text-sm text-slate-400">Geregistreerde e-mails</div>
          </div>

          <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Calendar className="w-8 h-8 text-green-400" />
              <span className="text-xs text-slate-400">VANDAAG</span>
            </div>
            <div className="text-3xl font-bold mb-1">
              {
                emails.filter(
                  (e) =>
                    new Date(e.created_at).toDateString() === new Date().toDateString()
                ).length
              }
            </div>
            <div className="text-sm text-slate-400">Nieuwe inschrijvingen</div>
          </div>

          <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <Mail className="w-8 h-8 text-amber-400" />
              <span className="text-xs text-slate-400">SOURCES</span>
            </div>
            <div className="text-3xl font-bold mb-1">
              {new Set(emails.map((e) => e.source)).size}
            </div>
            <div className="text-sm text-slate-400">Verschillende bronnen</div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-700">
            <h2 className="text-xl font-bold">Alle E-mailadressen</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">
                    E-mail
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">
                    Bron
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">
                    Toestemming Datum
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase">
                    Toegevoegd
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {emails.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                      Nog geen e-mailadressen in de mailinglist
                    </td>
                  </tr>
                ) : (
                  emails.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-cyan-400" />
                          <span className="text-cyan-400">{entry.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            entry.source === 'checkout_optin'
                              ? 'bg-green-500/10 text-green-400'
                              : entry.source === 'manual'
                              ? 'bg-blue-500/10 text-blue-400'
                              : 'bg-slate-500/10 text-slate-400'
                          }`}
                        >
                          {entry.source}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {formatDate(entry.consent_timestamp)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {formatDate(entry.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
          <h3 className="text-lg font-bold text-blue-400 mb-2">GDPR Compliantie</h3>
          <p className="text-sm text-slate-300">
            Alle e-mailadressen in deze lijst hebben expliciet toestemming gegeven om
            marketingcommunicatie te ontvangen. De datum van toestemming wordt bewaard voor
            compliance doeleinden. Klanten kunnen zich op elk moment uitschrijven.
          </p>
        </div>
      </div>
    </div>
  );
}
