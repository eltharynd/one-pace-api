import environment from '../environment.js'

import { defaultMetadataStorage } from 'class-transformer/cjs/storage.js'
import { validationMetadatasToSchemas } from 'class-validator-jsonschema'
import {
	RoutingControllersOptions,
	getMetadataArgsStorage,
} from 'routing-controllers'
import { routingControllersToSpec } from 'routing-controllers-openapi'

import { MetadataController } from '../metadata/metadata.controller.js'

const routingControllersOptions: RoutingControllersOptions = {
	controllers: [MetadataController],
	routePrefix: environment.API_BASE.replace(/\/$/, ''),
}
const schemas = validationMetadatasToSchemas({
	classTransformerMetadataStorage: defaultMetadataStorage,
	refPointerPrefix: '#/components/schemas/',
})
const storage = getMetadataArgsStorage()
export const SWAGGER_SPECS = routingControllersToSpec(
	storage,
	routingControllersOptions,
	{
		components: {
			schemas,
			securitySchemes: {
				basicAuth: {
					scheme: 'basic',
					type: 'http',
				},
			},
		},
		info: {
			description: 'Generated with `routing-controllers-openapi`',
			title: 'A sample API',
			version: '1.0.0',
		},
	},
)
