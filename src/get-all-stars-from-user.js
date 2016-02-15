import Promise from 'bluebird';
import parse from 'parse-link-header';
import parseRepos from './parsing/parse-repos';
import _ from 'lodash';
import winston from 'winston';
import fs from 'fs';
import path from 'path';
const request = Promise.promisifyAll(require('superagent'));

winston.add(winston.transports.File, { filename: 'download_getallstars.log' });
/**
 *
 * @param {Github} ghcp - authenticated github client with promisified async methods
 * @param {String} user - user name
 * @param {Number} maxPagination - max paginated requests
 * @param {Number} perPage - number per page
 */
export default async (ghcp, user, maxPagination, perPage, writeOutputToDisk) => {
  let per_page = perPage || 100;
  let maxPages = maxPagination || 10;
   if (!process.env.GHUSER || !process.env.GHPW ) {
     throw "GHUSER or GHPW not defined"
   }
  let starData = await request
    .get(`https://${process.env.GHUSER}:${process.env.GHPW}@api.github.com/users/${user}/starred?per_page=${per_page}`)
    .accept("application/vnd.github.v3.star+json");
  let starredRepos = [];
  starredRepos.push(parseRepos(starData.body));
  let maxLinks = per_page;
  let linksPulled = 1;
  if (starData.headers.hasOwnProperty('link')) {
    let links = parse(starData.headers.link);
    maxLinks = per_page*links.last.page;
    linksPulled = Math.min(maxPages, parseInt(links.last.page));

    let starsPromises = _.map(_.range(2, linksPulled+1), function(pageNum, index) {
      winston.log('info', 'fetching star data : ' + pageNum + 'for user ' + user);
        return ghcp.activity.getStarredReposForUserAsync({
          headers: {"Accept": "application/vnd.github.v3.star+json"},
          user: user,
          page: pageNum,
          per_page: per_page
      });
    });
    let remainingStarred = await Promise.all(starsPromises);
    starredRepos.push(_.flatten(_.map(remainingStarred, parseRepos)));
  }
  let output = {user,
    download_info: {
      dl_time: new Date(),
      per_page,
      linksPulled: linksPulled*per_page,
      maxLinks},
    starredRepos: _.flatten(starredRepos) };
  if (writeOutputToDisk) {
    // TODO: actually write somewhere generic
    let udir = "../prior_responses/users";
    let userDir = path.join(__dirname, udir);
    // TODO: change to populate database instead of file on filesystem
    fs.writeFile(path.join(userDir, user), JSON.stringify(output), function(err, res) {
      if (err) {
        winston.log('info', 'error writing file for user', user)
      } else {
        winston.log('info', 'wrote file for user',  user)
      }
    });
  }

  return output;
};
