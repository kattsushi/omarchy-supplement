#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
# shellcheck disable=SC1091 # Test helper is resolved from the repository root.
source "$ROOT/tests/bootstrap/assertions.sh"
FIXTURE="$(mktemp -d "${TMPDIR:-/tmp}/omarchy-bootstrap.XXXXXX")"
trap 'rm -rf "$FIXTURE"' EXIT
export REAL_HOME="$HOME"
export HOME="$FIXTURE/home"
export XDG_STATE_HOME="$FIXTURE/state"
export XDG_CACHE_HOME="$FIXTURE/cache"
export BOOTSTRAP_TEST_OS=arch
export BOOTSTRAP_TEST_ARCH=x86_64
mkdir -p "$HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME" "$HOME/child"
: >"$FIXTURE/.omarchy-bootstrap-fixture"
[[ "$HOME" != "$REAL_HOME" ]] || fail "fixture home must differ from active home"
[[ -f "$FIXTURE/.omarchy-bootstrap-fixture" ]] || fail "fixture marker missing"

run_cli() { "$ROOT/bin/workstation-bootstrap" "$@"; }
expect_refusal() {
	set +e
	"$@" >"$FIXTURE/out" 2>"$FIXTURE/err"
	local rc=$?
	set -e
	[[ $rc -eq 2 ]] || fail "expected safe refusal (2), got $rc: $(cat "$FIXTURE/err")"
}

# RED contract: this invocation fails until the CLI and parser exist.
test_valid_plan_contract() {
	expect_refusal run_cli plan --profile base
	assert_file_contains "$FIXTURE/out" $'schema\tbrf-v1'
	assert_file_contains "$FIXTURE/out" $'action\t'
	assert_file_contains "$FIXTURE/out" $'blocked'
}

test_parser_matrix() {
	local catalog="$FIXTURE/catalog"
	mkdir -p "$catalog"
	cp -R "$ROOT/bootstrap/catalog/v1/." "$catalog/"
	printf 'schema\tbrf-v1\nprofile\tbad@1\tarch\tx86_64\t-\t-\textra\n' >"$catalog/profiles.tsv"
	expect_exit 64 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base
	printf 'schema\tbrf-v1\nprofile-alias\tbase\tbase@1\nprofile\tbase@1\tarch\tx86_64\t-\t-\nprofile\tbase@1\tarch\tx86_64\t-\tconflict\n' >"$catalog/profiles.tsv"
	expect_exit 64 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base
	printf 'schema\tbrf-v1\nprofile-alias\tbase\tbase@1\nprofile\tbase@1\tarch\tx86_64\t-\t-\n' >"$catalog/profiles.tsv"
	printf 'schema\tbrf-v1\naction\tbase@1\t040\tbad-action\tpackage\tyes\tarch.pacman\t../escape\n' >"$catalog/actions.tsv"
	expect_exit 64 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base
	printf 'schema\tbrf-v1\nprofile-alias\tbase\tbase@1\nprofile-alias\tomarchy\tomarchy@1\nprofile\tbase@1\tarch\tx86_64\t-\tomarchy@1\nprofile\tomarchy@1\tarch\tx86_64\tbase@1\t-\n' >"$catalog/profiles.tsv"
	cp "$ROOT/bootstrap/catalog/v1/actions.tsv" "$catalog/actions.tsv"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base --profile omarchy
	assert_file_contains "$FIXTURE/err" "PROFILE_CONFLICT" || return 1
	printf 'schema\tbrf-v1\naction\tbase@1\t040\tbad-action\tpackage\tyes\tarch.pacman\ttoken-secret\n' >"$catalog/actions.tsv"
	expect_exit 64 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base
}

