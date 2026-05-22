import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('stagenation_scanner.db');
  await initSchema(db);
  return db;
}

async function initSchema(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      ticket_number TEXT,
      qr_data TEXT,
      qr_token TEXT,
      ticket_code TEXT,
      ticket_type_name TEXT,
      section_name TEXT,
      row_label TEXT,
      seat_number INTEGER,
      seat_type TEXT,
      holder_name TEXT,
      status TEXT DEFAULT 'valid',
      is_scanned INTEGER DEFAULT 0,
      scanned_at TEXT,
      downloaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      ticket_id TEXT,
      qr_raw TEXT NOT NULL,
      result TEXT NOT NULL,
      ticket_number TEXT,
      ticket_type_name TEXT,
      section_name TEXT,
      row_label TEXT,
      seat_number INTEGER,
      seat_type TEXT,
      scanned_at TEXT NOT NULL,
      synced_at TEXT,
      sync_status TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scan_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      attempts INTEGER DEFAULT 0,
      last_error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_qr_data ON tickets(qr_data);
    CREATE INDEX IF NOT EXISTS idx_tickets_qr_token ON tickets(qr_token);
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_code ON tickets(ticket_code);
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number ON tickets(ticket_number);
    CREATE INDEX IF NOT EXISTS idx_scans_event ON scans(event_id);
    CREATE INDEX IF NOT EXISTS idx_scans_sync ON scans(sync_status);
  `);
}

export async function clearEventData(eventId: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM tickets WHERE event_id = ?', eventId);
  await database.runAsync('DELETE FROM scans WHERE event_id = ? AND sync_status = "synced"', eventId);
}

export async function storeTickets(
  eventId: string,
  tickets: Array<{
    id: string;
    ticket_number: string | null;
    qr_data: string | null;
    qr_token: string | null;
    ticket_code: string | null;
    ticket_type_name: string | null;
    section_name: string | null;
    row_label: string | null;
    seat_number: number | null;
    seat_type: string | null;
    holder_name: string | null;
  }>
): Promise<void> {
  const database = await getDatabase();
  const stmt = await database.prepareAsync(
    `INSERT OR REPLACE INTO tickets (id, event_id, ticket_number, qr_data, qr_token, ticket_code, ticket_type_name, section_name, row_label, seat_number, seat_type, holder_name)
     VALUES ($id, $eventId, $ticketNumber, $qrData, $qrToken, $ticketCode, $ticketTypeName, $sectionName, $rowLabel, $seatNumber, $seatType, $holderName)`
  );

  try {
    for (const ticket of tickets) {
      await stmt.executeAsync({
        $id: ticket.id,
        $eventId: eventId,
        $ticketNumber: ticket.ticket_number,
        $qrData: ticket.qr_data,
        $qrToken: ticket.qr_token,
        $ticketCode: ticket.ticket_code,
        $ticketTypeName: ticket.ticket_type_name,
        $sectionName: ticket.section_name,
        $rowLabel: ticket.row_label,
        $seatNumber: ticket.seat_number,
        $seatType: ticket.seat_type,
        $holderName: ticket.holder_name,
      });
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

export async function findTicketByQR(
  eventId: string,
  qrRaw: string
): Promise<{
  id: string;
  ticket_number: string | null;
  ticket_type_name: string | null;
  section_name: string | null;
  row_label: string | null;
  seat_number: number | null;
  seat_type: string | null;
  holder_name: string | null;
  is_scanned: number;
  scanned_at: string | null;
} | null> {
  const database = await getDatabase();

  let parsed: { tid?: string; tok?: string } | null = null;
  try {
    parsed = JSON.parse(qrRaw);
  } catch {}

  if (parsed?.tid) {
    const row = await database.getFirstAsync<any>(
      'SELECT * FROM tickets WHERE id = ? AND event_id = ?',
      [parsed.tid, eventId]
    );
    if (row) return row;
  }

  const row = await database.getFirstAsync<any>(
    `SELECT * FROM tickets WHERE event_id = ? AND (
      qr_data = ? OR qr_token = ? OR ticket_code = ? OR ticket_number = ?
    ) LIMIT 1`,
    [eventId, qrRaw, qrRaw, qrRaw, qrRaw]
  );
  return row || null;
}

export async function checkAlreadyScanned(eventId: string, ticketId: string): Promise<boolean> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM tickets WHERE id = ? AND event_id = ? AND is_scanned = 1',
    [ticketId, eventId]
  );
  return (row?.cnt ?? 0) > 0;
}

export async function markScanned(ticketId: string, eventId: string): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    'UPDATE tickets SET is_scanned = 1, scanned_at = ? WHERE id = ? AND event_id = ?',
    [now, ticketId, eventId]
  );
}

export async function recordScan(scan: {
  id: string;
  event_id: string;
  ticket_id: string | null;
  qr_raw: string;
  result: string;
  ticket_number: string | null;
  ticket_type_name: string | null;
  section_name: string | null;
  row_label: string | null;
  seat_number: number | null;
  seat_type: string | null;
}): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO scans (id, event_id, ticket_id, qr_raw, result, ticket_number, ticket_type_name, section_name, row_label, seat_number, seat_type, scanned_at, sync_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [scan.id, scan.event_id, scan.ticket_id, scan.qr_raw, scan.result, scan.ticket_number, scan.ticket_type_name, scan.section_name, scan.row_label, scan.seat_number, scan.seat_type, now]
  );

  await database.runAsync(
    `INSERT INTO sync_queue (scan_id, payload) VALUES (?, ?)`,
    [scan.id, JSON.stringify({ ...scan, scanned_at: now })]
  );
}

export async function getEventStats(eventId: string): Promise<{
  totalTickets: number;
  totalScanned: number;
  validScans: number;
  alreadyUsed: number;
  invalidScans: number;
  pendingSync: number;
}> {
  const database = await getDatabase();

  const total = await database.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM tickets WHERE event_id = ?', [eventId]
  );
  const scanned = await database.getFirstAsync<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM tickets WHERE event_id = ? AND is_scanned = 1', [eventId]
  );
  const valid = await database.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM scans WHERE event_id = ? AND result = 'valid'", [eventId]
  );
  const already = await database.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM scans WHERE event_id = ? AND result = 'already_used'", [eventId]
  );
  const invalid = await database.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM scans WHERE event_id = ? AND result = 'invalid'", [eventId]
  );
  const pending = await database.getFirstAsync<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM scans WHERE event_id = ? AND sync_status = 'pending'", [eventId]
  );

  return {
    totalTickets: total?.cnt ?? 0,
    totalScanned: scanned?.cnt ?? 0,
    validScans: valid?.cnt ?? 0,
    alreadyUsed: already?.cnt ?? 0,
    invalidScans: invalid?.cnt ?? 0,
    pendingSync: pending?.cnt ?? 0,
  };
}

export async function getStatsByType(eventId: string): Promise<Array<{ name: string; total: number; scanned: number }>> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ ticket_type_name: string; total: number; scanned: number }>(
    `SELECT ticket_type_name, COUNT(*) as total, SUM(is_scanned) as scanned
     FROM tickets WHERE event_id = ? GROUP BY ticket_type_name`,
    [eventId]
  );
  return rows.map(r => ({ name: r.ticket_type_name || 'Onbekend', total: r.total, scanned: r.scanned }));
}

export async function getStatsBySection(eventId: string): Promise<Array<{ name: string; total: number; scanned: number }>> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ section_name: string; total: number; scanned: number }>(
    `SELECT section_name, COUNT(*) as total, SUM(is_scanned) as scanned
     FROM tickets WHERE event_id = ? GROUP BY section_name`,
    [eventId]
  );
  return rows.map(r => ({ name: r.section_name || 'Onbekend', total: r.total, scanned: r.scanned }));
}

export async function getPendingSyncs(): Promise<Array<{ id: number; scan_id: string; payload: string; attempts: number }>> {
  const database = await getDatabase();
  return database.getAllAsync<any>(
    'SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT 50'
  );
}

export async function markSynced(scanId: string, syncQueueId: number): Promise<void> {
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.runAsync("UPDATE scans SET sync_status = 'synced', synced_at = ? WHERE id = ?", [now, scanId]);
  await database.runAsync('DELETE FROM sync_queue WHERE id = ?', [syncQueueId]);
}

export async function incrementSyncAttempt(syncQueueId: number, error: string): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?',
    [error, syncQueueId]
  );
}
