import { Type } from 'class-transformer'
import {
	IsArray,
	IsBoolean,
	IsDateString,
	IsNumber,
	IsObject,
	IsOptional,
	IsString,
	registerDecorator,
	ValidateNested,
	ValidationOptions,
} from 'class-validator'
import perfectExpressSanitizer from 'perfect-express-sanitizer'
import { BadRequestError } from 'routing-controllers'
import {
	ArcMetadata as ArcMetadataType,
	EpisodeFilesMetadata as EpisodeFilesMetadataType,
	EpisodeMetadata as EpisodeMetadataType,
	FileMetadata as FileMetadataType,
	Metadata as MetadataType,
} from '../../metadata/metadata.model.js'

export function IsSafeFromInjection(validationOptions?: ValidationOptions) {
	return function (object: Object, propertyName: string) {
		registerDecorator({
			name: 'isSafeFromInjection',
			target: object.constructor,
			propertyName,
			options: {
				message: `$property contains characters or patterns that aren't allowed`,
				...validationOptions,
			},
			validator: {
				async validate(value: any) {
					if (typeof value !== 'string') return true

					const xss = perfectExpressSanitizer.sanitize.detectXss(value, 4)
					if (xss)
						throw new BadRequestError(
							`Query contains possible xss injection attempt`,
						)
					const sql = perfectExpressSanitizer.sanitize.detectSqlInj(value, 4)
					if (sql)
						throw new BadRequestError(
							`Query contains possible sql injection attempt`,
						)
					const noSql = perfectExpressSanitizer.sanitize.detectNoSqlInj(
						value,
						4,
					)
					if (noSql)
						throw new BadRequestError(
							`Query contains possible noSql injection attempt`,
						)

					return !(xss || sql || noSql)
				},
			},
		})
	}
}

export class Metadata implements MetadataType {
	@IsDateString()
	lastUpdate: string

	@IsString()
	title: string
	@IsString()
	description: string

	@IsArray()
	@IsString({ each: true })
	genre: string[]
	@IsString()
	customRating: string

	@IsArray()
	@IsObject()
	@ValidateNested({ each: true })
	@Type(() => ArcMetadata)
	arcs: ArcMetadataType[]
}

export class ArcMetadata implements ArcMetadataType {
	@IsNumber()
	arc: number

	@IsString()
	saga: string
	@IsString()
	title: string
	@IsString()
	description: string

	@IsString()
	status: 'complete' | 'tbr' | 'wip'

	@IsString()
	mangaChapters: string
	@IsNumber()
	mangaChaptersCount: number

	@IsString()
	animeEpisodes: string
	@IsNumber()
	animeEpisodesCount: number

	@IsString()
	fillerEpisodes: string
	@IsNumber()
	paceEpisodesCount: number

	@IsNumber()
	animeMinutes: number
	@IsNumber()
	paceMinutes: number
	@IsNumber()
	savedMinutes: number
	@IsNumber()
	savedPercentage: number

	@IsArray()
	@IsString({ each: true })
	audioLanguages: string[]
	@IsArray()
	@IsString({ each: true })
	subLanguages: string[]
	@IsArray()
	@IsString({ each: true })
	subLanguagesPixeldrain: string[]

	@IsString()
	resolution: string

	@IsArray()
	@IsObject()
	@IsOptional()
	@ValidateNested({ each: true })
	@Type(() => EpisodeMetadata)
	episodes: EpisodeMetadataType[]
}

export class EpisodeMetadata implements EpisodeMetadataType {
	@IsNumber()
	arc: number
	@IsNumber()
	episode: number

	@IsString()
	title: string
	@IsString()
	description: string

	@IsArray()
	@IsString({ each: true })
	audioLanguages: string[]
	@IsArray()
	@IsString({ each: true })
	subLanguages: string[]
	@IsArray()
	@IsString({ each: true })
	subLanguagesPixeldrain: string[]

	@IsString()
	mangaChapters: string
	@IsString()
	animeEpisodes: string

	@IsString()
	released: string

	@IsOptional()
	@ValidateNested()
	@Type(() => EpisodeFilesMetadata)
	files: EpisodeFilesMetadataType
}

export class EpisodeFilesMetadata implements EpisodeFilesMetadataType {
	@ValidateNested()
	@Type(() => FileMetadata)
	standard: FileMetadataType

	@IsOptional()
	@ValidateNested()
	@Type(() => FileMetadata)
	extended?: FileMetadataType

	@IsOptional()
	@ValidateNested()
	@Type(() => FileMetadata)
	alternate?: FileMetadataType

	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => FileMetadata)
	archived?: FileMetadataType[]
}

export class FileMetadata implements FileMetadataType {
	@IsString()
	CRC32: string
	@IsString()
	@IsOptional()
	CRC32_inFileName?: string

	@IsString()
	hash: string
	@IsString()
	magnetURI: string

	@IsNumber()
	duration: number

	@IsBoolean()
	@IsOptional()
	partOfBundle?: boolean
}

export class EpisodeQuery {
	@IsSafeFromInjection()
	@IsString()
	query: string

	@IsOptional()
	@IsNumber()
	arc?: number

	@IsOptional()
	@IsBoolean()
	title?: boolean

	@IsOptional()
	@IsBoolean()
	description?: boolean
}
