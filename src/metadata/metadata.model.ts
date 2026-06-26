export type Metadata = {
	lastUpdate: string

	title: string
	description: string

	genre: string[]
	customRating: string

	arcs: ArcMetadata[]
}

export type ArcMetadata = {
	arc: number

	saga: string
	title: string
	description: string

	status: 'complete' | 'tbr' | 'wip'

	mangaChapters: string
	mangaChaptersCount: number

	animeEpisodes: string
	animeEpisodesCount: number

	fillerEpisodes: string
	paceEpisodesCount: number

	animeMinutes: number
	paceMinutes: number
	savedMinutes: number
	savedPercentage: number

	audioLanguages: string[]
	subLanguages: string[]
	subLanguagesPixeldrain: string[]

	resolution: string

	episodes: EpisodeMetadata[]
}
export const ARC_METADATA_KEY_ORDER = [
	'arc',
	'saga',
	'title',
	'description',
	'status',
	'mangaChapters',
	'mangaChaptersCount',
	'animeEpisodes',
	'animeEpisodesCount',
	'fillerEpisodes',
	'paceEpisodesCount',
	'animeMinutes',
	'paceMinutes',
	'savedMinutes',
	'savedPercentage',
	'audioLanguages',
	'subLanguages',
	'subLanguagesPixeldrain',
	'resolution',
	'episodes',
] as const satisfies readonly (keyof ArcMetadata)[]

export type EpisodeMetadata = {
	arc: number
	episode: number

	title: string
	description: string

	audioLanguages: string[]
	subLanguages: string[]
	subLanguagesPixeldrain: string[]

	mangaChapters: string
	animeEpisodes: string

	released: string

	files: EpisodeFilesMetadata
}
export const EPISODE_METADATA_KEY_ORDER = [
	'arc',
	'episode',
	'title',
	'description',
	'audioLanguages',
	'subLanguages',
	'subLanguagesPixeldrain',
	'mangaChapters',
	'animeEpisodes',
	'released',
	'files',
] as const satisfies readonly (keyof EpisodeMetadata)[]

export type EpisodeFilesMetadata = {
	standard: FileMetadata
	extended?: FileMetadata
	alternate?: FileMetadata

	archived?: FileMetadata[] //missing
}
export const EPISODE_FILES_METADATA_KEY_ORDER = [
	'standard',
	'extended',
	'alternate',
	'archived',
] as const satisfies readonly (keyof EpisodeFilesMetadata)[]

export type FileMetadata = {
	CRC32: string
	CRC32_inFileName?: string

	hash: string //missing
	magnetURI: string //missing

	duration: number

	partOfBundle?: boolean //missing
}
export const FILE_METADATA_KEY_ORDER = [
	'CRC32',
	'CRC32_inFileName',
	'hash',
	'magnetURI',
	'duration',
	'partOfBundle',
] as const satisfies readonly (keyof FileMetadata)[]

export function reorderMetadata(
	metadata: RecursivePartial<Metadata>,
): Metadata {
	const buffer: RecursivePartial<Metadata> = {
		title: 'One Piece',
		description:
			'As a child, Monkey D. Luffy dreamed of becoming King of the Pirates. But his life changed when he accidentally gained the power to stretch like rubber... at the cost of never being able to swim again! Years later, Luffy sets off in search of the "One Piece", said to be the greatest treasure in the world...\n\n~\n\nOne Pace is a fan project that recuts the *One Piece* anime in an endeavor to bring it more in line with the pacing of the original manga by Eiichiro Oda. The team accomplishes this by removing filler scenes not present in the source material, fixing animation errors and correcting subtitles.',

		genre: [
			'Action',
			'Adventure',
			'Anime',
			'Fantasy',
			'Science Fiction',
			'Comedy',
			'Modern Odyssey',
			'Shōnen Jump',
		],
		customRating: 'TV-14',
		lastUpdate: metadata.lastUpdate || new Date().toISOString(),
	}

	if (metadata.arcs?.length > 0) {
		buffer.arcs = []
		for (let arc_in of metadata.arcs) {
			let arc_out: RecursivePartial<ArcMetadata> = {}

			for (const arc_key of ARC_METADATA_KEY_ORDER) {
				assignKey(arc_out, arc_in, arc_key)
			}

			const buffer_episodes = []

			if (arc_in.episodes?.length > 0) {
				for (const episode_in of arc_in.episodes) {
					let episode_out: RecursivePartial<EpisodeMetadata> = {}

					for (const episode_key of EPISODE_METADATA_KEY_ORDER) {
						assignKey(episode_out, episode_in, episode_key)
					}

					if (episode_in.files) {
						const files_in = episode_in.files
						let files_out: RecursivePartial<EpisodeFilesMetadata> = {}
						for (const files_key of EPISODE_FILES_METADATA_KEY_ORDER) {
							assignKey(files_out, files_in, files_key)
						}

						if (files_in.standard) {
							const standard_in = files_in.standard
							let standard_out: RecursivePartial<FileMetadata> = {}
							for (const file_key of FILE_METADATA_KEY_ORDER) {
								assignKey(standard_out, standard_in, file_key)
							}
							files_out.standard = standard_out
						}

						if (files_in.extended) {
							const extended_in = files_in.extended
							let extended_out: RecursivePartial<FileMetadata> = {}
							for (const file_key of FILE_METADATA_KEY_ORDER) {
								assignKey(extended_out, extended_in, file_key)
							}
							files_out.extended = extended_out
						}

						if (files_in.alternate) {
							const alternate_in = files_in.alternate
							let alternate_out: RecursivePartial<FileMetadata> = {}
							for (const file_key of FILE_METADATA_KEY_ORDER) {
								assignKey(alternate_out, alternate_in, file_key)
							}
							files_out.alternate = alternate_out
						}

						if (files_in.archived?.length > 0) {
							const archived_in = files_in.archived
							const archived_out = []
							for (let a_in of archived_in) {
								const archived_in = files_in.alternate
								let a_out: RecursivePartial<FileMetadata> = {}
								for (const file_key of FILE_METADATA_KEY_ORDER) {
									assignKey(a_out, archived_in, file_key)
								}
								archived_out.push(a_out)
							}
							files_out.archived = archived_out
						}

						episode_out.files = files_out
					}
					buffer_episodes.push(episode_out)
				}
			}

			arc_out.episodes = buffer_episodes

			buffer.arcs.push(arc_out)
		}
	}

	return <Metadata>buffer
}

function assignKey<T, K extends keyof T>(target: T, source: T, key: K): void {
	if (source[key] !== undefined) target[key] = source[key]
}

export type RecursivePartial<T> = {
	[P in keyof T]?: T[P] extends (infer U)[]
		? RecursivePartial<U>[]
		: T[P] extends object | undefined
			? RecursivePartial<T[P]>
			: T[P]
}
