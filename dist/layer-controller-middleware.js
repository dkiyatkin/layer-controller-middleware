var Layers, Promise, cheerio, cookie, fs, getHeaders, url,
  hasProp = {}.hasOwnProperty;

fs = require('fs');

url = require('url');

cookie = require('cookie');

cheerio = require('cheerio');

Promise = require('bluebird');

Promise.promisifyAll(fs);

getHeaders = function(req, res) {
  var _newCookies, headers, key, newCookies, oldCookies, value;
  res.emit('header');
  headers = JSON.parse(JSON.stringify(req.headers));
  if (res._headers && res._headers['set-cookie']) {
    newCookies = cookie.parse(res._headers['set-cookie']);
    delete newCookies.Path;
    delete newCookies.Expires;
    if (headers && headers.cookie) {
      oldCookies = cookie.parse(headers.cookie);
      for (key in oldCookies) {
        if (!hasProp.call(oldCookies, key)) continue;
        value = oldCookies[key];
        if (newCookies[key] == null) {
          newCookies[key] = value;
        }
      }
    }
    _newCookies = '';
    for (key in newCookies) {
      if (!hasProp.call(newCookies, key)) continue;
      value = newCookies[key];
      _newCookies = _newCookies + cookie.serialize(key, value) + '; ';
    }
    newCookies = _newCookies.slice(0, -2);
    headers.cookie = newCookies;
  }
  delete headers['accept-encoding'];
  return headers;
};

Layers = (function() {
  Layers.prototype.getHtml = function(state, req, res) {
    var MainLayer, mainLayer;
    MainLayer = require(this.options.mainLayer);
    mainLayer = new MainLayer();
    if (state.search(mainLayer.regState) === -1) {
      return Promise.resolve([]);
    }
    mainLayer.request.headers = getHeaders(req, res);
    if (mainLayer.request.headers['x-layer-controller-proxy']) {
      return Promise.resolve([]);
    }
    return fs.readFileAsync(this.options.index).then(function(index) {
      var $, protocol, socket;
      $ = cheerio.load(index, {
        ignoreWhitespace: false,
        xmlMode: false,
        lowerCaseTags: true
      });
      mainLayer.parentNode = $('html');
      protocol = ((socket = req.connection).encrypted ? 'https' : 'http');
      mainLayer.request.origin = protocol + "://" + mainLayer.request.headers.host;
      return mainLayer.state(state).then(function(mainLayer) {
        var raw, script, serverCache, visibleLayers;
        serverCache = JSON.stringify(mainLayer.request.cache).replace(/\//gim, '\\/');
        visibleLayers = JSON.stringify(mainLayer.layers.map(function(_layer) {
          return _layer.isShown;
        }));
        raw = "var visibleLayers = " + visibleLayers + ";\nmainLayer.layers.forEach(function(layer, i) {\n  if (visibleLayers[i]) {\n    layer.elementList = layer.findElements();\n  }\n});\nmainLayer.request.cache = " + serverCache + ";\nmainLayer.state('" + state + "');";
        script = "<script data-server-layer-controller type='text/javascript'>" + raw + "</script>";
        $('body').append(script);
        if (mainLayer.meta.title != null) {
          $('head title').html(mainLayer.meta.title);
        }
        if (mainLayer.meta.keywords != null) {
          $('head meta[name=keywords]').attr('content', mainLayer.meta.keywords);
        }
        if (mainLayer.meta.description != null) {
          $('meta[name=description]').attr('content', mainLayer.meta.description);
        }
        return [mainLayer.meta.statusCode || 200, $.html()];
      });
    });
  };

  function Layers(options1) {
    this.options = options1;
  }

  return Layers;

})();

module.exports = function(options) {
  var layers;
  layers = new Layers(options);
  return function(req, res, next) {
    var state;
    state = decodeURI(req.originalUrl);
    if (url.parse(state).search) {
      return next();
    }
    return layers.getHtml(state, req, res).then(function(arg) {
      var html, statusCode;
      statusCode = arg[0], html = arg[1];
      if (!html) {
        return next();
      }
      res.writeHead(statusCode, {
        'Content-Type': 'text/html'
      });
      return res.end(html);
    }).then(null, next);
  };
};
