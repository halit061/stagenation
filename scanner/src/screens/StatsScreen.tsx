import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { getEventStats, getStatsByType, getStatsBySection } from '../lib/database';
import { syncPendingScans, isOnline } from '../lib/sync';

type Props = {
  eventId: string;
  eventName: string;
  entranceName?: string;
  onBack: () => void;
};

export default function StatsScreen({ eventId, eventName, entranceName, onBack }: Props) {
  const [stats, setStats] = useState({
    totalTickets: 0,
    totalScanned: 0,
    validScans: 0,
    alreadyUsed: 0,
    invalidScans: 0,
    pendingSync: 0,
  });
  const [byType, setByType] = useState<Array<{ name: string; total: number; scanned: number }>>([]);
  const [bySection, setBySection] = useState<Array<{ name: string; total: number; scanned: number }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadStats = async () => {
    const s = await getEventStats(eventId);
    setStats(s);
    const types = await getStatsByType(eventId);
    setByType(types);
    const sections = await getStatsBySection(eventId);
    setBySection(sections);
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [eventId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const handleForceSync = async () => {
    setSyncing(true);
    try {
      if (await isOnline()) {
        await syncPendingScans();
        await loadStats();
      }
    } finally {
      setSyncing(false);
    }
  };

  const scanPercentage = stats.totalTickets > 0
    ? Math.round((stats.totalScanned / stats.totalTickets) * 100)
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
          <Text style={styles.backIcon}>{'<'}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Statistieken</Text>
          {entranceName && <Text style={styles.headerEntrance}>{entranceName}</Text>}
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22d3ee" />}
      >
        <Text style={styles.eventName}>{eventName}</Text>

        <View style={styles.mainCard}>
          <View style={styles.circularProgress}>
            <View style={styles.circleOuter}>
              <View style={styles.circleInner}>
                <Text style={styles.bigNumber}>{scanPercentage}%</Text>
              </View>
            </View>
          </View>
          <Text style={styles.bigLabel}>
            {stats.totalScanned} van {stats.totalTickets} gescand
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${scanPercentage}%` }]} />
          </View>
        </View>

        <View style={styles.grid}>
          <StatBox label="Geldig" value={stats.validScans} color="#22c55e" />
          <StatBox label="Reeds gescand" value={stats.alreadyUsed} color="#f59e0b" />
          <StatBox label="Ongeldig" value={stats.invalidScans} color="#ef4444" />
          <StatBox
            label="Te syncen"
            value={stats.pendingSync}
            color="#22d3ee"
            onPress={stats.pendingSync > 0 ? handleForceSync : undefined}
            loading={syncing}
          />
        </View>

        {byType.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Per tickettype</Text>
              <Text style={styles.sectionCount}>{byType.length}</Text>
            </View>
            {byType.map((t) => {
              const pct = t.total > 0 ? Math.round((t.scanned / t.total) * 100) : 0;
              return (
                <View key={t.name} style={styles.breakdownRow}>
                  <View style={styles.breakdownInfo}>
                    <Text style={styles.breakdownName}>{t.name}</Text>
                    <View style={styles.breakdownBar}>
                      <View style={[styles.breakdownBarFill, { width: `${pct}%` }]} />
                    </View>
                  </View>
                  <View style={styles.breakdownStats}>
                    <Text style={styles.breakdownValue}>{t.scanned}/{t.total}</Text>
                    <Text style={styles.breakdownPct}>{pct}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {bySection.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Per sectie</Text>
              <Text style={styles.sectionCount}>{bySection.length}</Text>
            </View>
            {bySection.map((s) => {
              const pct = s.total > 0 ? Math.round((s.scanned / s.total) * 100) : 0;
              return (
                <View key={s.name} style={styles.breakdownRow}>
                  <View style={styles.breakdownInfo}>
                    <Text style={styles.breakdownName}>{s.name}</Text>
                    <View style={styles.breakdownBar}>
                      <View style={[styles.breakdownBarFill, styles.breakdownBarSection, { width: `${pct}%` }]} />
                    </View>
                  </View>
                  <View style={styles.breakdownStats}>
                    <Text style={styles.breakdownValue}>{s.scanned}/{s.total}</Text>
                    <Text style={styles.breakdownPct}>{pct}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatBox({
  label,
  value,
  color,
  onPress,
  loading,
}: {
  label: string;
  value: number;
  color: string;
  onPress?: () => void;
  loading?: boolean;
}) {
  const content = (
    <View style={styles.statBox}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={[styles.statValue, { color }]}>{loading ? '...' : value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {onPress && <Text style={styles.statAction}>Sync</Text>}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ flex: 1, minWidth: '45%' }}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={{ flex: 1, minWidth: '45%' }}>{content}</View>;
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
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  headerEntrance: {
    color: '#22d3ee',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  eventName: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  mainCard: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  circularProgress: {
    marginBottom: 16,
  },
  circleOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderWidth: 3,
    borderColor: '#22d3ee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bigNumber: {
    color: '#22d3ee',
    fontSize: 24,
    fontWeight: '700',
  },
  bigLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22d3ee',
    borderRadius: 3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statAction: {
    color: '#22d3ee',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
  section: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionCount: {
    color: '#64748b',
    fontSize: 12,
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  breakdownInfo: {
    flex: 1,
    gap: 6,
  },
  breakdownName: {
    color: '#cbd5e1',
    fontSize: 14,
  },
  breakdownBar: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    backgroundColor: '#22d3ee',
    borderRadius: 2,
  },
  breakdownBarSection: {
    backgroundColor: '#22c55e',
  },
  breakdownStats: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  breakdownValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  breakdownPct: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
});
