const fs = require('fs')
const Logger = require('./logging')
const logging = new Logger('scraper', `./logs/scraper-${new Date().toLocaleTimeString('it-IT').replaceAll(':', '_')}`, process.env.LOG_LEVEL)
require('dotenv').config({ path: '../.env' })
const dbUrl = `http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@${process.env.COUCHDB_IP}:5984`
const nano = require('nano')(dbUrl)
const fetch = require('node-fetch')
const { parse } = require('node-html-parser')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

const ApiAwareFetch = require('./apiAwareFetch')
const apiFetch = new ApiAwareFetch(process.env.GH_PAT)

const processedDirectory = process.env.PROCESSED_DIRECTORY || './processed'

const githubApiHost = 'https://api.github.com'
const githubHost = 'https://github.com'

const scrapedResultsTable = 'scraped_results_new'

const statistics = {
  filesProcessed: 0,
  reposProcessed: 0,
  newRepos: 0,
  alreadyScannedRepos: 0,
  runStart: Date.now()
}

async function main () {
  logging.info(`Starting scraping run @ ${(new Date()).toISOString()}`)

  const tableConnection = await establishDBConnection(scrapedResultsTable)

  while (true) {
    const repoFiles = fs.readdirSync(processedDirectory)

    while (repoFiles.length > 0) {
      const file = repoFiles.shift()

      statistics.filesProcessed += 1

      logging.debug(`Processing file ${file}`)
      const repos = Object.keys(JSON.parse(fs.readFileSync(`${processedDirectory}/${file}`)))

      while (repos.length > 0) {
        const repo = repos.shift()
        logging.debug(`Processing ${repo}`)

        logging.info(`${statistics.filesProcessed} files processed, ${statistics.newRepos} new repos, ${statistics.alreadyScannedRepos} already scanned, total of ${statistics.reposProcessed}`)
        statistics.reposProcessed += 1

        const currentRecord = await tableConnection.get(repo)

        statistics.newRepos += 1

        let jsonApiResponse
        try {
          const apiFetchRequest = await apiFetch.fetch(`${githubApiHost}/repos/${repo}`)

          if (!apiFetchRequest) {
            continue
          }

          jsonApiResponse = await apiFetchRequest.json()

          if (apiFetchRequest.status === 404) {
            logging.warn(`Got 404 for API Request on ${repo}`)
            continue
          }

          for (const key of Object.keys(jsonApiResponse)) {
            if (key.includes('url')) {
              delete jsonApiResponse[key]
            }
          }
        } catch (error) {
          logging.error(error)
          continue
        }

        const defaultBranch = jsonApiResponse.default_branch
        let fileTree
        try {
          const filesRequest = await apiFetch.fetch(`${githubApiHost}/repos/${repo}/git/trees/${defaultBranch}`)
          fileTree = await filesRequest.json()

          // Some people are weird and have 32,000 files in their root directory
          // let's omit those people
          if (Object.keys(fileTree.tree).length > (process.env.MAX_FILE_LIMIT || 200)) {
            logging.warn(`Too many files in ${repo}`)
            fileTree = undefined
          }
        } catch (error) {
          logging.error(error)
          continue
        }

        let scrapedInformation
        try {
          const siteRequest = await fetch(`${githubHost}/${repo}`)
          const siteResponse = await siteRequest.text()

          if (siteRequest.status === 404) {
            throw new Error(`Could not find ${repo}`)
          }

          const parsedContent = parse(siteResponse)

          let contributors
          try {
            const rawContributors = parsedContent.querySelector(`a[href="/${repo}/graphs/contributors"] .Counter`)

            if (!rawContributors?.innerHTML || rawContributors?.innerHTML === null) {
              logging.warn(`Could not find contributors for ${repo}`)
              contributors = 1
            } else {
              if (rawContributors.innerHTML.includes('+')) {
                const betterContributors = parsedContent.querySelectorAll(`a[href="/${repo}/graphs/contributors"]`)[1].innerHTML
                contributors = textToNumbers(betterContributors.match(/[\d,]+/)[0])
              } else {
                contributors = textToNumbers(rawContributors.innerHTML)
                contributors = contributors === 0 ? 1 : contributors
              }
            }
          } catch (error) {
            logging.error(error)
            continue
          }

          let commits
          try {
            commits = textToNumbers(parsedContent.querySelector(`a[href="/${repo}/commits/${defaultBranch}"] > span > strong`).innerHTML)

            if (commits === null) {
              throw new Error('Could not find commits')
            }
          } catch (error) {
            logging.error(error)
            continue
          }

          scrapedInformation = {
            contributors,
            commits,
            scrapeTime: Date.now()
          }
        } catch (error) {
          logging.error(error)
          continue
        }

        try {
          await dbInsert({
            apiResponse: jsonApiResponse,
            fileTree,
            scrapedInformation,
            _rev: currentRecord._rev
          }, repo, tableConnection)
        } catch (error) {
          logging.error('Could not write to DB!')
          continue
        }
      }
      logging.info(`Finished processing ${file}, cleaning up.`)
      await exec(`rm -rf ${processedDirectory}/${file}`)
    }
  }
}

/**
 * For a given repo returns true/false depending on if the repo is in the DB
 * @param {String} repo - Repo to find in the DB
 * @param {DbConnection} connection - Connection to the DB
 */
async function dbEntryAlreadyExists (repo, connection) {
  try {
    await connection.head(repo)
    return true
  } catch (e) {
    return false
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
    // TODO: How are we going to be handling duplicates?
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
  if (!text) {
    console.log('Boom!')
  }

  if (Number.isInteger(text)) {
    return text
  }

  text = text.replaceAll(',', '')

  if (text.includes('k')) {
    text = text.replaceAll('k', '')
    return parseFloat(text) * 1000
  }

  return Number(text)
}

main()
