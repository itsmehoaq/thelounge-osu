"use strict";

const noop = function () {
	return function () {};
};
noop.default = noop;
module.exports = noop;
