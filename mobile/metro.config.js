const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

function resolveDep(name) {
  const candidates = [
    path.join(projectRoot, 'node_modules', name),
    path.join(workspaceRoot, 'node_modules', name),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate
    }
  }
  return path.dirname(
    require.resolve(`${name}/package.json`, { paths: [projectRoot, workspaceRoot] })
  )
}

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.disableHierarchicalLookup = true
config.resolver.extraNodeModules = {
  '@flightwatcher/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
  // Prefer mobile React 19 over hoisted frontend React 18
  react: resolveDep('react'),
  'react-native': resolveDep('react-native'),
}

module.exports = config
