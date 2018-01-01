'use babel';

const { isArray, isFunction } = require('lodash')
const childProcess = require('child_process')
const _ = require('lodash')

// import { parseBlame } from './blameFormatter';

/**
 * @module GitCommander
 *
 * Utility for executing git commands on a repo in a given working directory.
 *
 * Courtesy of https://github.com/alexcorre/git-blame by Alex Corre
 */
module.exports =
class GitCommander {

  constructor(path) {
    this.workingDirectory = path;
  }

  /**
   * Spawns a process to execute a git command in the GitCommander instances
   * working directory.
   *
   * @param {array|string} args - arguments to call `git` with on the command line
   * @return {Promise} returns a promise that resolves into the output of the command
   */
  exec(args, proc = 'git') {
    if (!isArray(args)) {
      return;
    }

    const child = childProcess.spawn(proc, args, {cwd: this.workingDirectory});
    let stdout = '';
    let stderr = '';
    let processError;

    child.stdout.on('data', function (data) {
      stdout += data;
    });

    child.stderr.on('data', function (data) {
      stderr += data;
    });

    child.on('error', function (error) {
      processError = error;
    });

    return new Promise(async (resolve, reject) => {

      child.on('close', function (errorCode) {
        if (processError) {
          return reject(processError);
        }

        if (errorCode) {
          const error = new Error(stderr);
          error.code = errorCode;
          return reject(error);
        }

        return resolve(stdout.trimRight())
      })
    })
  }

  /**
   * Executes git blame on the input file in the instances working directory
   *
   * @param {string} fileName - name of file to blame, relative to the repos
   *   working directory
   * @param {function} callback - callback funtion to call with results or error
   */
  blame(fileName, callback) {
    const args = ['blame', '--line-porcelain'];

    // ignore white space based on config
    if (atom.config.get('git-blame.ignoreWhiteSpaceDiffs')) {
      args.push('-w');
    }

    args.push(fileName);

    // Execute blame command and parse
    this.exec(args, function (err, blameStdOut) {
      if (err) {
        return callback(err, blameStdOut);
      }

      return callback(null, parseBlame(blameStdOut));
    });
  }

  /**
   * Executs git blame on the input file and returns an array
   * of the commits belonging to the file
   * @method getCommits
   * @param  {string}   filename name of file to get commits from
   * @return {Promise}           returns a promise that roles to an array of commits (strings)
   */
  async getCommits(fileName) {
    const args = [ 'log', '--pretty=%H', '--']
    args.push(fileName)

    try {
      const output = await this.exec(args)
      const commits = output.split("\n")
      return commits
    } catch (err) {
      console.error('Error fetching commits for file')
      console.error(err)
      return []
    }
  }

  /**
   * Executes git diff for a given file and given commit
   * @method diff
   */
  async diff(fileName, commit) {
    const args = [ 'diff', commit, fileName]
    return this.exec(args)
  }

  /**
   * Given a list of commits and a given file, this method
   * returns the checksum for the file for each of the given commits
   *
   * The file checksum is needed in conjunction with the commit hash for querying
   * for comments, as one commit hash can obviously apply to more than one file
   * @method getFileChecksumsFromCommits
   */
  async getFileChecksumsFromCommits(fileName, commits) {
    return Promise.all(_.map(commits, async commit => {
      const args = [ 'show', `${commit}:${fileName}`]
      return new Promise((resolve, reject) => {
        childProcess.exec(`git show ${commit}:${fileName} | shasum`, { cwd: this.workingDirectory },
          (error, stdout, stderror) => {
            if (error) return reject(error)
            if (stderror) return reject(stderror)
            resolve(stdout.trim())
          })
      })
    }))
  }

}
