#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
ROOT=${1:?}
SELECTED=${2:?}
# shellcheck disable=SC1091
source "$ROOT/bootstrap/lib/core.sh"
MANIFEST="$ROOT/bootstrap/contracts/workstation-source-v1.tsv"
if [[ -n ${BOOTSTRAP_SOURCE_MANIFEST:-} ]]; then
	[[ -n ${BOOTSTRAP_TEST_OS:-} && $BOOTSTRAP_SOURCE_MANIFEST == "${HOME%/*}/"* ]] || {
		printf 'schema\tworkstation-source-v1\nstatus\trefused\tSOURCE_MANIFEST_INVALID\n'
		exit "$BOOTSTRAP_REFUSAL"
	}
	MANIFEST=$BOOTSTRAP_SOURCE_MANIFEST
fi
refuse() { printf 'schema\tworkstation-source-v1\nstatus\trefused\t%s\n' "$1"; exit "$BOOTSTRAP_REFUSAL"; }

[[ -f $MANIFEST ]] || refuse SOURCE_MANIFEST_INVALID
awk -F '\t' '
	length($0)>512 || /\r/ { exit 1 }
	NR==1 { if ($0!="schema\tworkstation-source-map-v1") exit 1; next }
	$1=="profile" {
		if (phase || NF!=4 || $2!~/^profile:[a-z0-9][a-z0-9._-]{0,63}$/ || $3!~/^[a-z0-9][a-z0-9._-]{0,63}$/ || $4!~/^[a-z0-9][a-z0-9._\/-]*(,[a-z0-9][a-z0-9._\/-]*)*$/ || profile[$2]++ || bootstrap[$3]++ || (previous_profile!="" && previous_profile>=$2)) exit 1
		previous_profile=$2
		next
	}
	$1=="source" {
		phase=1; key=$2 FS $3 FS $4
		if (NF!=8 || $2!~/^(arch\/omarchy|macos|shared)$/ || $3!~/^(any|darwin|linux)$/ || $4!~/^[a-z0-9][a-z0-9._-]*$/ || $5!~/^[a-z0-9][a-z0-9._-]*$/ || $6!~/^(program|dependency)$/ || $7!~/^(program|dependency):[a-z0-9][a-z0-9._-]*$/ || $8!~/^(none|Hyprland|ghostty|hyprlock|hyprpaper|mako|nvim|polybar|starship|tmux|waybar|zsh)$/ || source[key]++ || (previous_source!="" && previous_source>=key)) exit 1
		previous_source=key
		if (($6 ":") != substr($7,1,length($6)+1)) exit 1
		next
	}
	{ exit 1 }
	END { if (NR<4 || NR>256) exit 1 }
' "$MANIFEST" || refuse SOURCE_MANIFEST_INVALID

cmp -s \
	<(awk -F '\t' '$1=="profile-alias" {print "profile:" $2 "\t" $2}' "$ROOT/bootstrap/catalog/v1/profiles.tsv" | sort) \
	<(awk -F '\t' '$1=="profile" {print $2 "\t" $3}' "$MANIFEST" | sort) || refuse SOURCE_MANIFEST_INCOMPLETE
expected_sources() { awk -F '\t' 'NR>1 {n=split($3,a,","); for(i=1;i<=n;i++) print $1 "\t" $2 "\t" a[i]}' "$ROOT/dotfiles/.workstation/profiles.tsv" | sort; }
mapped_sources() { awk -F '\t' '$1=="source" {print $2 "\t" $3 "\t" $4}' "$MANIFEST" | sort; }
[[ -z $(comm -13 <(expected_sources) <(mapped_sources)) ]] || refuse SOURCE_MANIFEST_INVALID
[[ -z $(comm -23 <(expected_sources) <(mapped_sources)) ]] || refuse SOURCE_MANIFEST_INCOMPLETE
grep -Fq $'profile\t'"$SELECTED"$'\t' "$MANIFEST" || refuse PROFILE_UNKNOWN

