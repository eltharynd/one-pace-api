import express from 'express'
import { Logger } from 'ez-ts-logger'
import { Server, createServer } from 'node:http'
import { createExpressServer } from 'routing-controllers'
import swaggerUIExpress from 'swagger-ui-express'
import environment from '../environment.js'
import { HealthController } from './health/health.controller.js'
import { DefaultInterceptor } from './interceptors/default.interceptor.js'
import { ArcController } from './metadata/arc/arc.controller.js'
import { EpisodeController } from './metadata/episode/episode.controller.js'
import { FilesController } from './metadata/files/files.controller.js'
import { MetadataController } from './metadata/metadata.controller.js'
import { HttpErrorHandler } from './middlewares/error.middleware.js'
import { LoggerMiddleware } from './middlewares/logger.middleware.js'
import { SWAGGER_SPECS } from './swagger.js'

export class Express {
	origins = [`https://onepacerr.com`, `https://www.onepacerr.com`]

	app: express.Express
	server: Server

	constructor() {
		this.app = createExpressServer({
			cors: {
				origin: this.origins,
				optionsSuccessStatus: 200,
				credentials: true,
			},
			routePrefix: environment.API_BASE.replace(/\/$/, ''),
			defaultErrorHandler: false,
			middlewares: [LoggerMiddleware, HttpErrorHandler],
			controllers: [
				HealthController,

				MetadataController,
				ArcController,
				EpisodeController,
				FilesController,
			],
			interceptors: [DefaultInterceptor],
			validation: { whitelist: true },
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
	}

	async start(portOverride?: number): Promise<Server> {
		return new Promise<Server>((resolve, reject) => {
			this.server.listen(portOverride || environment.PORT)
			this.server.on('error', error => {
				Logger.error(error)
				reject(error)
			})
			this.server.on('listening', () => resolve(this.server))
		})
	}
}
