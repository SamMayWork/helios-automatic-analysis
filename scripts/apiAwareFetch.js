const fetch = require('node-fetch')
const Logger = require('./logging')
const logging = new Logger('apifetch', `./logs/apifetch-${new Date().toLocaleTimeString('it-IT').replaceAll(':', '_')}`, process.env.LOG_LEVEL)
const { setTimeout } = require('timers/promises')

class ApiAwareFetch {
  constructor (apiKey) {
    this.apiKey = apiKey
    this.initialiseKeyCalls()
  }

  async initialiseKeyCalls () {
    const res = await fetch('https://api.github.com/', {
      headers: {
        authorization: `token ${this.apiKey}`
      }
    })

    this.setRemainingUsage(res)
  }

  setRemainingUsage (response) {
    this.remainingUsage = parseInt(response.headers.get('x-ratelimit-remaining'))
  }

  async fetch (url) {
    const request = await fetch(url, {
      headers: {
        authorization: `token ${this.apiKey}`
      }
    })

    this.setRemainingUsage(request)

    if (this.remainingUsage <= 0) {
      const waitUntil = parseInt(request.headers.get('x-ratelimit-reset')) + 10
      const timeToWait = waitUntil * 1e3 - Date.now()

      logging.error(`Primary rate limit breached, waiting until ${waitUntil}`)

      await setTimeout(timeToWait)
    }

    if (request.status === 403) {
      const forbiddenResponse = await request.json()
      if (forbiddenResponse.message === 'Repository access blocked') {
        logging.warn('Repo removed by GH staff')
        return
      }

      logging.error('Secondary Rate Limit breached, waiting...')
      await setTimeout(process.env.RATE_LIMIT_BREACHED_DELAY || 120000)
      return this.fetch(url)
    }

    return request
  }
}

module.exports = ApiAwareFetch
