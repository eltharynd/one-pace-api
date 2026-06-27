import { Controller, Get, InternalServerError } from 'routing-controllers'
import { ResponseSchema } from 'routing-controllers-openapi'
import { MetadataResponse } from '../../metadata/metadata.model.js'
import { Context } from '../../util/context.js'

@Controller(`/metadata`)
export class MetadataController {
	@Get(`/`)
	@ResponseSchema(MetadataResponse, {
		isArray: true,
	})
	metadata() {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			return new InternalServerError(`Metadata not available internally`)

		return metadata
	}
}
