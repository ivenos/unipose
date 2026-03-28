# unipose

**→ [ivenos.github.io/unipose](https://ivenos.github.io/unipose)**

Paste a `compose.yaml` on the left, get a standardized version on the right.

## Why?

A tidy homelab starts with tidy configs. After accumulating dozens of `compose.yaml` files across services, each written slightly differently — some with array-style environment variables, some with maps, keys in random order — reading and comparing them became a chore. unipose enforces a single consistent style so every file looks the same, no matter who wrote it or when.

## What it standardizes

- Service keys are sorted: `image` and `container_name` first, then all others alphabetically
- `environment`, `labels`, and `annotations` are converted from array to map syntax
- `healthcheck.test` is normalized to inline array form: `test: [CMD-SHELL, "..."]`
- Top-level keys follow the Compose spec order (`services` → `networks` → `volumes` → …)