import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import {
  findTicketByQR,
  markScanned,
  recordScan,
  getEventStats,
} from '../lib/database';
import { syncPendingScans, isOnline } from '../lib/sync';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ScanResult = {
  status: 'valid' | 'already_used' | 'invalid' | 'wrong_event';
  ticketNumber: string | null;
  ticketType: string | null;
  sectionName: string | null;
  rowLabel: string | null;
  seatNumber: number | null;
  seatType: string | null;
  holderName: string | null;
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
  const [scanning, setScanning] = useState(true);
  const [stats, setStats] = useState({ totalScanned: 0, totalTickets: 0, pendingSync: 0 });
  const [online, setOnline] = useState(true);
  const scanLockRef = useRef(false);
  const flashAnim = useRef(new Animated.Value(0)).current;
  const resultAnim = useRef(new Animated.Value(0)).current;

  const refreshStats = useCallback(async () => {
    const s = await getEventStats(eventId);
    setStats({ totalScanned: s.totalScanned, totalTickets: s.totalTickets, pendingSync: s.pendingSync });
    setOnline(await isOnline());
  }, [eventId]);

  React.useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  React.useEffect(() => {
    const syncInterval = setInterval(async () => {
      if (await isOnline()) {
        await syncPendingScans();
        await refreshStats();
      }
    }, 15_000);
    return () => clearInterval(syncInterval);
  }, [refreshStats]);

  const flashScreen = (color: string) => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const showResult = () => {
    resultAnim.setValue(0);
    Animated.spring(resultAnim, {
      toValue: 1,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanLockRef.current || !scanning) return;
    scanLockRef.current = true;

    try {
      const ticket = await findTicketByQR(eventId, data);

      if (!ticket) {
        const result: ScanResult = {
          status: 'invalid',
          ticketNumber: null,
          ticketType: null,
          sectionName: null,
          rowLabel: null,
          seatNumber: null,
          seatType: null,
          holderName: null,
        };
        setLastResult(result);
        showResult();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        flashScreen('#dc2626');

        await recordScan({
          id: crypto.randomUUID(),
          event_id: eventId,
          ticket_id: null,
          qr_raw: data,
          result: 'invalid',
          ticket_number: null,
          ticket_type_name: null,
          section_name: null,
          row_label: null,
          seat_number: null,
          seat_type: null,
        });
      } else if (ticket.is_scanned) {
        const result: ScanResult = {
          status: 'already_used',
          ticketNumber: ticket.ticket_number,
          ticketType: ticket.ticket_type_name,
          sectionName: ticket.section_name,
          rowLabel: ticket.row_label,
          seatNumber: ticket.seat_number,
          seatType: ticket.seat_type,
          holderName: ticket.holder_name,
        };
        setLastResult(result);
        showResult();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        flashScreen('#f59e0b');

        await recordScan({
          id: crypto.randomUUID(),
          event_id: eventId,
          ticket_id: ticket.id,
          qr_raw: data,
          result: 'already_used',
          ticket_number: ticket.ticket_number,
          ticket_type_name: ticket.ticket_type_name,
          section_name: ticket.section_name,
          row_label: ticket.row_label,
          seat_number: ticket.seat_number,
          seat_type: ticket.seat_type,
        });
      } else {
        await markScanned(ticket.id, eventId);

        const result: ScanResult = {
          status: 'valid',
          ticketNumber: ticket.ticket_number,
          ticketType: ticket.ticket_type_name,
          sectionName: ticket.section_name,
          rowLabel: ticket.row_label,
          seatNumber: ticket.seat_number,
          seatType: ticket.seat_type,
          holderName: ticket.holder_name,
        };
        setLastResult(result);
        showResult();
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        flashScreen('#16a34a');

        await recordScan({
          id: crypto.randomUUID(),
          event_id: eventId,
          ticket_id: ticket.id,
          qr_raw: data,
          result: 'valid',
          ticket_number: ticket.ticket_number,
          ticket_type_name: ticket.ticket_type_name,
          section_name: ticket.section_name,
          row_label: ticket.row_label,
          seat_number: ticket.seat_number,
          seat_type: ticket.seat_type,
        });
      }

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

  const statusColor = lastResult
    ? lastResult.status === 'valid'
      ? '#22c55e'
      : lastResult.status === 'already_used'
        ? '#f59e0b'
        : '#ef4444'
    : 'transparent';

  const scanPercentage = stats.totalTickets > 0
    ? Math.round((stats.totalScanned / stats.totalTickets) * 100)
    : 0;

  return (
    <View style={styles.container}>
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
        <TouchableOpacity onPress={onOpenStats} style={styles.headerButton} activeOpacity={0.7}>
          <Text style={styles.headerButtonIcon}>{'#'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[styles.onlineDot, !online && styles.offlineDot]} />
          <Text style={styles.statusLabel}>{online ? 'Online' : 'Offline'}</Text>
        </View>
        <View style={styles.statusCenter}>
          <Text style={styles.counterText}>
            {stats.totalScanned}/{stats.totalTickets}
          </Text>
          <View style={styles.miniProgress}>
            <View style={[styles.miniProgressFill, { width: `${scanPercentage}%` }]} />
          </View>
        </View>
        <View style={styles.statusRight}>
          {stats.pendingSync > 0 && (
            <View style={styles.syncBadge}>
              <Text style={styles.syncBadgeText}>{stats.pendingSync}</Text>
            </View>
          )}
        </View>
      </View>

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
          <Text style={styles.scanHint}>Richt de camera op een QR code</Text>
        </View>

        <Animated.View
          style={[
            styles.flash,
            {
              backgroundColor: statusColor,
              opacity: flashAnim,
            },
          ]}
          pointerEvents="none"
        />
      </View>

      {lastResult && (
        <Animated.View
          style={[
            styles.resultPanel,
            {
              transform: [{ scale: resultAnim }],
              opacity: resultAnim,
            },
          ]}
        >
          <View style={[styles.resultStrip, { backgroundColor: statusColor }]} />
          <View style={styles.resultContent}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>
                {lastResult.status === 'valid' && 'GELDIG'}
                {lastResult.status === 'already_used' && 'REEDS GESCAND'}
                {lastResult.status === 'invalid' && 'ONGELDIG'}
                {lastResult.status === 'wrong_event' && 'VERKEERD EVENT'}
              </Text>
            </View>

            <View style={styles.resultDetails}>
              {lastResult.ticketNumber && (
                <Text style={styles.ticketNumber}>#{lastResult.ticketNumber}</Text>
              )}

              {lastResult.ticketType && (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeText}>{lastResult.ticketType}</Text>
                </View>
              )}

              {lastResult.sectionName && (
                <Text style={styles.detailText}>
                  {lastResult.sectionName}
                  {lastResult.rowLabel ? ` \u2022 Rij ${lastResult.rowLabel}` : ''}
                  {lastResult.seatNumber ? ` \u2022 Stoel ${lastResult.seatNumber}` : ''}
                </Text>
              )}

              {lastResult.seatType && lastResult.seatType !== 'standard' && (
                <View style={styles.seatTypeBadge}>
                  <Text style={styles.seatTypeText}>
                    {lastResult.seatType === 'wheelchair' ? 'ROLSTOEL' :
                     lastResult.seatType === 'vip' ? 'VIP' :
                     lastResult.seatType.toUpperCase()}
                  </Text>
                </View>
              )}

              {lastResult.holderName && (
                <Text style={styles.holderText}>{lastResult.holderName}</Text>
              )}
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
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
  flash: {
    ...StyleSheet.absoluteFillObject,
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
  resultPanel: {
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  resultStrip: {
    width: 4,
  },
  resultContent: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  resultDetails: {
    alignItems: 'center',
    gap: 6,
  },
  ticketNumber: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  typeBadge: {
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)',
  },
  typeText: {
    color: '#22d3ee',
    fontSize: 13,
    fontWeight: '500',
  },
  detailText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  seatTypeBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  seatTypeText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
  },
  holderText: {
    color: '#64748b',
    fontSize: 13,
  },
});
