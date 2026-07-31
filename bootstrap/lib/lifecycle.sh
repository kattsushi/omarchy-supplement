#!/usr/bin/env bash
plan_payload_from_file() { tail -n +2 "$1"; }
plan_file_hash() {
	local payload
	payload=$(plan_payload_from_file "$1")
	printf '%s' "$payload" | bootstrap_hash
}
plan_profiles() { awk -F '\t' '$1=="profile" {printf "%s\n", $2}' "$1"; }
plan_has_only_managed_action() {
	awk -F '\t' '$1=="action" && !($2=="fixture-state" && $3=="managed-state" && ($8=="execute" || $8=="noop")) {bad=1} END {exit bad}' "$1"
}
receipt_validate() {
	awk -F '\t' '
		BEGIN { schema=operation=status=hash=engine=catalog=source=0 }
		$1=="schema" && NF==2 && $2=="brf-v1" { schema++; next }
		$1=="operation" && NF==2 && $2=="apply" { operation++; next }
		$1=="status" && NF==2 && $2 ~ /^(final|pending|failed)$/ { status++; next }
		$1=="plan_hash" && NF==2 && $2 ~ /^sha256:[0-9a-f]+$/ { hash++; next }
		$1=="engine_digest" && NF==2 && $2 ~ /^sha256:[0-9a-f]+$/ { engine++; next }
		$1=="catalog_digest" && NF==2 && $2 ~ /^sha256:[0-9a-f]+$/ { catalog++; next }
		$1=="profile" && NF==2 { profiles++; next }
		$1=="source_revision" && NF==4 { source++; next }
		$1=="action" && NF==6 && $3 ~ /^(pending|completed|noop|failed|blocked|not-attempted)$/ && $5 ~ /^(automatic|manual|unsupported)$/ { actions[$2]++; action_count++; next }
		$1=="diagnostic" && NF==3 { diagnostics[$2]++; next }
		$1=="recovery" && NF==3 { recoveries[$2]++; next }
		{ invalid=1 }
		END {
			for (action in actions) if (diagnostics[action] != 1 || recoveries[action] != 1) invalid=1
			exit !(schema==1 && operation==1 && status==1 && hash==1 && engine==1 && catalog==1 && profiles>0 && source>0 && action_count>0 && !invalid)
		}
	' "$1"
}
receipt_context_from_plan() {
	awk -F '\t' '
		$1=="profile" || $1=="engine_digest" || $1=="catalog_digest" { print }
		$1=="engine_digest" { engine=$2 }
		$1=="catalog_digest" { catalog=$2 }
		$1=="input_pin" { print "source_revision\t" $2 "\t" $3 "\t" $4 }
		END { print "source_revision\tbootstrap-engine\t" engine "\t" catalog }
	' "$1"
}
receipt_action_record() {
	local outcome=$1 expected=$2 rollback=$3 diagnostic=$4
	printf 'action\tfixture-state\t%s\t%s\t%s\t%s\n' "$outcome" "$expected" "$rollback" "$diagnostic"
	printf 'diagnostic\tfixture-state\t%s\n' "$diagnostic"
	printf 'recovery\tfixture-state\tinspect-receipt-and-replan\n'
}
lifecycle_current_plan() {
	local catalog=$1
	shift
	local payload rc
	set +e
	payload=$(plan_emit "$catalog" "$(bootstrap_os)" "$(bootstrap_arch)" "$@")
	rc=$?
	set -e
	((rc == 0)) || return "$rc"
	printf 'plan_hash\t%s\n%s\n' "$(printf '%s' "$payload" | bootstrap_hash)" "$payload"
}
lifecycle_apply() {
	local catalog=$1 plan=$2 expected=$3 supplied fresh fresh_hash root receipt target current backup context action
	[[ -f $plan && ! -L $plan ]] || {
		bootstrap_error 'PLAN_INVALID'
		return "$BOOTSTRAP_INVALID"
	}
	supplied=$(plan_file_hash "$plan") || return "$BOOTSTRAP_INVALID"
	[[ $supplied == "$expected" ]] || {
		bootstrap_error 'PLAN_HASH_MISMATCH'
		return "$BOOTSTRAP_REFUSAL"
	}
	[[ $(head -n1 "$plan") == $'plan_hash\t'* ]] || {
		bootstrap_error 'PLAN_INVALID'
		return "$BOOTSTRAP_INVALID"
	}
	mapfile -t profiles < <(plan_profiles "$plan")
	((${#profiles[@]})) || {
		bootstrap_error 'PLAN_INVALID'
		return "$BOOTSTRAP_INVALID"
	}
	fresh=$(lifecycle_current_plan "$catalog" "${profiles[@]}") || {
		bootstrap_error 'PLAN_STALE'
		return "$BOOTSTRAP_REFUSAL"
	}
	fresh_hash=$(printf '%s' "$fresh" | tail -n +2 | bootstrap_hash) || return 70
	[[ $fresh_hash == "$expected" ]] || {
		bootstrap_error 'PLAN_STALE'
		return "$BOOTSTRAP_REFUSAL"
	}
	plan_has_only_managed_action "$plan" || {
		bootstrap_error 'ACTION_UNSUPPORTED'
		return "$BOOTSTRAP_REFUSAL"
	}
	context=$(receipt_context_from_plan "$plan")
	root=$(state_root)
	state_guard "$root" || return $?
	state_lock "$root" || return $?
	trap state_unlock RETURN
	receipt="$root/receipts/apply-$supplied.brf"
	target="$root/managed/fixture-state"
	if awk -F '\t' '$1=="action" && $8=="noop" {found=1} END {exit !found}' "$plan"; then
		action=$(receipt_action_record noop managed-state-v1 automatic NONE)
		state_atomic_write "$receipt" $'schema\tbrf-v1\noperation\tapply\nstatus\tfinal\nplan_hash\t'"$supplied"$'\n'"$context"$'\n'"$action" || return 70
		printf '%s\n' "$receipt"
		return 0
	fi
	action=$(receipt_action_record pending managed-state-v1 automatic NONE)
	state_atomic_write "$receipt" $'schema\tbrf-v1\noperation\tapply\nstatus\tpending\nplan_hash\t'"$supplied"$'\n'"$context"$'\n'"$action" || return 70
	if [[ -e $target || -L $target ]]; then
		[[ -f $target && ! -L $target ]] || {
			bootstrap_error 'MANAGED_TARGET_UNSAFE'
			return "$BOOTSTRAP_REFUSAL"
		}
		current=$(state_file_hash "$target")
		[[ -f "$root/receipts/ownership" && $(cat "$root/receipts/ownership") == "$current" ]] || {
			bootstrap_error 'MANAGED_STATE_DRIFT'
			return "$BOOTSTRAP_REFUSAL"
		}
		backup="$root/backups/fixture-state-$supplied"
		cp -p "$target" "$backup" && chmod 600 "$backup" || return 70
		state_atomic_write "$root/backups/fixture-state-$supplied.brf" $'schema\tbrf-v1\nbackup\tfixture-state\npre_hash\t'"$current"$'\nrollback\tautomatic\nrestore\tmanual-copy-after-hash-check' || return 70
	fi
	if [[ ${BOOTSTRAP_INJECT_MANAGED_FAILURE:-} == yes ]]; then
		action=$(receipt_action_record failed managed-state-v1 automatic INJECTED_FAILURE)
		state_atomic_write "$receipt" $'schema\tbrf-v1\noperation\tapply\nstatus\tfailed\nplan_hash\t'"$supplied"$'\n'"$context"$'\n'"$action"
		return 3
	fi
	state_atomic_write "$target" 'managed-state-v1' || return 70
	current=$(state_file_hash "$target")
	state_atomic_write "$root/receipts/ownership" "$current" || return 70
	action=$(receipt_action_record completed managed-state-v1 automatic NONE)
	state_atomic_write "$receipt" $'schema\tbrf-v1\noperation\tapply\nstatus\tfinal\nplan_hash\t'"$supplied"$'\n'"$context"$'\n'"$action" || return 70
	printf '%s\n' "$receipt"
}
lifecycle_verify() {
	local receipt=$1 root out action_id outcome expected rollback diagnostic observed verification=() rc=0 context
	[[ -f $receipt && ! -L $receipt ]] || {
		bootstrap_error 'RECEIPT_INVALID'
		return "$BOOTSTRAP_INVALID"
	}
	receipt_validate "$receipt" || {
		bootstrap_error 'RECEIPT_INVALID'
		return "$BOOTSTRAP_INVALID"
	}
	root=$(state_root)
	state_guard "$root" || return $?
	context=$(awk -F '\t' '$1=="profile" || $1=="engine_digest" || $1=="catalog_digest" || $1=="source_revision" {print}' "$receipt")
	while IFS=$'\t' read -r _ action_id outcome expected rollback diagnostic; do
		if [[ $outcome == pending || $outcome == blocked || $outcome == not-attempted ]]; then
			verification+=("verification\t$action_id\tblocked\t$expected\tblocked\t$diagnostic")
			((rc == 3)) || rc=$BOOTSTRAP_REFUSAL
			continue
		fi
		if [[ $action_id == fixture-state && -f "$root/managed/fixture-state" && ! -L "$root/managed/fixture-state" ]]; then
			observed=$(cat "$root/managed/fixture-state")
		else
			observed=unavailable
		fi
		if [[ $observed == "$expected" ]]; then
			verification+=("verification\t$action_id\tpassed\t$expected\t$observed\tNONE")
		elif [[ $observed == unavailable ]]; then
			verification+=("verification\t$action_id\tunavailable\t$expected\t$observed\tVERIFY_UNAVAILABLE")
			rc=3
		else
			verification+=("verification\t$action_id\tfailed\t$expected\t$observed\tVERIFY_DRIFT")
			rc=3
		fi
	done < <(awk -F '\t' '$1=="action" {print}' "$receipt")
	out="$root/receipts/verify-$(basename "$receipt")"
	state_atomic_write "$out" $'schema\tbrf-v1\noperation\tverify\napply_receipt\t'"$(basename "$receipt")"$'\n'"$context"$'\n'"$(printf '%b\n' "${verification[@]}")" || return 70
	if ((rc == 3)); then
		bootstrap_error 'VERIFY_DRIFT'
		return "$rc"
	fi
	if ((rc == BOOTSTRAP_REFUSAL)); then
		printf '%s\n' "$out"
		bootstrap_error 'VERIFY_INCOMPLETE'
		return "$rc"
	fi
	printf '%s\n' "$out"
}
