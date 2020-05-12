#!make

.PHONY: test cover lint lint-fix

serviceName := $(shell basename `pwd`)

test:
	NODE_ENV=test ./node_modules/.bin/mocha "test/**/*.js" "**/*.spec.js" --exit

cover:
	NODE_ENV=test ./node_modules/.bin/nyc -x "test/*" -x "**/*.spec.js" --reporter=lcov --reporter=text-lcov ./node_modules/.bin/mocha --timeout 5000 "test/**/*.js" "src/**/*.js" --exit

lint:
	./node_modules/.bin/eslint index.js plugins lib

lint-fix:
	./node_modules/.bin/eslint index.js plugins lib --fix

