/** @type {import('expo/config').ExpoConfig} */
const appJson = require('./app.json')

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
      EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN: process.env.EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN,
    },
  },
}
