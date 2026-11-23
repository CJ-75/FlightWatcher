/**
 * Expo config — cleartext HTTP only for local/dev profiles.
 * Preview + production EAS builds force HTTPS (store-safe).
 */
const appJson = require('./app.json')

const profile = process.env.EAS_BUILD_PROFILE || ''
const allowCleartext =
  process.env.EXPO_ALLOW_CLEARTEXT === '1' ||
  profile === 'development' ||
  profile === ''

const expo = {
  ...appJson.expo,
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#0B1F33',
  },
  ios: {
    ...appJson.expo.ios,
    buildNumber: appJson.expo.ios?.buildNumber || '1',
  },
  android: {
    ...appJson.expo.android,
    versionCode: appJson.expo.android?.versionCode || 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#0B1F33',
    },
  },
  plugins: (appJson.expo.plugins || []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === 'expo-build-properties') {
      return [
        'expo-build-properties',
        {
          ...plugin[1],
          android: {
            ...(plugin[1]?.android || {}),
            usesCleartextTraffic: allowCleartext,
          },
        },
      ]
    }
    return plugin
  }),
  extra: {
    ...(appJson.expo.extra || {}),
    eas: {
      projectId: process.env.EAS_PROJECT_ID || undefined,
    },
  },
}

module.exports = { expo }