test_profile_determinism_and_isolation() {
	expect_refusal run_cli plan --profile omarchy --profile base --profile base
	cp "$FIXTURE/out" "$FIXTURE/first"
	expect_refusal run_cli plan --profile base --profile omarchy
	cmp "$FIXTURE/first" "$FIXTURE/out" || fail "equivalent profiles produced different plans"
	assert_file_contains "$FIXTURE/out" $'profile\tbase@1'
	assert_file_contains "$FIXTURE/out" $'profile\tomarchy@1'
	expect_refusal env BOOTSTRAP_TEST_OS=darwin "$ROOT/bin/workstation-bootstrap" plan --profile omarchy
	assert_file_contains "$FIXTURE/out" "PROFILE_INCOMPATIBLE" || return 1
	assert_file_not_contains "$FIXTURE/out" "omarchy-desktop" || return 1
	expect_refusal env BOOTSTRAP_TEST_OS=darwin "$ROOT/bin/workstation-bootstrap" plan --profile base
	assert_file_contains "$FIXTURE/out" "darwin.homebrew.formula" || return 1
	# Incompatible catalog intent remains visible as an explicit blocked action.
	assert_file_contains "$FIXTURE/out" "PROVIDER_PLATFORM_MISMATCH" || return 1
}

test_dotfiles_and_immutability_guards() {
	local before after catalog="$FIXTURE/embedded-catalog"
	before="$(tree_fingerprint "$HOME")"
	expect_refusal run_cli check --profile base
	after="$(tree_fingerprint "$HOME")"
	[[ "$before" == "$after" ]] || { fail "check mutated fixture"; return 1; }
	assert_file_contains "$FIXTURE/out" "DOTFILES_MISSING" || return 1
	# An exact embedded materialization is ready without a Git repository or remote.
	cp -R "$ROOT/dotfiles" "$HOME/dotfiles"
	mkdir "$FIXTURE/no-git"
	printf '#!/usr/bin/env bash\nexit 99\n' >"$FIXTURE/no-git/git"
	chmod +x "$FIXTURE/no-git/git"
	expect_refusal env PATH="$FIXTURE/no-git:$PATH" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "PROVIDER_APPLY_UNIMPLEMENTED" || return 1
	assert_file_not_contains "$FIXTURE/out" "DOTFILES_REMOTE_MISMATCH" || return 1
	cp -R "$ROOT/bootstrap/catalog/v1" "$catalog"
	sed -i 's/sha256:[0-9a-f]\{64\}/sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/' "$catalog/pins.tsv"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "DOTFILES_EMBEDDED_PIN_MISMATCH" || return 1
	cp "$ROOT/bootstrap/catalog/v1/pins.tsv" "$catalog/pins.tsv"
	sed -i 's/\tembedded\t/\tgit\t/' "$catalog/pins.tsv"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "PIN_MISSING" || return 1
	printf 'malformed\n' >"$catalog/pins.tsv"
	expect_exit 64 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	rm -rf "$HOME/dotfiles"
	mkdir -p "$HOME/.local/share/omarchy"
	expect_refusal run_cli check --profile omarchy
	assert_file_contains "$FIXTURE/out" "MANAGED_SOURCE_FORBIDDEN"
}

test_identity_and_extended_guards() {
	expect_refusal run_cli plan --profile base
	assert_file_contains "$FIXTURE/out" $'plan_hash\tsha256:' || return 1
	cp "$FIXTURE/out" "$FIXTURE/identity-one"
	expect_refusal run_cli plan --profile base
	cmp "$FIXTURE/identity-one" "$FIXTURE/out" || {
		fail "plan hash was unstable"
		return 1
	}
	expect_refusal env BOOTSTRAP_HASH_TOOL=missing "$ROOT/bin/workstation-bootstrap" plan --profile base
	assert_file_contains "$FIXTURE/err" "HASH_TOOL_MISSING" || return 1
	local catalog="$FIXTURE/duplicates"
	mkdir -p "$catalog"
	cp -R "$ROOT/bootstrap/catalog/v1/." "$catalog/"
	printf '\nprofile-alias\tbase\tbase@1\n' >>"$catalog/profiles.tsv"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base
	printf 'profile-alias\tbase\tomarchy@1\n' >>"$catalog/profiles.tsv"
	expect_exit 64 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base
}

test_safe_boundaries() {
	expect_exit 64 run_cli apply --plan nowhere --expect-hash sha256:deadbeef
	expect_exit 64 run_cli verify --receipt nowhere
	(
		cd "$HOME/child"
		expect_refusal "$ROOT/bin/workstation-bootstrap" plan --profile base
	)
	assert_file_not_contains "$FIXTURE/out" "SENTINEL_SECRET_VALUE"
}

