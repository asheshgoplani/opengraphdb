'use strict';

const path = require('node:path');

const platform = process.platform;
const arch = process.arch;

let native;
try {
  native = require(path.join(__dirname, 'index.node'));
} catch (error) {
  throw new Error(`Failed to load native module for ${platform}/${arch}: ${error.message}`);
}

module.exports = native;
