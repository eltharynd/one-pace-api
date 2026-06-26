import 'reflect-metadata'

import { Logger } from 'ez-ts-logger'

import { Express } from './api/express.js'
import environment from './environment.js'
import { MetadataController } from './metadata/metadata.controller.js'
import { RSSController } from './rss/rss.controller.js'
import { Scraper } from './scraper/scraper.controller.js'
import { Context } from './util/context.js'

const startApp = async () => {
	let gracefulClose = async () => {
		try {
			Logger.info('GRACEFULLY QUITTING APPLICATION...')

			//GRACEFUL QUIT HERE

			Logger.info('GRACEFULLY CLOSED APPLICATION...')
			process.exit(0)
		} catch (error) {
			Logger.error('COULD NOT GRACEFULLY CLOSE APPLICATION...')
			Logger.error(error)
		}
	}
	process.on('SIGINT', gracefulClose)
	process.on('SIGTERM', gracefulClose)

	try {
		Logger.info(`##################################`)
		Logger.info(`##################################`)
		Logger.info(`####                          ####`)
		Logger.info(
			`####     OnePacerr ${process.env.npm_package_version || 'NO_VERS'}${String('####').padStart(15 - (process.env.npm_package_version || 'NO_VERS').length, ' ')}`,
		)
		Logger.info(`####                          ####`)
		Logger.info(`##################################`)
		Logger.info(`##################################`)
		Logger.info('')
		Logger.info('STARTING APPLICATION...')

		Logger.info('INITIALIZING SCRAPING SERVICE...')
		Context.scraper = new Scraper()
		await Context.scraper.init()

		Logger.info('INITIALIZING RSS SERVICE...')
		Context.rss = new RSSController()
		await Context.rss.init()

		Logger.info('INITIALIZING METADATA...')
		Context.metadata = new MetadataController()
		await Context.metadata.init()

		if (!environment.SINGLE_MODE) {
			Logger.info('INITIALIZING EXPRESS SERVER...')
			Context.express = new Express()
			await Context.express.start()

			Logger.info('APPLICATION STARTED SUCCESSFULLY...')
		} else {
			Logger.info('APPLICATION EXECUTED SUCCESSFULLY...')
		}
	} catch (e) {
		Logger.error('APPLICATION COULD NOT BE STARTED...')
		Logger.error(e)
		return gracefulClose()
	}

	try {
	} catch (e) {
		Logger.error('APPLICATION CRASHED UNEXPECTEDLY...')
		Logger.error(e)
		gracefulClose()
	}
}
startApp()
