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
import { EpisodeMetadata, SanitizedParams } from '../metadata.model.js'

@Controller(`/metadata`)
export class FilesController {
	@Get(`/arcs/:arc/episodes/:episode/files`)
	@ResponseSchema(EpisodeMetadata, {
		isArray: true,
	})
	getAllFilesForAnEpisode(
		@Params() sanitizedParams: SanitizedParams,
		@QueryParam('released-only') releasedOnly: boolean,
	) {
		const { arc, episode } = sanitizedParams

		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		const _arcs = metadata.arcs.find(a => a.arc == arc)
		if (!_arcs) throw new NotFoundErrorResponse(`No arc with specified number`)

		const _episode = _arcs.episodes.find(
			e => e.episode == episode && (!releasedOnly || !!e.released),
		)
		if (_episode?.files) {
			return _episode.files
		}
		throw new NotFoundErrorResponse(`No episode with specified number`)
	}
}
