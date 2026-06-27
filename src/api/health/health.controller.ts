import { Controller, Get } from 'routing-controllers'
import { Context } from '../../util/context.js'
import { OkResponse } from '../interceptors/default.interceptor.js'

@Controller(`/healthz`)
export class HealthController {
	@Get(`/`)
	healthz() {
		return new OkResponse()
	}

	@Get(`/clients`)
	clients() {
		return { clients: Context.express.io.engine.clientsCount }
	}
}
