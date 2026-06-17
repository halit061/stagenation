import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { supabase } from '../lib/supabase';

type Entrance = {
  id: string;
  name: string;
};

type Event = {
  id: string;
  name: string;
  date?: string;
  event_start?: string;
  venue_name: string | null;
  entrances?: Entrance[];
};

type Props = {
  onSelectEvent: (event: Event, entrance?: Entrance) => void;
  onLogout: () => void;
};

export default function EventSelectScreen({ onSelectEvent, onLogout }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const loadEvents = async () => {
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('list-accessible-events');

      if (fetchError) {
        setError(fetchError.message || 'Kan events niet laden');
        return;
      }

      const eventsList = data?.events ?? data ?? [];

      for (const event of eventsList) {
        const { data: entrances } = await supabase
          .from('entrances')
          .select('id, name')
          .eq('event_id', event.id);
        event.entrances = entrances ?? [];
      }

      setEvents(eventsList);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Netwerkfout');
    }
  };

  useEffect(() => {
    loadEvents().finally(() => setLoading(false));
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const handleEventPress = (event: Event) => {
    if (event.entrances && event.entrances.length > 0) {
      setExpandedEvent(expandedEvent === event.id ? null : event.id);
    } else {
      onSelectEvent(event);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Datum onbekend';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Datum onbekend';
      return date.toLocaleDateString('nl-NL', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return 'Datum onbekend';
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingCard}>
          <ActivityIndicator size="large" color="#22d3ee" />
          <Text style={styles.loadingText}>Events laden...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Events</Text>
          <Text style={styles.headerSubtitle}>Selecteer een event om te scannen</Text>
        </View>
        <TouchableOpacity onPress={onLogout} style={styles.logoutButton} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Uitloggen</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22d3ee" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <View style={styles.emptyDot} />
            </View>
            <Text style={styles.emptyTitle}>Geen events</Text>
            <Text style={styles.emptyText}>Je hebt nog geen toegang tot events.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View>
            <TouchableOpacity
              style={[styles.card, expandedEvent === item.id && styles.cardExpanded]}
              onPress={() => handleEventPress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <Text style={styles.eventName}>{item.name}</Text>
                  {item.entrances && item.entrances.length > 0 && (
                    <View style={styles.entranceBadge}>
                      <Text style={styles.entranceBadgeText}>
                        {item.entrances.length} ingang{item.entrances.length > 1 ? 'en' : ''}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.eventMeta}>
                  <View style={styles.metaItem}>
                    <View style={styles.metaDot} />
                    <Text style={styles.eventDate}>{formatDate(item.event_start || item.date || '')}</Text>
                  </View>
                  {item.venue_name && (
                    <View style={styles.metaItem}>
                      <View style={[styles.metaDot, { backgroundColor: '#64748b' }]} />
                      <Text style={styles.eventVenue}>{item.venue_name}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.cardArrow}>
                <Text style={styles.arrowText}>
                  {expandedEvent === item.id ? '−' : '→'}
                </Text>
              </View>
            </TouchableOpacity>

            {expandedEvent === item.id && item.entrances && item.entrances.length > 0 && (
              <View style={styles.entranceList}>
                <TouchableOpacity
                  style={styles.entranceItem}
                  onPress={() => onSelectEvent(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.entranceIcon}>
                    <Text style={styles.entranceIconText}>A</Text>
                  </View>
                  <View style={styles.entranceInfo}>
                    <Text style={styles.entranceName}>Alle ingangen</Text>
                    <Text style={styles.entranceDesc}>Scan alle tickettypes</Text>
                  </View>
                </TouchableOpacity>
                {item.entrances.map((entrance) => (
                  <TouchableOpacity
                    key={entrance.id}
                    style={styles.entranceItem}
                    onPress={() => onSelectEvent(item, entrance)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.entranceIcon, styles.entranceIconActive]}>
                      <Text style={styles.entranceIconTextActive}>
                        {entrance.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.entranceInfo}>
                      <Text style={styles.entranceName}>{entrance.name}</Text>
                      <Text style={styles.entranceDesc}>Ingang scanner</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  center: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f8fafc',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  logoutButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  logoutText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  eventName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#f8fafc',
    flex: 1,
  },
  entranceBadge: {
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)',
  },
  entranceBadgeText: {
    color: '#22d3ee',
    fontSize: 11,
    fontWeight: '600',
  },
  eventMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22d3ee',
  },
  eventDate: {
    fontSize: 13,
    color: '#94a3b8',
  },
  eventVenue: {
    fontSize: 13,
    color: '#64748b',
  },
  cardArrow: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    color: '#94a3b8',
    fontSize: 18,
    fontWeight: '600',
  },
  entranceList: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#334155',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  entranceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    marginTop: 8,
  },
  entranceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  entranceIconActive: {
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
  },
  entranceIconText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '700',
  },
  entranceIconTextActive: {
    color: '#22d3ee',
    fontSize: 14,
    fontWeight: '700',
  },
  entranceInfo: {
    flex: 1,
  },
  entranceName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '500',
  },
  entranceDesc: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#334155',
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
});
