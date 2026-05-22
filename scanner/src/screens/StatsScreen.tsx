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

type Props = {
  eventId: string;
  eventName: string;
  onBack: () => void;
};

export default function StatsScreen({ eventId, eventName, onBack }: Props) {
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

  const scanPercentage = stats.totalTickets > 0
    ? Math.round((stats.totalScanned / stats.totalTickets) * 100)
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>Terug</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Statistieken</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
      >
        <Text style={styles.eventName}>{eventName}</Text>

        <View style={styles.mainCard}>
          <Text style={styles.bigNumber}>{stats.totalScanned}</Text>
          <Text style={styles.bigLabel}>van {stats.totalTickets} gescand ({scanPercentage}%)</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${scanPercentage}%` }]} />
          </View>
        </View>

        <View style={styles.grid}>
          <StatBox label="Geldig" value={stats.validScans} color="#16a34a" />
          <StatBox label="Reeds gebruikt" value={stats.alreadyUsed} color="#f59e0b" />
          <StatBox label="Ongeldig" value={stats.invalidScans} color="#dc2626" />
          <StatBox label="Te syncen" value={stats.pendingSync} color="#2563eb" />
        </View>

        {byType.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Per tickettype</Text>
            {byType.map((t) => (
              <View key={t.name} style={styles.breakdownRow}>
                <Text style={styles.breakdownName}>{t.name}</Text>
                <Text style={styles.breakdownValue}>{t.scanned} / {t.total}</Text>
              </View>
            ))}
          </View>
        )}

        {bySection.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Per sectie/tribune</Text>
            {bySection.map((s) => (
              <View key={s.name} style={styles.breakdownRow}>
                <Text style={styles.breakdownName}>{s.name}</Text>
                <Text style={styles.breakdownValue}>{s.scanned} / {s.total}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
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
  headerTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: 20,
    gap: 20,
  },
  eventName: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  mainCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  bigNumber: {
    color: '#f8fafc',
    fontSize: 48,
    fontWeight: '700',
  },
  bigLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#334155',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  breakdownName: {
    color: '#cbd5e1',
    fontSize: 14,
    flex: 1,
  },
  breakdownValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
});
