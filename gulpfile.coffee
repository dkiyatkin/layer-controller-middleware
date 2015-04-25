#!/usr/bin/env coffee

gulp = require('gulp')
gutil = require('gulp-util')
coffee = require('gulp-coffee')
mocha = require('gulp-mocha')

gulp.task 'test', ->
  gulp.src('test/*.coffee', {read: false})
  .pipe(mocha())

gulp.task 'make', ['test'], ->
  gulp.src('src/*.coffee')
  .pipe(coffee({bare: true}).on('error', gutil.log))
  .pipe(gulp.dest('dist'))
