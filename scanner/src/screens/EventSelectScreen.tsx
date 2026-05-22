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

type Event = {
  id: string;
  name: string;
  date: string;
  venue_name: string | null;
};

type Props = {
  onSelectEvent: (event: Event) => void;
  onLogout: () => void;
};

export default function EventSelectScreen({ onSelectEvent, onLogout }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadEvents = async () => {
    try {
      const { data, error: fetchError } = await supabase.functions.invoke('list-accessible-events');

      if (fetchError) {
        setError(fetchError.message || 'Kan events niet laden');
        return;
      }

      setEvents(data?.events ?? data ?? []);
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Events laden...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kies een event</Text>
        <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Uitloggen</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Geen events gevonden waartoe je toegang hebt.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => onSelectEvent(item)}>
            <Text style={styles.eventName}>{item.name}</Text>
            <View style={styles.eventMeta}>
              <Text style={styles.eventDate}>{item.date}</Text>
              {item.venue_name && <Text style={styles.eventVenue}>{item.venue_name}</Text>}
            </View>
          </TouchableOpacity>
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
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  logoutText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  error: {
    color: '#ef4444',
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  list: {
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  eventName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 8,
  },
  eventMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  eventDate: {
    fontSize: 14,
    color: '#94a3b8',
  },
  eventVenue: {
    fontSize: 14,
    color: '#64748b',
  },
  empty: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
});
