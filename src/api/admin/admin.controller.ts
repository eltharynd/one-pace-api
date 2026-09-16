import { Controller, Get, UseBefore } from 'routing-controllers'
import { Context } from '../../util/context.js'
import { OkResponse } from '../interceptors/default.interceptor.js'
import { AdminGuard } from '../middlewares/auth.middleware.js'

const FORCE_UPDATES_DELAY = 300_000
@Controller(`/admin`)
export class AdminController {
	@Get(`/update/force`)
	@UseBefore(AdminGuard)
	healthz() {
		if (Context.express.isLeader) {
			Context.metadata.init(true)
		} else {
			Context.express.io.serverSideEmit('forced_update')
		}
		return new OkResponse()
	}
}
