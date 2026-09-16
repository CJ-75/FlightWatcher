/**
 * Expo SDK 52 breaks on Node 23+/24 native TS stripping of node_modules.
 * Require Node 20 or 22 LTS.
 */
const major = Number(process.versions.node.split('.')[0])
if (major >= 23) {
  console.error(
    `\n[flightwatcher-mobile] Node ${process.version} is not supported with Expo SDK 52.\n` +
      `Use Node 20 LTS, then re-run:\n\n` +
      `  fnm install 20\n` +
      `  fnm exec --using=20 npm run start -w flightwatcher-mobile\n\n` +
      `Or setup fnm in your shell (once):\n` +
      `  fnm env --use-on-cd | Out-String | Invoke-Expression\n` +
      `  fnm use 20\n`
  )
  process.exit(1)
}
