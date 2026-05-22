import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { downloadEventTickets, DownloadProgress } from '../lib/ticketDownloader';

type Props = {
  eventId: string;
  eventName: string;
  entranceName?: string;
  onReady: () => void;
  onError: () => void;
};

export default function DownloadScreen({ eventId, eventName, entranceName, onReady, onError }: Props) {
  const [progress, setProgress] = useState<DownloadProgress>({
    status: 'loading',
    downloaded: 0,
    total: 0,
    message: 'Tickets laden...',
  });
  const [pulseAnim] = useState(new Animated.Value(1));
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    downloadEventTickets(eventId, setProgress);
  }, [eventId]);

  useEffect(() => {
    if (progress.status === 'loading') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [progress.status]);

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
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Text style={styles.eventName}>{eventName}</Text>
        {entranceName && (
          <View style={styles.entranceTag}>
            <Text style={styles.entranceTagText}>{entranceName}</Text>
          </View>
        )}

        {progress.status === 'loading' && (
          <View style={styles.loadingContent}>
            <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
              <View style={styles.innerCircle}>
                <Text style={styles.percentageText}>{percentage}%</Text>
              </View>
            </Animated.View>

            <View style={styles.progressBarOuter}>
              <View style={[styles.progressBarInner, { width: `${percentage}%` }]} />
            </View>

            <Text style={styles.progressText}>{progress.message}</Text>
            <Text style={styles.countText}>
              {progress.downloaded} / {progress.total} tickets
            </Text>
          </View>
        )}

        {progress.status === 'done' && (
          <View style={styles.doneContent}>
            <View style={styles.checkCircle}>
              <View style={styles.checkLine1} />
              <View style={styles.checkLine2} />
            </View>
            <Text style={styles.doneText}>Klaar!</Text>
            <Text style={styles.doneSubtext}>{progress.total} tickets geladen</Text>
          </View>
        )}

        {progress.status === 'error' && (
          <View style={styles.errorContent}>
            <View style={styles.errorCircle}>
              <Text style={styles.errorMark}>!</Text>
            </View>
            <Text style={styles.errorTitle}>Download mislukt</Text>
            <Text style={styles.errorText}>{progress.message}</Text>
          </View>
        )}
      </Animated.View>
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
    fontSize: 22,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 8,
    textAlign: 'center',
  },
  entranceTag: {
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)',
    marginBottom: 32,
  },
  entranceTagText: {
    color: '#22d3ee',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingContent: {
    alignItems: 'center',
    width: '100%',
    marginTop: 24,
  },
  pulseCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(34, 211, 238, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  innerCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  percentageText: {
    color: '#22d3ee',
    fontSize: 22,
    fontWeight: '700',
  },
  progressBarOuter: {
    width: '100%',
    height: 6,
    backgroundColor: '#1e293b',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: '#22d3ee',
    borderRadius: 3,
  },
  progressText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  countText: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 6,
  },
  doneContent: {
    alignItems: 'center',
    marginTop: 32,
  },
  checkCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 2,
    borderColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkLine1: {
    position: 'absolute',
    width: 16,
    height: 3,
    backgroundColor: '#22c55e',
    borderRadius: 2,
    transform: [{ rotate: '45deg' }, { translateX: -4 }, { translateY: 4 }],
  },
  checkLine2: {
    position: 'absolute',
    width: 28,
    height: 3,
    backgroundColor: '#22c55e',
    borderRadius: 2,
    transform: [{ rotate: '-45deg' }, { translateX: 4 }, { translateY: 0 }],
  },
  doneText: {
    color: '#22c55e',
    fontSize: 20,
    fontWeight: '700',
  },
  doneSubtext: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 6,
  },
  errorContent: {
    alignItems: 'center',
    marginTop: 32,
  },
  errorCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 2,
    borderColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorMark: {
    color: '#ef4444',
    fontSize: 32,
    fontWeight: '700',
  },
  errorTitle: {
    color: '#f87171',
    fontSize: 18,
    fontWeight: '600',
  },
  errorText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
});
