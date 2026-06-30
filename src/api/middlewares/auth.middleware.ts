import { NextFunction, Request, Response } from 'express'
import {
	ExpressMiddlewareInterface,
	Middleware,
	Req,
	Res,
} from 'routing-controllers'
import environment from '../../environment.js'
import {
	ForbiddenErrorResponse,
	UnauthorizedErrorResponse,
} from '../interceptors/default.interceptor.js'

@Middleware({ type: 'before' })
export class AdminGuard implements ExpressMiddlewareInterface {
	async use(@Req() req: Request, @Res() res: Response, next: NextFunction) {
		const adminApiKey = req.header('Authorization')

		if (!adminApiKey) {
			return next(
				new UnauthorizedErrorResponse(
					`This resource is reserved for System Administrators`,
				),
			)
		}

		if (!adminApiKey || !environment.ADMIN_API_KEY) {
			return next(new ForbiddenErrorResponse(`This resource is not enabled`))
		}

		if (adminApiKey != environment.ADMIN_API_KEY) {
			return next(
				new ForbiddenErrorResponse(
					`This resource is reserved for System Administrators`,
				),
			)
		}

		environment.ADMIN_API_KEY
		return next()
	}
}
