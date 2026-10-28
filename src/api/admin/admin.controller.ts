import { Response } from 'express'
import { Logger } from 'ez-ts-logger'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import {
	Body,
	Get,
	JsonController,
	Post,
	Res,
	UseBefore,
} from 'routing-controllers'
import { simpleGit } from 'simple-git'
import environment from '../../environment.js'
import { Context } from '../../util/context.js'
import { OkResponse } from '../interceptors/default.interceptor.js'
import { AdminGuard } from '../middlewares/auth.middleware.js'

const FORCE_UPDATES_DELAY = 300_000
const PRE_PROCESSED_ROOT = './pre-processed'
const PRE_PROCESSED_OUTPUT = `${PRE_PROCESSED_ROOT}/torrents.json`

const REPO_DIR = './tmp/git-repo'
const REPO_PRE_PROCESSED_PATH = `${REPO_DIR}${PRE_PROCESSED_ROOT.replace('./', '/')}/torrents.json`
const BRANCH = 'main'

@JsonController(`/admin`)
export class AdminController {
	@Get(`/update/force`)
	@UseBefore(AdminGuard)
	forceUpdate() {
		if (Context.express.isLeader) {
			Context.metadata.init(true)
		} else {
			Context.express.io.serverSideEmit('forced_update')
		}
		return new OkResponse()
	}

	@Post(`/update/processed-torrents`)
	@UseBefore(AdminGuard)
	async updateProcessedTorrents(
		@Body({ options: { limit: '5mb' } }) body: any,
		@Res() res: Response,
	) {
		let cache = body
		console.log(cache)
		try {
			cache = JSON.parse(await readFileSync(PRE_PROCESSED_OUTPUT).toString())
			for (let b of body) {
				let found = cache.find(c => c.infoHash == b.infoHash)
				if (found) {
					for (let key of Object.keys(b)) found[key] = b[key]
				}
			}
		} catch (e) {
			Logger.error(e)
		}

		console.log(cache)
		cache.sort((a, b) => b.release.localeCompare(a.release))

		await writeFileSync(PRE_PROCESSED_OUTPUT, JSON.stringify(cache, null, 2))

		res.once('finish', () => {
			this.commitChanges().catch(e => Logger.error(e))
		})

		return res.status(200).send('OK')
	}

	private async commitChanges() {
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

			mkdirSync(path.dirname(REPO_PRE_PROCESSED_PATH), { recursive: true })
			copyFileSync(PRE_PROCESSED_OUTPUT, REPO_PRE_PROCESSED_PATH)

			Logger.debug(`git add -f ${PRE_PROCESSED_OUTPUT}`)
			await git.add(['-f', PRE_PROCESSED_OUTPUT])

			Logger.debug(`git status --ignored`)
			const status = await git.status(['--ignored'])
			if (status.staged.length === 0) {
				Logger.warn('No changes to commit')
				return
			}

			Logger.debug(`Committing`)
			await git.commit(
				`Chore: Torrents pre-processing updates`,
				PRE_PROCESSED_OUTPUT,
			)
			Logger.debug(`Pushing`)
			await git.push('origin', BRANCH)

			Logger.info(`Committed changes to repo`)
		} catch (e) {
			Logger.errorAndThrow(e)
		}
	}
}
