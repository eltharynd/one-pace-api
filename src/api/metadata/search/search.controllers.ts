import {
	Controller,
	Get,
	InternalServerError,
	Param,
} from 'routing-controllers'
import { ResponseSchema } from 'routing-controllers-openapi'
import { Context } from '../../../util/context.js'
import { NotFoundErrorResponse } from '../../interceptors/default.interceptor.js'
import { EpisodeMetadata } from '../metadata.model.js'

@Controller(`/search`)
export class SearchController {
	@Get(`/crc32/:crc32`)
	@ResponseSchema(EpisodeMetadata)
	findAnEpisodeByCRC32(@Param('crc32') crc32: string) {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		let _found = metadata.arcs.find(a => {
			const _found = a.episodes.find(
				e =>
					e.files?.standard?.CRC32 == crc32 ||
					e.files?.extended?.CRC32 == crc32 ||
					e.files?.alternate?.CRC32 == crc32 ||
					!!e.files?.archived?.find(a => a.CRC32 == crc32),
			)
			if (_found) {
				a.episodes = [_found]
				return true
			}
			return false
		})

		if (!_found)
			throw new NotFoundErrorResponse(
				`No episode found that matches provided CRC32`,
			)

		_found.episodes[0]
	}
}
