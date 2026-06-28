import environment from '../environment.js'

import { defaultMetadataStorage } from 'class-transformer/cjs/storage.js'
import { validationMetadatasToSchemas } from 'class-validator-jsonschema'
import {
	RoutingControllersOptions,
	getMetadataArgsStorage,
} from 'routing-controllers'
import { routingControllersToSpec } from 'routing-controllers-openapi'

import { MetadataController } from '../metadata/metadata.controller.js'
import { ArcController } from './metadata/arc/arc.controller.js'
import { EpisodeController } from './metadata/episode/episode.controller.js'
import { FilesController } from './metadata/files/files.controller.js'
import { SearchController } from './metadata/search/search.controller.js'

const routingControllersOptions: RoutingControllersOptions = {
	controllers: [
		MetadataController,
		ArcController,
		EpisodeController,
		FilesController,

		SearchController,
	],
	routePrefix: environment.API_BASE.replace(/\/$/, ''),
}
const schemas = validationMetadatasToSchemas({
	classTransformerMetadataStorage: defaultMetadataStorage,
	refPointerPrefix: '#/components/schemas/',
})

const storage = getMetadataArgsStorage()

const includedNames = new Set(
	(routingControllersOptions.controllers as Function[]).map(c => c.name),
)

const specStorage = Object.assign(
	Object.create(Object.getPrototypeOf(storage)),
	storage,
	{
		controllers: storage.controllers.filter(c =>
			includedNames.has(c.target.name),
		),
		actions: storage.actions.filter(a => includedNames.has(a.target.name)),
	},
)

export const SWAGGER_SPECS = routingControllersToSpec(
	specStorage,
	routingControllersOptions,
	{
		components: {
			schemas,
			// securitySchemes: {
			// 	basicAuth: {
			// 		scheme: 'basic',
			// 		type: 'http',
			// 	},
			// },
		},
		info: {
			description:
				'A Public API for One Pace episodes Metadata.\n built for <a href="https://github.com/eltharynd/OnePacerr">OnePacerr</a>, available to everyone!',
			title: 'One Pace Metadata API',
			version: process.env.npm_package_version,
		},
	},
)
