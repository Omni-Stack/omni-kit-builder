import path from "path"
import { isWindows } from "./general"
import { mkdir, stat } from "fs/promises"

export function resolvePath(_path: string, cwd: string = process.cwd()): string {
  if (path.isAbsolute(_path))
    return _path

  return path.resolve(cwd, _path)
}

export function slash(p: string): string {
  return p.replace(/\\/g, '/')
}

export function normalizePath(id: string): string
export function normalizePath(id?: string): string | undefined
export function normalizePath(id?: string): string | undefined | null {
  if (!id) {
    return id
  }
  return path.posix.normalize(isWindows ? slash(id) : id)
}

/**
 * 寻找一组相对路径的最长公共前缀路径。
 *
 * @param {string[]} paths - 相对路径字符串数组。
 * @returns {string} - 最长公共前缀路径。
 */
export function findLongestCommonPrefixPath(paths: string[]): [string, number] {
  if (!paths || paths.length === 0 || paths.length === 1) {
    return ['', 0];
  }

  // 将所有路径分割成组件数组
  // 例如: 'src/components/button.js' -> ['src', 'components', 'button.js']
  const pathComponents = paths.map(p => {
    // 使用 path.normalize() 清理路径（例如处理 'a/../b'）
    // path.sep 是操作系统特定的路径分隔符 ('/' 或 '\')
    return path.normalize(p).split(path.sep).filter(component => component !== '');
  });

  // 取第一个路径的组件作为初始公共前缀
  const firstPathComponents = pathComponents[0];
  let commonPrefix = [];

  // 逐个组件进行比较
  for (let i = 0; i < firstPathComponents.length; i++) {
    const currentComponent = firstPathComponents[i];
    let isCommon = true;

    // 遍历所有其他路径，检查它们在当前位置 i 的组件是否相同
    for (let j = 1; j < pathComponents.length; j++) {
      const otherComponents = pathComponents[j];

      // 如果其他路径已经结束，或者当前组件不匹配
      if (i >= otherComponents.length || otherComponents[i] !== currentComponent) {
        isCommon = false;
        break;
      }
    }

    if (isCommon) {
      // 如果所有路径都包含这个组件，则将其加入公共前缀
      commonPrefix.push(currentComponent);
    } else {
      // 只要有一个组件不匹配，就可以停止比较了
      break;
    }
  }

  // 将公共前缀组件重新连接成路径
  if (commonPrefix.length === 0) {
    return ['', 0];
  }

  // 使用 path.join 确保路径分隔符符合操作系统规范
  // 最后返回的路径末尾不带分隔符
  return [path.join(...commonPrefix), commonPrefix.length];
}

export async function ensurePathExists(targetPath: string, isFile = false) {
  // 确定需要创建的目录路径
  // 如果是文件，只需要创建它的父目录。
  // 如果是文件夹，需要创建它本身。
  const dirToCreate = isFile ? path.dirname(targetPath) : targetPath;

  if (!dirToCreate || dirToCreate === '.') {
    // 如果路径是当前目录或根目录，则不需要创建
    return dirToCreate;
  }

  try {
    // 尝试使用 recursive: true 创建目录
    await mkdir(dirToCreate, { recursive: true });
    return dirToCreate;
  } catch (error) {
    // 检查路径是否存在，但 stat 可能会因为权限问题失败
    try {
      const stats = await stat(dirToCreate);
      if (stats.isDirectory()) {
        return dirToCreate;
      }
    } catch (statError) {
      // ignore
    }
    // 如果创建失败，且不是因为目录已存在，则抛出错误
    throw error;
  }
}

/**
 * 通过构造 '..' 路径片段，模拟向上移动目录层级，从而移除相对路径的前缀文件夹。
 *
 * @param {string} relativePath - 待处理的相对路径，例如 'dist/assets/image.png'
 * @param {number} levelsToRemove - 要移除的前缀文件夹层级数量，例如 2 (移除 'dist' 和 'assets')
 * @returns {string} - 处理后的相对路径，例如 'image.png'
 */
export function removePrefixFolders(relativePath: string, levelsToRemove: number): string {
  if (levelsToRemove <= 0) {
    return relativePath;
  }

  // 构造一个包含指定数量 '..' 的数组
  const upPathSegments = Array<string>(levelsToRemove).fill('..');

  // 将 '..' 数组放在路径前面
  const joinedPath = path.join(...upPathSegments, relativePath);

  // 使用 path.normalize 或 path.resolve 进行解析
  // path.normalize 会处理 'a/../b' -> 'b'
  // 结果就是移除了前缀的路径

  // 注意：如果 levelsToRemove 太多，path.normalize 会将路径解析到根目录
  // 但在相对路径的场景中，path.normalize 是最安全的，它不会将路径转换为绝对路径。
  return path.normalize(joinedPath);
}
