import fs from 'fs';
import waitOn from 'wait-on';
import { build as tsdownBuild } from 'tsdown';
import { spawn, type ChildProcess } from 'child_process';
import { checkPackageExists } from 'check-package-exists';
import { bgCyan, bgCyanBright, bgGreen, bgMagentaBright, bgYellowBright, cyan, greenBright } from 'ansis';

import type { _TsdownOptions, AppType, DevArgs, InlineConfig, ResolvedConfig } from './types';
import { resolveConfig } from './config';
import { createLogger, ensurePathExists, findLongestCommonPrefixPath, removePrefixFolders } from './utils';
import { TAG } from './constants';
import path from 'path';
import { cp } from 'fs/promises';

const logger = createLogger()

export class Core {
  private config: ResolvedConfig;

  private constructor(config: ResolvedConfig) {
    this.config = config;
  }

  static async create(config: InlineConfig = {}) {
    const resolvedConfig = await resolveConfig(config);
    return new Core(resolvedConfig);
  }

  getConfig() {
    return this.config;
  }

  async build(autoPack = true) {
    const {
      type: appType = 'node',
      tsdownConfigs = [],
      afterBuild,
      electron: electronConfig = {},
    } = this.config

    const isElectron = appType === 'electron'
    const startTime = performance.now()

    logger.info(TAG, `📦 Mode: ${bgCyanBright(' Production ')}`)
    logger.info(TAG, `💠 Application type: ${isElectron ? bgCyan(' electron ') : bgGreen(' node ')}`)

    isElectron && Core.electronEnvCheck()

    // env
    const env = Core.createEnv(appType, this.config, 'production')

    // tsdown build
    for (let i = 0; i < tsdownConfigs.length; i++) {
      const tsdownConfig = tsdownConfigs[i]
      await Core.tsdownBuild({ ...tsdownConfig }, env)
    }
    const prebuildTime = performance.now() - startTime
    logger.success(TAG, `✅ Prebuild succeeded! (${prebuildTime.toFixed(2)}ms)`)

    await afterBuild?.()

    const cpRenderer = async () => {
      if (!electronConfig.renderer) {
        return
      }
      if (electronConfig.renderer.outDir && electronConfig.renderer.cwd && electronConfig.renderer.entry) {
        const cwd = electronConfig.renderer.cwd
        const outDir = path.join(cwd, electronConfig.renderer.outDir)

        const assets = electronConfig.renderer.assets ?? []
        const entryFile = electronConfig.renderer.entry

        const [_, commonPrefixNumber] = findLongestCommonPrefixPath([...assets, entryFile])
        for (const item of assets) {
          const toEnsure = path.join(outDir, removePrefixFolders(item, commonPrefixNumber))
          await cp(path.join(cwd, item), await ensurePathExists(toEnsure), { recursive: true, force: true })
        }

        const toEnsure = path.join(outDir, removePrefixFolders(entryFile, commonPrefixNumber))
        const entryFileTarget = path.join(await ensurePathExists(toEnsure, true), path.basename(entryFile))
        await cp(path.join(cwd, entryFile), entryFileTarget, { force: true });
      }
    }

    const pack = async () => {
      if (isElectron && electronConfig.build && electronConfig.build.disabled !== true) {
        await cpRenderer()

        if (!checkPackageExists('electron-builder'))
          throw new Error('"electronConfig.build" is powered by "electron-builder", please installed it via `npm i electron-builder -D`')

        const { build: electronBuilder } = await import('electron-builder')

        logger.info(TAG, 'Start electron build...\n')

        await electronBuilder({
          config: electronConfig.build.config,
          ...(electronConfig.build.cliOptions || {}),
        })

        await electronConfig.build.afterBuild?.()
      }

      const endTime = performance.now() - startTime
      logger.success(`${TAG}`, `Build succeeded! (${endTime.toFixed(2)}ms)`)
    }

    if (autoPack)
      await pack()

    else
      return pack
  }

