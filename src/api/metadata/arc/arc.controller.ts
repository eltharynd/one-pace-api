import {
	Controller,
	Get,
	InternalServerError,
	Params,
	QueryParam,
} from 'routing-controllers'
import { ResponseSchema } from 'routing-controllers-openapi'
import { Context } from '../../../util/context.js'
import { NotFoundErrorResponse } from '../../interceptors/default.interceptor.js'
import { ArcMetadata, SanitizedParams } from '../metadata.model.js'

@Controller(`/metadata/arcs`)
export class ArcController {
	@Get(`/`)
	@ResponseSchema(ArcMetadata, {
		isArray: true,
	})
	getEveryArc(
		@QueryParam('episodes') episodes: boolean,
		@QueryParam('files') files: boolean,
		@QueryParam('complete-only') completeOnly: boolean,
		@QueryParam('to-be-redone-only') toBeRedoneOnly: boolean,
		@QueryParam('released-only') releasedOnly: boolean,
	) {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		if (completeOnly) {
			metadata.arcs = metadata.arcs.filter(a => a.status != 'wip')
		} else if (toBeRedoneOnly)
			metadata.arcs = metadata.arcs.filter(a => a.status == 'tbr')

		for (let _arc of metadata.arcs) {
			if (!episodes) delete _arc.episodes
			else if (releasedOnly)
				_arc.episodes = _arc.episodes.filter(e => !!e.released)
			else if (!files)
				_arc.episodes = _arc.episodes.map(e => {
					const buffer = e
					delete e.files
					return buffer
				})
		}
		return metadata.arcs
	}

	@Get(`/:arc`)
	@ResponseSchema(ArcMetadata)
	getASpecificArc(
		@Params() sanitizedParams: SanitizedParams,
		@QueryParam('episodes') episodes: boolean,
		@QueryParam('files') files: boolean,
		@QueryParam('released-only') releasedOnly: boolean,
	) {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		const { arc } = sanitizedParams

		const _arc = metadata.arcs.find(a => a.arc == arc)
		if (_arc) {
			if (!episodes) delete _arc.episodes
			else if (releasedOnly)
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
