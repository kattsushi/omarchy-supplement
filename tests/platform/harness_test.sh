#!/usr/bin/env bash
# Platform harness contract test; runs only isolated, owned fixtures.
set -euo pipefail
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd -P)
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
work=$(mktemp -d "${TMPDIR:-/tmp}/platform-harness-test.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
base=5d6ce40575d75c4d917832687e538059615a1d33
candidate=$work/candidate managed=$work/managed
# A local clone with deterministic metadata gives the harness a clean candidate.
git clone -q "$root" "$candidate"
git -C "$candidate" checkout -q "$base"
mkdir -p "$candidate/tests/platform"
cp "$root/tests/platform/run.sh" "$candidate/tests/platform/run.sh"
cp "$root/tests/platform/harness_test.sh" "$candidate/tests/platform/harness_test.sh"
cp "$root/tests/platform/README.md" "$candidate/tests/platform/README.md"
git -C "$candidate" add tests/platform
git -C "$candidate" -c user.name=fixture -c user.email=fixture@example.invalid commit -q --date='2000-01-01T00:00:00Z' -m fixture
mkdir "$managed"; git -C "$managed" init -q
git -C "$managed" config user.name fixture; git -C "$managed" config user.email fixture@example.invalid
printf managed >"$managed/file"; git -C "$managed" add file; git -C "$managed" commit -q --date='2000-01-01T00:00:00Z' -m fixture
mkdir "$work/bin"
cat >"$work/bin/omarchy" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = version ] && { printf '%s\n' "${OMARCHY_VERSION:-3.8.4}"; exit 0; }
exit 64
EOF
chmod +x "$work/bin/omarchy"
mkdir "$work/active"; printf active >"$work/active/sentinel"
run() { HOME="$work/active" PATH="${HARNESS_PATH:-$work/bin:/usr/bin:/bin}" "$candidate/tests/platform/run.sh" --managed-source "$managed"; }
candidate_state() { { git -C "$candidate" rev-parse HEAD; git -C "$candidate" write-tree; git -C "$candidate" diff --no-ext-diff; git -C "$candidate" diff --cached --no-ext-diff; git -C "$candidate" ls-files --others --exclude-standard | while IFS= read -r path; do stat -c '%a:%F:%n' "$candidate/$path"; done; } | sha256sum; }
out1=$(run) || fail harness
out2=$(run) || fail repeat
[ "$out1" = "$out2" ] || fail nondeterministic
printf '%s\n' "$out1" | awk -F '\t' '
  NR==1 { ok=($0=="schema\tplatform-evidence-v1") }
  $1=="candidate" && $2=="commit" { commit=1 }
  $1=="candidate" && $2=="tree" { tree=1 }
  $1=="materialize" && $2=="leaves" && $3==57 { leaves=1 }
  $1=="packages" && $2=="count" && $3==13 { packages=1 }
  $1=="stow" && $2=="target-links" && $3+0>0 { links=1 }
  $1=="status" && $2=="pass" { pass=1 }
  END { exit !(ok&&commit&&tree&&leaves&&packages&&links&&pass) }' || fail evidence
case $out1 in *"$work"*|*PLATFORM_PRIVACY_SENTINEL*) fail privacy;; esac
[ "$(cat "$work/active/sentinel")" = active ] || fail active-home
# Invalid version output is refused without exposing the injected value.
if invalid=$(OMARCHY_VERSION='bad value' run 2>&1); then fail invalid-version; fi
case $invalid in *'bad value'*|*$'status\tpass'*) fail version-privacy;; esac
# A failed Stow command cannot yield evidence success.
mkdir "$work/fail"; printf '#!/usr/bin/env bash\nexit 99\n' >"$work/fail/stow"; chmod +x "$work/fail/stow"
if HARNESS_PATH="$work/fail:$work/bin:/usr/bin:/bin" run >/dev/null 2>&1; then fail command-failure; fi
# Managed-source changes during the run are detected after fixture work completes.
mkdir "$work/mutate"; cat >"$work/mutate/git" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"$managed for-each-ref"* && ! -e "$work/mutated" ]]; then : >"$work/mutated"; printf changed >>"$managed/file"; fi
exec /usr/bin/git "\$@"
EOF
chmod +x "$work/mutate/git"
if HARNESS_PATH="$work/mutate:$work/bin:/usr/bin:/bin" run >/dev/null 2>&1; then fail managed-mutation; fi
git -C "$managed" checkout -q -- file
# Every blocker mutation preserves bootstrap's exit 2 but fails exact-set/order validation.
for case_name in missing extra wrong reordered; do
  cat >"$work/$case_name-bootstrap" <<EOF
#!/usr/bin/env bash
out=\$("\$1" "\${@:2}" 2>&1); rc=\$?
printf %s "\$rc" >"$work/$case_name-rc"
case $case_name in
  missing) out=\$(printf '%s\\n' "\$out" | sed '/^block[[:space:]]arch-base-packages/d');;
  extra) out="\$out"$'\\nblock\\textra\\tUNEXPECTED\\texpected\\tobserved\\tfixture';;
  wrong) out=\$(printf '%s\\n' "\$out" | sed 's/PROVIDER_APPLY_UNIMPLEMENTED/WRONG_BLOCKER/');;
  reordered) out=\$(printf '%s\\n' "\$out" | awk -F '\\t' '\$1=="block" { blocks[++n]=\$0; next } { print } END { if(n>1) { print blocks[2]; print blocks[1]; for(i=3;i<=n;i++) print blocks[i] } else for(i=1;i<=n;i++) print blocks[i] }');;
