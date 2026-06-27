import { Controller, Get, InternalServerError } from 'routing-controllers'
import { ResponseSchema } from 'routing-controllers-openapi'
import { Context } from '../../util/context.js'
import { Metadata } from './metadata.model.js'

@Controller(`/metadata`)
export class MetadataController {
	@Get(`/`)
	@ResponseSchema(Metadata, {
		isArray: true,
	})
	metadata() {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			return new InternalServerError(`Metadata not available internally`)

		return metadata
	}
}
