#!/usr/bin/env bash
# Live gateway smoke runbook.
#
# Manually exercises the gateway with Quasar enabled and a real provider so the
# end-to-end channel + agent session + Quasar run-event persistence can be
# verified outside the unit-test harness.
#
# Usage:
#     scripts/live_gateway_smoke.sh
#
# Required environment:
#     SKYTH_QUASAR_PASSWORD     superuser password for Quasar
#     SKYTH_PROVIDER            ai sdk provider name (e.g. openai, anthropic)
#     SKYTH_API_KEY             provider API key
#     SKYTH_MODEL               model id understood by that provider
#
# Optional environment:
#     SKYTH_API_BASE            override gateway base URL for the provider
#     SKYTH_HOME                override Skyth home (default ~/.skyth)
#     GATEWAY_PORT              gateway port to probe (default 3000)
#     SKYTH_QUASAR_USERNAME     onboarding username (default 'skyth')
#
# The script intentionally does not start the gateway for you. Start it first
# (in another terminal) so log output stays visible:
#
#     bun run skyth/gateway/gateway.ts
#
# Then run this script against the live process. The script checks reachability,
# verifies the Quasar run-event database exists, and prints the recent contents
# of `run_events` so you can confirm the dedicated IPC op is being used.

set -euo pipefail

PORT="${GATEWAY_PORT:-3000}"
HOME_DIR="${SKYTH_HOME:-$HOME/.skyth}"
RUN_EVENTS_DB="$HOME_DIR/quasar/run_events.quasardb"
GATEWAY_DB="$HOME_DIR/quasar/gateway.quasardb"

require() {
    local name="$1"
    if [ -z "${!name:-}" ]; then
        echo "error: $name must be set" >&2
        exit 1
    fi
}

require SKYTH_QUASAR_PASSWORD
require SKYTH_PROVIDER
require SKYTH_API_KEY
require SKYTH_MODEL

echo "== Live gateway smoke runbook =="
echo "Skyth home:    $HOME_DIR"
echo "Provider:      $SKYTH_PROVIDER"
echo "Model:         $SKYTH_MODEL"
echo "Gateway port:  $PORT"
echo

echo "1. Probe gateway debug health endpoint"
if ! curl -fsS "http://127.0.0.1:$PORT/debug/health" >/dev/null; then
    echo "   gateway is not reachable at http://127.0.0.1:$PORT" >&2
    echo "   start it first: bun run skyth/gateway/gateway.ts" >&2
    exit 1
fi
echo "   ok"
echo

echo "2. Check Quasar databases exist (created on first boot)"
for db in "$GATEWAY_DB" "$RUN_EVENTS_DB"; do
    if [ ! -e "$db" ]; then
        echo "   missing: $db" >&2
        echo "   ensure the gateway has run at least once with Quasar enabled" >&2
        exit 1
    fi
    echo "   ok: $db"
done
echo

cat <<NOTES
3. Drive a turn against the live gateway

   Pick whichever channel matches your real setup. The gateway speaks two
   primary channels by default:

   a) Web channel (chrome-extension relay)
      - Start the chrome extension relay and connect a tab.
      - Send a chat message from the extension UI.

   b) Telegram channel
      - Configure SKYTH_TELEGRAM_BOT_TOKEN and SKYTH_GATEWAY_HANDLE_TELEGRAM=1
      - Send a /help or plain message to the bot from any chat.

   You should see a model response posted back through the same channel.

4. Verify run events were persisted through the dedicated Quasar IPC op

   Tail the gateway log for run lifecycle markers. They should look like:

       [agent] run_start runId=<runId> threadId=<threadId>
       [agent] run_finish runId=<runId> output=<text>

   Then query the run_events table to confirm the rows landed via the
   run_event_record IPC op (not the legacy VFS JSON path):

       sqlite3 $RUN_EVENTS_DB \\
           "SELECT id, sequence, event_type, run_id, thread_id \\
            FROM run_events ORDER BY id DESC LIMIT 20;"

   You should see rows for run_start, step_start, model_complete, step_finish
   and run_finish in increasing sequence order. There should be no
   run_events.json file under \$HOME_DIR/quasar/gateway.quasardb's VFS surface.

5. Negative check (sanity)

   Set SKYTH_QUASAR_ADAPTERS=0 and restart the gateway. Drive another turn.
   The run should complete successfully (no Quasar dependency) and the
   run_events table should not gain new rows for that runId.
NOTES
