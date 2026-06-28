import {
	Controller,
	Get,
	InternalServerError,
	Param,
	Params,
	QueryParam,
} from 'routing-controllers'
import { ResponseSchema } from 'routing-controllers-openapi'
import { Context } from '../../../util/context.js'
import { NotFoundErrorResponse } from '../../interceptors/default.interceptor.js'
import { EpisodeMetadata, SanitizedParams } from '../metadata.model.js'

@Controller(`/metadata`)
export class EpisodeController {
	@Get(`/episodes`)
	@ResponseSchema(EpisodeController, {
		isArray: true,
	})
	getAllEpisodes(
		@QueryParam('files') files: boolean,
		@QueryParam('released-only') releasedOnly: boolean,
	) {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		let _episodes: EpisodeMetadata[] = metadata.arcs.flatMap(a => a.episodes)
		if (releasedOnly) _episodes = _episodes.filter(e => !!e.released)
		if (!files)
			_episodes = _episodes.map(e => {
				const buffer = e
				delete e.files
				return buffer
			})
		return _episodes
	}

	@Get(`/arcs/:arc/episodes`)
	@ResponseSchema(EpisodeMetadata, {
		isArray: true,
	})
	getAllEpisodesOfAnArc(
		@Params() sanitizedParams: SanitizedParams,
		@QueryParam('files') files: boolean,
		@QueryParam('released-only') releasedOnly: boolean,
	) {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		const { arc } = sanitizedParams
		const _arcs = metadata.arcs.find(a => a.arc == arc)
		if (!_arcs) throw new NotFoundErrorResponse(`No arc with specified number`)

		let _episodes = _arcs.episodes
		if (_episodes) {
			if (releasedOnly) _episodes = _episodes.filter(e => !!e.released)
			if (!files)
				_episodes.map(e => {
					const buffer = e
					delete buffer.files
					return buffer
				})
			return _episodes
		}
		throw new NotFoundErrorResponse(`No episode with specified number`)
	}

	@Get(`/arcs/:arc/episodes/:episode`)
	@ResponseSchema(EpisodeMetadata)
	getASpecificEpisode(
		@Param('arc') arc: number,
		@Param('episode') episode: number,
		@QueryParam('files') files: boolean,
		@QueryParam('released-only') releasedOnly: boolean,
	) {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		const _arcs = metadata.arcs.find(a => a.arc == arc)
		if (!_arcs) throw new NotFoundErrorResponse(`No arc with specified number`)

		const _episode = _arcs.episodes.find(
			e => e.episode == episode && (!releasedOnly || !!e.released),
		)
		if (_episode) {
			if (!files) delete _episode.files
			return _episode
		}
		throw new NotFoundErrorResponse(`No episode with specified number`)
	}
}
