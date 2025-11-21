import electron from 'electron';
import {
  type BrowserWindowConstructorOptions,
  type App,
  type HandlerDetails,
  type Event,
  type OnBeforeRequestListenerDetails,
  type CallbackResponse,
} from 'electron';
import { access } from 'fs/promises';
import { checkUrlAccessible } from '../utils';

const {
  BrowserWindow,
  shell,
} = electron

// ! 为了兼容 electron@22
// 最后支持 win7 的 electron 版本 - https://releases.electronjs.org/release?major=v22
type WindowOpenHandlerResponse = {
  action: 'deny'
} | {
  action: 'allow',
  outlivesOpener?: boolean,
  overrideBrowserWindowOptions?: BrowserWindowConstructorOptions
}

export interface ExpandOptions {
  openDevTools?: boolean;
  /** server mode */
  url?: string;
  /** static mode */
  file?: string;
}

export interface Handlers {
  onWindowOpen?: (details: Electron.HandlerDetails, parentWindow: InstanceType<typeof BrowserWindow>) => WindowOpenHandlerResponse | void
  onWindowClose?: (event: Event, window: InstanceType<typeof BrowserWindow>) => void
  /** 资源请求即将发生时 */
  onBeforeRequest?: (details: OnBeforeRequestListenerDetails) => Promise<CallbackResponse | void>
}

export class Application {
  private readonly app: App;
  private readonly defaultOptions: BrowserWindowConstructorOptions;
  private readonly defaultExpandOptions: ExpandOptions;
  private readonly handlers?: Handlers;

  /**
   * 管理所有窗口
   * - 键: string (给窗口定义的唯一ID, 如 'main', 'settings')
   * - 值: BrowserWindow 实例
   */
  private windows: Map<string, InstanceType<typeof BrowserWindow>> = new Map();

  constructor(
    electronApp: App,
    options: BrowserWindowConstructorOptions,
    expandOptions: ExpandOptions,
    handlers?: Handlers
  ) {
    this.app = electronApp;
    // 视为“主窗口”的默认配置
    this.defaultOptions = options;
    this.defaultExpandOptions = expandOptions;

    this.handlers = handlers;
  }

  /**
   * 启动应用，并创建主窗口
   */
  public async run() {
    // 禁止前端控制台的安全性警告 log
    process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

    if (!this.app.requestSingleInstanceLock()) {
      this.app.quit();
      process.exit(0);
    }

    this.app.on('window-all-closed', this.onWindowAllClosed.bind(this));
    this.app.on('activate', this.onActivate.bind(this));

    await this.app.whenReady();
    // 启动时，创建 "main" 窗口
    return this.createWindow('main', this.defaultOptions, this.defaultExpandOptions);
  }

  /**
   * 在 macOS 上，如果 Dock 被点击且没有窗口，则重新创建主窗口
   */
  private onActivate() {
    if (this.windows.size === 0) {
      this.createWindow('main', this.defaultOptions, this.defaultExpandOptions);
    }
  }

  private async onWindowAllClosed() {
    // [INFO] 开发模式优化
    // 开发模式下直接中断项目，由于 mac 端 dock 栏后台暂留的机制
    // app 可能不会退出，此处对 url\file 特别做判断（开发模式中断项目 url 将会无服务）
    const isAccessible = this.defaultExpandOptions.url
      ? await checkUrlAccessible(this.defaultExpandOptions.url)
      : this.defaultExpandOptions.file
        ? await access(this.defaultExpandOptions.file)
        : false

    if (process.platform !== 'darwin' || !isAccessible) {
      this.app.quit();
    }
  }

  /**
   * 创建或聚焦一个窗口
   * @param windowKey 窗口的唯一标识符 (e.g., "main", "settings")
   * @param options 窗口的 BrowserWindow 选项
   * @param expandOptions (可选) 拓展选项
   */
  public createWindow(
    windowKey: string,
    options: BrowserWindowConstructorOptions,
    expandOptions?: ExpandOptions
  ) {
    // 如果窗口存在，则聚焦它而不是创建新的
    if (this.windows.has(windowKey)) {
      const existingWindow = this.windows.get(windowKey)!;

      if (existingWindow.isMinimized()) {
        existingWindow.restore();
      }
      existingWindow.focus();
      return;
    }

    const newWindow = new BrowserWindow(options);

    newWindow.webContents.session.webRequest.onBeforeRequest(async (details, callback) => {
      const response = await this.handlers?.onBeforeRequest?.(details)
      if (response) {
        return callback(response);
      }
      callback({});
    });

    newWindow.webContents.setWindowOpenHandler((details) => {
      console.log(`[WindowHandler] 父窗口 (ID: ${newWindow.id}) 请求打开: ${details.url}`);

      // 将 `newWindow` (即“父”窗口) 传递给处理程序
      const customHandler = this.handlers?.onWindowOpen?.(details, newWindow)
      if (customHandler) {
        return customHandler;
      }

      return this.handleWindowOpen(details, newWindow)
    });

    const loadPath = expandOptions?.url || this.defaultExpandOptions.url;
    const loadFile = expandOptions?.file || this.defaultExpandOptions.file;
    const openDevTools = expandOptions?.openDevTools || this.defaultExpandOptions.openDevTools;

    if (loadPath) {
      newWindow.loadURL(loadPath);
    } else if (loadFile) {
      newWindow.loadFile(loadFile);
    } else {
      console.warn(`[App] 窗口 ${windowKey} 被创建，但没有提供 url 或 file。`);
    }

    if (openDevTools) {
      newWindow.webContents.openDevTools();
    }

    newWindow
      .on('close', (event) => {
        this.handlers?.onWindowClose?.(event, newWindow)
      })
      .on('closed', () => {
        // 当窗口关闭时，从 Map 中移除
        this.windows.delete(windowKey);
        console.log(`[App] 窗口关闭: ${windowKey}. 当前窗口数: ${this.windows.size}`);
      });

    // 跟踪新窗口
    this.windows.set(windowKey, newWindow);
    console.log(`[App] 窗口创建: ${windowKey}. 当前窗口数: ${this.windows.size}`);
    return newWindow
  }

  /**
   * 默认处理窗口打开
   */
  private handleWindowOpen(
    details: HandlerDetails,
    _parentWindow: InstanceType<typeof BrowserWindow>
  ): WindowOpenHandlerResponse {
    // http(s) 的链接使用本机浏览器打开
    if (details.url.startsWith('http:') || details.url.startsWith('https:')) {
      // 在用户默认浏览器中打开
      shell.openExternal(details.url);
      return { action: 'deny' };
    }

    return { action: 'deny' };
  }

  /**
   * 获取窗口
   */
  public getWindow(windowKey: string) {
    return this.windows.get(windowKey);
  }
}

