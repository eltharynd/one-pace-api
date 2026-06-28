import { isNumber } from 'class-validator'
import {
	BadRequestError,
	Get,
	InternalServerError,
	JsonController,
	Param,
	QueryParams,
} from 'routing-controllers'
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi'
import { Context } from '../../../util/context.js'
import { NotFoundErrorResponse } from '../../interceptors/default.interceptor.js'
import { EpisodeMetadata, EpisodeQuery } from '../metadata.model.js'

@JsonController(`/search`)
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

	@Get(`/episode`)
	@OpenAPI({
		parameters: [
			{
				in: 'query',
				name: 'search query',
				description: `If wrapped in quotes (eg: "Straw Hats") searches for an exact match, if not searches for any of the words (eg: Straw Hats => either "Straw" or "Hats"). Case in-sensitive.`, // Add description here
				required: true,
				schema: { type: 'string' },
			},
		],
	})
	@ResponseSchema(EpisodeMetadata, { isArray: true })
	findAnEpisodeByQuery(@QueryParams() episodeQuery: EpisodeQuery) {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		const { query, arc, title, description } = episodeQuery
		if (!(query?.length >= 3)) {
			throw new BadRequestError(`Query must be at least 3 chars long`)
		} else if (!(query?.length > 0)) {
			throw new BadRequestError(`Empty query`)
		}

		let _episodes: EpisodeMetadata[] = metadata.arcs
			.filter(a => !isNumber(arc) || arc == a.arc)
			.flatMap(a => a.episodes)

		if (/^['"`‘’“”‹›«»].*['"`‘’“”‹›«»]$/.test(query)) {
			const RE = new RegExp(normalize(query), 'i')
			let _found = _episodes.filter(
				e =>
					(!title &&
						!description &&
						(RE.test(normalize(e.title)) ||
							RE.test(normalize(e.description)))) ||
					(title && RE.test(normalize(e.title))) ||
					(description && RE.test(normalize(e.description))),
			)

			return _found
		} else {
			const keywords = normalize(query).split(' ')
			const REs = keywords.map(k => new RegExp(k, 'i'))

			let _found = _episodes.filter(e => {
				return (
					(!title &&
						!description &&
						(REs.find(re => re.test(normalize(e.title))) ||
							REs.find(re => re.test(normalize(e.description))))) ||
					(title && REs.find(re => re.test(normalize(e.title)))) ||
					(description && REs.find(re => re.test(normalize(e.description))))
				)
			})

			return _found
		}
	}
}

const normalize = (query: string) => {
	if (query && typeof query === 'string')
		return query
			.replaceAll(/['"`‘’“”‹›«»]/g, '')
			.replaceAll(/[,:;\.\-_]/g, ' ')
			.replaceAll(/\s{1,}/g, ' ')
			.trim()
	else return query
}
