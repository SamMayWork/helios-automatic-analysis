const fs = require('fs')
const fetch = require('node-fetch')

require('dotenv').config({ path: '../.env' })

/*

DB TO CSV

Gets all of the records that match the selector and then dumps the content to a CSV

This isn't as smooth as you might expect, some of the requests take 50ms, some take 3 seconds.

*/

// const query = {
//   selector: {
//     scrapedInformation: {
//       contributors: {
//         $gt: 1
//       }
//     }
//   }
// }

const query = {
  selector: {
    _id: {
      $gt: null
    }
  }
}

/**
 * Converts a row from the DB into the CSV string
 * @param {Object} row - Row from the DB
 * @returns A string that can be saved to a CSV file
 */
function objToCsvString (row) {
  // id,hasReadMe,hasCodeOfConduct,hasArchitecture,hasContributing,hasChangeLog,hasPages,hasWiki,license,topicsCount,commitCount,contributorsCount,starsCount,subscribersCount

  const hasReadme = hasFile('readme', row.fileTree?.tree) ? 1 : 0
  const hasCOC = hasFile('codeofconduct', row.fileTree?.tree) ? 1 : 0
  const hasArch = hasFile('architecture', row.fileTree?.tree) ? 1 : 0
  const hasContributing = hasFile('contributing', row.fileTree?.tree) ? 1 : 0
  const hasChangeLog = hasFile('changelog', row.filefileTree?.tree) ? 1 : 0
  const hasPages = row.apiResponse.has_pages ? 1 : 0
  const hasWiki = row.apiResponse.has_wiki ? 1 : 0
  const hasLicense = row.apiResponse.license ? 1 : 0
  const hasTopics = row.apiResponse.topics ? 1 : 0

  const numberOfFactors = hasReadme + hasCOC + hasArch + hasContributing + hasChangeLog + hasPages + hasWiki + hasLicense + hasTopics

  const commits = row.scrapedInformation.commits
  const contributors = row.scrapedInformation.contributors
  const watchers = row.apiResponse.watchers
  const subscribers = row.apiResponse.subscribers_count

  const bsContributionFactor = Math.round((contributors / commits) * 10000) / 10000
  const bsContributionFactor2 = Math.round((commits / contributors) * 10000) / 10000

  const variables = [
    row._id,
    hasReadme,
    hasCOC,
    hasArch,
    hasContributing,
    hasChangeLog,
    hasPages,
    hasWiki,
    hasLicense,
    hasTopics,
    commits,
    contributors,
    watchers,
    subscribers,
    numberOfFactors,
    bsContributionFactor,
    bsContributionFactor2
  ]

  return `${variables.join(',')}\n`
}

/**
 * Checks all permutations of a file name in the file tree
 * @param {String} fileCheck - Name of the file to look for (i.e. contributing.md)
 * @param {Array} files - Full File tree from the response
 */
function hasFile (fileCheck, files) {
  fileCheck = fileCheck.toLowerCase()

  if (!files) {
    return false
  }

  for (const file of files) {
    const fileName = file.path.toLowerCase().replaceAll('_', '').replaceAll('-', '')

    if (fileName === fileCheck ||
        fileName === fileCheck + '.md' ||
        fileName === fileCheck + '.markdown' ||
        fileName === fileCheck + '.rst') {
      return true
    }
  }

  return false
}

async function main () {
  fs.appendFileSync('./results.csv', 'id,hasReadMe,hasCodeOfConduct,hasArchitecture,hasContributing,hasChangeLog,hasPages,hasWiki,license,topicsCount,commitCount,contributorsCount,starsCount,subscribersCount,factors,bsContributors,bsCommits\n')
  let bookmark
  while (true) {
    let allRecords
    try {
      const allRecordsRequest = await fetch(`http://${process.env.COUCHDB_USERNAME}:${process.env.COUCHDB_PASSWORD}@${process.env.COUCHDB_IP}:5984/scraped_results_new/_find`, {
        method: 'post',
        body: JSON.stringify({ ...query, bookmark, limit: 500, update: false }),
        headers: {
          'Content-Type': 'application/json'
        }
      })

      allRecords = await allRecordsRequest.json()
    } catch (error) {
      console.error(error)
      return
    }

    if (bookmark === allRecords.bookmark) {
      console.log('All records processed')
      return
    }

    bookmark = allRecords.bookmark
    console.log(`Got next Bookmark: ${bookmark}`)

    while (allRecords.docs.length > 0) {
      const row = allRecords.docs.shift()
      if (!row?.apiResponse?.fork) {
        const csvString = objToCsvString(row)
        try {
          fs.appendFileSync('./results.csv', csvString)
        } catch (error) {
          console.error(error)
          return
        }
      }
    }
  }
}

main()
