const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

function resolveDep(name) {
  const candidates = [
    path.join(projectRoot, 'node_modules', name),
    path.join(workspaceRoot, 'node_modules', name),
    path.join(workspaceRoot, 'node_modules', 'expo', 'node_modules', name),
    path.join(projectRoot, 'node_modules', 'expo', 'node_modules', name),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate
    }
  }
  return path.dirname(
    require.resolve(`${name}/package.json`, {
      paths: [
        projectRoot,
        workspaceRoot,
        path.join(workspaceRoot, 'node_modules', 'expo'),
      ],
    })
  )
}

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules', 'expo', 'node_modules'),
]
config.resolver.disableHierarchicalLookup = true
config.resolver.extraNodeModules = {
  '@flightwatcher/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
  react: resolveDep('react'),
  'react-native': resolveDep('react-native'),
  'expo-modules-core': resolveDep('expo-modules-core'),
}

module.exports = config
