import { readFileSync } from 'node:fs'
import { parseMarketIndex } from '@deepseek-ai/dsh-plugin-market-index'

const file = process.argv[2]
if (!file) throw new Error('usage: node market/validate.mjs index.json')
parseMarketIndex(JSON.parse(readFileSync(file, 'utf8')), 'https://nbstarry.github.io/NB-DSH-Plugins/index.json')
console.log('DSH market index validation passed')