case "$(bootstrap_os)" in arch|linux) platform=linux;; darwin|macos) platform=macos;; *) platform=unknown;; esac
case "$(bootstrap_arch)" in x86_64|amd64) architecture=x86_64;; aarch64|arm64) architecture=aarch64;; *) architecture=unknown;; esac

observe_omarchy() {
	local output rc first token version generation
	local -a matches=()
	local semver='(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?'
	if [[ -n ${BOOTSTRAP_TEST_OMARCHY_OBSERVATION+x} ]]; then
		case $BOOTSTRAP_TEST_OMARCHY_OBSERVATION in missing|timeout) printf 'unavailable\t%s\t-' "$BOOTSTRAP_TEST_OMARCHY_OBSERVATION"; return;; oversize) printf 'unavailable\toutput-limit\t-'; return;; esac
		output=$BOOTSTRAP_TEST_OMARCHY_OBSERVATION
	elif ! command -v omarchy >/dev/null 2>&1; then
		printf 'unavailable\tmissing\t-'; return
	else
		set +e; output=$(timeout 2s omarchy version 2>/dev/null); rc=$?; set -e
		[[ $rc -ne 124 ]] || { printf 'unavailable\ttimeout\t-'; return; }
		[[ $rc -eq 0 ]] || { printf 'unavailable\tprobe-failed\t-'; return; }
	fi
	[[ $output != *$'\n'* ]] || { printf 'unavailable\tmalformed-or-ambiguous\t-'; return; }
	first=$output
	[[ $(printf '%s' "$first" | wc -c) -le 512 ]] || { printf 'unavailable\toutput-limit\t-'; return; }
	for token in ${first//[^0-9A-Za-z.+-]/ }; do [[ $token =~ ^$semver$ ]] && matches+=("$token"); done
	((${#matches[@]} == 1)) || { printf 'unavailable\tmalformed-or-ambiguous\t-'; return; }
	version=${matches[0]}
	case $version in 3.*) generation=omarchy-3;; 4.*) generation=omarchy-4;; *) printf 'unavailable\tunsupported-major\t-'; return;; esac
	printf 'observed\t%s\t%s' "$version" "$generation"
}

probe_state() {
	local probe=$1
	[[ $probe != none ]] || { printf unavailable; return; }
	case ",${BOOTSTRAP_TEST_PRESENT_PROBES:-}," in *,"$probe",*) printf present; return;; esac
	command -v "$probe" >/dev/null 2>&1 && printf present || printf missing
}

fingerprint=$(bootstrap_hash <"$MANIFEST") || refuse SOURCE_HASH_UNAVAILABLE
printf 'schema\tworkstation-source-v1\nsource_fingerprint\t%s\nplatform\t%s\t%s\nomarchy\t%s\n' "$fingerprint" "$platform" "$architecture" "$(observe_omarchy)"
while IFS=$'\t' read -r _ logical bootstrap selectors; do
	[[ $logical == "$SELECTED" ]] && selected=selected || selected=available
	printf 'profile\t%s\t%s\t%s\t%s\n' "$logical" "$bootstrap" "$selectors" "$selected"
done < <(awk -F '\t' '$1=="profile"' "$MANIFEST" | sort -t $'\t' -k2,2)
awk -F '\t' '$1=="profile" {n=split($4,a,","); for(i=1;i<=n;i++) owner[a[i]]=$2; next} $1=="source" {print "expectation\t" owner[$2] "\t" $3 "\t" $2 "\t" $4 "\t" $5 "\t" $6 "\t" $7 "\t" $8}' "$MANIFEST" | sort
while IFS=$'\t' read -r kind identity probe; do
	printf '%s\t%s\t%s\tunavailable\tunavailable\tunavailable\tunavailable\n' "$kind" "$identity" "$(probe_state "$probe")"
done < <(awk -F '\t' '$1=="source" {print $6 "\t" $7 "\t" $8}' "$MANIFEST" | sort -u -t $'\t' -k2,2)
printf 'status\tcomplete\n'
