#!/usr/bin/env bash
resolve_profiles() {
	local catalog=$1 os=$2 arch=$3
	shift 3
	local -a wanted=("$@") expanded=() queue=() row record name target row_os architectures implies conflicts
	local requested
	for requested in "${wanted[@]}"; do
		target=$(awk -F '\t' -v p="$requested" '$1=="profile-alias" && $2==p {print $3; exit}' "$catalog/profiles.tsv")
		queue+=("${target:-$requested}")
	done
	while ((${#queue[@]})); do
		name=${queue[0]}
		queue=("${queue[@]:1}")
		[[ " ${expanded[*]} " == *" $name "* ]] && continue
		row=$(awk -F '\t' -v p="$name" -v current_os="$os" '$1=="profile" && $2==p { if (!fallback) fallback=$0; if ($3==current_os) { print; found=1; exit } } END { if (!found && fallback) print fallback }' "$catalog/profiles.tsv")
		[[ -n $row ]] || {
			bootstrap_error "PROFILE_UNKNOWN:$name"
			return "$BOOTSTRAP_INVALID"
		}
		IFS=$'\t' read -r record name row_os architectures implies conflicts <<<"$row"
		[[ $row_os == "$os" ]] && case ",$architectures," in *,"$arch",*) true ;; *) false ;; esac || {
			printf 'PROFILE_INCOMPATIBLE\t%s\t%s\n' "$name" "$os"
			return "$BOOTSTRAP_REFUSAL"
		}
		expanded+=("$name")
		[[ $implies == - ]] || queue+=("$implies")
	done
	local selected conflicts conflict
	for selected in "${expanded[@]}"; do
		conflicts=$(awk -F '\t' -v p="$selected" -v current_os="$os" '$1=="profile" && $2==p && $3==current_os {print $6; exit}' "$catalog/profiles.tsv")
		[[ -z $conflicts || $conflicts == - ]] && continue
		IFS=',' read -r -a conflict_list <<<"$conflicts"
		for conflict in "${conflict_list[@]}"; do
			[[ " ${expanded[*]} " == *" $conflict "* ]] && {
				bootstrap_error "PROFILE_CONFLICT:$selected:$conflict"
				return "$BOOTSTRAP_REFUSAL"
			}
		done
	done
	printf '%s\n' "${expanded[@]}" | LC_ALL=C sort -u
}
resolve_actions() {
	local catalog=$1 os=$2
	shift 2
	local profiles=" $* " row profile provider id kind required order desired status
	while IFS=$'\t' read -r _ profile order id kind required provider desired; do
		[[ " $profiles " == *" $profile "* ]] || continue
		# Keep mismatched actions visible so plan/check can report the blocker.
		status=$(provider_status "$os" "$provider")
		printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$order" "$id" "$kind" "$required" "$provider" "$desired" "$status"
	done < <(tail -n +2 "$catalog/actions.tsv") | LC_ALL=C sort -t $'\t' -k1,1 -k2,2
}
