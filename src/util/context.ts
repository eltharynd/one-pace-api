import { Express } from '../api/express.js'
import { MetadataController } from '../metadata/metadata.controller.js'
import { RSSController } from '../rss/rss.controller.js'
import { Scraper } from '../scraper/scraper.controller.js'

class ContextContainer {
	express: Express
	scraper: Scraper
	rss: RSSController
	metadata: MetadataController
}

export const Context = new ContextContainer()
