import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { translate } from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import * as WebBrowser from 'expo-web-browser'

WebBrowser.maybeCompleteAuthSession()

export function LoginScreen({ onContinueAsGuest }: { onContinueAsGuest?: () => void }) {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onLogin = async () => {
    setLoading(true)
    setError(null)
    const { error: err } = await signInWithGoogle()
    if (err) setError(err.message)
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>FlightWatcher</Text>
      <Text style={styles.subtitle}>{translate('fr', 'app.subtitle')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.button} onPress={onLogin} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#0B1F33" />
        ) : (
          <Text style={styles.buttonText}>{translate('fr', 'auth.signInWithGoogle')}</Text>
        )}
      </Pressable>
      {onContinueAsGuest ? (
        <Pressable style={styles.ghost} onPress={onContinueAsGuest}>
          <Text style={styles.ghostText}>Continuer sans compte</Text>
        </Pressable>
      ) : null}
      <Text style={styles.hint}>Deep link: flightwatcher://auth/callback</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1F33',
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    fontSize: 36,
    fontWeight: '700',
    color: '#F4F7FA',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8FA3B5',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#3DBDA7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#0B1F33',
    fontWeight: '700',
    fontSize: 16,
  },
  error: {
    color: '#FF6B6B',
    marginBottom: 12,
  },
  hint: {
    marginTop: 24,
    color: '#5A7388',
    fontSize: 12,
  },
  ghost: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 10,
  },
  ghostText: {
    color: '#8FA3B5',
    fontWeight: '600',
  },
})
