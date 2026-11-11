import { execFileSync } from 'child_process'
import { checkoutPlan, handBackNote, sameRepository } from './checkoutPlan'
import { fetchTaskBranch } from './taskBranchClient'

const USAGE = `Usage: viberglass checkout <task>

Puts a task's branch in the git clone you're in, to work on it yourself after
taking it over in Viberglass. <task> is its key, such as WEB-42.

Needs VIBERGLASS_URL (your Viberglass address) and VIBERGLASS_TOKEN (an API
token from Settings → API tokens).`

function git(args: string[], output = false): string {
  return execFileSync('git', args, { encoding: 'utf-8', stdio: output ? ['ignore', 'pipe', 'inherit'] : 'inherit' }) ?? ''
}

async function checkout(task: string): Promise<void> {
  const url = process.env.VIBERGLASS_URL
  const token = process.env.VIBERGLASS_TOKEN
  if (!url || !token) throw new Error('Set VIBERGLASS_URL and VIBERGLASS_TOKEN first.')

  const branch = await fetchTaskBranch(url, token, task)
  const origin = git(['remote', 'get-url', 'origin'], true).trim()
  if (!sameRepository(origin, branch.repositoryUrl)) {
    throw new Error(`This clone's origin is ${origin}, but ${task} is in ${branch.repositoryUrl}. Run this in a clone of that.`)
  }
  for (const command of checkoutPlan(branch)) git(command)

  console.log(`\n${handBackNote(branch)}`)
}

async function main(argv: string[]): Promise<number> {
  const [command, task] = argv
  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE)
    return 0
  }
  if (command !== 'checkout' || !task) {
    console.error(USAGE)
    return 2
  }
  try {
    await checkout(task)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

void main(process.argv.slice(2)).then((code) => process.exit(code))
