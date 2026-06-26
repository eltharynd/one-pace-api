import { Express } from '../api/express.js'
import { Scraper } from '../scraper/scraper.controller.js'

class ContextContainer {
	express: Express
	scraper: Scraper
}

export const Context = new ContextContainer()
