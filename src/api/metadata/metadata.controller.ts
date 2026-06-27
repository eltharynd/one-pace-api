import { Controller, Get, InternalServerError } from 'routing-controllers'
import { Context } from '../../util/context.js'

@Controller(`/metadata`)
export class MetadataController {
	@Get(`/`)
	metadata() {
		const metadata = Context.metadata.getAll()
		if (!metadata)
			return new InternalServerError(`Metadata not available internally`)

		return metadata
	}
}
