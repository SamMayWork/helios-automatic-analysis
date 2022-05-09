const fs = require('fs')
const chalk = require('chalk')
class Logger {
  /**
   * Logger Constructor
   * @param {String} logPrefix - Owning component of this logging session
   * @param {String} outLogFile - File to output logs to
   * @param {String} logLevel - Minimum level of logs to show to the screen
   */
  constructor (logPrefix, outLogFile, logLevel) {
    this.logPrefix = logPrefix
    this.outLogFile = outLogFile

    switch (logLevel.toUpperCase()) {
      case 'DEBUG':
        this.logLevel = 0
        break
      case 'INFO':
        this.logLevel = 1
        break
      case 'WARN':
        this.logLevel = 2
        break
      case 'ERROR':
        this.logLevel = 3
        break
      default:
        this._log('No Log Level configured!')
    }
  }

  info (message) {
    const logString = `${this.logPrefix}-${this._getCurrentPrettyTime()}/${chalk.bgGreen.black('info')} : ${message}`
    this._log(logString, 1)
  }

  debug (message) {
    const logString = `${this.logPrefix}-${this._getCurrentPrettyTime()}/${chalk.bgGray('debug')} : ${message}`
    this._log(logString, 0)
  }

  error (message) {
    const logString = `${this.logPrefix}-${this._getCurrentPrettyTime()}/${chalk.bgRed('error')} : ${message}`
    this._log(logString, 3, true)
  }

  warn (message) {
    const logString = `${this.logPrefix}-${this._getCurrentPrettyTime()}/${chalk.bgBlue('warn')} : ${message}`
    this._log(logString, 2, true)
  }

  _getCurrentPrettyTime () {
    return new Date().toLocaleTimeString('it-IT').replaceAll(':', '_')
  }

  _log (message, logLevel, error = false) {
    if (logLevel >= this.logLevel) {
      if (error) {
        console.error(message)
      } else {
        console.log(message)
      }
    }

    fs.appendFileSync(this.outLogFile, `${message}\n`)
  }
}

module.exports = Logger
