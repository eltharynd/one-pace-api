import { NextFunction, Request, Response } from 'express'
import nocache from 'nocache'
import { ExpressMiddlewareInterface, Middleware } from 'routing-controllers'

@Middleware({ type: 'before' })
export class NoCacheMiddleware implements ExpressMiddlewareInterface {
	use(req: Request, res: Response, next: NextFunction): void {
		nocache()(req, res, next)
	}
}
