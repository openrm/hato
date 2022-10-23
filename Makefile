#!make

.PHONY: deps types test coverage lint lint-fix

export NODE_ENV ?= test

node_modules: package.json
	@npm install

deps: node_modules

types:
	@npx tsc

test:
	@npx mocha

tdd:
	@npx mocha --watch

coverage:
	@npx nyc mocha

lint:
	@npx eslint index.js plugins lib

lint-fix:
	@npx eslint index.js plugins lib --fix
