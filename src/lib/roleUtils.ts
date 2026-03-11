export type ValidRole = 'super_admin' | 'admin' | 'scanner';

export function normalizeRole(role: string | null | undefined): ValidRole | null {
  if (!role) return null;

  const normalized = role.toLowerCase().replace(/[-\s]/g, '_');

  if (normalized === 'super_admin' || normalized === 'superadmin') {
    return 'super_admin';
  }

  if (normalized === 'admin') {
    return 'admin';
  }

  if (normalized === 'scanner' || normalized === 'scanner_manager' || normalized === 'bar_staff' || normalized === 'table_manager') {
    return 'scanner';
  }

  return null;
}

export function isSuperAdmin(role: string | null | undefined): boolean {
  if (!role) return false;
  return role === 'super_admin';
}

export function isAdmin(role: string | null | undefined): boolean {
  if (!role) return false;
  return role === 'super_admin' || role === 'admin';
}

export function isScanner(role: string | null | undefined): boolean {
  if (!role) return false;
  return role === 'super_admin' || role === 'admin' || role === 'scanner';
}
