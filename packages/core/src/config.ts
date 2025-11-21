import path from "path";
import { pathToFileURL } from "url";
import { readFileSync } from "fs";
import { readFile } from "fs/promises";

import { underline } from "ansis";
import { createConfigCoreLoader, type CoreLoadConfigResult } from 'unconfig-core'

import { CONFIG_FILE, TAG } from "./constants";
import { createLogger, isTruthy, merge, normalizePath, resolvePath } from "./utils";
import type { _TsdownOptions, ElectronBuildConfig, InlineConfig, PreloadTsdownConfig, RendererConfig, ResolvedConfig, UserConfigExport, UserTsdownConfig } from "./types";

const logger = createLogger()
let isWatch = false

export function defineConfig(config: UserConfigExport): UserConfigExport {
  return config
}

/**
 * Resolve config
 */
export async function resolveConfig(inlineConfig: InlineConfig, cwd: string = process.cwd()): Promise<ResolvedConfig> {
  const { configFile } = inlineConfig

  // get config file path
  let file: string | undefined
  let exported: UserConfigExport = {}

  let loadResult: CoreLoadConfigResult<UserConfigExport> | null = null

  const parser = createParser('unrun')
  if (typeof configFile === 'string') {
    [loadResult] = await createConfigCoreLoader<UserConfigExport>({
      sources: [
        {
          files: [configFile],
          extensions: [],
          parser,
        },
      ],
      cwd,
      stopAt: path.parse(cwd).root,
    }).load(isWatch)
  }
  else if (configFile !== false) {
    [loadResult] = await createConfigCoreLoader<UserConfigExport>({
      sources: [
        {
          files: [CONFIG_FILE],
          extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json', ''],
          parser,
        },
      ],
      cwd,
      stopAt: path.parse(cwd).root,
    }).load(isWatch)
  }

  if (loadResult) {
    ; ({ config: exported, source: file } = loadResult)
    logger.info(TAG, `Using config: ${underline(file)}`)

    exported = await exported
    if (typeof exported === 'function') {
      exported = await exported(inlineConfig)
    }
  }

  exported = merge(exported, inlineConfig)
  // resolve app type
  const appType = exported.type || 'node'

  // resolve main file
  const mainFile = await getMainFileAndCheck(cwd, exported.main)

  // get package type
  const pkgType = await getPkgType(cwd)

  // resolve entry file tsdown config
  if (!exported.entry)
    throw new Error('entry file is required')

  const tsdownConfigArr: _TsdownOptions[] = [
    await mergeTsdownConfig(exported, cwd, {
      format: pkgType === 'module' ? 'es' : 'cjs',
      outExtensions: () => {
        const main = mainFile.replace(cwd, '').replace(/^\/+/, '')
        const extname = path.extname(main)

        const output = path.join(path.dirname(main), path.basename(main, extname))
        const expectOutput = path.join(exported.outDir!, path.basename(exported.entry!, path.extname(exported.entry!)))
        const dtsMap = {
          '.js': '.ts',
          '.cjs': '.cts',
          '.mjs': '.mts',
        } as Record<string, string>

        const js = expectOutput === output ? extname : undefined

        return {
          js,
          dts: js ? dtsMap[js] : undefined,
        }
      }
    })
  ]

  // resolve electron preload file tsdown config, entry must be specified
  if (exported.electron?.preload || inlineConfig.preload) {
    let preloadConfig = { ...(exported.electron?.preload || {}) }
    if (inlineConfig.preload)
      preloadConfig = { ...preloadConfig, entry: inlineConfig.preload }

    if (preloadConfig.entry)
      tsdownConfigArr.push(await mergeTsdownConfig(preloadConfig, cwd, tsdownConfigArr[0]))
    else
      logger.warn(TAG, 'Electron preload\'s entry is not specified, it will be ignored')
  }

  // resolve electron builder config
  let electronBuilderConfig: ElectronBuildConfig | undefined
  if (exported.electron?.build || inlineConfig.electronBuilderConfig) {
    const electronConfig = exported.electron?.build || {
      config: inlineConfig.electronBuilderConfig
    }
    electronBuilderConfig = await resolveElectronBuilderConfig(electronConfig, cwd)
  }

  // resolve electron renderer config
  let electronRendererConfig: RendererConfig | undefined
  if (exported.electron?.renderer || inlineConfig.renderer) {
    electronRendererConfig = resolveElectronRendererConfig(exported.electron?.renderer || inlineConfig.renderer, cwd)
  }

  // resolve debug config
  const debugCfg = exported.debugCfg || {}
  debugCfg.enabled = !!(inlineConfig.debug || debugCfg.enabled)
  if (debugCfg.enabled) {
    tsdownConfigArr.forEach((c) => {
      c.sourcemap = debugCfg.sourcemapType === 'file' ? true : 'inline'
    })
  }

  // resolve build only
  const buildOnly = !!(inlineConfig.buildOnly || exported.buildOnly || debugCfg.buildOnly)

  // resolve run only
  const runOnly = !!(inlineConfig.runOnly || exported.runOnly)

  return {
    cwd,
    type: appType,
    main: mainFile,
    args: exported.args || [],
    debugCfg,
    buildOnly,
    runOnly,
    tsdownConfigs: tsdownConfigArr,
    electron: {
      build: electronBuilderConfig,
      renderer: electronRendererConfig
    },
    afterBuild: exported.afterBuild,
  }
}

