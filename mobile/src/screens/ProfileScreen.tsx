import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { apiBase } from '../lib/client'

export function ProfileScreen() {
  const { user, signOut } = useAuth()

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profil</Text>
      <Text style={styles.email}>{user?.email || '—'}</Text>
      <Text style={styles.meta}>API: {apiBase}</Text>
      <Pressable style={styles.button} onPress={() => void signOut()}>
        <Text style={styles.buttonText}>Se déconnecter</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F8', padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#0B1F33' },
  email: { marginTop: 8, color: '#5A7388', fontSize: 16 },
  meta: { marginTop: 8, color: '#8FA3B5', fontSize: 12 },
  button: {
    marginTop: 32,
    backgroundColor: '#0B1F33',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#F4F7FA', fontWeight: '700' },
})
