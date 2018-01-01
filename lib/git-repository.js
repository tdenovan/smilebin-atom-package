'use babel';

import { Directory } from 'atom';

/**
 * Given a pathString for a file in an active TextEditor
 *
 * @param  {String} pathString
 * @return {Promise<GitRepository>}
 */
export const repositoryForEditorPath = async function (pathString) {
  const directory = new Directory(pathString);

  return atom.project.repositoryForDirectory(directory)
    .then((projectRepo) => {
      if (!projectRepo) {
        throw new Error(`Unable to find GitRepository for path ${pathString}.`);
      }

      return projectRepo;
    });
}

export const getHostnameFromGitUrl = function (url) {
  const regex = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*@)?(.*?)(\.git)(\/?|\#[-\d\w._]+?)$/
  return url.match(regex)[3]
}