async function loadPackageJson(cwd: string) {
  const parser = createParser('unrun')
  const [packageJson] = await createConfigCoreLoader<any>({
    sources: [
      {
        files: ['package.json'],
        extensions: [],
        parser,
      },
    ],
    cwd,
    stopAt: path.parse(cwd).root,
  }).load()

  return packageJson
}

async function getMainFileAndCheck(cwd: string, defaultMainFile?: string) {
  let mainFile = defaultMainFile
  if (!mainFile) {
    const packageJson = await loadPackageJson(cwd)
    const { source: filePath, config: data } = packageJson

    if (!filePath)
      throw new Error('Main file is not specified, and no package.json found')

    const { main } = data
    if (main)
      mainFile = resolvePath(main, cwd)
    else
      throw new Error('Main file is not specified, package.json also missing main field ')
  }

  if (!/\.cjs$|\.mjs$|\.js$/.test(mainFile))
    throw new Error(`Main file must be .cjs or .(m)js: ${mainFile}`)

  return mainFile
}

async function getPkgType(cwd: string) {
  const packageJson = await loadPackageJson(cwd)
  const { config: data } = packageJson

  const TYPES = ['commonjs', 'module', undefined] as const
  return (TYPES.includes(data.type) ? data.type : undefined) as (typeof TYPES)[number]
}

async function mergeTsdownConfig(inputConfig: UserTsdownConfig | PreloadTsdownConfig, cwd: string, defaultConfig: _TsdownOptions = {}): Promise<_TsdownOptions> {
  let extraCfg: _TsdownOptions | undefined
  if (inputConfig.tsdownConfig) {
    // load tsdown config
    if (typeof inputConfig.tsdownConfig === 'string') {
      const parser = createParser('unrun')
      const [result] = await createConfigCoreLoader<_TsdownOptions>({
        sources: [
          {
            files: [inputConfig.tsdownConfig],
            extensions: [],
            parser,
          },
        ],
        cwd,
        stopAt: path.parse(cwd).root,
      }).load()

      if (!result) {
        logger.warn(TAG, `tsdown config file: ${inputConfig.tsdownConfig} not found, ignored.\n`)
      }
      else {
        extraCfg = result.config
      }
    }
    // use tsdown config directly
    else if (typeof inputConfig.tsdownConfig === 'object') {
      extraCfg = inputConfig.tsdownConfig
    }
  }

  // extra tsdown config entry field will be ignored
  delete extraCfg?.entry

  // merge tsdown config
  let tsdownConfig: _TsdownOptions = merge(defaultConfig, {
    entry: inputConfig.entry ? (Array.isArray(inputConfig.entry) ? inputConfig.entry : [inputConfig.entry]) : undefined,
    outDir: inputConfig.outDir,
    tsconfig: inputConfig.tsconfig,
    external: inputConfig.external,
    config: false,
  })

  tsdownConfig = extraCfg ? { ...tsdownConfig, ...extraCfg } : tsdownConfig

  // support specific package.json, "dependencies" in package.json will be external
  if (Array.isArray(tsdownConfig.external) && tsdownConfig.external.some(e => typeof e === 'string' && e.includes('package.json'))) {
    const external = []

    for (const item of tsdownConfig.external) {
      if (typeof item !== 'string' || !item.includes('package.json')) {
        external.push(item)
        continue
      }

      const pkgJsonPath = resolvePath(item, cwd)
      const { dependencies = {}, peerDependencies = {} } = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
      for (const dep in { ...dependencies, ...peerDependencies })
        external.push(dep)
    }

    tsdownConfig.external = [...new Set(external)]
  }

  return tsdownConfig
}

