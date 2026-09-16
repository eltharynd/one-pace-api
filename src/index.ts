import 'reflect-metadata'
import environment from './environment.js'

import { Logger } from 'ez-ts-logger'

import { Express } from './api/express.js'
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
			`####    One Pace API ${process.env.npm_package_version || 'NO_VERS'}${String('####').padStart(13 - (process.env.npm_package_version || 'NO_VERS').length, ' ')}`,
		)
		Logger.info(`####                          ####`)
		Logger.info(`##################################`)
		Logger.info(`##################################`)
		Logger.info('')
		Logger.info('STARTING APPLICATION...')

		Context.express = new Express()
		if (!Context.scraper) Context.scraper = new Scraper()
		if (!Context.rss) Context.rss = new RSSController()
		if (!Context.metadata) Context.metadata = new MetadataController()

		if (!environment.SINGLE_MODE) {
			Logger.info('INITIALIZING EXPRESS SERVER...')
			await Context.express.start()

			Logger.info('APPLICATION STARTED SUCCESSFULLY...')
		} else {
			Logger.info('APPLICATION EXECUTED SUCCESSFULLY...')
			return
		}
	} catch (e) {
		Logger.error('APPLICATION COULD NOT BE STARTED...')
		if (environment.SINGLE_MODE) {
			Logger.errorAndThrow(e)
		} else Logger.error(e)
		return gracefulClose()
	}
}
startApp()