# Embedded verification participates in canonical identity without external checkout facts.
test_acceptance_gap_contract() {
	expect_refusal run_cli plan --profile base
	assert_file_contains "$FIXTURE/out" $'engine_digest\tsha256:' || return 1
	assert_file_contains "$FIXTURE/out" $'catalog_digest\tsha256:' || return 1
	cp -R "$ROOT/dotfiles" "$HOME/dotfiles"
	mkdir -p "$HOME/.config"
	ln -s "$HOME/dotfiles/file-that-does-not-exist" "$HOME/.config/starship.toml"
	expect_refusal run_cli check --profile base
	assert_file_contains "$FIXTURE/out" "TARGET_OWNER_CONFLICT" || return 1
	rm "$HOME/.config/starship.toml"
	local installer catalog="$FIXTURE/omarchy-catalog"
	while IFS= read -r installer; do assert_file_contains "$ROOT/bootstrap/catalog/v1/legacy.tsv" "$installer" || return 1; done < <(find "$ROOT" -maxdepth 1 -type f -name 'install-*.sh' -printf '%f\n' | LC_ALL=C sort)
	cp -R "$ROOT/bootstrap/catalog/v1" "$catalog"
	sed -i '/omarchy-3.8.4/d' "$catalog/ownership.tsv"
	expect_refusal env BOOTSTRAP_SENTINEL_SECRET=SENTINEL_SECRET_VALUE BOOTSTRAP_CATALOG_DIR="$catalog" BOOTSTRAP_TEST_OMARCHY_VERSION=3.8.3 BOOTSTRAP_TEST_HYPRLAND_VERSION=0.56 "$ROOT/bin/workstation-bootstrap" check --profile omarchy
	assert_file_contains "$FIXTURE/out" "OMARCHY_VERSION_UNVERIFIED" || return 1
	assert_file_not_contains "$FIXTURE/out" "SENTINEL_SECRET_VALUE"
}

