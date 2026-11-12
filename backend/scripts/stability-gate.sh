#!/usr/bin/env bash
set -uo pipefail

usage() {
  cat <<'USAGE'
Usage: ./scripts/stability-gate.sh <solo|full|parallel> [--runs N] [--continue-on-failure]

Run from backend/. --runs sets the required consecutive-pass streak.
USAGE
}

fail_preflight() {
  printf 'Preflight failed: %s\n' "$1" >&2
  exit 2
}

if (($# < 1)); then
  usage >&2
  exit 2
fi

MODE="$1"
shift
case "$MODE" in
  solo) TARGET_RUNS=20 ;;
  full) TARGET_RUNS=10 ;;
  parallel) TARGET_RUNS=5 ;;
  *)
    usage >&2
    exit 2
    ;;
esac

CONTINUE_ON_FAILURE=0
while (($#)); do
  case "$1" in
    --runs)
      (($# >= 2)) || fail_preflight '--runs requires a positive integer'
      [[ "$2" =~ ^[1-9][0-9]*$ ]] || fail_preflight '--runs requires a positive integer'
      TARGET_RUNS="$2"
      shift 2
      ;;
    --continue-on-failure)
      CONTINUE_ON_FAILURE=1
      shift
      ;;
    *)
      fail_preflight "unknown option: $1"
      ;;
  esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
BACKEND_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
[[ "$(pwd -P)" == "$BACKEND_DIR" ]] || fail_preflight 'run this script from backend/'
[[ -f "$BACKEND_DIR/package.json" && -f "$BACKEND_DIR/test/jest-e2e.json" ]] ||
  fail_preflight 'backend package.json or e2e Jest config is missing'

REPO_ROOT="$(git -C "$BACKEND_DIR" rev-parse --show-toplevel 2>/dev/null)" ||
  fail_preflight 'could not locate the Git repository'
EXPECTED_NODE="$(node -e 'process.stdout.write(require("./package.json").engines.node)' 2>/dev/null)" ||
  fail_preflight 'could not read backend/package.json engines.node'
EXPECTED_PNPM="$(node -e 'process.stdout.write(require("./package.json").packageManager.replace(/^pnpm@/, "").split("+")[0])' 2>/dev/null)" ||
  fail_preflight 'could not read backend/package.json packageManager'
NVMRC_NODE="$(tr -d '[:space:]v' < "$REPO_ROOT/.nvmrc" 2>/dev/null)" ||
  fail_preflight 'could not read the root .nvmrc'
[[ -n "$EXPECTED_NODE" && "$EXPECTED_NODE" == "$NVMRC_NODE" ]] ||
  fail_preflight 'backend engines.node and root .nvmrc do not pin the same Node version'

NODE_VERSION="$(node --version 2>/dev/null)" || fail_preflight 'node is unavailable'
NODE_VERSION="${NODE_VERSION#v}"
[[ "$NODE_VERSION" == "$EXPECTED_NODE" ]] ||
  fail_preflight "Node version is $NODE_VERSION; required pinned patch is $EXPECTED_NODE"

PNPM_VERSION="$(pnpm --version 2>/dev/null)" || fail_preflight 'pnpm is unavailable'
[[ "$PNPM_VERSION" == "$EXPECTED_PNPM" ]] ||
  fail_preflight "pnpm version is $PNPM_VERSION; required version is $EXPECTED_PNPM"

RUNNING_SERVICES="$(docker compose ps --status running --services 2>/dev/null)" ||
  fail_preflight 'could not inspect Docker Compose services'
for service in redis postgres; do
  grep -Fxq "$service" <<<"$RUNNING_SERVICES" ||
    fail_preflight "Docker Compose service '$service' is not running"
done

GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null)" ||
  fail_preflight 'could not read the current Git commit'
GIT_BRANCH="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null)" ||
  fail_preflight 'could not read the current Git branch'
GIT_STATUS="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=normal 2>/dev/null)" ||
  fail_preflight 'could not inspect Git worktree state'
if [[ -n "$GIT_STATUS" ]]; then
  WORKTREE_STATE=dirty
else
  WORKTREE_STATE=clean
fi
NODE_VERSION="$(node --version)"
PNPM_VERSION="$(pnpm --version)"
OS_DESCRIPTION="$(uname -srm)"

START_UTC="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
OUTPUT_STAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
OUTPUT_DIR="$BACKEND_DIR/test-results/stability/${OUTPUT_STAMP}-${MODE}"
[[ ! -e "$OUTPUT_DIR" ]] || fail_preflight "evidence directory already exists: $OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR" || fail_preflight "could not create $OUTPUT_DIR"
RUN_RECORDS="$OUTPUT_DIR/.runs.tsv"
: > "$RUN_RECORDS" || fail_preflight "could not create run metadata in $OUTPUT_DIR"

CONSECUTIVE_PASSES=0
TOTAL_RUNS=0
FAILURE_COUNT=0
CURRENT_RUN_ACTIVE=0
GATE_RESULT='GATE NOT PASSED'
RUN_STATE=RUNNING
END_UTC=''

