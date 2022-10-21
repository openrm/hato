#!make

.PHONY: deps types test coverage lint lint-fix

export NODE_ENV ?= test

node_modules: package.json
	@npm install

deps: node_modules

types:
	@npx tsc

test:
	@npx mocha "test/**/*.js" "**/*.spec.js"

tdd:
	@npx mocha "test/**/*.js" "**/*.spec.js" --watch

coverage:
	@npx nyc -x "test/*" -x "**/*.spec.js" --reporter=lcov --reporter=text-lcov --reporter=text $(MAKE) -s test

lint:
	@npx eslint index.js plugins lib

lint-fix:
	@npx eslint index.js plugins lib --fix
