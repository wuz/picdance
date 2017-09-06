all: js

js:
	browserify src/main.js -o dist/bundle.js -t [ babelify --presets [ env ] ] -t uglifyify
