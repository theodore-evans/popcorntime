(function (App) {
    var server;
    var httpServer;
    var PORT = 9999;
    var subtitlePath = {};
    var subtitleUrls = {};
    var encoding = 'utf8';
    var send = require('send');
    var srt2vtt = require('srt-to-vtt');
    var zlib = require('zlib');
    var PassThrough = require('stream').PassThrough;

    // Cache for already-proxied subtitles (langcode → vtt buffer)
    var subtitleCache = {};

    server = http.createServer(function (req, res) {
        var uri = url.parse(req.url);

        // Proxy endpoint: /proxy/<langcode>.vtt
        var proxyMatch = uri.pathname.match(/^\/proxy\/(.+)\.vtt$/);
        if (proxyMatch) {
            var langcode = decodeURIComponent(proxyMatch[1]);
            return handleProxyRequest(langcode, res);
        }

        // Original static file serving
        var ext = path.extname(uri.pathname).substr(1);
        var sub_path = subtitlePath[ext];

        if (ext in subtitlePath) {
            var sub_dir = path.dirname(sub_path);
            var sub_uri = '/' + path.basename(sub_path);

            var headers = function (res, path, stat) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Content-Type', 'text/' + ext + ';charset=' + encoding);
            };

            send(req, sub_uri, {
                    root: sub_dir
                })
                .on('headers', headers)
                .pipe(res);
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    function handleProxyRequest(langcode, res) {
        // Serve from cache if available
        if (subtitleCache[langcode]) {
            res.writeHead(200, {
                'Content-Type': 'text/vtt;charset=utf-8',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(subtitleCache[langcode]);
            return;
        }

        var remoteUrl = subtitleUrls[langcode];
        if (!remoteUrl) {
            res.writeHead(404);
            res.end();
            return;
        }

        // Fetch from OpenSubtitles using Node.js request (no CORS)
        request.get({
            url: remoteUrl,
            encoding: null,
            timeout: 10000
        }, function (error, response, body) {
            if (error || !response || response.statusCode !== 200) {
                win.error('SubtitlesServer proxy error for ' + langcode + ':', error || ('HTTP ' + (response && response.statusCode)));
                res.writeHead(502);
                res.end();
                return;
            }

            var contentType = (response.headers['content-type'] || '').toLowerCase();
            var isGzip = contentType.indexOf('gz') !== -1 || remoteUrl.indexOf('.gz') !== -1;

            var processBuffer = function (buffer) {
                // Convert SRT to VTT
                var input = new PassThrough();
                var chunks = [];
                input.pipe(srt2vtt())
                    .on('data', function (chunk) { chunks.push(chunk); })
                    .on('end', function () {
                        var vttBuffer = Buffer.concat(chunks);
                        subtitleCache[langcode] = vttBuffer;
                        res.writeHead(200, {
                            'Content-Type': 'text/vtt;charset=utf-8',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end(vttBuffer);
                    })
                    .on('error', function (err) {
                        win.error('SubtitlesServer SRT→VTT conversion error:', err);
                        res.writeHead(500);
                        res.end();
                    });
                input.end(buffer);
            };

            if (isGzip) {
                zlib.gunzip(body, function (err, decompressed) {
                    if (err) {
                        win.error('SubtitlesServer gunzip error:', err);
                        res.writeHead(500);
                        res.end();
                        return;
                    }
                    processBuffer(decompressed);
                });
            } else {
                processBuffer(body);
            }
        });
    }

    function startListening(cb) {
        httpServer = server.listen(PORT, '127.0.0.1');
    }

    function stopServer(cb) {
        httpServer.close(function () {
            httpServer = null;
            if (cb) {
                cb();
            }
        });
    }

    var SubtitlesServer = {
        start: function (data, cb) {
            encoding = data.encoding || 'utf8';
            if (data.vtt) {
                subtitlePath['vtt'] = data.vtt;
            }
            if (data.srt) {
                subtitlePath['srt'] = data.srt;
            }
            if (!httpServer) {
                startListening(cb);
            }
        },

        // Register subtitle URLs for proxy serving
        setSubtitleUrls: function (urls) {
            subtitleUrls = urls || {};
            subtitleCache = {};
        },

        // Ensure the server is running (for proxy mode)
        ensureStarted: function () {
            if (!httpServer) {
                startListening();
            }
        },

        stop: function () {
            subtitleUrls = {};
            subtitleCache = {};
            if (httpServer) {
                stopServer();
            }
        }
    };
    App.SubtitlesServer = SubtitlesServer;
})(window.App);
