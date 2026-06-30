import {
	BadRequestError,
	Controller,
	Get,
	UseBefore,
} from 'routing-controllers'
import { Context } from '../../util/context.js'
import { OkResponse } from '../interceptors/default.interceptor.js'
import { AdminGuard } from '../middlewares/auth.middleware.js'

const FORCE_UPDATES_DELAY = 300_000
@Controller(`/admin`)
export class AdminController {
	lastForcedUpdate: Date = new Date()

	@Get(`/update/force`)
	@UseBefore(AdminGuard)
	healthz() {
		const currently = new Date()

		if (
			currently.getTime() <
			this.lastForcedUpdate.getTime() + FORCE_UPDATES_DELAY
		) {
			return new BadRequestError(
				`Not enogh time passed from thast forced update, wait another ${
					(this.lastForcedUpdate.getTime() +
						FORCE_UPDATES_DELAY -
						currently.getTime()) /
					1000 /
					60
				} minutes...`,
			)
		} else {
			Context.metadata.init(true)
			return new OkResponse()
		}
	}
}
