#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
# shellcheck source=assertions.sh
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
	local before after
	before="$(tree_fingerprint "$HOME")"
	expect_refusal run_cli check --profile base
	after="$(tree_fingerprint "$HOME")"
	[[ "$before" == "$after" ]] || {
		fail "check mutated fixture"
		return 1
	}
	assert_file_contains "$FIXTURE/out" "PIN_MISSING" || return 1
	git init -q "$HOME/dotfiles"
	git -C "$HOME/dotfiles" config user.email fixture@example.invalid
	git -C "$HOME/dotfiles" config user.name fixture
	printf 'x\n' >"$HOME/dotfiles/file"
	git -C "$HOME/dotfiles" add file
	git -C "$HOME/dotfiles" commit -qm fixture
	git -C "$HOME/dotfiles" remote add origin https://example.invalid/wrong/dotfiles.git
	local wrong_catalog="$FIXTURE/wrong-catalog"
	cp -R "$ROOT/bootstrap/catalog/v1" "$wrong_catalog"
	sed -i 's/^pin\tdotfiles-v2\tgit\tgithub.com\/kattsushi\/dotfiles-v2\t-\tsha256\t-$/pin\tdotfiles-v2\tgit\tgithub.com\/kattsushi\/dotfiles-v2\taaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\tsha256\tfixture/' "$wrong_catalog/pins.tsv"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$wrong_catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "DOTFILES_REMOTE_MISMATCH" || return 1
	rm -rf "$HOME/dotfiles"
	git init -q "$HOME/dotfiles"
	git -C "$HOME/dotfiles" config user.email fixture@example.invalid
	git -C "$HOME/dotfiles" config user.name fixture
	mkdir -p "$HOME/dotfiles/common/config"
	printf 'fixture\n' >"$HOME/dotfiles/common/config/example"
	git -C "$HOME/dotfiles" add common/config/example
	git -C "$HOME/dotfiles" commit -qm expected
	git -C "$HOME/dotfiles" remote add origin https://github.com/kattsushi/dotfiles-v2.git
	local head catalog="$FIXTURE/ready-catalog"
	head=$(git -C "$HOME/dotfiles" rev-parse HEAD)
	cp -R "$ROOT/bootstrap/catalog/v1" "$catalog"
	sed -i "s/^pin\\tdotfiles-v2\\tgit\\tgithub.com\\/kattsushi\\/dotfiles-v2\\t-\\tsha256\\t-$/pin\\tdotfiles-v2\\tgit\\tgithub.com\\/kattsushi\\/dotfiles-v2\\t$head\\tsha256\\tfixture/" "$catalog/pins.tsv"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "PROVIDER_APPLY_UNIMPLEMENTED" || return 1
	printf 'dirty\n' >>"$HOME/dotfiles/common/config/example"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "DOTFILES_DIRTY" || return 1
	printf 'fixture\n' >"$HOME/dotfiles/common/config/example"
	mkdir -p "$HOME/.config"
	printf 'unmanaged\n' >"$HOME/.config/example"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "TARGET_UNMANAGED" || return 1
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

# RED: Work-A acceptance requires every plan-relevant engine/catalog/source fact to be
# visible in canonical identity, SSH remote normalization, and bounded Omarchy baselines.
test_acceptance_gap_contract() {
	expect_refusal run_cli plan --profile base
	assert_file_contains "$FIXTURE/out" $'engine_digest\tsha256:' || return 1
	assert_file_contains "$FIXTURE/out" $'catalog_digest\tsha256:' || return 1
	local catalog="$FIXTURE/ssh-catalog"
	cp -R "$ROOT/bootstrap/catalog/v1" "$catalog"
	git init -q "$HOME/dotfiles"
	git -C "$HOME/dotfiles" config user.email fixture@example.invalid
	git -C "$HOME/dotfiles" config user.name fixture
	mkdir -p "$HOME/dotfiles/common/config"
	printf 'fixture\n' >"$HOME/dotfiles/common/config/example"
	git -C "$HOME/dotfiles" add common/config/example
	git -C "$HOME/dotfiles" commit -qm ssh-fixture
	local head
	head=$(git -C "$HOME/dotfiles" rev-parse HEAD)
	git -C "$HOME/dotfiles" remote add origin ssh://git@github.com/kattsushi/dotfiles-v2.git
	sed -i "s/^pin\\tdotfiles-v2\\tgit\\tgithub.com\\/kattsushi\\/dotfiles-v2\\t-\\tsha256\\t-$/pin\\tdotfiles-v2\\tgit\\tgithub.com\\/kattsushi\\/dotfiles-v2\\t$head\\tsha256\\tfixture/" "$catalog/pins.tsv"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "PROVIDER_APPLY_UNIMPLEMENTED" || return 1
	mkdir -p "$HOME/.config"
	rm -f "$HOME/.config/example"
	ln -s "$HOME/dotfiles/common/config/example" "$HOME/.config/example"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "PROVIDER_APPLY_UNIMPLEMENTED" || return 1
	rm "$HOME/.config/example"
	ln -s "$HOME/dotfiles/file-that-does-not-exist" "$HOME/.config/example"
	expect_refusal env BOOTSTRAP_CATALOG_DIR="$catalog" "$ROOT/bin/workstation-bootstrap" check --profile base
	assert_file_contains "$FIXTURE/out" "TARGET_OWNER_CONFLICT" || return 1
	rm "$HOME/.config/example"
	local installer
	while IFS= read -r installer; do assert_file_contains "$ROOT/bootstrap/catalog/v1/legacy.tsv" "$installer" || return 1; done < <(find "$ROOT" -maxdepth 1 -type f -name 'install-*.sh' -printf '%f\n' | LC_ALL=C sort)
	sed -i '/omarchy-3.8.4/d' "$catalog/ownership.tsv"
	expect_refusal env BOOTSTRAP_SENTINEL_SECRET=SENTINEL_SECRET_VALUE BOOTSTRAP_CATALOG_DIR="$catalog" BOOTSTRAP_TEST_OMARCHY_VERSION=3.8.3 BOOTSTRAP_TEST_HYPRLAND_VERSION=0.56 "$ROOT/bin/workstation-bootstrap" check --profile omarchy
	assert_file_contains "$FIXTURE/out" "OMARCHY_VERSION_UNVERIFIED" || return 1
	assert_file_not_contains "$FIXTURE/out" "SENTINEL_SECRET_VALUE"
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
printf 'PASS bootstrap suite\n'
