import express from 'express'
import { Logger } from 'ez-ts-logger'
import EventEmitter from 'node:events'
import { createServer, Server } from 'node:http'
import { createClient } from 'redis'
import { createExpressServer } from 'routing-controllers'
import { Server as SocketIOServer } from 'socket.io'
import swaggerUIExpress from 'swagger-ui-express'

import { createAdapter } from '@socket.io/redis-adapter'
import environment from '../environment.js'
import { MetadataController } from '../metadata/metadata.controller.js'
import { RSSController } from '../rss/rss.controller.js'
import { Scraper } from '../scraper/scraper.controller.js'
import { Context } from '../util/context.js'
import { AdminController } from './admin/admin.controller.js'
import { HealthController } from './health/health.controller.js'
import { DefaultInterceptor } from './interceptors/default.interceptor.js'
import { ArcController } from './metadata/arc/arc.controller.js'
import { EpisodeController } from './metadata/episode/episode.controller.js'
import { FilesController } from './metadata/files/files.controller.js'
import { MetadataController as RESTMetadataController } from './metadata/metadata.controller.js'
import { SearchController } from './metadata/search/search.controller.js'
import { HttpErrorHandler } from './middlewares/error.middleware.js'
import { LoggerMiddleware } from './middlewares/logger.middleware.js'
import { NoCacheMiddleware } from './middlewares/nocache.middleware.js'
import { SWAGGER_SPECS } from './swagger.js'

const LEADER_KEY = 'app:leader'
const LEADER_TTL_MS = 10000

export class Express {
	private origins = [`https://onepacerr.com`, `https://www.onepacerr.com`]

	private app: express.Express
	private server: Server

	io: SocketIOServer

	private pubClient
	private subClient
	isLeader: boolean = false
	private leaderInterval

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

				AdminController,

				RESTMetadataController,
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
		this.pubClient = createClient({
			url: environment.REDIS_URL,
			socket: {
				reconnectStrategy: retries => {
					const delay = Math.min(retries * 100, 5000)
					Logger.warn(
						`Redis reconnect attempt ${retries}, retrying in ${delay}ms`,
					)
					return delay
				},
			},
		})
		this.subClient = this.pubClient.duplicate()

		this.pubClient.on('error', err =>
			Logger.error(`Redis pubClient error: ${err.message}`),
		)
		this.subClient.on('error', err =>
			Logger.error(`Redis subClient error: ${err.message}`),
		)

		this.pubClient.on('reconnecting', () =>
			Logger.warn('Redis pubClient reconnecting...'),
		)
		this.pubClient.on('ready', () =>
			Logger.info('Redis pubClient reconnected and ready'),
		)

		this.subClient.on('reconnecting', () =>
			Logger.warn('Redis subClient reconnecting...'),
		)
		this.subClient.on('ready', () =>
			Logger.info('Redis subClient reconnected and ready'),
		)

		Promise.all([this.pubClient.connect(), this.subClient.connect()])
			.then(() => {
				Logger.info(`Successfully connected to redis`)
			})
			.catch(error => {
				Logger.error(`Could not connect to redis...`)
				Logger.error(error)
			})
			.finally(() => {
				this.io = new SocketIOServer(this.server, {
					adapter: createAdapter(this.pubClient, this.subClient),
				})

				this.io.on('connection', async socket => {
					Logger.debug(`Socket ${socket.id} connected`)
					Logger.info(
						`Client connected, total clients: ${(await this.io.fetchSockets()).length}`,
					)

					socket.on('subscribe_to_updates', () => {
						Logger.debug(`Socket ${socket.id} joined 'updates'`)
						socket.join('updates')
					})

					socket.on('unsubscribe_from_updates', () => {
						Logger.debug(`Socket ${socket.id} left 'updates'`)
						socket.leave('updates')
					})

					socket.on('disconnect', async () => {
						Logger.debug(`Socket ${socket.id} disconnected`)
						Logger.info(
							`Client disconnected, total clients: ${(await this.io.fetchSockets()).length}`,
						)
					})
				})

				this.io.on('leader_elected', data => {
					Logger.info(`Received updates from leader`)
					Context.scraper.scrapedEpisodeGuide = data.scraper.scrapedEpisodeGuide
					Context.scraper.scrapedEpisodeDescriptions =
						data.scraper.scrapedEpisodeDescriptions
					Context.rss.feed = data.rss
					Context.metadata.metadata = data.metadata
				})

				this.io.on('forced_update', () => {
					if (Context.express.isLeader) {
						Logger.info(`Received forced update`)
						Context.metadata.init(true)
					}
				})

				setInterval(() => this.tryBecomeLeader(), LEADER_TTL_MS / 2)
				this.tryBecomeLeader()
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

		setTimeout(() => {
			this.eventEmitter.emit('listening')
			this.listening = true
		}, 10000)
	}

	async waitForActive() {
		Logger.debug(`Waiting for express to be listening...`)

		return await new Promise<void>(resolve => {
			if (this.listening) return resolve()
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

	private async startProcessing() {
		Logger.info('INITIALIZING SCRAPING SERVICE...')
		if (!Context.scraper) Context.scraper = new Scraper()
		await Context.scraper.init()

		Logger.info('INITIALIZING RSS SERVICE...')
		if (!Context.rss) Context.rss = new RSSController()
		await Context.rss.init()

		Logger.info('INITIALIZING METADATA...')
		if (!Context.metadata) Context.metadata = new MetadataController()
		await Context.metadata.init()

		if (this.leaderInterval) {
			clearInterval(this.leaderInterval)
			this.leaderInterval = null
		}

		this.leaderInterval = setInterval(async () => {
			try {
				Logger.info(`Refreshing Google Sheets`)
				await Context.scraper.init()
				Logger.info(`Refreshing RSS feed`)
				await Context.rss.init()
				Logger.info(`Refreshing Metadata`)
				await Context.metadata.init()
			} catch (e) {
				Logger.error(`Error trying to refresh data`)
				Logger.error(e)
			}
		}, environment.SCRAPE_INTERVAL)
	}

	private async stopProcessing() {
		Logger.info('STOPPING SCRAPING SERVICE...')
		if (Context.scraper) {
			Context.scraper = null
		}

		Logger.info('STOPPING RSS SERVICE...')
		if (Context.rss) {
			Context.rss = null
		}

		Logger.info('STOPPING METADATA...')
		if (Context.metadata) {
			Context.metadata = null
		}

		if (this.leaderInterval) {
			clearInterval(this.leaderInterval)
			this.leaderInterval = null
		}
	}

	private async tryBecomeLeader() {
		const instanceId = process.env.RAILWAY_REPLICA_ID || process.pid.toString()

		// SET key value NX PX ttl — only succeeds if no one currently holds it
		const acquired = await this.pubClient.set(LEADER_KEY, instanceId, {
			NX: true,
			PX: LEADER_TTL_MS,
		})

		if (acquired) {
			this.isLeader = true
			Logger.info(`This instance (${instanceId}) is now the leader`)
			await this.startProcessing()
		} else if (this.isLeader) {
			// We think we're leader — renew our lease if we still hold the key
			const current = await this.pubClient.get(LEADER_KEY)
			if (current === instanceId) {
				await this.pubClient.pExpire(LEADER_KEY, LEADER_TTL_MS)
			} else {
				this.isLeader = false
				Logger.warn('Lost leadership')
				await this.stopProcessing()
			}
		}
	}
}
