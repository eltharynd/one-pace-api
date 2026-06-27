import {
	Controller,
	Get,
	InternalServerError,
	Param,
	QueryParam,
} from 'routing-controllers'
import { ResponseSchema } from 'routing-controllers-openapi'
import { Context } from '../../../util/context.js'
import { NotFoundErrorResponse } from '../../interceptors/default.interceptor.js'
import { ArcMetadata } from '../metadata.model.js'

@Controller(`/metadata/arcs`)
export class ArcController {
	@Get(`/`)
	@ResponseSchema(ArcMetadata, {
		isArray: true,
	})
	getEveryArc() {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		return metadata.arcs
	}

	@Get(`/:arc`)
	@ResponseSchema(ArcMetadata)
	getASpecificArc(
		@Param('arc') arc: number,
		@QueryParam('episodes') episodes: boolean,
		@QueryParam('files') files: boolean,
		@QueryParam('released-only') releasedOnly: boolean,
	) {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		const _arc = metadata.arcs.find(a => a.arc == arc)
		if (_arc) {
			if (!episodes) delete _arc.episodes
			else if (!releasedOnly)
				_arc.episodes = _arc.episodes.filter(e => !!e.released)
			else if (!files)
				_arc.episodes = _arc.episodes.map(e => {
					const buffer = e
					delete e.files
					return buffer
				})
			return _arc
		}
		throw new NotFoundErrorResponse(`No arc with specified number`)
	}
}
