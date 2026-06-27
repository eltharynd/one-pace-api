import { Logger } from 'ez-ts-logger'
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { simpleGit } from 'simple-git'
import environment from '../environment.js'
import { Context } from '../util/context.js'
import {
	ArcMetadata,
	EpisodeFilesMetadata,
	EpisodeMetadata,
	Metadata,
	RecursivePartial,
	reorderMetadata,
} from './metadata.model.js'

const OUTPUT_ROOT = './output'
const METADATA_OUTPUT = `${OUTPUT_ROOT}/metadata.json`

const REPO_DIR = './tmp/git-repo'
const REPO_METADATA_PATH = `${REPO_DIR}${OUTPUT_ROOT.replace('./', '/')}/metadata.json`
const BRANCH = 'main'

export class MetadataController {
	metadata: Metadata

	async init(): Promise<void> {
		if (existsSync(METADATA_OUTPUT) && !environment.FORCE_REGENERATION) {
			try {
				Logger.debug(`Checking metadata from cache`)
				this.metadata = JSON.parse(readFileSync(METADATA_OUTPUT).toString())

				const lastRSSUpdate: Date = await Context.rss.getLastUdate()
				const lastScraperUpdate: Date = await Context.scraper.getLastUdate()
				const lastUpdate: Date = new Date(this.metadata.lastUpdate)
				if (lastRSSUpdate > lastUpdate || lastScraperUpdate > lastUpdate) {
					Logger.info(`Remote updates, renewing cached metadata...`)
					await this.process()
				} else {
					Logger.info('Loaded Metadata from cache')
				}
			} catch (e) {
				Logger.warn('Badly formed cached metadata, reprocessing')
				await this.process()
			}
		} else {
			Logger.debug(
				`Processing Metadata from remote sources${environment.FORCE_REGENERATION ? ' [Forced}' : ''}`,
			)
			await this.process()
			Logger.info(
				`Processed Metadata from remote sources${environment.FORCE_REGENERATION ? ' [Forced}' : ''}`,
			)
		}
	}

	getAll(): Metadata {
		return structuredClone(this.metadata)
	}

	private async commitChanges() {
		if (environment.GIT_AUTO_COMMIT) {
			try {
				Logger.debug(`Committing changes to repo`)

				const exists = await stat(path.join(REPO_DIR, '.git'))
					.then(() => true)
					.catch(() => false)

				const remoteUrl = `https://x-access-token:${environment.GIT_TOKEN}@github.com/eltharynd/one-pace-api.git`

				if (!exists) {
					Logger.debug(`Cloning repo`)
					mkdirSync(REPO_DIR, { recursive: true })
					await simpleGit().clone(remoteUrl, REPO_DIR, [
						'--branch',
						BRANCH,
						'--single-branch',
					])
				} else Logger.debug(`Repo already cloned`)

				Logger.debug(`Initializing simple git`)
				const git = simpleGit(REPO_DIR)

				Logger.debug(`Adding git configs`)
				await git.addConfig('user.name', 'github-actions[bot]')
				await git.addConfig(
					'user.email',
					'41898282+github-actions[bot]@users.noreply.github.com',
				)

				Logger.debug(`Pulling main branch`)
				await git.pull('origin', BRANCH)

				mkdirSync(path.dirname(REPO_METADATA_PATH), { recursive: true })
				copyFileSync(METADATA_OUTPUT, REPO_METADATA_PATH)

				Logger.debug(`git add -f ${METADATA_OUTPUT}`)
				await git.add(['-f', METADATA_OUTPUT])

				Logger.debug(`git status --ignored`)
				const status = await git.status(['--ignored'])
				if (status.staged.length === 0) {
					Logger.warn('No changes to commit')
					return
				}

				Logger.debug(`Committing`)
				await git.commit(`Chore: Automated updates`, METADATA_OUTPUT)
				Logger.debug(`Pushing`)
				await git.push('origin', BRANCH)

				Logger.info(`Committed changes to repo`)
			} catch (e) {
				Logger.errorAndThrow(e)
			}
		}
	}

