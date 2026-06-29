import express from 'express'
import { Logger } from 'ez-ts-logger'
import EventEmitter from 'node:events'
import { Server, createServer } from 'node:http'
import { createExpressServer } from 'routing-controllers'
import { Server as SocketIOServer } from 'socket.io'
import swaggerUIExpress from 'swagger-ui-express'
import environment from '../environment.js'
import { HealthController } from './health/health.controller.js'
import { DefaultInterceptor } from './interceptors/default.interceptor.js'
import { ArcController } from './metadata/arc/arc.controller.js'
import { EpisodeController } from './metadata/episode/episode.controller.js'
import { FilesController } from './metadata/files/files.controller.js'
import { MetadataController } from './metadata/metadata.controller.js'
import { SearchController } from './metadata/search/search.controller.js'
import { HttpErrorHandler } from './middlewares/error.middleware.js'
import { LoggerMiddleware } from './middlewares/logger.middleware.js'
import { NoCacheMiddleware } from './middlewares/nocache.middleware.js'
import { SWAGGER_SPECS } from './swagger.js'

export class Express {
	private origins = [`https://onepacerr.com`, `https://www.onepacerr.com`]

	private app: express.Express
	private server: Server

	io: SocketIOServer

	private listening: boolean = false
	private eventEmitter: EventEmitter = new EventEmitter()

	constructor() {
		this.app = createExpressServer({
			cors: {
				origin: this.origins,
				optionsSuccessStatus: 200,
				credentials: true,
			},
			routePrefix: environment.API_BASE.replace(/\/$/, ''),
			defaultErrorHandler: false,
			middlewares: [NoCacheMiddleware, LoggerMiddleware, HttpErrorHandler],
			controllers: [
				HealthController,

				MetadataController,
				ArcController,
				EpisodeController,
				FilesController,

				SearchController,
			],
			interceptors: [DefaultInterceptor],
			validation: { whitelist: true, forbidNonWhitelisted: true },
			classToPlainTransformOptions: {
				enableCircularCheck: true,
			},
		})

		this.app.set('trust proxy', true)
		this.app.use(
			`${environment.API_BASE}docs`,
			swaggerUIExpress.serve,
			swaggerUIExpress.setup(SWAGGER_SPECS),
			// swaggerUIExpress.setup(SWAGGER_SPECS, {
			// 	customCss:
			// 		readFileSync(
			// 			path.join(process.cwd(), 'docs/theme-flattop.css'),
			// 		).toString() +
			// 		readFileSync(path.join(process.cwd(), 'docs/custom.css')).toString(),
			// }),
		)

		this.server = createServer(this.app)
		this.io = new SocketIOServer(this.server)

		this.io.on('connection', socket => {
			Logger.debug(`Socket ${socket.id} connected`)
			Logger.info(`Clients connected: ${this.io.engine.clientsCount}`)

			socket.on('subscribe_to_updates', () => {
				Logger.debug(`Socket ${socket.id} joined 'updates'`)
				socket.join('updates')
			})

			socket.on('unsubscribe_from_updates', () => {
				Logger.debug(`Socket ${socket.id} left 'updates'`)
				socket.leave('updates')
			})

			socket.on('disconnect', () => {
				Logger.debug(`Socket ${socket.id} disconnected`)
				Logger.info(`Clients connected: ${this.io.engine.clientsCount}`)
			})
		})
	}

	async start(portOverride?: number) {
		await new Promise<Server>((resolve, reject) => {
			this.server.listen(portOverride || environment.PORT)
			this.server.on('error', error => {
				Logger.error(error)
				reject(error)
			})
			this.server.on('listening', () => {
				resolve(this.server)
			})
		})

		this.eventEmitter.emit('listening')
	}

	async waitForActive() {
		Logger.debug(`Waiting for express to be listening...`)

		return await new Promise<void>(resolve => {
			if (this.listening) return
			const listener = () => {
				this.eventEmitter.removeListener('listening', listener)
				Logger.debug(`Express sending listening event...`)
				resolve()
			}
			this.eventEmitter.addListener('listening', listener)
			const handler = setInterval(() => {
				if (this.listening) {
					Logger.debug(`Express sending listening event...`)
					clearInterval(handler)
					resolve()
				}
			}, 2000)
		})
	}
}
