import 'reflect-metadata'

import { Logger } from 'ez-ts-logger'

import { Express } from './api/express.js'
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
			`####     OnePacerr ${process.env.npm_package_version}${String('####').padStart(15 - process.env.npm_package_version.length, ' ')}`,
		)
		Logger.info(`####                          ####`)
		Logger.info(`##################################`)
		Logger.info(`##################################`)
		Logger.info('')
		Logger.info('STARTING APPLICATION...')

		Logger.info('INITIALIZING EXPRESS SERVER...')
		Context.express = new Express()
		await Context.express.start()

		Logger.info('APPLICATION STARTED SUCCESSFULLY...')
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
