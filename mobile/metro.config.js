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
      paths: [projectRoot, workspaceRoot, path.join(workspaceRoot, 'node_modules', 'expo')],
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

// Do NOT set disableHierarchicalLookup — nested deps (is-arrayish, etc.) break.
// Force React 19 (mobile) over React 18 (frontend) via resolveRequest instead.
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react' || moduleName === 'react/jsx-runtime' || moduleName === 'react/jsx-dev-runtime') {
    const base = resolveDep('react')
    const subpath =
      moduleName === 'react'
        ? path.join(base, 'index.js')
        : path.join(base, moduleName.replace('react/', '') + '.js')
    // Prefer package exports resolution when available
    try {
      return {
        filePath: require.resolve(moduleName, { paths: [base, projectRoot] }),
        type: 'sourceFile',
      }
    } catch {
      if (fs.existsSync(subpath)) {
        return { filePath: subpath, type: 'sourceFile' }
      }
    }
  }
  if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
    try {
      return {
        filePath: require.resolve(moduleName, { paths: [resolveDep('react-native'), projectRoot] }),
        type: 'sourceFile',
      }
    } catch {
      // fall through
    }
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

config.resolver.extraNodeModules = {
  '@flightwatcher/shared': path.resolve(workspaceRoot, 'packages/shared/src'),
  react: resolveDep('react'),
  'react-native': resolveDep('react-native'),
  'expo-modules-core': resolveDep('expo-modules-core'),
}

module.exports = config
