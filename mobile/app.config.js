/** @type {import('expo/config').ConfigContext} */
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN: process.env.EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN,
    EXPO_PUBLIC_WEB_ORIGIN: process.env.EXPO_PUBLIC_WEB_ORIGIN,
  },
})