test_workstation_source_contract() {
	local before after contract="$FIXTURE/workstation-source-v1.tsv" output repo_before repo_after index_before index_after status_before status_after
	repo_fingerprint() {
		while IFS= read -r -d '' tracked_file; do
			if [[ -L $ROOT/$tracked_file ]]; then printf 'link\t%s\t%s\n' "$tracked_file" "$(readlink "$ROOT/$tracked_file")"; else printf 'file\t%s\t' "$tracked_file"; sha256sum "$ROOT/$tracked_file" | awk '{print $1}'; fi
		done < <(git -C "$ROOT" ls-files -z)
	}
	before=$(tree_fingerprint "$HOME")
	repo_before=$(repo_fingerprint | sha256sum | awk '{print $1}')
	index_before=$(git -C "$ROOT" write-tree)
	status_before=$(git -C "$ROOT" status --porcelain=v1 --untracked-files=all)
	env BOOTSTRAP_TEST_OMARCHY_OBSERVATION='Omarchy 4.2.1' BOOTSTRAP_TEST_PRESENT_PROBES='nvim,starship,tmux,zsh' \
		"$ROOT/bin/workstation-bootstrap" observe --profile profile:base >"$FIXTURE/source-one"
	after=$(tree_fingerprint "$HOME")
	[[ $before == "$after" ]] || { fail "source observation mutated fixture"; return 1; }
	cp "$FIXTURE/source-one" "$FIXTURE/source-first"
	env BOOTSTRAP_TEST_OMARCHY_OBSERVATION='Omarchy 4.2.1' BOOTSTRAP_TEST_PRESENT_PROBES='nvim,starship,tmux,zsh' \
		"$ROOT/bin/workstation-bootstrap" observe --profile profile:base >"$FIXTURE/source-two"
	repo_after=$(repo_fingerprint | sha256sum | awk '{print $1}')
	index_after=$(git -C "$ROOT" write-tree)
	status_after=$(git -C "$ROOT" status --porcelain=v1 --untracked-files=all)
	[[ $repo_before == "$repo_after" && $index_before == "$index_after" && $status_before == "$status_after" ]] || fail "source observation changed repository, index, or status"
	cmp "$FIXTURE/source-first" "$FIXTURE/source-two" || fail "source observation was not deterministic"
	assert_file_contains "$FIXTURE/source-one" $'schema\tworkstation-source-v1' || return 1
	assert_file_contains "$FIXTURE/source-one" $'platform\tlinux\tx86_64' || return 1
	assert_file_contains "$FIXTURE/source-one" $'omarchy\tobserved\t4.2.1\tomarchy-4' || return 1
	assert_file_contains "$FIXTURE/source-one" $'profile\tprofile:base\tbase\tmacos,shared\tselected' || return 1
	assert_file_contains "$FIXTURE/source-one" $'profile\tprofile:omarchy\tomarchy\tarch/omarchy\tavailable' || return 1
	assert_file_contains "$FIXTURE/source-one" $'program\tprogram:neovim\tpresent\tunavailable\tunavailable\tunavailable\tunavailable' || return 1
	assert_file_contains "$FIXTURE/source-one" $'program\tprogram:backgrounds\tunavailable\tunavailable\tunavailable\tunavailable\tunavailable' || return 1
	assert_file_contains "$FIXTURE/source-one" $'program\tprogram:hyprpaper\tmissing\tunavailable\tunavailable\tunavailable\tunavailable' || return 1
	assert_file_contains "$FIXTURE/source-one" $'dependency\tdependency:hyprland-theme\tunavailable\tunavailable\tunavailable\tunavailable\tunavailable' || return 1
	assert_file_contains "$FIXTURE/source-one" $'status\tcomplete' || return 1
	assert_file_not_contains "$FIXTURE/source-one" '3.8.4' || return 1
	assert_file_not_contains "$FIXTURE/source-one" "$HOME" || return 1
	awk -F '\t' '$1=="profile" {n=split($4,a,","); for(i=1;i<=n;i++) owner[a[i]]=$2; next} $1=="source" {print "expectation\t" owner[$2] "\t" $3 "\t" $2 "\t" $4 "\t" $5 "\t" $6 "\t" $7 "\t" $8}' "$ROOT/bootstrap/contracts/workstation-source-v1.tsv" | sort >"$FIXTURE/expected-mappings"
	awk -F '\t' '$1=="expectation"' "$FIXTURE/source-one" >"$FIXTURE/actual-mappings"
	cmp "$FIXTURE/expected-mappings" "$FIXTURE/actual-mappings" || fail "emitted expectations do not exactly cover manifest mappings"
	awk -F '\t' 'FNR==NR {if ($1=="program" || $1=="dependency") evidence[$1 FS $2]++; next} $1=="expectation" {expectations++; if (evidence[$7 FS $8]!=1) exit 1} END {if (!expectations) exit 1}' "$FIXTURE/source-one" "$FIXTURE/source-one" || fail "expectation/evidence relationships are incomplete or duplicated"

	cp "$ROOT/bootstrap/contracts/workstation-source-v1.tsv" "$contract"
	printf 'source\tshared\tany\tunknown-package\tunknown\tprogram\tprogram:unknown\tnone\n' >>"$contract"
	expect_refusal env BOOTSTRAP_SOURCE_MANIFEST="$contract" "$ROOT/bin/workstation-bootstrap" observe --profile profile:base
	[[ $(cat "$FIXTURE/out") == $'schema\tworkstation-source-v1\nstatus\trefused\tSOURCE_MANIFEST_INVALID' ]] || fail "manifest refusal was not structured and safe"
	expect_refusal "$ROOT/bin/workstation-bootstrap" observe --profile profile:unknown
	[[ $(cat "$FIXTURE/out") == $'schema\tworkstation-source-v1\nstatus\trefused\tPROFILE_UNKNOWN' ]] || fail "profile refusal code was not preserved"

	env BOOTSTRAP_TEST_OS=darwin BOOTSTRAP_TEST_ARCH=arm64 BOOTSTRAP_TEST_OMARCHY_OBSERVATION=missing \
		"$ROOT/bin/workstation-bootstrap" observe --profile profile:omarchy >"$FIXTURE/source-platform"
	assert_file_contains "$FIXTURE/source-platform" $'platform\tmacos\taarch64' || return 1
	assert_file_contains "$FIXTURE/source-platform" $'omarchy\tunavailable\tmissing\t-' || return 1
	assert_file_contains "$FIXTURE/source-platform" $'profile\tprofile:base\tbase\tmacos,shared\tavailable' || return 1
	assert_file_contains "$FIXTURE/source-platform" $'profile\tprofile:omarchy\tomarchy\tarch/omarchy\tselected' || return 1

	for observation in 'Omarchy 3.9.0' 'Omarchy 4.0.0-rc.1+build.5' 'Omarchy 5.1.0' missing timeout 'release candidate'; do
		output=$(env BOOTSTRAP_TEST_OMARCHY_OBSERVATION="$observation" "$ROOT/bin/workstation-bootstrap" observe --profile profile:base)
		case $observation in
			'Omarchy 3.9.0') [[ $output == *$'omarchy\tobserved\t3.9.0\tomarchy-3'* ]] || fail "Omarchy 3 classification failed";;
			'Omarchy 4.0.0-rc.1+build.5') [[ $output == *$'omarchy\tobserved\t4.0.0-rc.1+build.5\tomarchy-4'* ]] || fail "full SemVer classification failed";;
			'Omarchy 5.1.0') [[ $output == *$'omarchy\tunavailable\tunsupported-major\t-'* ]] || fail "future Omarchy was promoted";;
			missing|timeout) [[ $output == *$'omarchy\tunavailable\t'"$observation"$'\t-'* ]] || fail "$observation classification failed";;
			*) [[ $output == *$'omarchy\tunavailable\tmalformed-or-ambiguous\t-'* ]] || fail "malformed/ambiguous classification failed";;
		esac
	done
	for observation in 'Omarchy 01.2.3' 'Omarchy 1.02.3' 'Omarchy 1.2.03' 'Omarchy 1.2.3.4' 'Omarchy v1.2.3' 'Omarchy x1.2.3' 'Omarchy 1.2.3x' 'Omarchy 1.2.3-01' 'Omarchy 1.2.3+' 'Omarchy 3.9.0 and 4.0.0' $'Omarchy 3.9.0\nOmarchy 4.0.0' 'Omarchy ４.２.３'; do
		output=$(env BOOTSTRAP_TEST_OMARCHY_OBSERVATION="$observation" "$ROOT/bin/workstation-bootstrap" observe --profile profile:base)
		[[ $output == *$'omarchy\tunavailable\tmalformed-or-ambiguous\t-'* ]] || fail "malformed SemVer was promoted: $observation"
	done
	output=$(env BOOTSTRAP_TEST_OMARCHY_OBSERVATION="$(printf '%0513d' 0)" "$ROOT/bin/workstation-bootstrap" observe --profile profile:base)
	[[ $output == *$'omarchy\tunavailable\toutput-limit\t-'* ]] || fail "Omarchy output limit was not typed unavailable"
	local stub="$FIXTURE/source-stub"
	mkdir -p "$stub"
	printf '#!/usr/bin/env bash\nprintf "SENTINEL_SECRET_VALUE /home/alice" >&2\nsleep 3\n' >"$stub/omarchy"
	chmod +x "$stub/omarchy"
	timeout 4s env PATH="$stub:$PATH" "$ROOT/bin/workstation-bootstrap" observe --profile profile:base >"$FIXTURE/source-timeout" 2>"$FIXTURE/source-timeout-err" || fail "bounded Omarchy probe exceeded total deadline"
	assert_file_contains "$FIXTURE/source-timeout" $'omarchy\tunavailable\ttimeout\t-' || return 1
	[[ ! -s $FIXTURE/source-timeout-err ]] || fail "source probe exposed stderr"
	assert_file_not_contains "$FIXTURE/source-timeout" 'SENTINEL_SECRET_VALUE' || return 1

	cp "$ROOT/bootstrap/contracts/workstation-source-v1.tsv" "$contract"
	sed -i '/source\tshared\tany\tnvim/d' "$contract"
	expect_refusal env BOOTSTRAP_SOURCE_MANIFEST="$contract" "$ROOT/bin/workstation-bootstrap" observe --profile profile:base
	[[ $(cat "$FIXTURE/out") == $'schema\tworkstation-source-v1\nstatus\trefused\tSOURCE_MANIFEST_INCOMPLETE' ]] || fail "omitted mapping was not refused as incomplete"
	cp "$ROOT/bootstrap/contracts/workstation-source-v1.tsv" "$contract"
	printf 'source\tshared\tany\tnvim\teditor\tprogram\tprogram:other\tnvim\n' >>"$contract"
	expect_refusal env BOOTSTRAP_SOURCE_MANIFEST="$contract" "$ROOT/bin/workstation-bootstrap" observe --profile profile:base
	[[ $(cat "$FIXTURE/out") == $'schema\tworkstation-source-v1\nstatus\trefused\tSOURCE_MANIFEST_INVALID' ]] || fail "duplicate/contradictory mapping was not refused"
	cp "$ROOT/bootstrap/contracts/workstation-source-v1.tsv" "$contract"
	sed -i 's/\tnvim$/\tcurl/' "$contract"
	expect_refusal env BOOTSTRAP_SOURCE_MANIFEST="$contract" "$ROOT/bin/workstation-bootstrap" observe --profile profile:base
	[[ $(cat "$FIXTURE/out") == $'schema\tworkstation-source-v1\nstatus\trefused\tSOURCE_MANIFEST_INVALID' ]] || fail "non-allowlisted probe was not refused"
	cp "$ROOT/bootstrap/contracts/workstation-source-v1.tsv" "$contract"
	printf '%0513d\n' 0 >>"$contract"
	expect_refusal env BOOTSTRAP_SOURCE_MANIFEST="$contract" "$ROOT/bin/workstation-bootstrap" observe --profile profile:base
	[[ $(cat "$FIXTURE/out") == $'schema\tworkstation-source-v1\nstatus\trefused\tSOURCE_MANIFEST_INVALID' ]] || fail "overlong manifest record was not refused"
}

