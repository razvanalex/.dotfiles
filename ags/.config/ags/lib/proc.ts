import { exec, execAsync } from "ags/process"

interface EnvVar {
    name: string
    value: string
}

function execBash(cmd: string, env?: EnvVar[]): string {
    let environ = "";
    if (env) {
        environ = env.map(({ name, value }) => `${name}='${value.replace(/'/g, "'\\''")}'`).join(' ')
    }

    return exec(`/bin/bash -c '${environ} ${cmd.replace(/'/g, "'\\''")}'`)
}

async function execBashAsync(cmd: string, env?: EnvVar[]): Promise<string> {
    let environ = "";
    if (env) {
        environ = env.map(({ name, value }) => `${name}='${value.replace(/'/g, "'\\''")}'`).join(' ')
    }

    return await execAsync(`/bin/bash -c '${environ} ${cmd.replace(/'/g, "'\\''")}'`)
}

function execNoExcept(cmd: string): string {
    try {
        return exec(cmd)
    } catch {
        return "";
    }
}

async function execAsyncNoExcept(cmd: string): Promise<string> {
    try {
        return await execAsync(cmd)
    } catch {
        return "";
    }
}

export {
    execBash,
    execBashAsync,
    execNoExcept,
    execAsyncNoExcept
}
