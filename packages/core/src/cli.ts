#!/usr/bin/env node
import { cac } from 'cac'
import { version } from '../package.json'
import { TAG } from './constants'
import { createLogger } from './utils'
import type { AppType } from './types'

const cli = cac('doubleshot-build')

// global options
interface GlobalCLIOptions {
  '--'?: string[]
  't'?: AppType
  'type'?: AppType
  'c'?: string
  'config'?: string
  'disableConfig'?: true
  'e'?: string
  'entry'?: string
  'o'?: string
  'out'?: string
  'tsconfig'?: string
  /** string,string,string... */
  'external'?: string
  'tsdownConfig'?: string
  'preload'?: string
}

interface DevOptions {
  m?: string
  main?: string
  rendererUrl?: string
  waitTimeout?: number
  waitForRenderer?: boolean
  rendererDev?: string
  rendererCwd?: string
  rendererAssets?: string
  rendererOut?: string
  rendererEntry?: string
  buildOnly?: boolean
  runOnly?: boolean
  debug?: boolean
}

interface BuildOptions {
  electronBuilderConfig?: string
}

cli
  .option('-t, --type <type>', 'Application type, \'node\' or \'electron\'', { default: 'node' })
  .option('-c, --config <config>', 'Specify config file')
  .option('--disable-config', 'Do not load config file')
  .option('-e, --entry <file>', 'Entry file for bundling')
  .option('-o, --out <dir>', 'Output directory')
  .option('--tsconfig <file>', 'TS config file')
  .option('--external <names>', 'External packages')
  .option('--tsdown-config <file>', 'tsdown config file')
  .option('--preload <file>', 'Electron preload file')

// dev
cli
  .command('', 'run in development mode')
  .alias('dev')
  .option('-m, --main <file>', 'The main file of the application')
  .option('--renderer-url', 'Renderer process url, support multiple')
  .option('--wait-for-renderer', 'Wait for renderer process to be ready')
  .option('--wait-timeout', 'Wait for renderer process ready timeout')
  .option('--renderer-dev', 'Renderer Dev config, dev server url')
  .option('--renderer-cwd', 'Renderer base config, default is `process.cwd()`, base path')
  .option('--renderer-assets', 'Renderer base config, assets dir, based on `renderer.cwd`')
  .option('--renderer-out', 'Static renderer, default is \'dist\', based on `renderer.cwd`')
  .option('--renderer-entry', 'Static renderer, default is \'index.html\', based on `renderer.cwd`')
  .option('--build-only', 'Only prebuild files and won\'t run the application')
  .option('--run-only', 'Skip prebuild and run the application')
  .option('--debug', 'Run in debug mode')
  .action(async (options: DevOptions & GlobalCLIOptions) => {
    const logger = createLogger()
    const { Core } = await import('./core')

    try {
      await (await Core.create({
        main: options.main,
        type: options.type,
        configFile: options.disableConfig === true ? false : options.config,
        entry: options.entry,
        outDir: options.out,
        tsconfig: options.tsconfig,
        external: options.external?.split(','),
        tsdownConfig: options.tsdownConfig,
        preload: options.preload,
        renderer: {
          url: options.rendererUrl ? (options.rendererUrl.includes(',') ? options.rendererUrl.split(',') : options.rendererUrl) : '',
          waitTimeout: options.waitTimeout,
          waitForRenderer: options.waitForRenderer,
          devUrl: options.rendererDev,
          cwd: options.rendererCwd,
          assets: options.rendererAssets ? (options.rendererAssets.includes(',') ? options.rendererAssets.split(',') : [options.rendererAssets]) : [],
          outDir: options.rendererOut,
          entry: options.rendererEntry,
        },
        buildOnly: options.buildOnly,
        runOnly: options.runOnly,
        debug: options.debug,
      })).dev()
    }
    catch (e) {
      logger.error(TAG, e)
      process.exit(1)
    }
  })

// build
cli
  .command('build', 'build for production')
  .option('--electron-builder-config <file>', 'Electron-Builder config file')
  .action(async (options: BuildOptions & GlobalCLIOptions) => {
    const logger = createLogger()
    const { Core } = await import('./core')

    try {
      await (await Core.create({
        electronBuilderConfig: options.electronBuilderConfig,
        type: options.type,
        configFile: options.disableConfig === true ? false : options.config,
        entry: options.entry,
        outDir: options.out,
        tsconfig: options.tsconfig,
        external: options.external?.split(','),
        tsdownConfig: options.tsdownConfig,
        preload: options.preload,
      })).build()
    }
    catch (e) {
      logger.error(TAG, e)
      process.exit(1)
    }
    finally {
      process.exit()
    }
  })

cli.help()
cli.version(version)

cli.parse()
