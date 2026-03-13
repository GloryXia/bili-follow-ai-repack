import fs from 'fs-extra';

/**
 * 创建一个同时输出到控制台和文件的日志函数
 * @param {string} logFile - 日志文件路径
 * @returns {Function} log 函数
 */
export function createLogger(logFile) {
  return (...items) => {
    const line = `[${new Date().toISOString()}] ${items.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' ')}`;
    console.log(line);
    fs.appendFileSync(logFile, line + '\n');
  };
}
