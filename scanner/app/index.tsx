import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../src/hooks/useAuth';
import LoginScreen from '../src/screens/LoginScreen';
import EventSelectScreen from '../src/screens/EventSelectScreen';
import DownloadScreen from '../src/screens/DownloadScreen';
import ScannerScreen from '../src/screens/ScannerScreen';
import StatsScreen from '../src/screens/StatsScreen';

type AppState =
  | { screen: 'login' }
  | { screen: 'events' }
  | { screen: 'download'; eventId: string; eventName: string }
  | { screen: 'scanner'; eventId: string; eventName: string }
  | { screen: 'stats'; eventId: string; eventName: string };

export default function App() {
  const { session, loading, signIn, signOut } = useAuth();
  const [state, setState] = useState<AppState>({ screen: 'events' });

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563eb" />
        <StatusBar style="light" />
      </View>
    );
  }

  if (!session) {
    return (
      <>
        <StatusBar style="light" />
        <LoginScreen onLogin={signIn} />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {state.screen === 'events' && (
        <EventSelectScreen
          onSelectEvent={(event) =>
            setState({ screen: 'download', eventId: event.id, eventName: event.name })
          }
          onLogout={async () => {
            await signOut();
            setState({ screen: 'events' });
          }}
        />
      )}
      {state.screen === 'download' && (
        <DownloadScreen
          eventId={state.eventId}
          eventName={state.eventName}
          onReady={() => setState({ screen: 'scanner', eventId: state.eventId, eventName: state.eventName })}
          onError={() => setState({ screen: 'events' })}
        />
      )}
      {state.screen === 'scanner' && (
        <ScannerScreen
          eventId={state.eventId}
          eventName={state.eventName}
          onOpenStats={() => setState({ screen: 'stats', eventId: state.eventId, eventName: state.eventName })}
          onBack={() => setState({ screen: 'events' })}
        />
      )}
      {state.screen === 'stats' && (
        <StatsScreen
          eventId={state.eventId}
          eventName={state.eventName}
          onBack={() => setState({ screen: 'scanner', eventId: state.eventId, eventName: state.eventName })}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
