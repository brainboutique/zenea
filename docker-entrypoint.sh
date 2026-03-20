#!/bin/sh
set -e

# If /data is a mounted volume, its ownership comes from the host.
# Fix permissions at runtime so the app can read/write entity data.
#
# Skip with `SKIP_DATA_CHOWN=1` (useful for large volumes once ownership is correct).
if [ "${SKIP_DATA_CHOWN:-}" != "1" ] && [ -d "/data" ]; then
  # Only try to chown if we have permission (the image runs as root by default).
  if [ "$(id -u)" = "0" ]; then
    # Run recursive chown only when needed:
    # - first startup (no marker yet)
    # - or if /data owner/group changed (host volume re-created, etc.)
    current_owner="$(stat -c '%U:%G' /data 2>/dev/null || true)"
    target_owner="www-data:www-data"
    marker="/data/.zenea_data_chowned"
    if [ ! -f "$marker" ] || [ -z "$current_owner" ] || [ "$current_owner" != "$target_owner" ]; then
      echo "Fixing /data ownership to ${target_owner}..." >&2
      chown -R www-data:www-data /data
      # Marker is best-effort; failures shouldn't block the container.
      echo "$target_owner" > "$marker" 2>/dev/null || true
    fi
  else
    echo "Skipping /data chown: not running as root." >&2
  fi
fi

# Generate APP_KEY at runtime if not set (so the container works out-of-the-box)
if [ -z "${APP_KEY}" ]; then
  # Use Laravel's key format (base64:...) so env('APP_KEY') works as expected
  export APP_KEY="base64:$(openssl rand -base64 32)"
  echo "Generated APP_KEY at startup (set APP_KEY yourself for production)." >&2
fi

exec "$@"
