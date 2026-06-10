import * as assert from 'assert';
import {
    parseStatusJson,
    isStatusPayload,
    reduceToState,
    buildTooltip,
    relativeTime,
    type StatusPayload,
} from '../statusBar';

suite('StatusBar (JSON) — unit tests', () => {
    suite('isStatusPayload', () => {
        test('accepts a valid payload with all three status enum values', () => {
            const payload = {
                environments: [
                    { name: 'development', secret_count: 4, last_modified_at: '2026-06-10T09:58:01Z', status: 'in_sync' },
                    { name: 'production', secret_count: 1, last_modified_at: '2026-06-10T09:58:14Z', status: 'modified' },
                    { name: 'staging', secret_count: 0, last_modified_at: null, status: 'never_sealed' },
                ],
                artifact: { found: true, path: '/tmp/envy.enc', last_modified_at: '2026-06-10T09:58:15Z', environments: ['development', 'staging'] },
            };
            assert.strictEqual(isStatusPayload(payload), true);
        });

        test('accepts null last_modified_at (env with 0 secrets)', () => {
            const payload = {
                environments: [
                    { name: 'development', secret_count: 0, last_modified_at: null, status: 'in_sync' },
                ],
                artifact: { found: false, path: '/tmp/envy.enc', last_modified_at: null, environments: [] },
            };
            assert.strictEqual(isStatusPayload(payload), true);
        });

        test('rejects a payload whose environments is not an array', () => {
            const payload = { environments: 'not-an-array', artifact: { found: false, path: '/tmp/x', last_modified_at: null, environments: [] } };
            assert.strictEqual(isStatusPayload(payload), false);
        });

        test('rejects a payload whose element lacks status', () => {
            const payload = {
                environments: [
                    { name: 'development', secret_count: 0, last_modified_at: null },
                ],
                artifact: { found: false, path: '/tmp/x', last_modified_at: null, environments: [] },
            };
            assert.strictEqual(isStatusPayload(payload), false);
        });

        test('rejects a payload with non-null/non-string last_modified_at', () => {
            const payload = {
                environments: [
                    { name: 'development', secret_count: 0, last_modified_at: 12345, status: 'in_sync' },
                ],
                artifact: { found: false, path: '/tmp/x', last_modified_at: null, environments: [] },
            };
            assert.strictEqual(isStatusPayload(payload), false);
        });
    });

    suite('parseStatusJson', () => {
        test('returns the parsed object on a valid payload', () => {
            const text = JSON.stringify({
                environments: [
                    { name: 'development', secret_count: 4, last_modified_at: '2026-06-10T09:58:01Z', status: 'in_sync' },
                ],
                artifact: { found: true, path: '/tmp/envy.enc', last_modified_at: '2026-06-10T09:58:01Z', environments: ['development'] },
            });
            const parsed = parseStatusJson(text);
            assert.strictEqual(parsed.environments.length, 1);
            assert.strictEqual(parsed.environments[0].status, 'in_sync');
        });

        test('throws on malformed JSON', () => {
            assert.throws(() => parseStatusJson('not valid json'), /JSON/);
        });

        test('throws when the schema check fails', () => {
            assert.throws(() => parseStatusJson('{"environments": "bad"}'), /Invalid envy status JSON payload/);
        });
    });

    suite('reduceToState', () => {
        test('returns Modified when any env is modified', () => {
            const envs: StatusPayload['environments'] = [
                { name: 'a', secret_count: 1, last_modified_at: null, status: 'in_sync' },
                { name: 'b', secret_count: 1, last_modified_at: null, status: 'modified' },
            ];
            assert.strictEqual(reduceToState(envs), 'Modified');
        });

        test('returns NeverSealed when any is never_sealed and none is modified', () => {
            const envs: StatusPayload['environments'] = [
                { name: 'a', secret_count: 1, last_modified_at: null, status: 'in_sync' },
                { name: 'b', secret_count: 1, last_modified_at: null, status: 'never_sealed' },
            ];
            assert.strictEqual(reduceToState(envs), 'NeverSealed');
        });

        test('returns InSync when all are in_sync', () => {
            const envs: StatusPayload['environments'] = [
                { name: 'a', secret_count: 1, last_modified_at: null, status: 'in_sync' },
                { name: 'b', secret_count: 1, last_modified_at: null, status: 'in_sync' },
            ];
            assert.strictEqual(reduceToState(envs), 'InSync');
        });

        test('returns InSync defensively for unknown status values', () => {
            const envs: StatusPayload['environments'] = [
                { name: 'a', secret_count: 1, last_modified_at: null, status: 'future_state_we_dont_know' as string },
            ];
            assert.strictEqual(reduceToState(envs), 'InSync');
        });
    });

    suite('buildTooltip', () => {
        test('returns the aggregated string for a payload with a most-recent timestamp', () => {
            const now = new Date().toISOString();
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const payload: StatusPayload = {
                environments: [
                    { name: 'a', secret_count: 5, last_modified_at: now, status: 'in_sync' },
                    { name: 'b', secret_count: 12, last_modified_at: oneHourAgo, status: 'in_sync' },
                ],
                artifact: { found: true, path: '/x', last_modified_at: now, environments: ['a', 'b'] },
            };
            const tip = buildTooltip(payload);
            assert.ok(tip.startsWith('2 environments, 17 secrets total, last modified '), `unexpected tooltip: ${tip}`);
            assert.ok(tip.includes('ago') || tip.includes('just now'), `tooltip should include relative time: ${tip}`);
        });

        test('returns "last modified never" when all timestamps are null', () => {
            const payload: StatusPayload = {
                environments: [
                    { name: 'a', secret_count: 0, last_modified_at: null, status: 'in_sync' },
                    { name: 'b', secret_count: 0, last_modified_at: null, status: 'never_sealed' },
                ],
                artifact: { found: false, path: '/x', last_modified_at: null, environments: [] },
            };
            assert.strictEqual(buildTooltip(payload), '2 environments, 0 secrets total, last modified never');
        });

        test('returns "last modified never" when environments is empty', () => {
            const payload: StatusPayload = {
                environments: [],
                artifact: { found: false, path: '/x', last_modified_at: null, environments: [] },
            };
            assert.strictEqual(buildTooltip(payload), '0 environments, 0 secrets total, last modified never');
        });
    });

    suite('relativeTime', () => {
        test('returns "just now" for a timestamp within the last 45 seconds', () => {
            assert.strictEqual(relativeTime(new Date().toISOString()), 'just now');
        });

        test('returns "X minutes ago" for a timestamp a few minutes old', () => {
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            assert.strictEqual(relativeTime(fiveMinAgo), '5 minutes ago');
        });

        test('returns "X days ago" for a timestamp 3 days old', () => {
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
            assert.strictEqual(relativeTime(threeDaysAgo), '3 days ago');
        });

        test('returns "never" for an unparseable timestamp', () => {
            assert.strictEqual(relativeTime('not a date'), 'never');
        });
    });
});