async function resolveElectronBuilderConfig(buildConfig: ElectronBuildConfig | undefined, cwd: string): Promise<ElectronBuildConfig> {
  if (!buildConfig)
    return { disabled: true }

  type Configuration = import('electron-builder').Configuration
  const defaultConfig = {
    directories: {
      output: path.join(cwd, 'release')
    }
  } satisfies Configuration

  let resolvedConfig: Configuration | undefined = undefined

  if (typeof buildConfig.config === 'string') {
    const parser = createParser('unrun')
    const [configContent] = await createConfigCoreLoader<Configuration | undefined>({
      sources: [
        {
          files: [buildConfig.config],
          extensions: [],
          parser,
        },
      ],
      cwd,
      stopAt: path.parse(cwd).root,
    }).load()

    resolvedConfig = configContent.config
  } else {
    resolvedConfig = buildConfig.config
  }

  resolvedConfig = { ...defaultConfig, ...resolvedConfig }

  // Check if `files` and electron-build `output` directories conflict
  const output = resolvedConfig?.directories?.output
  const files = !Array.isArray(resolvedConfig?.files) ? [resolvedConfig?.files].filter(Boolean) : resolvedConfig?.files
  if (output) {
    const todoList = [...files]

    for (let index = 0; index < todoList.length; index++) {
      const element = todoList[index];

      if (typeof element === 'string' && resolvePath(output, cwd).startsWith(resolvePath(element, cwd))) {
        files[index] = undefined
        logger.warn(`electron build config: <files> - '${element}' and <directories.output> are in conflict, it will be filtered.`)
      } else if (typeof element === 'object' && element) {
        if (element.from && resolvePath(output, cwd).startsWith(resolvePath(element.from, cwd))) {
          files[index] = undefined
          logger.warn(`electron build config: <files.from> - '${element.from}' and <directories.output> are in conflict, it will be filtered.`)
        } else if (element.to && resolvePath(output, cwd).startsWith(resolvePath(element.to, cwd))) {
          files[index] = undefined
          logger.warn(`electron build config: <files.to> - '${element.to}' and <directories.output> are in conflict, it will be filtered.`)
        }
      }
    }
  }
  resolvedConfig.files = files.filter(isTruthy)

  return {
    disabled: buildConfig.disabled === true,
    config: resolvedConfig,
    afterBuild: buildConfig.afterBuild,
    cliOptions: buildConfig.cliOptions,
  }
}

function resolveElectronRendererConfig(rendererConfig: RendererConfig | undefined, cwd: string): RendererConfig | undefined {
  if (!rendererConfig)
    return

  const outDir = normalizePath(rendererConfig.outDir || 'dist')
  const entry = normalizePath(rendererConfig.entry || 'index.html')

  return {
    ...rendererConfig,
    cwd,
    // Server mode, priority
    ...(!rendererConfig.url ? { outDir, entry } : {})
  }
}

// @link https://github.com/rolldown/tsdown/blob/e177a66888f21a4c045967fdf4fa5483b986c812/src/config/config.ts#L156
type Parser = 'native' | 'unrun'
function createParser(loader: Parser) {
  return async (filepath: string) => {
    const basename = path.basename(filepath)
    const isJSON =
      basename === CONFIG_FILE || basename.endsWith('.json')
    if (isJSON) {
      const contents = await readFile(filepath, 'utf8')
      const parsed = JSON.parse(contents)
      return parsed
    }

    if (loader === 'native') {
      return nativeImport(filepath)
    }

    return unrunImport(filepath)
  }
}

async function nativeImport(id: string) {
  const mod = await import(pathToFileURL(id).href).catch((error) => {
    const cannotFindModule = error?.message?.includes?.('Cannot find module')
    if (cannotFindModule) {
      const configError = new Error(
        `Failed to load the config file. Try setting the --config-loader CLI flag to \`unrun\`.\n\n${error.message}`,
        { cause: error },
      )
      throw configError
    } else {
      throw error
    }
  })
  const config = mod.default || mod
  return config
}

async function unrunImport(id: string) {
  const { unrun } = await import('unrun')
  const { module } = await unrun({
    path: pathToFileURL(id).href,
  })
  return module
}
