import { Plus, Trash2, Shield, ShieldAlert, ShieldCheck, Key, AlertCircle, Mail } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useToast } from './Toast';

interface ScannerUser {
  id: string;
  user_id: string;
  email: string;
  role: string;
  is_active: boolean;
  event_id: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

interface ScannerUsersManagerProps {
  currentUserRole?: string | null;
}

export function ScannerUsersManager({ currentUserRole }: ScannerUsersManagerProps = {}) {
  const { showToast } = useToast();
  const isSuperAdmin = currentUserRole === 'super_admin';
  const [users, setUsers] = useState<ScannerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ScannerUser | null>(null);
  const [userForm, setUserForm] = useState({
    email: '',
    password: '',
    role: 'scanner',
    is_active: true,
  });
  const [passwordForm, setPasswordForm] = useState({
    user_id: '',
    new_password: '',
  });

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('No session token');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-scanner-users`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to load users');
      }

      setUsers(result.users || []);
    } catch (error: any) {
      console.error('Error loading scanner users:', error);
      showToast(`Fout bij laden gebruikers: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('Niet ingelogd. Log opnieuw in.');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user-role`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: userForm.email,
            role: userForm.role,
            brand: null,
            event_id: null,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ScannerUsersManager] HTTP error:', response.status, errorText);
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || `Server fout: ${response.status}`);
        } catch {
          throw new Error(`Server fout: ${response.status} - ${errorText.slice(0, 200)}`);
        }
      }

      const result = await response.json();

      if (!result.success) {
        console.error('[ScannerUsersManager] Error response:', result);
        throw new Error(result.error || 'Onbekende fout bij aanmaken gebruiker');
      }

      if (result.is_new_user && result.temp_password) {
        showToast(`Nieuwe gebruiker aangemaakt!\n\nEmail: ${result.user_email}\nTijdelijk wachtwoord: ${result.temp_password}\n\nDeel dit wachtwoord veilig met de gebruiker.`, 'success');
      } else if (result.is_new_user) {
        showToast(`Nieuwe gebruiker aangemaakt: ${result.user_email}\n\nEen tijdelijk wachtwoord is per e-mail verstuurd.`, 'success');
      } else {
        showToast(`Rol toegewezen aan bestaande gebruiker: ${result.user_email}`, 'success');
      }

      setShowUserForm(false);
      resetUserForm();
      loadUsers();
    } catch (error: any) {
      console.error('[ScannerUsersManager] Error creating user:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  }

  async function handleUpdateRole(userRoleId: string, newRole: string) {
    if (!confirm('Weet je zeker dat je de rol wilt wijzigen?')) return;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('No session token');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-update-user-role`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_role_id: userRoleId,
            new_role: newRole,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to update role');
      }