# RED: Work-B lifecycle does not exist yet; this test must fail before the bounded implementation.
test_work_b_lifecycle_contract() {
	local catalog="$FIXTURE/managed-catalog" plan hash before after
	mkdir -p "$catalog"
	cp "$ROOT/bootstrap/catalog/v1/profiles.tsv" "$catalog/profiles.tsv"
	cp "$ROOT/bootstrap/catalog/v1/pins.tsv" "$catalog/pins.tsv"
	cp "$ROOT/bootstrap/catalog/v1/ownership.tsv" "$catalog/ownership.tsv"
	cp "$ROOT/bootstrap/catalog/v1/legacy.tsv" "$catalog/legacy.tsv"
	printf 'schema\tbrf-v1\naction\tbase@1\t090\tfixture-state\tmanaged-state\tyes\tinternal\tfixture-state\n' >"$catalog/actions.tsv"
	set +e
	env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base >"$FIXTURE/managed-plan" 2>"$FIXTURE/managed-err"
	local plan_rc=$?
	set -e
	[[ $plan_rc -eq 0 ]] || {
		fail "managed fixture plan must be apply-capable"
		return
	}
	plan="$FIXTURE/managed-plan"
	hash=$(awk -F '\t' '$1=="plan_hash" {print $2}' "$plan")
	before=$(tree_fingerprint "$HOME")
	expect_exit 3 env BOOTSTRAP_INJECT_MANAGED_FAILURE=yes BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" apply --plan "$plan" --expect-hash "$hash"
	[[ ! -e "$XDG_STATE_HOME/omarchy-supplement/bootstrap/managed/fixture-state" ]] || {
		fail "failed action changed target"
		return
	}
	env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" apply --plan "$plan" --expect-hash "$hash" >"$FIXTURE/receipt"
	local receipt
	receipt=$(cat "$FIXTURE/receipt")
	[[ -f $receipt ]] || {
		fail "apply receipt missing"
		return
	}
	env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" verify --receipt "$receipt" >"$FIXTURE/verify"
	assert_file_contains "$FIXTURE/verify" "verify-apply-" || return 1
	[[ $(cat "$XDG_STATE_HOME/omarchy-supplement/bootstrap/managed/fixture-state") == managed-state-v1 ]] || {
		fail "managed state not written"
		return
	}
	# Convergence: a second canonical plan is a visible no-op for the managed target.
	env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base >"$FIXTURE/second-plan"
	local second_hash
	second_hash=$(awk -F '\t' '$1=="plan_hash" {print $2}' "$FIXTURE/second-plan")
	env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" apply --plan "$FIXTURE/second-plan" --expect-hash "$second_hash" >/dev/null
	[[ $(cat "$XDG_STATE_HOME/omarchy-supplement/bootstrap/managed/fixture-state") == managed-state-v1 ]] || {
		fail "second apply was not a no-op"
		return
	}
	# TRIANGULATE: changed state makes the original approval stale before any second mutation.
	printf 'drift\n' >"$XDG_STATE_HOME/omarchy-supplement/bootstrap/managed/fixture-state"
	expect_exit 2 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" apply --plan "$plan" --expect-hash "$hash"
	after=$(tree_fingerprint "$HOME")
	[[ $before == "$after" ]] || fail "managed apply touched HOME outside fixture state"
	expect_exit 3 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" verify --receipt "$receipt"
	# A malformed approval is refused before a lock or target mutation.
	printf 'unknown\tbad\n' >>"$plan"
	expect_exit 2 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" apply --plan "$plan" --expect-hash "$hash"
}