  async dev() {
    const {
      main: mainFile,
      type: appType = 'node',
      buildOnly = false,
      runOnly = false,
      debugCfg = {},
      tsdownConfigs = [],
      electron: electronConfig = {},
    } = this.config

    const isDebug = !!debugCfg.enabled
    const isElectron = appType === 'electron'
    const startTime = performance.now()

    logger.info(TAG, `💻 Mode: ${isDebug ? `${bgYellowBright(' DEBUG ')} ` : ''}${bgCyanBright(' Development ')}`)
    logger.info(TAG, `💠 Application type: ${isElectron ? bgCyan(' electron ') : bgGreen(' node ')}`)

    // env
    const env = Core.createEnv(appType, this.config, 'development')

    // args
    const args = Core.createArgs(this.config)

    // run process init
    let electron: any | undefined
    if (isElectron && Core.electronEnvCheck()) {
      // ? whether to support custom 'electron' module
      electron = await import('electron')
      if (typeof electron === 'object' && electron.default)
        electron = electron.default
    }
    let child: ChildProcess

    // process once exit, kill child process
    process.on('exit', () => {
      if (child) {
        child.off('exit', Core.exitMainProcess)
        child.kill()
      }
    })

    // prebuild files
    const prebuild = async () => {
      // tsdown build
      for (let i = 0; i < tsdownConfigs.length; i++) {
        let isFirstBuild = true
        const _tsdownConfig = tsdownConfigs[i]
        const { onSuccess: _onSuccess, watch: _watch, ...tsdownOptions } = _tsdownConfig
        const watch = _watch !== false
        if (!watch)
          logger.info(TAG, '⚠️  Watch mode is disabled')

        if (typeof _onSuccess === 'string')
          logger.warn(TAG, '⚠️  "onSuccess" only support a function, ignore it.')

        const onSuccess: _TsdownOptions['onSuccess'] = async () => {
          if (!watch)
            return

          if (typeof _onSuccess === 'function')
            await (_onSuccess as () => Promise<void>)()

          // first build will not trigger rebuild
          if (isFirstBuild) {
            isFirstBuild = false
            return
          }

          logger.success(TAG, 'Rebuild succeeded!')
          if (buildOnly)
            return

          if (child) {
            child.off('exit', Core.exitMainProcess)
            child.kill()
          }

          child = Core.runMainProcess(mainFile, electron, args)
        }

        await Core.tsdownBuild({ onSuccess, watch, ...tsdownOptions }, env)
      }
    }

    if (runOnly) {
      logger.info(TAG, `🚄 ${bgMagentaBright(' RUN ONLY ')} Prebuild will be skipped`)
    }
    else {
      await prebuild()
      const prebuildTime = performance.now() - startTime
      logger.success(TAG, `✅ Prebuild succeeded! (${prebuildTime.toFixed(2)}ms)`)
    }

    if (buildOnly) {
      logger.info(TAG, `🛠️ ${bgYellowBright(' BUILD ONLY ')} Application won't start`)
      return
    }

    if (isElectron) {
      const serverUrl = electronConfig.renderer?.devUrl || electronConfig.renderer?.url
      if (serverUrl && electronConfig.renderer?.waitForRenderer !== false) {
        const waitFn = async (url: string, timeout?: number) => {
          if (!electronConfig?.renderer) {
            return
          }
          if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://')) {
            logger.info(TAG, `🚦 Wait for renderer: ${cyan(url)}`)
            await waitOn(Core.createWaitOnOpts(url, timeout))
          }
          else {
            logger.warn(TAG, `Invalid renderer url: ${url}, ignored.\n`)
          }
        }

        if (!Array.isArray(serverUrl))
          await waitFn(serverUrl, electronConfig.renderer?.waitTimeout)

        else
          await Promise.all(serverUrl.map((url => waitFn(url, electronConfig.renderer?.waitTimeout))))
      }
      // else if (electronConfig.renderer?.mode === 'static' && electronConfig.renderer.root) {
      //   // ... nothing
      // }
    }

