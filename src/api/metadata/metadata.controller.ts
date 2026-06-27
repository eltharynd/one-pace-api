import { Controller, Get, InternalServerError } from 'routing-controllers'
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi'
import { Context } from '../../util/context.js'
import { Metadata } from './metadata.model.js'

@Controller(`/metadata`)
export class MetadataController {
	@Get(`/`)
	@ResponseSchema(Metadata, {
		isArray: true,
	})
	getTheWholeMetadataSet() {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		return metadata
	}

	@Get(`/update`)
	@OpenAPI({
		description: 'Returns the ISO 8601 timestamp of the last metadata update',
		responses: {
			'200': {
				description: 'ISO timestamp string',
				content: {
					'application/json': {
						schema: {
							type: 'string',
							format: 'date-time',
							example: '2026-06-27T10:15:30.000Z',
						},
					},
				},
			},
		},
	})
	getLastUpdate() {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			throw new InternalServerError(`Metadata not available internally`)

		return new Date(metadata.lastUpdate).toISOString()
	}
}
