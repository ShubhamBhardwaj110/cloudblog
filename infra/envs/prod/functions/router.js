// CloudFront viewer-request function (cloudfront-js-2.0).
//   /posts/my-post   -> /posts/my-post/index.html  (prerendered page written by the publisher)
//   /admin, /about   -> /index.html                (client-side routes in the React app)
//   /assets/x.js     -> unchanged                  (anything with a file extension)
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri.indexOf('/media/') === 0) return request;

  var last = uri.substring(uri.lastIndexOf('/') + 1);
  if (last.indexOf('.') !== -1) return request; // a real file

  var postMatch = uri.match(/^\/posts\/([a-z0-9-]+)\/?$/);
  if (postMatch) {
    request.uri = '/posts/' + postMatch[1] + '/index.html';
    return request;
  }

  request.uri = '/index.html';
  return request;
}
