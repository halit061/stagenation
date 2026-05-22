import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { downloadEventTickets, DownloadProgress } from '../lib/ticketDownloader';

type Props = {
  eventId: string;
  eventName: string;
  onReady: () => void;
  onError: () => void;
};

export default function DownloadScreen({ eventId, eventName, onReady, onError }: Props) {
  const [progress, setProgress] = useState<DownloadProgress>({
    status: 'loading',
    downloaded: 0,
    total: 0,
    message: 'Tickets laden...',
  });

  useEffect(() => {
    downloadEventTickets(eventId, setProgress).then(() => {
      // onReady is called from the effect watching progress.status
    });
  }, [eventId]);

  useEffect(() => {
    if (progress.status === 'done') {
      const timer = setTimeout(onReady, 800);
      return () => clearTimeout(timer);
    }
    if (progress.status === 'error') {
      const timer = setTimeout(onError, 3000);
      return () => clearTimeout(timer);
    }
  }, [progress.status]);

  const percentage = progress.total > 0
    ? Math.round((progress.downloaded / progress.total) * 100)
    : 0;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.eventName}>{eventName}</Text>

        {progress.status === 'loading' && (
          <>
            <ActivityIndicator size="large" color="#2563eb" style={styles.spinner} />
            <View style={styles.progressBarOuter}>
              <View style={[styles.progressBarInner, { width: `${percentage}%` }]} />
            </View>
            <Text style={styles.progressText}>{progress.message}</Text>
            <Text style={styles.countText}>{progress.downloaded} / {progress.total}</Text>
          </>
        )}

        {progress.status === 'done' && (
          <>
            <View style={styles.checkCircle}>
              <Text style={styles.checkMark}>OK</Text>
            </View>
            <Text style={styles.doneText}>{progress.message}</Text>
            <Text style={styles.countText}>{progress.total} tickets geladen</Text>
          </>
        )}

        {progress.status === 'error' && (
          <>
            <View style={styles.errorCircle}>
              <Text style={styles.errorMark}>!</Text>
            </View>
            <Text style={styles.errorText}>{progress.message}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  eventName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f8fafc',
    marginBottom: 32,
    textAlign: 'center',
  },
  spinner: {
    marginBottom: 24,
  },
  progressBarOuter: {
    width: '100%',
    height: 8,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 4,
  },
  progressText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  countText: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 8,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkMark: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  doneText: {
    color: '#22c55e',
    fontSize: 18,
    fontWeight: '600',
  },
  errorCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorMark: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
  },
});
