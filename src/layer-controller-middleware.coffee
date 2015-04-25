# Собрать слои на сервере

fs = require('fs')
url = require('url')
cookie = require('cookie')
cheerio = require('cheerio')
Promise = require('bluebird')
Promise.promisifyAll(fs)

# TODO подробное описание что здесь происходит
getHeaders = (req, res) ->
  res.emit('header')
  headers = JSON.parse(JSON.stringify(req.headers))
  if res._headers and res._headers['set-cookie']
    newCookies = cookie.parse(res._headers['set-cookie'])
    delete newCookies.Path
    delete newCookies.Expires
    if headers and headers.cookie
      oldCookies = cookie.parse(headers.cookie)
      for own key, value of oldCookies
        if not newCookies[key]?
          newCookies[key] = value
    _newCookies = ''
    for own key, value of newCookies
      _newCookies = _newCookies + cookie.serialize(key, value) + '; '
    newCookies = _newCookies.slice(0, -2)
    headers.cookie = newCookies
  delete(headers['accept-encoding']) # TODO gzip
  headers

class Layers
  # Вернуть html код
  # @param {String} state Состояние для контроллера
  # @param {Promise} [statusCode, html]
  getHtml: (state, req, res) ->
    MainLayer = require(@options.mainLayer)
    mainLayer = new MainLayer()
    return Promise.resolve([]) if state.search(mainLayer.regState) is -1 # нету совпадение state у первого слоя
    mainLayer.request.headers = getHeaders(req, res)
    return Promise.resolve([]) if mainLayer.request.headers['x-layer-controller-proxy'] # защита от рекурсии

    fs.readFileAsync(@options.index).then (index) ->
      $ = cheerio.load index,
        ignoreWhitespace: false
        xmlMode: false
        lowerCaseTags: true

      mainLayer.parentNode = $('html')
      protocol = (if (socket = req.connection).encrypted then 'https' else 'http')
      mainLayer.request.origin = "#{protocol}://#{mainLayer.request.headers.host}" # тоже и на клиенте

      mainLayer.state(state).then (mainLayer) ->
        serverCache = JSON.stringify(mainLayer.request.cache).replace(/\//gim, '\\/')
        visibleLayers = JSON.stringify(mainLayer.layers.map (_layer) -> _layer.isShown)
        # window.mainLayer # REVIEW
        raw = """
          var visibleLayers = #{visibleLayers};
          mainLayer.layers.forEach(function(layer, i) {
            if (visibleLayers[i]) {
              layer.elementList = layer.findElements();
            }
          });
          mainLayer.request.cache = #{serverCache};
          mainLayer.state('#{state}');
        """
        script = "<script data-server-layer-controller type='text/javascript'>#{raw}</script>"
        $('body').append(script)
        $('head title').html(mainLayer.meta.title) if mainLayer.meta.title? # также в клиентском обработчике
        $('head meta[name=keywords]').attr('content', mainLayer.meta.keywords) if mainLayer.meta.keywords?
        $('meta[name=description]').attr('content', mainLayer.meta.description) if mainLayer.meta.description?
        [mainLayer.meta.statusCode or 200, $.html()]

  constructor: (@options) ->

module.exports = (options) ->
  layers = new Layers(options)

  (req, res, next) ->
    state = decodeURI(req.originalUrl) # определить state из адреса
    return next() if url.parse(state).search # если есть ? значит это не сюда

    layers.getHtml(state, req, res).then ([statusCode, html]) -> # создать html документ
      return next() if not html # слои не собрались
      res.writeHead(statusCode, 'Content-Type': 'text/html')
      res.end(html)

    .then null, next