      showToast('Rol succesvol gewijzigd!', 'success');
      loadUsers();
    } catch (error: any) {
      console.error('Error updating role:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  }

  async function handleToggleActive(userRoleId: string, currentStatus: boolean) {
    const action = currentStatus ? 'uitschakelen' : 'activeren';
    if (!confirm(`Weet je zeker dat je deze gebruiker wilt ${action}?`)) return;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('No session token');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-toggle-user-active`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_role_id: userRoleId,
            is_active: !currentStatus,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to toggle status');
      }

      showToast(`Gebruiker ${!currentStatus ? 'geactiveerd' : 'gedeactiveerd'}!`, 'success');
      loadUsers();
    } catch (error: any) {
      console.error('Error toggling active status:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();

    if (!passwordForm.new_password || passwordForm.new_password.length < 10) {
      showToast('Wachtwoord moet minimaal 10 tekens bevatten', 'error');
      return;
    }

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('No session token');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-reset-user-password`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: passwordForm.user_id,
            new_password: passwordForm.new_password,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to reset password');
      }

      showToast('Wachtwoord succesvol gereset!', 'success');
      setShowPasswordReset(false);
      setPasswordForm({ user_id: '', new_password: '' });
      setSelectedUser(null);
    } catch (error: any) {
      console.error('Error resetting password:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  }

  async function handleDeleteUser(id: string, email: string) {
    if (!confirm(`Weet je zeker dat je ${email} wilt verwijderen?`)) return;

    try {
      const { data, error } = await supabase.functions.invoke('delete-user-role', {
        body: { user_role_id: id },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to delete user');

      showToast('Gebruiker verwijderd!', 'success');
      loadUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  }

  async function handleSendPasswordResetEmail(user: ScannerUser) {
    if (!confirm(`Weet je zeker dat je een wachtwoord reset email wilt sturen naar ${user.email}?`)) return;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      if (!token) {
        throw new Error('No session token');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-password-reset-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: user.user_id,
            email: user.email,
          }),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to send password reset email');
      }

      showToast(`Wachtwoord reset email is verstuurd naar ${user.email}.\n\nDe gebruiker kan nu op de link in de email klikken om een nieuw wachtwoord in te stellen.`, 'success');
    } catch (error: any) {
      console.error('Error sending password reset email:', error);
      showToast(`Fout: ${error.message}`, 'error');
    }
  }

  function resetUserForm() {
    setUserForm({
      email: '',
      password: '',
      role: 'scanner',
      is_active: true,
    });
  }

  function openPasswordReset(user: ScannerUser) {
    setSelectedUser(user);
    setPasswordForm({
      user_id: user.user_id,
      new_password: '',
    });
    setShowPasswordReset(true);
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white">Laden...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold mb-2 text-white">
            Scanner <span className="text-red-400">Gebruikers</span>
          </h2>
          <p className="text-white">Beheer scanner accounts met email en wachtwoord</p>
        </div>
        <button
          onClick={() => {
            setShowUserForm(true);
            resetUserForm();
          }}
          className="flex items-center gap-2 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors text-white"
        >
          <Plus className="w-5 h-5" />
          Nieuwe Scanner Gebruiker
        </button>
      </div>

      <div className="mb-8 bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-cyan-400 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h3 className="font-bold text-cyan-400 mb-2">Scanner Toegang</h3>
            <p className="text-sm text-white mb-3">
              Maak scanner accounts aan met email en wachtwoord. Deze accounts kunnen inloggen op de scanner app om tickets en tafels te scannen.
            </p>
            <ul className="text-sm text-white space-y-2">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                <span><strong>Scanner:</strong> Kan alleen scannen, geen beheer</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                <span><strong>Admin:</strong> Kan scannen en beheer per event</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-1">•</span>
                <span><strong>Super Admin:</strong> Volledige toegang (gebruik voorzichtig)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {showUserForm && (
        <div className="mb-8 bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
          <h3 className="text-2xl font-bold text-white mb-6">Nieuwe Scanner Gebruiker</h3>
          <form onSubmit={handleCreateUser} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">E-mailadres *</label>
              <input
                type="email"
                required
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white"
                placeholder="scanner@voorbeeld.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Rol *</label>
              <select
                required
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white"
              >
                <option value="scanner">Scanner</option>
                {isSuperAdmin && <option value="admin">Admin</option>}
                {isSuperAdmin && <option value="super_admin">Super Admin</option>}
              </select>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-sm text-yellow-200">
                <strong>Let op:</strong> De gebruiker krijgt automatisch een veilig gegenereerd tijdelijk wachtwoord.
                <br />
                Je kunt het wachtwoord later resetten via de "Wachtwoord resetten" knop.
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setShowUserForm(false)}
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors text-white"
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors text-white"
              >
                Aanmaken
              </button>
            </div>
          </form>
        </div>
      )}

      {showPasswordReset && selectedUser && (
        <div className="mb-8 bg-slate-800/80 backdrop-blur border-2 border-slate-600 rounded-2xl p-6">
          <h3 className="text-2xl font-bold text-white mb-6">
            Wachtwoord Resetten: {selectedUser.email}
          </h3>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-white">Nieuw Wachtwoord *</label>
              <input
                type="password"
                required
                minLength={10}
                value={passwordForm.new_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                className="w-full px-4 py-2 bg-slate-900 border-2 border-slate-600 rounded-lg focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 text-white"
                placeholder="Minimaal 10 tekens"
              />
              <p className="text-sm text-white/70 mt-1">Wachtwoord moet minimaal 10 tekens bevatten</p>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => {
                  setShowPasswordReset(false);
                  setSelectedUser(null);
                  setPasswordForm({ user_id: '', new_password: '' });
                }}
                className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition-colors text-white"
              >
                Annuleren
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-400 rounded-lg font-semibold transition-colors text-white"
              >
                Wachtwoord Resetten
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-slate-800/50 backdrop-blur border-2 border-slate-700 rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-700/50">
              <th className="px-6 py-4 text-left text-sm font-bold text-white">Email</th>
              <th className="px-6 py-4 text-left text-sm font-bold text-white">Rol</th>
              <th className="px-6 py-4 text-left text-sm font-bold text-white">Status</th>
              <th className="px-6 py-4 text-left text-sm font-bold text-white">Aangemaakt</th>
              <th className="px-6 py-4 text-left text-sm font-bold text-white">Laatste Login</th>
              <th className="px-6 py-4 text-right text-sm font-bold text-white">Acties</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-slate-700 hover:bg-slate-700/30">
                <td className="px-6 py-4 text-white">{user.email}</td>
                <td className="px-6 py-4">
                  <select
                    value={user.role}
                    onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                    className="px-3 py-1 bg-slate-900 border border-slate-600 rounded text-white text-sm"
                    disabled={!isSuperAdmin && user.role !== 'scanner'}
                  >
                    <option value="scanner">Scanner</option>
                    {isSuperAdmin && <option value="admin">Admin</option>}
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </td>
                <td className="px-6 py-4">
                  {user.is_active ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                      <ShieldCheck className="w-4 h-4" />
                      Actief
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm">
                      <ShieldAlert className="w-4 h-4" />
                      Uitgeschakeld
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-white/70 text-sm">
                  {new Date(user.created_at).toLocaleDateString('nl-NL')}
                </td>
                <td className="px-6 py-4 text-white/70 text-sm">
                  {user.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleDateString('nl-NL')
                    : 'Nooit'}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleSendPasswordResetEmail(user)}
                      className="p-2 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                      title="Stuur wachtwoord reset email"
                    >
                      <Mail className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openPasswordReset(user)}
                      className="p-2 text-cyan-400 hover:bg-cyan-500/20 rounded-lg transition-colors"
                      title="Wachtwoord handmatig resetten"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(user.id, user.is_active)}
                      className={`p-2 rounded-lg transition-colors ${
                        user.is_active
                          ? 'text-yellow-400 hover:bg-yellow-500/20'
                          : 'text-green-400 hover:bg-green-500/20'
                      }`}
                      title={user.is_active ? 'Uitschakelen' : 'Activeren'}
                    >
                      <Shield className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.id, user.email)}
                      className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      title="Verwijderen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12">
            <Shield className="w-16 h-16 mx-auto mb-4" style={{ color: 'rgba(255, 255, 255, 0.45)' }} />
            <p className="text-white text-lg">Geen scanner gebruikers gevonden</p>
            <p className="text-white/70 text-sm mt-2">Maak je eerste scanner gebruiker aan om te beginnen</p>
          </div>
        )}
      </div>
    </div>
  );
}