run_test work-b-lifecycle-contract test_work_b_lifecycle_contract
test_safe_legacy_boundaries() {
	local stub="$FIXTURE/stubs"
	mkdir -p "$stub"
	for command in yay pacman stow git curl wget kill; do
		printf '#!/usr/bin/env bash\necho unsafe-command >&2\nexit 99\n' >"$stub/$command"
		chmod +x "$stub/$command"
	done
	expect_exit 2 env PATH="$stub:$PATH" "$ROOT/install-all.sh"
	expect_exit 2 env PATH="$stub:$PATH" "$ROOT/install-dotfiles.sh"
	expect_exit 2 env PATH="$stub:$PATH" "$ROOT/install-mkalias.sh"
	expect_exit 2 env PATH="$stub:$PATH" "$ROOT/install-discord.sh"
	for wrapper in install-all.sh install-dotfiles.sh install-mkalias.sh install-discord.sh; do
		for unsafe in yay pacman stow 'git clone' 'rm -rf' 'kill '; do
			assert_file_not_contains "$ROOT/$wrapper" "$unsafe" || return 1
		done
	done
	# Static, non-desktop regression: the nested predicate reads the configured value
	# and has no literal workspace-ID comparison.
	assert_file_contains "$ROOT/bin/omarchy-work-revyse" 'int(os.environ["WORKSPACE"])' || return 1
	assert_file_not_contains "$ROOT/bin/omarchy-work-revyse" 'workspace", {}).get("id") != 3' || return 1
}