	private async process(): Promise<void> {
		let guide = Context.scraper.getEpisodeGuide()
		let descriptions = Context.scraper.getEpisodeDescriptions()

		let buffer: RecursivePartial<Metadata> = {
			arcs: [],
		}

		for (let sheet of guide.sheets) {
			if (sheet.index == 0) {
				Logger.debug('Processing Arc Overview')

				let halfSeasons = 0

				for (let row of sheet.rows) {
					if (String(row[1]) == 'Totals' || String(row[1]) == 'Arcs') continue
					if (!row[1]) break

					let _arc = Number.parseFloat(String(row[0])) + halfSeasons
					if (_arc % 1 != 0) {
						_arc = Math.floor(_arc) + 1
						halfSeasons++
					}

					let arc: RecursivePartial<ArcMetadata> = {
						arc: _arc,
						title: String(row[1]).replace(/\ *\(.*\).*$/, ''),

						status: /\(WIP\)/i.test(String(row[0]))
							? 'wip'
							: /\(TBR\)/i.test(String(row[0]))
								? 'tbr'
								: 'complete',
						mangaChapters: String(row[2]),
						mangaChaptersCount: Number(row[3]),
						animeEpisodes: String(row[4]),
						animeEpisodesCount: Number(row[5]),

						fillerEpisodes: String(row[6]),
						paceEpisodesCount: Number(row[7]),

						animeMinutes: Number(row[8]),
						paceMinutes: Number(row[9]),
						savedMinutes: Number(row[10]),
						savedPercentage: Number.parseFloat(String(row[11])),

						audioLanguages: String(row[12]).replaceAll(' ', '').split(','),
						subLanguages: String(row[13]).replaceAll(' ', '').split(','),
						subLanguagesPixeldrain: String(row[14])
							.replaceAll(' ', '')
							.split(','),
						resolution: String(row[15]),

						episodes: [],
					}
					buffer.arcs.push(arc)
				}
			} else {
				Logger.debug(`Processing ${sheet.index}. ${sheet.title}`)

				let arc = buffer.arcs.find(a => a.arc == sheet.index)

				for (let [index, row] of sheet.rows.entries()) {
					if (
						String(row[1]).includes('One Pace Episode') ||
						String(row[1]).includes('Forward')
					)
						continue
					if (!row[1]) break

					if (/G8/.test(String(row[1]))) {
						arc.episodes.find(e => e.episode == 25).files.alternate = {
							CRC32: String(row[6]),
							duration:
								Number.parseInt(String(row[5]).split(':')[0]) * 60 +
								Number.parseInt(String(row[5]).split(':')[1]),
							...(await Context.rss.getTorrentInfo(
								`${arc.title} 25 Alternate Cut (G-8)`,
							)),
						}
						continue
					}

					let match = String(row[1]).match(/^\w+[\w\ ]+\ ([0-9]{1,3})/i)
					let episodeNumber =
						match?.length > 0 ? Number.parseInt(match[1]) : index

					let files: RecursivePartial<EpisodeFilesMetadata> = {
						standard: {
							CRC32: String(row[6]) == '702231E9' ? '704F68EA' : String(row[6]),
							duration:
								Number.parseInt(String(row[5]).split(':')[0]) * 60 +
								Number.parseInt(String(row[5]).split(':')[1]),
							...(await Context.rss.getTorrentInfo(
								`${arc.title} ${String(episodeNumber).padStart(2, '0')}`,
							)),
						},
					}

					if (row[7]) {
						if (/^[A-Z0-9]{8}$/.test(String(row[7]))) {
							files.extended = {
								CRC32:
									String(row[7]) == '702231E9' ? '704F68EA' : String(row[7]),
								duration:
									Number.parseInt(String(row[8]).split(':')[0]) * 60 +
									Number.parseInt(String(row[8]).split(':')[1]),
								...(await Context.rss.getTorrentInfo(
									`${arc.title} ${String(episodeNumber).padStart(2, '0')} Extended Cut`,
								)),
							}
						} else {
							let match = String(row[7]).match(/([A-Z0-9]{8})/)
							if (match?.length > 0) {
								Logger.warn('CORRECTION')
								files.standard.CRC32_inFileName = match[1]
							} else Logger.warn('CORRECTION FAILED')
						}
					}

					let episode: RecursivePartial<EpisodeMetadata> = {
						arc: arc.arc,
						episode: episodeNumber,

						released: new Date(String(row[4])).toISOString(),
						files: files,
					}

					if (arc.arc == 17 && episode.episode == 0) {
						Logger.debug(`Manual correction for ${arc.arc}-${episode.episode}`)
						episode.title = 'The Wealthy Pirate Gang'
						episode.description =
							'While Donquixote Doflamingo punishes Bellamy for being defeated by Luffy, the Straw Hat Pirates continues their journey on the Octopus Balloon.'
					}

					arc.episodes.push(episode)
				}
			}
		}

		const arcsSheet = descriptions.sheets.find(s => /arcs/i.test(s.title))
		for (let [index, row] of arcsSheet.rows.entries()) {
			if (/saga_title/i.test(String(row[0])) || !row[0] || !row[1]) continue

			let arc: RecursivePartial<ArcMetadata> = buffer.arcs.find(
				a => a.arc == Number.parseInt(String(row[1])),
			)
			if (!arc) {
				if (/Specials/i.test(String(row[2]))) {
					arc = {
						arc: 0,

						saga: String(row[0]),
						title: String(row[0]),
						description: String(row[2]),

						status: 'complete',

						episodes: [],
					}
					buffer.arcs.push(arc)
				} else continue
			}

			Logger.debug(`Processing ${row[2]} Arc Descriptions`)
			arc.saga = String(row[0])
			arc.title = String(row[2])
			arc.description = String(row[3])
		}

		const episodesSheet = descriptions.sheets.find(s =>
			/episodes/i.test(s.title),
		)
		for (let [index, row] of episodesSheet.rows.entries()) {
			if (/arc_title/i.test(String(row[0])) || !row[0]) continue

			Logger.debug(
				`Processing '${String(row[0])} - ${String(row[1])}' Episode Descriptions`,
			)

			let arc: RecursivePartial<ArcMetadata> = buffer.arcs.find(
				a => a.title == String(row[0]),
			)
			if (arc) {
				let episode = arc.episodes.find(
					e => e.episode == Number.parseInt(String(row[1])),
				)
				if (episode) {
					if (!row[2]) {
						Logger.debug(
							`Episode '${String(row[0])} - ${String(row[1])}' description is still empty`,
						)
						continue
					}
					episode.title = String(row[2])
					episode.description = String(row[3])
				} else
					Logger.debug(
						`Episode '${String(row[0])} - ${String(row[1])}' from descriptions not found in guide`,
					)
			} else
				Logger.warn(
					`Arc '${String(row[0])}' from descriptions not found in guide`,
				)
		}

		const reordered: Metadata = reorderMetadata(buffer)

		Logger.debug(`Writing metadata to file`)
		writeFileSync(METADATA_OUTPUT, JSON.stringify(reordered, null, 2))
		Logger.debug(`Metadata written to file`)
		await this.commitChanges()
	}
}
