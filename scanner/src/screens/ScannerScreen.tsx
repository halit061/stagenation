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
  checkAlreadyScanned,
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
  onOpenStats: () => void;
  onBack: () => void;
};

export default function ScannerScreen({ eventId, eventName, onOpenStats, onBack }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(true);
  const [stats, setStats] = useState({ totalScanned: 0, totalTickets: 0, pendingSync: 0 });
  const scanLockRef = useRef(false);
  const flashAnim = useRef(new Animated.Value(0)).current;

  const refreshStats = useCallback(async () => {
    const s = await getEventStats(eventId);
    setStats({ totalScanned: s.totalScanned, totalTickets: s.totalTickets, pendingSync: s.pendingSync });
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
      duration: 600,
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
        <Text style={styles.permissionText}>Camera toegang nodig om QR codes te scannen</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Camera toestaan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = lastResult
    ? lastResult.status === 'valid'
      ? '#16a34a'
      : lastResult.status === 'already_used'
        ? '#f59e0b'
        : '#dc2626'
    : 'transparent';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Terug</Text>
        </TouchableOpacity>
        <Text style={styles.eventTitle} numberOfLines={1}>{eventName}</Text>
        <TouchableOpacity onPress={onOpenStats} style={styles.statsButton}>
          <Text style={styles.statsText}>Stats</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.counterBar}>
        <Text style={styles.counterText}>
          {stats.totalScanned} / {stats.totalTickets} gescand
        </Text>
        {stats.pendingSync > 0 && (
          <Text style={styles.syncText}>{stats.pendingSync} te syncen</Text>
        )}
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={scanning ? handleBarCodeScanned : undefined}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
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
        <View style={[styles.resultPanel, { borderTopColor: statusColor }]}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.statusText}>
              {lastResult.status === 'valid' && 'GELDIG'}
              {lastResult.status === 'already_used' && 'REEDS GEBRUIKT'}
              {lastResult.status === 'invalid' && 'ONGELDIG'}
              {lastResult.status === 'wrong_event' && 'VERKEERD EVENT'}
            </Text>
          </View>

          {lastResult.ticketNumber && (
            <Text style={styles.ticketNumber}>#{lastResult.ticketNumber}</Text>
          )}

          {lastResult.ticketType && (
            <Text style={styles.detailText}>{lastResult.ticketType}</Text>
          )}

          {lastResult.sectionName && (
            <Text style={styles.detailText}>
              {lastResult.sectionName}
              {lastResult.rowLabel ? ` - Rij ${lastResult.rowLabel}` : ''}
              {lastResult.seatNumber ? ` - Stoel ${lastResult.seatNumber}` : ''}
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
      )}
    </View>
  );
}

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
    paddingBottom: 12,
    backgroundColor: '#0f172a',
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  backText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  eventTitle: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  statsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  statsText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  counterBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
  },
  counterText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  syncText: {
    color: '#f59e0b',
    fontSize: 13,
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
  scanFrame: {
    width: SCREEN_WIDTH * 0.65,
    height: SCREEN_WIDTH * 0.65,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
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
  permissionText: {
    color: '#f8fafc',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resultPanel: {
    backgroundColor: '#1e293b',
    padding: 20,
    borderTopWidth: 4,
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
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ticketNumber: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  detailText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  seatTypeBadge: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  seatTypeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  holderText: {
    color: '#64748b',
    fontSize: 13,
  },
});
