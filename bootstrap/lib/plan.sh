#!/usr/bin/env bash
# shellcheck disable=SC2086 # Profiles are intentionally expanded into positional arguments.
plan_emit() {
	local catalog=$1 os=$2 arch=$3
	shift 3
	local profiles action_count=0 blocked=0 row order id kind required provider desired status
	local pin_kind pin_revision pin_integrity engine_digest catalog_digest resolve_rc
	set +e
	profiles=$(resolve_profiles "$catalog" "$os" "$arch" "$@")
	resolve_rc=$?
	set -e
	if ((resolve_rc)); then
		[[ -n $profiles ]] && printf '%s\n' "$profiles"
		return "$resolve_rc"
	fi
	engine_digest=$(bootstrap_digest_files "$ROOT/bin/workstation-bootstrap" "$ROOT/bootstrap/lib/core.sh" "$ROOT/bootstrap/lib/catalog.sh" "$ROOT/bootstrap/lib/providers.sh" "$ROOT/bootstrap/lib/dotfiles.sh" "$ROOT/bootstrap/lib/resolve.sh" "$ROOT/bootstrap/lib/plan.sh" "$ROOT/bootstrap/lib/state.sh" "$ROOT/bootstrap/lib/lifecycle.sh") || return "$BOOTSTRAP_REFUSAL"
	catalog_digest=$(bootstrap_digest_files "$catalog/profiles.tsv" "$catalog/actions.tsv" "$catalog/pins.tsv" "$catalog/ownership.tsv" "$catalog/legacy.tsv") || return "$BOOTSTRAP_REFUSAL"
	printf 'schema\tbrf-v1\nplan_schema\tv1\nplatform\t%s\t%s\nengine_digest\t%s\ncatalog_digest\t%s\n' "$os" "$arch" "$engine_digest" "$catalog_digest"
	while IFS= read -r row; do printf 'profile\t%s\n' "$row"; done <<<"$profiles"
	while IFS=$'\t' read -r order id kind required provider desired status; do
		[[ -n $id ]] || continue
		((action_count += 1))
		if [[ $kind == managed-state ]]; then
			if [[ -n ${BOOTSTRAP_TEST_OS:-} && ! -e "$(state_root)/managed/$desired" ]]; then
				status=CHANGE_NEEDED
			elif [[ -n ${BOOTSTRAP_TEST_OS:-} && -f "$(state_root)/managed/$desired" && $(cat "$(state_root)/managed/$desired") == managed-state-v1 ]]; then
				status=SATISFIED
			else status=MANAGED_STATE_FIXTURE_ONLY; fi
			printf 'action\t%s\t%s\t%s\t%s\t%s\t%s\t%s\tautomatic\n' "$id" "$kind" "$order" "$required" "$provider" "$desired" "$([[ $status == CHANGE_NEEDED ]] && echo execute || echo noop)"
			[[ $status == CHANGE_NEEDED || $status == SATISFIED ]] || {
				printf 'block\t%s\t%s\texpected\tobserved\tfixture-only\n' "$id" "$status"
				blocked=1
			}
			continue
		fi
		# Model prerequisite and approved external-reference availability without reading values.
		if [[ $status != PROVIDER_PLATFORM_MISMATCH && $desired == prerequisite-* ]]; then
			command -v "${desired#prerequisite-}" >/dev/null 2>&1 || status=PREREQUISITE_MISSING
		elif [[ $status != PROVIDER_PLATFORM_MISMATCH && $desired == approved-ref-* ]]; then
			local ref_var="BOOTSTRAP_APPROVED_REF_${id//-/_}"
			[[ -n ${!ref_var:-} ]] || status=SECRET_REFERENCE_MISSING
		fi
		pin_kind=$(awk -F '\t' -v d="$desired" '$1=="pin" && $2==d {print $3; exit}' "$catalog/pins.tsv")
		pin_revision=$(awk -F '\t' -v d="$desired" '$1=="pin" && $2==d {print $5; exit}' "$catalog/pins.tsv")
		pin_integrity=$(awk -F '\t' -v d="$desired" '$1=="pin" && $2==d {print $7; exit}' "$catalog/pins.tsv")
		if [[ $kind == dotfiles ]]; then
			if [[ $pin_kind != embedded || ! $pin_revision =~ ^sha256:[0-9a-f]{64}$ ]]; then
				status=PIN_MISSING
			elif [[ -z $pin_integrity || $pin_integrity == - ]]; then
				status=INTEGRITY_MISSING
			else status=$(dotfiles_status "$pin_revision"); fi
			[[ $status == DOTFILES_READY ]] && status=$(ownership_status "$catalog" "$desired")
		fi
		if [[ $id == omarchy-desktop ]]; then
			status=$(omarchy_baseline_status)
			while IFS=$'\t' read -r _ ownership_desired _ _ target; do
				[[ $ownership_desired == "$desired" ]] && managed_source_forbidden "$target" && status=MANAGED_SOURCE_FORBIDDEN
			done < <(tail -n +2 "$catalog/ownership.tsv")
		fi
		printf 'input_pin\t%s\t%s\t%s\n' "$desired" "${pin_revision:--}" "${pin_integrity:--}"
		[[ $status == DOTFILES_READY || $status == OWNERSHIP_CLEAR || $status == OMARCHY_BASELINE_READY ]] && status=PROVIDER_APPLY_UNIMPLEMENTED
		printf 'action\t%s\t%s\t%s\t%s\t%s\t%s\tblocked\tunsupported\n' "$id" "$kind" "$order" "$required" "$provider" "$desired"
		printf 'block\t%s\t%s\texpected\tobserved\tmanual-resolution\n' "$id" "$status"
		blocked=1
	done < <(resolve_actions "$catalog" "$os" $profiles)
	((action_count > 0)) || {
		bootstrap_error "NO_ACTIONS"
		return "$BOOTSTRAP_INVALID"
	}
	printf 'profile_complete\t%s\n' "$([[ $blocked -eq 0 ]] && echo true || echo false)"
	((blocked)) && return "$BOOTSTRAP_REFUSAL"
	return 0
}
