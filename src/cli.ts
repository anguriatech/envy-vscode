import { execFile, spawn, type ExecFileOptions, type SpawnOptions } from 'node:child_process';

export interface CliResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

export class CliNotFoundError extends Error {
    constructor() {
        super('envy CLI not found on PATH');
        this.name = 'CliNotFoundError';
    }
}

export interface ExecOptions {
    /** When set, the value is written to the child's stdin (via `spawn`) and never appears in argv. */
    stdin?: string;
    /** When set, merged into `process.env` to form the child's environment. */
    env?: NodeJS.ProcessEnv;
}

/**
 * Execute an envy CLI command with the given arguments in the specified working directory.
 *
 * Behaviour:
 *  - If `options.stdin` is undefined, uses `execFile` (no shell). Argument values
 *    are never interpreted by a shell. Existing call sites pass only `(args, cwd)`.
 *  - If `options.stdin` is set, uses `spawn` so the value can be written to the
 *    child's stdin. The value never appears in argv (`ps`, `/proc/<pid>/cmdline`).
 *  - If `options.env` is set, it is merged into the child's environment so values
 *    like `ENVY_PASSPHRASE` are passed to the CLI without touching argv.
 *
 * On Windows, shell:true is required because npm-installed binaries are .cmd wrappers.
 * On Unix, shell:false is used for safety.
 *
 * Exit-code contract (both paths):
 *   - ENOENT (binary not on PATH) → rejects with CliNotFoundError
 *   - Any other exit code, including exit 1 (e.g., `envy diff` differences-found
 *     convention) → resolves with the full CliResult so callers can inspect
 *     exitCode, stdout, and stderr without an exception boundary.
 *
 * stdout and stderr are always captured regardless of exit code.
 *
 * @throws {CliNotFoundError} when the envy binary is not on PATH
 */
export function execEnvy(
    args: string[],
    cwd: string,
    options?: ExecOptions,
): Promise<CliResult> {
    if (options?.stdin === undefined) {
        return execEnvyExecFile(args, cwd, options?.env);
    }
    return execEnvySpawn(args, cwd, options.stdin, options.env ?? process.env);
}

function execEnvyExecFile(
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv | undefined,
): Promise<CliResult> {
    return new Promise((resolve, reject) => {
        const useShell = process.platform === 'win32';
        const execOpts: ExecFileOptions = { cwd, shell: useShell };
        if (env !== undefined) {
            execOpts.env = env;
        }
        execFile('envy', args, execOpts, (error, stdout, stderr) => {
            const out = typeof stdout === 'string' ? stdout : (stdout?.toString('utf8') ?? '');
            const err = typeof stderr === 'string' ? stderr : (stderr?.toString('utf8') ?? '');
            if (error !== null) {
                const sysError = error as NodeJS.ErrnoException;
                if (sysError.code === 'ENOENT') {
                    reject(new CliNotFoundError());
                    return;
                }
                resolve({
                    stdout: out,
                    stderr: err,
                    exitCode: typeof error.code === 'number' ? error.code : 1,
                });
                return;
            }
            resolve({ stdout: out, stderr: err, exitCode: 0 });
        });
    });
}

function execEnvySpawn(
    args: string[],
    cwd: string,
    stdinValue: string,
    env: NodeJS.ProcessEnv,
): Promise<CliResult> {
    return new Promise((resolve, reject) => {
        const useShell = process.platform === 'win32';
        const spawnOpts: SpawnOptions = { cwd, env, shell: useShell };
        const child = spawn('envy', args, spawnOpts);

        let stdout = '';
        let stderr = '';
        let settled = false;

        const settle = (result: CliResult | Error): void => {
            if (settled) {
                return;
            }
            settled = true;
            if (result instanceof Error) {
                reject(result);
            } else {
                resolve(result);
            }
        };

        const appendChunk = (chunk: Buffer | string, target: 'stdout' | 'stderr'): void => {
            const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
            if (target === 'stdout') {
                stdout += text;
            } else {
                stderr += text;
            }
        };
        child.stdout?.on('data', (chunk: Buffer | string) => {
            appendChunk(chunk, 'stdout');
        });
        child.stderr?.on('data', (chunk: Buffer | string) => {
            appendChunk(chunk, 'stderr');
        });

        child.on('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') {
                settle(new CliNotFoundError());
            } else {
                settle(error);
            }
        });

        child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            const exitCode = code !== null ? code : (signal !== null ? 1 : 0);
            settle({ stdout, stderr, exitCode });
        });

        child.stdin?.on('error', () => {
            // The 'close' event will fire and settle the promise; swallow the
            // stdin-side EPIPE that occurs when the child has already exited.
        });
        child.stdin?.end(stdinValue, 'utf8');
    });
}
