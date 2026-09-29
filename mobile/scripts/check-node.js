/**
 * Expo SDK 57 requires a modern Node (22+ recommended).
 * Node <20 is rejected; Node 23/24 type-stripping issues are mostly fixed on recent Expo.
 */
const major = Number(process.versions.node.split('.')[0])
if (major < 20) {
  console.error(
    `\n[flightwatcher-mobile] Node ${process.version} is too old for Expo SDK 57.\n` +
      `Use Node 22 LTS:\n\n` +
      `  fnm env --shell powershell | Out-String | Invoke-Expression\n` +
      `  fnm install 22\n` +
      `  fnm use 22\n`
  )
  process.exit(1)
}
