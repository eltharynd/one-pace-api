import dotenv from 'dotenv'
import { Logger } from 'ez-ts-logger'
dotenv.config({ path: './.env' })

export default {
	SINGLE_MODE: /single/i.test(process.env.RUN_MODE || 'false'),

	LOG_LEVEL: process.env.LOG_LEVEL || 'info',
	DEBUGGING:
		/debug/i.test(process.env.LOG_LEVEL || 'false') ||
		/true/i.test(process.env.DEBUGGING || 'false'),

	TESTING:
		/test/i.test(process.env.NODE_ENV) || /true/i.test(process.env.TESTING),

	DOMAIN: process.env.DOMAIN || 'localhost',
	API_BASE: process.env.API_BASE || '/api/v1/',
	PORT: Number.parseInt(process.env.PORT || '3000'),

	FORCE_REGENERATION: /true/i.test(process.env.FORCE_REGENERATION),

	GIT_TOKEN: process.env.GIT_TOKEN || '',
	GIT_AUTO_COMMIT: /true/i.test(process.env.GIT_AUTO_COMMIT),

	GOOGLE_DEVELOPER_MODE: /true/i.test(process.env.GOOGLE_DEVELOPER_MODE),
	GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
	GOOGLE_SHEET_EPISODE_GUIDE:
		process.env.GOOGLE_SHEET_EPISODE_GUIDE ||
		'1HQRMJgu_zArp-sLnvFMDzOyjdsht87eFLECxMK858lA',
	GOOGLE_SHEET_EPISODE_DESCRIPTION:
		process.env.GOOGLE_SHEET_EPISODE_DESCRIPTION ||
		'1M0Aa2p5x7NioaH9-u8FyHq6rH3t5s6Sccs8GoC6pHAM',
}

Logger.reloadEnvConfigs()
