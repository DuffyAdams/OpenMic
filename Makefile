.PHONY: help dev lan test test-api test-web test-e2e build-web types apk apk-release install-tv deploy

help:            ## Show targets
	@grep -E '^[a-z-]+:.*##' Makefile | sed 's/:.*## /\t/'

dev:             ## API + web dev servers (http://localhost:5173)
	./scripts/dev.sh

lan:             ## Single-process home-network server on :8000 (needs ADMIN_PASSWORD)
	./scripts/lan.sh

test: test-api test-web test-e2e  ## Everything

test-api:        ## Backend unit/integration tests + lint
	cd services/api && uv run ruff check app tests migrations && uv run pytest -q

test-web:        ## Svelte type check
	cd apps/web && npm run check

test-e2e: build-web  ## Browser tests: TV + phones against the real backend
	cd apps/web && npx playwright test

build-web:       ## Production build of the web app
	cd apps/web && npm run build

types:           ## Regenerate OpenAPI spec + TypeScript types after changing API schemas
	cd apps/web && npm run gen:api

apk:             ## Debug APK
	cd apps/fire-tv && ./gradlew assembleDebug

apk-release:     ## Release APK (optionally SERVER=https://...)
	cd apps/fire-tv && ./gradlew assembleRelease $(if $(SERVER),-PkaraokeServerUrl=$(SERVER))

install-tv:      ## make install-tv TV=192.168.1.50 SERVER=https://karaoke.example.com
	./scripts/install-firetv.sh $(TV) $(SERVER)

deploy:          ## Build and (re)start the Docker stack
	cd infrastructure && docker compose up -d --build
