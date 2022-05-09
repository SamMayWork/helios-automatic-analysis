const Logger = require('./logging')
const logging = new Logger('extractor', `./logs/extractor-${new Date().toLocaleTimeString('it-IT').replaceAll(':', '_')}`, process.env.LOG_LEVEL)
const { setTimeout } = require('timers/promises')
const fs = require('fs')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

/*
EXTRACTOR

This file gets log files from ghArchive and downlaods them onto the system, in .json.gz
format and then extracts them ready for the pre-processor to turn them into a list of repos.
This repo ensures that the INPUT_DIRECTORY always has some content to be processed through.

ENV VARS
  - INPUT_DIRECTORY     : Directory for the downloaded files to go into
  - EXTRACTED_DIRECTORY : Directory for the extracted files to be put into
  - EXTRACTED_MINIMUM   : Minimum count of files in the extracted directory
  - SATURATION_DELAY    : Time to wait if there enoguh files in the extracted directory
*/

const extractedDirectory = process.env.EXTRACTED_DIRECTORY || './extracted'

let fileLock = false
const extractedMinimum = process.env.EXTRACTED_MINIMUM || 20

let currentTime

async function main () {
  logging.info(`Starting extraction run @ ${(new Date()).toISOString()}`)

  currentTime = JSON.parse(fs.readFileSync('./currentTime.json', 'utf8'))

  while (true) {
    const filesWaitingToBeExtracted = fs.readdirSync(extractedDirectory).length

    // If the amount of files
    if (filesWaitingToBeExtracted < extractedMinimum && fileLock === false) {
      logging.info(`Count of files in ${extractedDirectory} is less than ${extractedMinimum}, getting new files.`)
      fileLock = true

      await getNewContent(currentTime)

      if (currentTime.day === 28 && currentTime.hour === 23) {
        currentTime.hour = 0
        currentTime.day = 1
        currentTime.month += 1
      } else if (currentTime.hour === 23) {
        currentTime.day += 1
        currentTime.hour = 0
      } else {
        currentTime.hour += 1
      }

      fs.writeFileSync('./currentTime.json', JSON.stringify(currentTime, null, 4))

      fileLock = false
      logging.info('Finished getting new files.')
    }

    if (filesWaitingToBeExtracted >= extractedMinimum) {
      // Wait 2 minutes so we don't overload the VM
      logging.info('No files waiting to be extracted, sufficient files waiting to be processed.')
      await setTimeout(process.env.SATURATION_DELAY || 120000)
    }
  }
}

/**
 * Converts a time object into a string that works with GH Archive
 * @param {Object} time - Time to process
 * @returns a string that represents the time object passed in
 */
function timeObjToString (time) {
  function prefixSingles (number) {
    if (number < 10) { return '0' + number }
    return number
  }
  return `${time.year}-${prefixSingles(time.month)}-${prefixSingles(time.day)}-${time.hour}`
}

/**
 * Downloads the given time from GH Archive and splits the files in the ./in directory
 * for processing and ingestion into the scraper
 * @param {Object} time - Current GH Archive time to process
 */
async function getNewContent (time) {
  try {
    const currentTimeString = timeObjToString(time)

    await exec(`wget https://data.gharchive.org/${currentTimeString}.json.gz`)
    await exec(`gunzip ./${currentTimeString}.json.gz`)
    await exec(`rm -rf ./${currentTimeString}.json.gz`)
    await exec(`split -l 1000 ./${currentTimeString}.json ${extractedDirectory}/$(uuidgen)__`)
    await exec(`rm -rf ${currentTimeString}.json`)
  } catch (error) {
    logging.error(error)
  }
}

main()