write_summary() {
  local exit_code=$?
  trap - EXIT
  [[ -n "$END_UTC" ]] || END_UTC="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  if [[ "$RUN_STATE" == RUNNING ]]; then
    RUN_STATE=INTERRUPTED
    GATE_RESULT='GATE NOT PASSED'
  fi

  node - "$OUTPUT_DIR" "$MODE" "$TARGET_RUNS" "$CONSECUTIVE_PASSES" \
    "$TOTAL_RUNS" "$GIT_SHA" "$GIT_BRANCH" "$WORKTREE_STATE" \
    "$NODE_VERSION" "$PNPM_VERSION" "$OS_DESCRIPTION" "$START_UTC" \
    "$END_UTC" "$RUN_STATE" "$GATE_RESULT" "$RUN_RECORDS" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');

const [
  outputDir,
  mode,
  targetRuns,
  consecutivePasses,
  totalRuns,
  gitCommit,
  branch,
  worktree,
  nodeVersion,
  pnpmVersion,
  os,
  startTimeUtc,
  endTimeUtc,
  state,
  result,
  recordsPath,
] = process.argv.slice(2);

const records = fs.readFileSync(recordsPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [
      runNumber,
      startUtc,
      endUtc,
      durationSeconds,
      exitCode,
      jestSuites,
      jestTests,
      logFile,
      failureNamesJson,
    ] = line.split('\t');
    return {
      runNumber: Number(runNumber),
      startUtc,
      endUtc,
      durationSeconds: Number(durationSeconds),
      exitCode: Number(exitCode),
      jestSuites: jestSuites || 'Not reported',
      jestTests: jestTests || 'Not reported',
      logFile,
      failureNames: JSON.parse(failureNamesJson),
    };
  });

const failures = records
  .filter((run) => run.exitCode !== 0)
  .map(({ runNumber, failureNames, logFile, exitCode }) => ({
    runNumber,
    exitCode,
    testNames: failureNames,
    logFile,
  }));
const summary = {
  mode,
  targetRuns: Number(targetRuns),
  consecutivePassesAchieved: Number(consecutivePasses),
  totalRuns: Number(totalRuns),
  failures,
  gitCommit,
  branch,
  worktree,
  nodeVersion,
  pnpmVersion,
  os,
  startTimeUtc,
  endTimeUtc,
  state,
  result,
  runs: records,
};

const markdown = [
  '# Stability gate results',
  '',
  `- Mode: ${mode}`,
  `- Target consecutive passes: ${targetRuns}`,
  `- Consecutive passes achieved: ${consecutivePasses}`,
  `- Total runs: ${totalRuns}`,
  `- Failures: ${failures.length}`,
  `- Git commit: ${gitCommit}`,
  `- Branch: ${branch}`,
  `- Worktree: ${worktree}`,
  `- Node: ${nodeVersion}`,
  `- pnpm: ${pnpmVersion}`,
  `- OS: ${os}`,
  `- Started (UTC): ${startTimeUtc}`,
  `- Ended (UTC): ${endTimeUtc}`,
  `- Status: ${state}`,
  '',
  '| Run | Start (UTC) | End (UTC) | Duration (s) | Exit | Jest suites | Jest tests | Log |',
  '|---:|---|---|---:|---:|---|---|---|',
  ...records.map((run) =>
    `| ${run.runNumber} | ${run.startUtc} | ${run.endUtc} | ${run.durationSeconds} | ${run.exitCode} | ${run.jestSuites} | ${run.jestTests} | [${run.logFile}](./${run.logFile}) |`),
  '',
  '## Failures',
  '',
  ...(failures.length
    ? failures.flatMap((failure) => [
        `- Run ${failure.runNumber} (exit ${failure.exitCode}), log [${failure.logFile}](./${failure.logFile}):`,
        ...(failure.testNames.length
          ? failure.testNames.map((name) => `  - ${name.replaceAll('|', '\\|')}`)
          : ['  - No Jest test name reported (non-Jest or preflight command failure).']),
      ])
    : ['- None.']),
  '',
  result,
  '',
].join('\n');

fs.writeFileSync(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'summary.md'), markdown);
fs.rmSync(recordsPath, { force: true });
NODE
  local summary_status=$?
  if ((summary_status != 0)); then
    printf 'Failed to write stability-gate summary in %s\n' "$OUTPUT_DIR" >&2
    exit_code=1
  fi
  exit "$exit_code"
}

on_interrupt() {
  RUN_STATE=INTERRUPTED
  GATE_RESULT='GATE NOT PASSED'
  END_UTC="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  if ((CURRENT_RUN_ACTIVE == 1)); then
    run_end="$END_UTC"
    run_end_epoch="$(date +%s)"
    duration_seconds=$((run_end_epoch - run_start_epoch))
    exit_code=130
    printf 'Interrupted before this run completed.\n' >> "$log_path"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t[]\n' \
      "$run_number" "$run_start" "$run_end" "$duration_seconds" "$exit_code" \
      "${jest_suites:-}" "${jest_tests:-}" "$log_file" >> "$RUN_RECORDS"
    CURRENT_RUN_ACTIVE=0
  fi
  exit 130
}

trap write_summary EXIT
trap on_interrupt INT TERM