    child = Core.runMainProcess(mainFile, electron, args)
  }

  static electronEnvCheck(custom = 'electron') {
    if (!checkPackageExists(custom))
      throw new Error('"Application type: electron" is powered by "electron", please installed it via `npm i electron -D`')

    return true
  }

  static createArgs(config: ResolvedConfig): DevArgs {
    const { args = [], debugCfg = {} } = config

    const dsArgs: ResolvedConfig['args'] = {
      node: [],
      electron: [],
    }

    if (Array.isArray(args)) {
      dsArgs.node = [...args]
      dsArgs.electron = [...args]
    }
    else {
      dsArgs.node = [...(args.node || [])]
      dsArgs.electron = [...(args.electron || [])]
    }

    if (debugCfg.enabled && debugCfg.args) {
      if (Array.isArray(debugCfg.args)) {
        dsArgs.node.push(...debugCfg.args)
        dsArgs.electron.push(...debugCfg.args)
      }
      else {
        dsArgs.node.push(...(debugCfg.args.node || []))
        dsArgs.electron.push(...(debugCfg.args.electron || []))
      }
    }

    return dsArgs
  }

  /**
   * TODO: env to virtual-module
   */
  static createEnv(type: AppType, config: ResolvedConfig, mode: 'production' | 'development'): _TsdownOptions['env'] {
    const env: _TsdownOptions['env'] = {
      [`${TAG}_APP_TYPE`]: type,
      [`${TAG}_MODE`]: mode,
      NODE_ENV: mode,
      DEBUG: !!config.debugCfg.enabled
    }

    function setEnv(key: string, val?: any) {
      env && val && typeof key === 'string' && (env[key] = val)
    }

    if (type === 'electron') {
      setEnv(`${TAG}_RENDERER_CWD`, config.electron.renderer?.cwd)
      setEnv(`${TAG}_RENDERER_OUTDIR`, config.electron.renderer?.outDir)
      setEnv(`${TAG}_RENDERER_ENTRY`, config.electron.renderer?.entry)

      if (config.electron.renderer?.url) {
        const rendererUrlKey = `${TAG}_RENDERER_URL`
        if (Array.isArray(config.electron.renderer.url)) {
          setEnv(`${TAG}_RENDERER_URL_COUNT`, config.electron.renderer.url.length)
          for (let i = 0; i < config.electron.renderer.url.length; i++) {
            if (i === 0)
              setEnv(rendererUrlKey, config.electron.renderer.url[i])
            else
              setEnv(`${rendererUrlKey}_${i + 1}`, config.electron.renderer.url[i])
          }
        }
        else {
          setEnv(rendererUrlKey, config.electron.renderer.url)
        }
      }

      if (config.electron.renderer?.devUrl) {
        setEnv(`${TAG}_RENDERER_DEV_URL`, config.electron.renderer.devUrl)
      } else if(mode === 'development') {
        const target = `file://${path.join(config.electron.renderer?.cwd || process.cwd(), config.electron.renderer?.entry || 'index.html')}`
        setEnv(`${TAG}_RENDERER_DEV_URL`, target)
      }

      if (config.electron.renderer?.assets?.length) {
        const rendererAssetsKey = `${TAG}_RENDERER_ASSETS`
        setEnv(`${TAG}_RENDERER_ASSETS_COUNT`, config.electron.renderer.assets.length)
        for (let i = 0; i < config.electron.renderer.assets.length; i++) {
          if (i === 0)
            setEnv(rendererAssetsKey, config.electron.renderer.assets[i])
          else
            setEnv(`${rendererAssetsKey}_${i + 1}`, config.electron.renderer.assets[i])
        }
      }

      if (config.electron.renderer?.cwd && config.electron.renderer.outDir && config.electron.renderer.entry) {
        setEnv(`${TAG}_RENDERER_FILE`, path.join(config.electron.renderer.outDir, config.electron.renderer.entry))
      }
    }

    const { debugCfg = {} } = config
    if (debugCfg.enabled && debugCfg.env) {
      for (const key in debugCfg.env)
        setEnv(key, debugCfg.env[key])
    }

    return env
  }

  static tsdownBuild(opts: _TsdownOptions, dsEnv: _TsdownOptions['env'] = {}) {
    const { env: optsEnv, ...restOpts } = opts
    const env = { ...(optsEnv ?? {}), ...dsEnv }

    return tsdownBuild({
      silent: true,
      env,
      ...restOpts,
    })
  }

  /**
   * See: https://github.com/jeffbski/wait-on/issues/78
   */
  static createWaitOnOpts(url: string, timeout?: number) {
    if (url.startsWith('http://') || url.startsWith('https://'))
      url = url.startsWith('http://') ? url.replace('http://', 'http-get://') : url.replace('https://', 'https-get://')
    else if (url.startsWith('file://'))
      url = url.replace('file://', '')

    return {
      resources: [url],
      timeout: timeout || 5000,
      headers: {
        accept: '*/*',
      },
    }
  }

  static runMainProcess(mainFile: string, electron: any, args: DevArgs) {
    if (!fs.existsSync(mainFile))
      throw new Error(`Main file not found: ${mainFile}`)

    logger.success(TAG, `⚡️ Run main file: ${greenBright(mainFile)}`)

    const devArgs = electron ? [...(args.electron || [])] : [...(args.node || [])]

    return spawn(electron ?? 'node', [mainFile, ...devArgs], { stdio: 'inherit' }).on('exit', Core.exitMainProcess)
  }

  static exitMainProcess() {
    logger.warn(TAG, 'Main process exit')
    process.exit()
  }
}
