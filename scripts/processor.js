const fs = require('fs')
const { setTimeout } = require('timers/promises')
const { v4: uuidv4 } = require('uuid')

const Logger = require('./logging')
const logging = new Logger('processor', `./logs/processor-${new Date().toLocaleTimeString('it-IT').replaceAll(':', '_')}`, process.env.LOG_LEVEL)

const extractedDirectory = process.env.EXTRACTED_DIRECTORY || './extracted'
const processedDirectory = process.env.PROCESSED_DIRECTORY || './processed'

const processingQueueMax = process.env.PROCESSING_QUEUE_MAX || 50

/*
PROCESSOR

Processes files in the extracted directory and gets the repo names from the
entries and then puts them into files in the processed directory.

ENV VARS
  - PROCESSED_DIRECTORY  : Directory for the processed files to go into
  - EXTRACTED_DIRECTORY  : Directory for extracted files to be read from
  - PROCESSING_QUEUE_MAX : Maximum amount of files in the processing queue before stalling
  - SATURATION_DELAY     : Time to wait if there enoguh files in the processed directory
*/

async function main () {
  logging.info(`Starting processing run @ ${(new Date()).toISOString()}`)

  while (true) {
    const extractedFiles = fs.readdirSync(extractedDirectory)

    const processedFiles = fs.readdirSync(processedDirectory)
    if (processedFiles.length >= processingQueueMax) {
      logging.info('Hit max queue count for processed files, waiting...')
      await setTimeout(process.env.SATURATION_DELAY || 120000)
      continue
    }

    if (extractedFiles.length === 0) {
      logging.error('No extracted files to process, waiting...')
      await setTimeout(process.env.SATURATION_DELAY || 120000)
      continue
    }

    logging.info(`Found ${extractedFiles.length} files to process`)
    for (const file of extractedFiles) {
      const repos = {}
      logging.info(`Processing ${file}`)

      try {
        const content = fs.readFileSync(`${extractedDirectory}/${file}`, 'utf8')

        content.split('\n').forEach(line => {
          let repo
          try {
            repo = JSON.parse(line)
          } catch (error) {
            logging.error(error)
            return
          }
          const repoName = repo.repo.name
          const repoUrl = repo.repo.url

          if (repos[repoName] !== undefined) {
            // logging.warn(`Processed ${repoName} in this file previously, skipping...`)
            return
          }

          repos[repoName] = repoUrl
        })

        logging.info(`Finished processing ${file}`)
        fs.writeFileSync(`${processedDirectory}/${uuidv4()}.json`, JSON.stringify(repos, null, 4))
        fs.unlinkSync(`${extractedDirectory}/${file}`)
      } catch (error) {
        logging.error(error)
      }
    }
  }
}

main()