printf 'Mode: %s; target consecutive passes: %s\n' "$MODE" "$TARGET_RUNS"
printf 'Evidence: %s\n' "$OUTPUT_DIR"
printf 'Git: %s (%s; %s)\n' "$GIT_SHA" "$GIT_BRANCH" "$WORKTREE_STATE"

while ((CONSECUTIVE_PASSES < TARGET_RUNS)); do
  run_number=$((TOTAL_RUNS + 1))
  log_file="run-${run_number}.log"
  log_path="$OUTPUT_DIR/$log_file"
  run_start="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  run_start_epoch="$(date +%s)"
  TOTAL_RUNS="$run_number"
  CURRENT_RUN_ACTIVE=1
  exit_code=0
  jest_suites=''
  jest_tests=''
  failure_names=()

  {
    printf 'Run: %s\nStart (UTC): %s\nMode: %s\n' "$run_number" "$run_start" "$MODE"
    case "$MODE" in
      solo) printf 'Command: pnpm test:e2e test/smoke/auth-rate-limit.e2e-spec.ts\n' ;;
      full) printf 'Command: pnpm test:e2e --runInBand\n' ;;
      parallel) printf 'Command: pnpm test:e2e\n' ;;
    esac
    printf 'Redis flush: docker compose exec -T redis redis-cli flushall\n'
  } > "$log_path"

  if ! docker compose exec -T redis redis-cli flushall >> "$log_path" 2>&1; then
    exit_code=125
    printf 'Redis flush failed; test command was not run.\n' >> "$log_path"
  else
    if [[ -n "${STABILITY_GATE_TEST_CMD:-}" ]]; then
      printf 'Test-only override: STABILITY_GATE_TEST_CMD\n' >> "$log_path"
      STABILITY_GATE_RUN_NUMBER="$run_number" bash -c "$STABILITY_GATE_TEST_CMD" >> "$log_path" 2>&1
      exit_code=$?
    else
      case "$MODE" in
        solo)
          pnpm test:e2e test/smoke/auth-rate-limit.e2e-spec.ts >> "$log_path" 2>&1
          exit_code=$?
          ;;
        full)
          pnpm test:e2e --runInBand >> "$log_path" 2>&1
          exit_code=$?
          ;;
        parallel)
          pnpm test:e2e >> "$log_path" 2>&1
          exit_code=$?
          ;;
      esac
    fi
  fi

  run_end="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  run_end_epoch="$(date +%s)"
  duration_seconds=$((run_end_epoch - run_start_epoch))
  jest_suites="$(grep -E '^[[:space:]]*Test Suites:' "$log_path" | tail -n 1 | sed 's/^[[:space:]]*//' || true)"
  jest_tests="$(grep -E '^[[:space:]]*Tests:' "$log_path" | tail -n 1 | sed 's/^[[:space:]]*//' || true)"

  if ((exit_code != 0)); then
    while IFS= read -r test_name; do
      [[ -n "$test_name" ]] && failure_names+=("$test_name")
    done < <(grep -E '^[[:space:]]*● ' "$log_path" | sed -E 's/^[[:space:]]*●[[:space:]]*//' || true)
    if ((${#failure_names[@]} == 0)); then
      while IFS= read -r suite_name; do
        [[ -n "$suite_name" ]] && failure_names+=("Failing suite: $suite_name")
      done < <(grep -E '^[[:space:]]*FAIL[[:space:]]+' "$log_path" | sed -E 's/^[[:space:]]*FAIL[[:space:]]+//' || true)
    fi
    FAILURE_COUNT=$((FAILURE_COUNT + 1))
    CONSECUTIVE_PASSES=0
    printf 'Run %s failed (exit %s); consecutive-pass streak reset to 0.\n' \
      "$run_number" "$exit_code" >&2
  else
    CONSECUTIVE_PASSES=$((CONSECUTIVE_PASSES + 1))
  fi

  failure_names_json="$(node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- "${failure_names[@]}")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$run_number" "$run_start" "$run_end" "$duration_seconds" "$exit_code" \
    "$jest_suites" "$jest_tests" "$log_file" "$failure_names_json" >> "$RUN_RECORDS"
  CURRENT_RUN_ACTIVE=0

  printf 'Run %s: exit=%s, duration=%ss, %s, %s; streak=%s/%s\n' \
    "$run_number" "$exit_code" "$duration_seconds" \
    "${jest_suites:-Test Suites: not reported}" \
    "${jest_tests:-Tests: not reported}" "$CONSECUTIVE_PASSES" "$TARGET_RUNS"

  if ((exit_code != 0 && CONTINUE_ON_FAILURE == 0)); then
    RUN_STATE=COMPLETED
    break
  fi
done

END_UTC="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
RUN_STATE=COMPLETED
if ((CONSECUTIVE_PASSES >= TARGET_RUNS && FAILURE_COUNT == 0)); then
  GATE_RESULT='GATE PASSED'
else
  GATE_RESULT='GATE NOT PASSED'
fi

printf '%s\n' "$GATE_RESULT"
[[ "$GATE_RESULT" == 'GATE PASSED' ]]