esac
printf '%s\\n' "\$out"
exit "\$rc"
EOF
  chmod +x "$work/$case_name-bootstrap"
  : >"$work/.omarchy-bootstrap-fixture"; mkdir -p "$work/bootstrap-home"
  for bootstrap_command in plan check; do
    set +e; HOME="$work/bootstrap-home" REAL_HOME="$work/real-home" BOOTSTRAP_TEST_OS=arch BOOTSTRAP_TEST_ARCH=x86_64 "$work/$case_name-bootstrap" "$candidate/bin/workstation-bootstrap" "$bootstrap_command" --profile base --profile omarchy >/dev/null 2>&1; wrapper_rc=$?; set -e
    [ "$wrapper_rc" = 2 ] && [ "$(cat "$work/$case_name-rc")" = 2 ] || fail "bootstrap-$case_name-$bootstrap_command-rc"
  done
  if BOOTSTRAP_WRAPPER="$work/$case_name-bootstrap" run >/dev/null 2>&1; then fail "bootstrap-$case_name"; fi
  [ "$(cat "$work/$case_name-rc")" = 2 ] || fail "bootstrap-$case_name-rc"
done
# TERM removes only the exact owned platform-harness root and preserves the candidate.
signal_candidate_before=$(candidate_state)
mkdir "$work/signal-bin" "$work/signal-tmp"
cat >"$work/signal-bin/stow" <<'EOF'
#!/usr/bin/env bash
[ "${1:-}" = --version ] && { printf 'stow 2.4.1\n'; exit 0; }
sleep 30
EOF
chmod +x "$work/signal-bin/stow"
TMPDIR="$work/signal-tmp" HOME="$work/active" PATH="$work/signal-bin:$work/bin:/usr/bin:/bin" "$candidate/tests/platform/run.sh" --managed-source "$managed" >"$work/signal.out" 2>&1 & pid=$!
for _ in 1 2 3 4 5; do find "$work/signal-tmp" -maxdepth 1 -type d -name 'platform-harness.*' -print -quit | grep -q . && break; sleep 1; done
kill -TERM "$pid"; wait "$pid" && fail signal-status
! find "$work/signal-tmp" -maxdepth 1 -type d -name 'platform-harness.*' -print -quit | grep -q . || fail signal-cleanup
[ "$signal_candidate_before" = "$(candidate_state)" ] || fail signal-candidate
[ "$(cat "$work/active/sentinel")" = active ] && [ "$(git -C "$managed" status --porcelain)" = '' ] || fail signal-isolation
# A separate clean candidate receives staged-only mid-run dirt through a PATH Git stub.
staged=$work/staged-candidate; git clone -q "$root" "$staged"; git -C "$staged" checkout -q "$base"
mkdir -p "$staged/tests/platform"; cp "$root/tests/platform/run.sh" "$root/tests/platform/harness_test.sh" "$root/tests/platform/README.md" "$staged/tests/platform/"
git -C "$staged" add tests/platform; git -C "$staged" -c user.name=fixture -c user.email=fixture@example.invalid commit -q --date='2000-01-01T00:00:00Z' -m fixture
original_candidate=$candidate; candidate=$staged; mkdir "$work/staged-bin"
cat >"$work/staged-bin/git" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"$staged write-tree"* && ! -e "$work/staged-mutated" ]]; then : >"$work/staged-mutated"; printf staged >>"$staged/tests/platform/README.md"; /usr/bin/git -C "$staged" add tests/platform/README.md; fi
exec /usr/bin/git "\$@"
EOF
chmod +x "$work/staged-bin/git"
if staged_out=$(HARNESS_PATH="$work/staged-bin:$work/bin:/usr/bin:/bin" run 2>&1); then fail staged-accepted; fi
case $staged_out in *"$work"*|*PLATFORM_PRIVACY_SENTINEL*|*$'status\tpass'*) fail staged-leak;; esac
candidate=$original_candidate
# A PATH Git stub dirties both tracked and untracked candidate state mid-run; no PASS leaks.
mkdir "$work/dirty-bin"
cat >"$work/dirty-bin/git" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"$candidate write-tree"* && ! -e "$work/candidate-mutated" ]]; then : >"$work/candidate-mutated"; printf dirty >>"$candidate/tests/platform/README.md"; : >"$candidate/injected"; fi
exec /usr/bin/git "\$@"
EOF
chmod +x "$work/dirty-bin/git"
if dirty=$(HARNESS_PATH="$work/dirty-bin:$work/bin:/usr/bin:/bin" run 2>&1); then fail dirty-accepted; fi
case $dirty in *"$work"*|*PLATFORM_PRIVACY_SENTINEL*|*$'status\tpass'*) fail dirty-leak;; esac
# The now-dirty candidate is refused before fixture work begins.
if dirty=$(run 2>&1); then fail dirty-accepted; fi
case $dirty in *$'status\tpass'*) fail dirty-pass;; esac
# Caller mistakes and required dependency failures refuse without an accidental PASS.
if "$candidate/tests/platform/run.sh" >/dev/null 2>&1; then fail missing-source; fi
if "$candidate/tests/platform/run.sh" --managed-source "$work/missing" >/dev/null 2>&1; then fail nongit-source; fi
mkdir "$work/no-stow"; ln -s /usr/bin/bash "$work/no-stow/bash"
if PATH="$work/no-stow" /usr/bin/bash "$candidate/tests/platform/run.sh" --managed-source "$managed" >/dev/null 2>&1; then fail dependency; fi
[ "$(stat -c '%a' "$root/tests/platform/run.sh")" = 755 ] && [ "$(stat -c '%a' "$root/tests/platform/harness_test.sh")" = 755 ] && [ "$(stat -c '%a' "$root/tests/platform/README.md")" = 644 ] || fail modes
printf 'platform harness tests: PASS\n'
