import { execFile } from 'node:child_process';

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

/**
 * Execute an envy CLI command with the given arguments in the specified working directory.
 * Uses execFile (no shell) so argument values are never interpreted by a shell.
 *
 * On Windows, shell:true is required because npm-installed binaries are .cmd wrappers.
 * On Unix, shell:false is used for safety.
 *
 * Exit-code contract:
 *   - ENOENT (binary not on PATH) → rejects with CliNotFoundError
 *   - Any other exit code, including exit 1 (e.g., `envy diff` differences-found
 *     convention) → resolves with the full CliResult so callers can inspect
 *     exitCode, stdout, and stderr without an exception boundary.
 *
 * stdout and stderr are always captured by execFile regardless of exit code.
 *
 * @throws {CliNotFoundError} when the envy binary is not on PATH
 */
export function execEnvy(args: string[], cwd: string): Promise<CliResult> {
    return new Promise((resolve, reject) => {
        const useShell = process.platform === 'win32';
        execFile('envy', args, { cwd, shell: useShell }, (error, stdout, stderr) => {
            // stdout and stderr are populated by execFile even on non-zero exit.
            const out = stdout ?? '';
            const err = stderr ?? '';

            if (error !== null) {
                const sysError = error as NodeJS.ErrnoException;
                if (sysError.code === 'ENOENT') {
                    reject(new CliNotFoundError());
                    return;
                }
                // Non-zero exit code (e.g., exit 1 from `envy diff` when differences
                // exist) — always resolve so callers can read exitCode and stdout.
                // error.code is the numeric exit code for process failures.
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