# RED: receipts must be self-describing BRF evidence and verification must consume them.
test_remediation_receipt_and_blocker_contract() {
	local catalog="$FIXTURE/remediation-catalog" plan hash receipt
	cp -R "$ROOT/bootstrap/catalog/v1" "$catalog"
	printf 'action\tbase@1\t041\tmismatch-package\tpackage\tyes\tarch.pacman\tmismatch-pkg\n' >>"$catalog/actions.tsv"
	expect_refusal env BOOTSTRAP_TEST_OS=darwin BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base
	assert_file_contains "$FIXTURE/out" $'action\tmismatch-package\tpackage' || return 1
	assert_file_contains "$FIXTURE/out" 'PROVIDER_PLATFORM_MISMATCH' || return 1
	printf 'action\tbase@1\t042\tmissing-prerequisite\tshell\tyes\tnone\tprerequisite-no-such-bootstrap-command\naction\tbase@1\t043\tmissing-approved-ref\tshell\tyes\tnone\tapproved-ref-fixture\n' >>"$catalog/actions.tsv"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" 'PREREQUISITE_MISSING' || return 1
	assert_file_contains "$FIXTURE/out" 'SECRET_REFERENCE_MISSING' || return 1
	printf 'schema\tbrf-v1\naction\tbase@1\t090\tfixture-state\tmanaged-state\tyes\tinternal\tfixture-state\n' >"$catalog/actions.tsv"
	rm -rf "$XDG_STATE_HOME/omarchy-supplement"
	env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" plan --profile base >"$FIXTURE/remediation-plan"
	plan="$FIXTURE/remediation-plan"
	hash=$(awk -F '\t' '$1=="plan_hash" {print $2}' "$plan")
	env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" apply --plan "$plan" --expect-hash "$hash" >"$FIXTURE/remediation-receipt-path"
	receipt=$(cat "$FIXTURE/remediation-receipt-path")
	assert_file_contains "$receipt" $'profile\tbase@1' || return 1
	assert_file_contains "$receipt" $'engine_digest\tsha256:' || return 1
	assert_file_contains "$receipt" $'catalog_digest\tsha256:' || return 1
	assert_file_contains "$receipt" $'source_revision\tbootstrap-engine\tsha256:' || return 1
	assert_file_contains "$receipt" $'action\tfixture-state\tcompleted\tmanaged-state-v1\tautomatic' || return 1
	assert_file_contains "$receipt" $'diagnostic\tfixture-state\tNONE' || return 1
	env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" verify --receipt "$receipt" >"$FIXTURE/remediation-verify-path"
	local verify_receipt
	verify_receipt=$(cat "$FIXTURE/remediation-verify-path")
	assert_file_contains "$verify_receipt" $'verification\tfixture-state\tpassed\tmanaged-state-v1\tmanaged-state-v1\tNONE' || return 1
	# TRIANGULATE: every incomplete outcome refuses success but emits a diagnostic receipt.
	local incomplete receipt_variant verify_path rc
	for incomplete in pending blocked not-attempted; do
		receipt_variant="$FIXTURE/$incomplete-receipt"
		sed "s/^action\tfixture-state\tcompleted\tmanaged-state-v1\tautomatic\tNONE$/action\tfixture-state\t$incomplete\tmanaged-state-v1\tunsupported\tINCOMPLETE_$incomplete/" "$receipt" >"$receipt_variant"
		set +e
		env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" verify --receipt "$receipt_variant" >"$FIXTURE/$incomplete-verify-path"
		rc=$?
		set -e
		[[ $rc -eq 2 ]] || {
			fail "$incomplete verification must refuse success"
			return 1
		}
		verify_path=$(cat "$FIXTURE/$incomplete-verify-path")
		assert_file_contains "$verify_path" $'verification\tfixture-state\tblocked\tmanaged-state-v1\tblocked\tINCOMPLETE_' || return 1
	done
	# An unavailable independent observation is a verification failure with receipt evidence.
	rm "$XDG_STATE_HOME/omarchy-supplement/bootstrap/managed/fixture-state"
	set +e
	env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" verify --receipt "$receipt" >"$FIXTURE/unavailable-verify-path"
	rc=$?
	set -e
	[[ $rc -eq 3 ]] || {
		fail "unavailable verification must fail"
		return 1
	}
	verify_path="$XDG_STATE_HOME/omarchy-supplement/bootstrap/receipts/verify-$(basename "$receipt")"
	assert_file_contains "$verify_path" $'verification\tfixture-state\tunavailable\tmanaged-state-v1\tunavailable\tVERIFY_UNAVAILABLE' || return 1
	printf 'drift\n' >"$XDG_STATE_HOME/omarchy-supplement/bootstrap/managed/fixture-state"
	expect_exit 3 env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" verify --receipt "$receipt"
	# Reduced receipts cannot bypass context and per-action diagnostic/recovery evidence.
	awk -F '\t' '$1!="source_revision"' "$receipt" >"$FIXTURE/reduced-receipt"
	expect_exit 64 "$ROOT/bin/workstation-bootstrap" verify --receipt "$FIXTURE/reduced-receipt"
	awk -F '\t' '$1!="diagnostic"' "$receipt" >"$FIXTURE/reduced-receipt"
	expect_exit 64 "$ROOT/bin/workstation-bootstrap" verify --receipt "$FIXTURE/reduced-receipt"
	awk -F '\t' '$1!="recovery"' "$receipt" >"$FIXTURE/reduced-receipt"
	expect_exit 64 "$ROOT/bin/workstation-bootstrap" verify --receipt "$FIXTURE/reduced-receipt"
	cp "$receipt" "$FIXTURE/malformed-receipt"
	printf 'unknown\tbad\n' >>"$FIXTURE/malformed-receipt"
	expect_exit 64 "$ROOT/bin/workstation-bootstrap" verify --receipt "$FIXTURE/malformed-receipt"
}
run_test remediation-receipt-and-blocker-contract test_remediation_receipt_and_blocker_contract
run_test safe-legacy-boundaries test_safe_legacy_boundaries
run_test valid-plan-contract test_valid_plan_contract
run_test parser-matrix test_parser_matrix
run_test profile-determinism-and-isolation test_profile_determinism_and_isolation
run_test dotfiles-and-immutability-guards test_dotfiles_and_immutability_guards
run_test identity-and-extended-guards test_identity_and_extended_guards
run_test safe-boundaries test_safe_boundaries
run_test acceptance-gap-contract test_acceptance_gap_contract
run_test workstation-source-contract test_workstation_source_contract
printf 'PASS bootstrap suite\n'
