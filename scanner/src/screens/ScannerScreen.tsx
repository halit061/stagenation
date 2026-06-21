import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import {
  findTicketByQR,
  markScanned,
  recordScan,
  getEventStats,
} from '../lib/database';
import { supabase } from '../lib/supabase';
import { isOnline } from '../lib/sync';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const RESULT_DISPLAY_DURATION = 3000;

type ScanStatus = 'valid' | 'already_used' | 'invalid' | 'wrong_event' | 'error';

type ScanResult = {
  status: ScanStatus;
  ticketNumber: string | null;
  ticketType: string | null;
  sectionName: string | null;
  rowLabel: string | null;
  seatNumber: number | null;
  seatType: string | null;
  holderName: string | null;
  message: string | null;
  timestamp: string;
};

type Props = {
  eventId: string;
  eventName: string;
  entranceName?: string;
  onOpenStats: () => void;
  onBack: () => void;
};

export default function ScannerScreen({ eventId, eventName, entranceName, onOpenStats, onBack }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [showingResult, setShowingResult] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [stats, setStats] = useState({ totalScanned: 0, totalTickets: 0, pendingSync: 0 });
  const [online, setOnline] = useState(true);
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const scanLockRef = useRef(false);
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultAnim = useRef(new Animated.Value(0)).current;

  const refreshStats = useCallback(async () => {
    setOnline(await isOnline());
    const s = await getEventStats(eventId);
    setStats({ totalScanned: s.totalScanned, totalTickets: s.totalTickets, pendingSync: s.pendingSync });
  }, [eventId]);

  React.useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  const addToHistory = (result: ScanResult) => {
    setScanHistory(prev => [result, ...prev].slice(0, 10));
  };

  const showResultScreen = (result: ScanResult) => {
    setLastResult(result);
    setShowingResult(true);
    setScanning(false);

    resultAnim.setValue(0);
    Animated.spring(resultAnim, {
      toValue: 1,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();

    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    resultTimeoutRef.current = setTimeout(() => {
      setShowingResult(false);
      setScanning(true);
    }, RESULT_DISPLAY_DURATION);
  };

  const dismissResult = () => {
    if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
    setShowingResult(false);
    setScanning(true);
  };

  const scanOnline = async (qrData: string): Promise<ScanResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('unified-scan', {
        body: {
          code: qrData,
          active_event_id: eventId,
        },
      });

      if (error) return null;
      if (!data || !data.status) return null;

      const now = new Date().toISOString();
      const details = data.details || {};

      switch (data.status) {
        case 'OK':
          return {
            status: 'valid',
            ticketNumber: details.ticket_number || null,
            ticketType: details.ticket_type_name || null,
            sectionName: details.section_name || null,
            rowLabel: details.row_label || null,
            seatNumber: details.seat_number || null,
            seatType: null,
            holderName: details.holder_name || details.guest_name || null,
            message: data.message || null,
            timestamp: now,
          };
        case 'ALREADY_USED':
          return {
            status: 'already_used',
            ticketNumber: details.ticket_number || null,
            ticketType: details.ticket_type_name || null,
            sectionName: details.section_name || null,
            rowLabel: details.row_label || null,
            seatNumber: details.seat_number || null,
            seatType: null,
            holderName: details.holder_name || details.guest_name || null,
            message: data.message || null,
            timestamp: now,
          };
        case 'WRONG_EVENT':
          return {
            status: 'wrong_event',
            ticketNumber: null,
            ticketType: null,
            sectionName: null,
            rowLabel: null,
            seatNumber: null,
            seatType: null,
            holderName: null,
            message: data.message || 'Ticket voor ander event',
            timestamp: now,
          };
        case 'INVALID':
        case 'EVENT_CLOSED':
        case 'NOT_YET_OPEN':
          return {
            status: 'invalid',
            ticketNumber: null,
            ticketType: null,
            sectionName: null,
            rowLabel: null,
            seatNumber: null,
            seatType: null,
            holderName: null,
            message: data.message || 'Ongeldig ticket',
            timestamp: now,
          };
        default:
          return {
            status: 'invalid',
            ticketNumber: null,
            ticketType: null,
            sectionName: null,
            rowLabel: null,
            seatNumber: null,
            seatType: null,
            holderName: null,
            message: data.message || 'Onbekende status',
            timestamp: now,
          };
      }
    } catch {
      return null;
    }
  };

  const scanOffline = async (qrData: string): Promise<ScanResult> => {
    const now = new Date().toISOString();
    const ticket = await findTicketByQR(eventId, qrData);

    if (!ticket) {
      return {
        status: 'invalid',
        ticketNumber: null,
        ticketType: null,
        sectionName: null,
        rowLabel: null,
        seatNumber: null,
        seatType: null,
        holderName: null,
        message: 'Code niet gevonden (offline)',
        timestamp: now,
      };
    }

    if (ticket.is_scanned) {
      return {
        status: 'already_used',
        ticketNumber: ticket.ticket_number,
        ticketType: ticket.ticket_type_name,
        sectionName: ticket.section_name,
        rowLabel: ticket.row_label,
        seatNumber: ticket.seat_number,
        seatType: ticket.seat_type,
        holderName: ticket.holder_name,
        message: 'Reeds gescand (offline)',
        timestamp: now,
      };
    }

    await markScanned(ticket.id, eventId);

    return {
      status: 'valid',
      ticketNumber: ticket.ticket_number,
      ticketType: ticket.ticket_type_name,
      sectionName: ticket.section_name,
      rowLabel: ticket.row_label,
      seatNumber: ticket.seat_number,
      seatType: ticket.seat_type,
      holderName: ticket.holder_name,
      message: null,
      timestamp: now,
    };
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanLockRef.current || !scanning) return;
    scanLockRef.current = true;

    try {
      let result: ScanResult;

      const deviceOnline = await isOnline();
      setOnline(deviceOnline);

      if (deviceOnline) {
        const onlineResult = await scanOnline(data);
        if (onlineResult) {
          result = onlineResult;
        } else {
          result = await scanOffline(data);
        }
      } else {
        result = await scanOffline(data);
      }

      if (result.status === 'valid') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (result.status === 'already_used') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }

      showResultScreen(result);
      addToHistory(result);

      await recordScan({
        id: crypto.randomUUID(),
        event_id: eventId,
        ticket_id: null,
        qr_raw: data,
        result: result.status === 'valid' ? 'valid' : result.status === 'already_used' ? 'already_used' : 'invalid',
        ticket_number: result.ticketNumber,
        ticket_type_name: result.ticketType,
        section_name: result.sectionName,
        row_label: result.rowLabel,
        seat_number: result.seatNumber,
        seat_type: result.seatType,
      });

      await refreshStats();
    } finally {
      setTimeout(() => {
        scanLockRef.current = false;
      }, 1500);
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <View style={styles.permissionCard}>
          <View style={styles.cameraIcon}>
            <View style={styles.cameraLens} />
          </View>
          <Text style={styles.permissionTitle}>Camera toegang nodig</Text>
          <Text style={styles.permissionText}>Om QR codes te scannen hebben we toegang tot je camera nodig</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={styles.permissionButtonText}>Camera toestaan</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // History view
  if (showHistory) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowHistory(false)} style={styles.headerButton} activeOpacity={0.7}>
            <Text style={styles.headerButtonIcon}>{'<'}</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.eventTitle}>Laatste 10 scans</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView style={styles.historyList} contentContainerStyle={styles.historyContent}>
          {scanHistory.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryText}>Nog geen scans</Text>
            </View>
          ) : (
            scanHistory.map((item, index) => (
              <View key={index} style={[styles.historyItem, { borderLeftColor: getStatusColor(item.status) }]}>
                <View style={styles.historyItemHeader}>
                  <View style={[styles.historyStatusDot, { backgroundColor: getStatusColor(item.status) }]} />
                  <Text style={styles.historyStatusText}>{getStatusLabel(item.status)}</Text>
                  <Text style={styles.historyTime}>
                    {new Date(item.timestamp).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </Text>
                </View>
                {item.ticketNumber && (
                  <Text style={styles.historyTicketNumber}>#{item.ticketNumber}</Text>
                )}
                {item.holderName && (
                  <Text style={styles.historyDetail}>{item.holderName}</Text>
                )}
                {item.ticketType && (
                  <Text style={styles.historyDetail}>{item.ticketType}</Text>
                )}
                {item.sectionName && (
                  <Text style={styles.historyDetail}>
                    {item.sectionName}
                    {item.rowLabel ? ` - Rij ${item.rowLabel}` : ''}
                    {item.seatNumber ? ` - Stoel ${item.seatNumber}` : ''}
                  </Text>
                )}
                {item.message && !item.ticketNumber && (
                  <Text style={styles.historyDetail}>{item.message}</Text>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  const statusColor = lastResult ? getStatusColor(lastResult.status) : 'transparent';

  const scanPercentage = stats.totalTickets > 0
    ? Math.round((stats.totalScanned / stats.totalTickets) * 100)
    : 0;

  return (
    <View style={styles.container}>
      {/* Full-screen result overlay - stays 3 seconds, tap to dismiss */}
      {showingResult && lastResult && (
        <TouchableOpacity
          style={[styles.fullScreenResult, { backgroundColor: statusColor }]}
          activeOpacity={0.95}
          onPress={dismissResult}
        >
          <Animated.View style={[styles.resultCenter, { transform: [{ scale: resultAnim }], opacity: resultAnim }]}>
            <View style={styles.resultIconCircle}>
              <Text style={styles.resultIcon}>
                {lastResult.status === 'valid' ? '\u2713' : lastResult.status === 'already_used' ? '!' : '\u2717'}
              </Text>
            </View>

            <Text style={styles.resultStatusText}>{getStatusLabel(lastResult.status)}</Text>

            {lastResult.ticketNumber && (
              <Text style={styles.resultTicketNumber}>#{lastResult.ticketNumber}</Text>
            )}

            {lastResult.holderName && (
              <Text style={styles.resultHolderName}>{lastResult.holderName}</Text>
            )}

            {lastResult.ticketType && (
              <View style={styles.resultTypeBadge}>
                <Text style={styles.resultTypeText}>{lastResult.ticketType}</Text>
              </View>
            )}

            {lastResult.sectionName && (
              <Text style={styles.resultSeatInfo}>
                {lastResult.sectionName}
                {lastResult.rowLabel ? ` \u2022 Rij ${lastResult.rowLabel}` : ''}
                {lastResult.seatNumber ? ` \u2022 Stoel ${lastResult.seatNumber}` : ''}
              </Text>
            )}

            {lastResult.message && !lastResult.ticketNumber && (
              <Text style={styles.resultMessage}>{lastResult.message}</Text>
            )}

            <Text style={styles.tapToDismiss}>Tik om door te gaan</Text>
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerButton} activeOpacity={0.7}>
          <Text style={styles.headerButtonIcon}>{'<'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.eventTitle} numberOfLines={1}>{eventName}</Text>
          {entranceName && (
            <Text style={styles.entranceLabel}>{entranceName}</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => setShowHistory(true)} style={styles.headerButton} activeOpacity={0.7}>
          <Text style={styles.headerButtonIcon}>{'\u2630'}</Text>
        </TouchableOpacity>
      </View>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.onlineDot, !online && styles.offlineDot]} />
          <Text style={styles.statusLabel}>{online ? 'Live' : 'Offline'}</Text>
        </View>
        <TouchableOpacity onPress={onOpenStats} style={styles.statusCenter} activeOpacity={0.7}>
          <Text style={styles.counterText}>
            {stats.totalScanned}/{stats.totalTickets}
          </Text>
          <View style={styles.miniProgress}>
            <View style={[styles.miniProgressFill, { width: `${scanPercentage}%` }]} />
          </View>
        </TouchableOpacity>
        <View style={styles.statusRight}>
          {stats.pendingSync > 0 && (
            <View style={styles.syncBadge}>
              <Text style={styles.syncBadgeText}>{stats.pendingSync} sync</Text>
            </View>
          )}
        </View>
      </View>

      {/* Camera */}
      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
        />
        <View style={styles.overlay}>
          <View style={styles.scanArea}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          {!scanning && !showingResult && (
            <ActivityIndicator size="large" color="#22d3ee" style={{ marginTop: 20 }} />
          )}
          {scanning && (
            <Text style={styles.scanHint}>
              {online ? 'Live scanning actief' : 'Offline modus'}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function getStatusColor(status: ScanStatus): string {
  switch (status) {
    case 'valid': return '#16a34a';
    case 'already_used': return '#d97706';
    case 'wrong_event': return '#9333ea';
    case 'invalid': return '#dc2626';
    case 'error': return '#dc2626';
    default: return '#6b7280';
  }
}

function getStatusLabel(status: ScanStatus): string {
  switch (status) {
    case 'valid': return 'GELDIG';
    case 'already_used': return 'REEDS GESCAND';
    case 'wrong_event': return 'VERKEERD EVENT';
    case 'invalid': return 'ONGELDIG';
    case 'error': return 'FOUT';
    default: return 'ONBEKEND';
  }
}

const SCAN_SIZE = SCREEN_WIDTH * 0.65;
const CORNER_SIZE = 24;
const CORNER_WIDTH = 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#0f172a',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonIcon: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  eventTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  entranceLabel: {
    color: '#22d3ee',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#334155',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 70,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  offlineDot: {
    backgroundColor: '#f59e0b',
  },
  statusLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  statusCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  counterText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  miniProgress: {
    width: 80,
    height: 3,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: '#22d3ee',
    borderRadius: 2,
  },
  statusRight: {
    width: 70,
    alignItems: 'flex-end',
  },
  syncBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  syncBadgeText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanArea: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: '#22d3ee',
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: '#22d3ee',
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderLeftWidth: CORNER_WIDTH,
    borderColor: '#22d3ee',
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_WIDTH,
    borderRightWidth: CORNER_WIDTH,
    borderColor: '#22d3ee',
    borderBottomRightRadius: 8,
  },
  scanHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 20,
    textAlign: 'center',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  permissionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    width: '100%',
  },
  cameraIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  cameraLens: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#22d3ee',
  },
  permissionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  permissionText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#22d3ee',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  permissionButtonText: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  // Full screen result overlay
  fullScreenResult: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  resultCenter: {
    alignItems: 'center',
    gap: 16,
  },
  resultIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultIcon: {
    fontSize: 52,
    color: '#fff',
    fontWeight: '700',
  },
  resultStatusText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
    textAlign: 'center',
  },
  resultTicketNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  resultHolderName: {
    fontSize: 18,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  resultTypeBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  resultTypeText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  resultSeatInfo: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  resultMessage: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginTop: 8,
  },
  tapToDismiss: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 32,
  },
  // History
  historyList: {
    flex: 1,
  },
  historyContent: {
    padding: 16,
  },
  emptyHistory: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyHistoryText: {
    color: '#64748b',
    fontSize: 16,
  },
  historyItem: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  historyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  historyStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  historyStatusText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  historyTime: {
    color: '#64748b',
    fontSize: 12,
  },
  historyTicketNumber: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  historyDetail: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },
});
