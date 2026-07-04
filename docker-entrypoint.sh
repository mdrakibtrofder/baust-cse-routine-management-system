#!/bin/sh
# Replace the build-time placeholder with the runtime API_BASE_URL so the
# same image can be deployed against any backend without rebuilding.
set -e

: "${API_BASE_URL:?API_BASE_URL env var must be set (e.g. https://api.yourdomain.com/api)}"

find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.html' \) \
  -exec grep -l '__API_BASE_URL_PLACEHOLDER__' {} + 2>/dev/null \
  | while read -r file; do
      sed -i "s|__API_BASE_URL_PLACEHOLDER__|${API_BASE_URL}|g" "$file"
    done

echo "API base URL set to: ${API_BASE_URL}"
