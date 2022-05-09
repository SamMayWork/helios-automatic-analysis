const fs = require('fs')
const Logger = require('./logging')
const logging = new Logger('rescraper', `./logs/scraper-${new Date().toLocaleTimeString('it-IT').replaceAll(':', '_')}`, 'info')
require('dotenv').config({ path: '../.env' })
const dbUrl = `http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@${process.env.COUCHDB_IP}:5984`
const nano = require('nano')(dbUrl)
const fetch = require('node-fetch')
const { parse } = require('node-html-parser')

const GITHUB_HOST = 'https://github.com'

let STARTING_INDEX = process.env.STARTING_INDEX || 0
const END_INDEX = process.env.END_INDEX || 50

async function rescrape () {
  try {
    let prevIndex
    try {
      prevIndex = parseInt(fs.readFileSync('./currentIndex.txt', 'utf8'))

      if (prevIndex) {
        STARTING_INDEX = prevIndex
        logging.info(`Found previous index ${STARTING_INDEX}`)
      }
    } catch (error) {
      logging.error('Could not read previous value, continuing')
    }

    const tableConnection = await establishDBConnection('scraped_results')

    const allRecordsRequest = await fetch(`http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@${process.env.COUCHDB_IP}:5984/scraped_results/_all_docs`, {
      method: 'get',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    const allRecords = await allRecordsRequest.json()

    for (let i = STARTING_INDEX; i < END_INDEX; i++) {
      fs.writeFileSync('./currentIndex.txt', `${i}`)

      const row = allRecords.rows[i]

      if (!row) {
        logging.error(`Current Start Index is ${STARTING_INDEX}, End Index is ${END_INDEX}, Current Index is ${i}`)
        process.exit(0)
      }

      const currentRecord = await tableConnection.get(row.id)

      if (!currentRecord) {
        logging.error('Got no current record from the DB')
        continue
      }

      let scrapedInformation
      try {
        const siteRequest = await fetch(`${GITHUB_HOST}/${row.id}`)
        const siteResponse = await siteRequest.text()

        if (siteRequest.status === 404) {
          throw new Error(`Could not find ${row.id}`)
        }

        const parsedContent = parse(siteResponse)

        let contributors
        try {
          contributors = textToNumbers(parsedContent.querySelector(`a[href="/${row.id}/graphs/contributors"] .Counter`).innerHTML)

          if (contributors === 0) {
            contributors = 1
          }

          if (!contributors) {
            throw new Error('Could not find contributors')
          }
        } catch (error) {
          if (error.message.includes('Cannot read properties of null')) {
            logging.warn(`Scanned ${row.id} which did not have a contributors section, defaulting to 1`)
            contributors = 1
          } else {
            logging.error(error)
            fs.appendFileSync('errors.txt', `\n${row.id}`)
            continue
          }
        }

        let commits
        try {
          commits = textToNumbers(parsedContent.querySelector(`a[href="/${row.id}/commits/${currentRecord.apiResponse.default_branch}"] > span > strong`).innerHTML)

          if (!commits) {
            throw new Error('Could not find commits')
          }
        } catch (error) {
          logging.error(error)
          fs.appendFileSync('errors.txt', `\n${row.id}`)
          continue
        }

        scrapedInformation = {
          contributors: contributors,
          commits: commits,
          scrapeTime: Date.now()
        }

        try {
          const newRecord = {
            ...currentRecord,
            scrapedInformation,
            rescrapeTime: Date.now(),
            _rev: currentRecord._rev
          }

          await dbInsert(newRecord, row.id, tableConnection)
        } catch (error) {
          logging.error('Could not write to DB!')
          continue
        }
      } catch (error) {
        logging.error(error)
        continue
      }
    }
  } catch (error) {
    logging.error(error)
  }
}

/**
 * Creates a connection to the DataBase and then returns an object which can be used
 * to interact with the DB on the table provided. If a TableName is not provided, generates
 * one automatically
 * @param {String} tableName - Name for the table, if not provided defaults to current time
 * @returns Connection to the current table
 */
async function establishDBConnection (tableName) {
  try {
    if (tableName) {
      return nano.db.use(tableName)
    }

    const newTable = `scraping_${new Date().toLocaleTimeString('it-IT').replaceAll(':', '_')}`
    await nano.db.create(newTable)
    return nano.db.use(newTable)
  } catch (error) {
    logging.error(`Could not establish connection to Database, error was: ${error}`)
    process.exit(1)
  }
}

/**
 * Takes the parsed repoInformation and inserts it into the database, using the name of the
 * repo as the ID
 * @param {Object} repoInformation - JSON Repo Information
 * @param {String} repoName - Name of the repo in the format Org/Name (i.e. Docker/Cli)
 * @param {DbConnection} connection - Connection to the DB Table
 */
async function dbInsert (repoInformation, repoName, connection) {
  if (!repoInformation || !connection) {
    logging.error(`${repoInformation ? 'Processed Repo Information' : 'Connection'} not provided`)
  }

  try {
    await connection.insert(repoInformation, repoName)
  } catch (error) {
    logging.error(error)
  }
}

/**
 * Converts GitHub format string numbers to plain JS Numbers
 * (Some inaccuracy is a given)
 * @param {String} text - String text to convert to number
 */
function textToNumbers (text) {
  text = text.replaceAll(',', '')

  if (text.includes('k')) {
    text = text.replaceAll('k', '')
    return parseFloat(text) * 1000
  }

  return Number(text)
}

rescrape()
