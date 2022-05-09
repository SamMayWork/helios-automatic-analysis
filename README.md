# helios-automatic-analysis

Contains all of the tools neccessary to run the helios suite of tools against GitHub.

---
## Index
 - [Scraping](#scraping)
   - [Running the Extractor](#running-the-extractor)
   - [Running the Processor](#running-the-processor)
   - [Running the Scraper](#running-the-scraper)
 - [Analysis and Graphing](#analysis-and-graphing)
   - [DB to CSV](#db-to-csv)
   - [Plotly Graphing](#plotly-graphing)
 - [Help](#help)

---
## Scraping

Running the scraper requires 3 components, the extractor, processor, and scraper. The 3 components are arranged in a pipeline and are neccessary to get the full tool up and running.

---
### Running the Extractor

To configure the extractor a file is needed in the root directory with the file name `currentTime.json`, this contains the following structure:

```JSON
{
    "year": 2022,
    "month": 1,
    "day": 1,
    "hour": 1
}
```

This tells the extractor which files to pull from ghArchive. Other than this the following values must be set:

```sh
export LOG_LEVEL=<debug|info|warn|error>
```

And then the extractor should be started by running

```sh
npm run extractor
```

---
### Running the Processor

To run the processor, ensure there is some content created by the extractor and then configure the env vars:

```sh
export LOG_LEVEL=<debug|info|warn|error>
```

And then start the processor with

```sh
npm run processor
```

---
### Running the Scraper

To run the scraper the following configuration must be set:

```sh
export COUCHDB_IP=<CouchDB Instance IP>
export COUCHDB_USERNAME=<CouchDB Username>
export COUCHDB_PASSWORD=<CouchDB Password>
export GH_PAT=<GitHub API Key>
export LOG_LEVEL=<debug|info|warn|error>
```

And then run:

```sh
npm run extractor
```

If the previous steps have been followed correctly and are successful, the pipeline will keep the scraper fed and crunching through records.

---
## Analysis and Graphing

---
### DB to CSV

To extract data out of the DB and convert it to CSV, set the following configuration:

```sh
export COUCHDB_IP=<CouchDB Instance IP>
export COUCHDB_USERNAME=<CouchDB Username>
export COUCHDB_PASSWORD=<CouchDB Password>
```

And then run 

```sh
npm run dbtocsv
```

To change the content put into CSV format, change the selector in the `scripts/dbToCsv.js` file to include the fields you wish. The default selector for commits/contributors is:

```JSON
{
  "selector": { 
    "scrapedInformation": { 
      "contributors": { 
        "$gt": 1 
      } 
    } 
  }, 
  "fields": ["_id", "scrapedInformation"]
}
```

---
### Plotly Graphing

To view the exported data in CSV format, `cd` into the `analysis/` dir and copy in your exported CSV file. Then run:

```sh
python3 graph.py
```

To start the graphing server.

---
## Help

### OH BLIMEY, WHAT ARE ALL OF THESE WGET ERRORS?

Run `npm run clean` to remove all in-progress workload, check the content of `currentTime.json` to see where the current marker is and then adjust accordingly.

### OH BLIMEY, WHAT ARE THESE ERRORS IN THE SCRAPER LOGS?

We use scraping to get content from the GitHub UI, sometimes the UI isn't consistent so therefore sometimes the scraping fails. In this case the document is droppped and not added to the DB (as we can't verify the correct figures). Errors are only a concern if there are a large number of them.

### OH BLIMEY, WHY DOES IT SAY THE PRIMARY RATE LIMIT HAS BEEN BREACHED?

API Keys can only be used 5,000 times an hour, if this tool breaches this limit it will automatically wait until the renewal time before scraping more data. Breaching the primary rate limit is a good signal as it means the tool is not being bottlenecked elsewhere.

### OH BLIMEY, WHY DOES IT SAY THE SECONDARY RATE LIMIT HAS BEEN BREACHED?

Even though GitHub provides 5,000 requests per hour there is a limit on the amount of requests per unit time, if the secondary rate limit is breached the tool will automatically wait until it is allowed to make requests again.

