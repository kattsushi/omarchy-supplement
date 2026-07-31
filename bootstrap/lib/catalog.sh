#!/usr/bin/env bash
catalog_fail() {
	bootstrap_error "SCHEMA_INVALID:$1"
	return "$BOOTSTRAP_INVALID"
}
valid_id() { [[ $1 =~ ^[a-z0-9][a-z0-9._@-]*$ ]]; }
valid_path() { [[ $1 =~ ^[a-zA-Z0-9._/-]+$ && $1 != /* && $1 != *..* && $1 != *//* && $1 != . ]]; }
validate_catalog() {
	local file=$1 kind=$2 line record rest fields expected key
	local -A seen=()
	[[ -f $file ]] || {
		catalog_fail "missing-$kind"
		return
	}
	IFS= read -r line <"$file" || {
		catalog_fail "empty-$kind"
		return
	}
	[[ $line == $'schema\tbrf-v1' ]] || {
		catalog_fail "header-$kind"
		return
	}
	while IFS= read -r line || [[ -n $line ]]; do
		[[ -z $line || $line == \#* ]] && continue
		[[ $line != *[';|&`$(){}<>%']* && $line != *$'\r'* ]] || {
			catalog_fail "unsafe-$kind"
			return
		}
		[[ $line != *token* && $line != *password* && $line != *private_key* && $line != *secret* ]] || {
			catalog_fail "secret-$kind"
			return
		}
		IFS=$'\t' read -r -a fields <<<"$line"
		record=${fields[0]}
		case "$kind:$record" in
		profiles:profile-alias)
			expected=3
			valid_id "${fields[1]:-}" && valid_id "${fields[2]:-}" || {
				catalog_fail "profile-alias"
				return
			}
			;;
		profiles:profile)
			expected=6
			valid_id "${fields[1]:-}" && [[ ${fields[2]:-} == arch || ${fields[2]:-} == darwin ]] || {
				catalog_fail "profile"
				return
			}
			;;
		actions:action)
			expected=8
			valid_id "${fields[1]:-}" && [[ ${fields[2]:-} =~ ^0[0-9][0-9]$ ]] && valid_id "${fields[3]:-}" && [[ ${fields[4]:-} =~ ^(package|dotfiles|download|shell|desktop)$ ]] && [[ ${fields[5]:-} =~ ^(yes|no)$ ]] && [[ ${fields[6]:-} =~ ^(internal|arch.pacman|arch.aur|darwin.homebrew.formula|darwin.homebrew.cask|darwin.nix-darwin|none)$ ]] && valid_id "${fields[7]:-}" || {
				catalog_fail "action"
				return
			}
			;;
		pins:pin)
			expected=7
			valid_id "${fields[1]:-}" && valid_id "${fields[2]:-}" && valid_id "${fields[3]//\//-}" || {
				catalog_fail "pin"
				return
			}
			;;
		ownership:ownership)
			expected=5
			valid_id "${fields[1]:-}" && valid_id "${fields[2]:-}" && valid_path "${fields[3]:-}" && valid_path "${fields[4]:-}" || {
				catalog_fail "ownership"
				return
			}
			;;
		legacy:legacy)
			expected=5
			valid_path "${fields[1]:-}" && [[ ${fields[2]:-} =~ ^(redirected-read-only|blocked|retired|supported)$ ]] && [[ ${fields[3]:-} =~ ^[A-Z0-9._-]+$ ]] && valid_id "${fields[4]:-}" || {
				catalog_fail "legacy"
				return
			}
			;;
		*)
			catalog_fail "record-$kind"
			return
			;;
		esac
		[[ ${#fields[@]} -eq $expected ]] || {
			catalog_fail "fields-$kind"
			return
		}
		case "$kind:$record" in
		profiles:profile) key="${fields[1]}:${fields[2]}" ;;
		profiles:profile-alias) key="${fields[1]}" ;;
		actions:action) key="${fields[3]}" ;;
		ownership:ownership) key="${fields[4]}" ;;
		*) key="${fields[1]:-}" ;;
		esac
		if [[ -n ${seen[$key]+x} ]]; then
			[[ ${seen[$key]} == "$line" ]] || {
				catalog_fail "duplicate-$kind"
				return
			}
			continue
		fi
		seen[$key]="$line"
	done < <(tail -n +2 "$file")
}
validate_catalogs() {
	local d=$1
	validate_catalog "$d/profiles.tsv" profiles && validate_catalog "$d/actions.tsv" actions && validate_catalog "$d/pins.tsv" pins && validate_catalog "$d/ownership.tsv" ownership && validate_catalog "$d/legacy.tsv" legacy
}
