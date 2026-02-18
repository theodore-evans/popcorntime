(function (App) {
    'use strict';

    var readdirp = require('readdirp');
    var collection = App.Device.Collection;

    var players = {
        'VLC': {
            type: 'vlc',
            cmd: '/Contents/MacOS/VLC',
            switches: '--no-video-title-show',
            subswitch: '--sub-file=',
            fs: '-f',
            stop: 'vlc://quit',
            pause: 'vlc://pause',
            filenameswitch: '--meta-title='
        },
        'Fleex player': {
            type: 'fleex-player',
            cmd: '/Contents/MacOS/Fleex player',
            filenameswitch: '-file-name '
        },
        'MPlayer': {
            type: 'mplayer',
            cmd: 'mplayer',
            switches: '--really-quiet',
            subswitch: '-sub ',
            fs: '-fs',
        },
        'MPlayerX': {
            type: 'mplayer',
            cmd: '/Contents/MacOS/MPlayerX',
            switches: '-font "/Library/Fonts/Arial Bold.ttf"',
            urlswitch: '-url ',
            subswitch: '-sub ',
            fs: '-fs',
        },
        'MPlayer OSX Extended': {
            type: 'mplayer',
            cmd: '/Contents/Resources/Binaries/mpextended.mpBinaries/Contents/MacOS/mplayer',
            switches: '-font "/Library/Fonts/Arial Bold.ttf"',
            subswitch: '-sub ',
            fs: '-fs',
        },
        'IINA': {
            type: 'iina',
            cmd: '/Contents/MacOS/iina-cli',
            subswitch: '--mpv-sub-file=',
            fs: '--mpv-fs',
        },
        'Bomi': {
            type: 'bomi',
            switches: '',
            subswitch: '--set-subtitle ',
            fs: '--action window/enter-fs'
        },
        'mpv': {
            type: 'mpv',
            switches: '--no-terminal',
            subswitch: '--sub-file=',
            fs: '--fs',
            filenameswitch: '--force-media-title='
        },
        'mpvnet': {
            type: 'mpvnet',
            switches: '--no-terminal',
            subswitch: '--sub-files=',
            fs: '-fs',
            filenameswitch: '--force-media-title='
        },
        'MPC-HC': {
            type: 'mpc-hc',
            switches: '',
            subswitch: '/sub ',
            fs: '/fullscreen'
        },
        'MPC-HC64': {
            type: 'mpc-hc',
            switches: '',
            subswitch: '/sub ',
            fs: '/fullscreen'
        },
        'MPC-BE': {
            type: 'mpc-be',
            switches: '',
            subswitch: '/sub ',
            fs: '/fullscreen'
        },
        'MPC-BE64': {
            type: 'mpc-be',
            switches: '',
            subswitch: '/sub ',
            fs: '/fullscreen'
        },
        'SMPlayer': {
            type: 'smplayer',
            switches: '',
            subswitch: '-sub ',
            fs: '-fs',
            stop: 'smplayer -send-action quit',
            pause: 'smplayer -send-action pause'
        },
        'BSPlayer': {
            type: 'bsplayer',
            switches: '',
            subswitch: '',
            fs: '-fs'
        },
        'PotPlayerMini64': {
            type: 'potplayer',
            switches: '',
            subswitch: '/sub='
        }
    };

    /* map name back into the object as we use it in match */
    _.each(players, function (v, k) {
        players[k].name = k;
    });

    extPlayerlst = Object.getOwnPropertyNames(players).join(', ')
        .replace(/MPC-HC64, |MPC-BE64, |Mini64/gi, '')
        .replace('Extended', 'Ext.')
        .replace('mpvnet', 'mpv.net')
        .replace(/,([^,]*)$/, ' &$1')
    ;

    function getPlayerName(loc) {
        return path.basename(loc).replace(path.extname(loc), '');
    }

    function getPlayerSubSwitch(loc) {
        var name = getPlayerName(loc);
        return players[name].subswitch || '';
    }

    function getPlayerFilenameSwitch(loc) {
        var name = getPlayerName(loc);
        return players[name].filenameswitch || '';
    }

    function getPlayerUrlSwitch(loc) {
        var name = getPlayerName(loc);
        return players[name].urlswitch || '';
    }

    function getPlayerCmd(loc) {
        var name = getPlayerName(loc);
        return players[name].cmd;
    }

    function getPlayerSwitches(loc) {
        var name = getPlayerName(loc);
        return players[name].switches || '';
    }

    function getPlayerFS(loc) {
        var name = getPlayerName(loc);
        return players[name].fs || '';
    }

    class ExtPlayer extends App.Device.Loaders.Device {
        constructor(attrs) {
            super(Object.assign({
                type: 'ext-app',
                name: i18n.__('External Player'),
            }, attrs));
        }

        play(streamModel) {
            var args = [];
            var exe;
            var url = streamModel.attributes.src;
            var isFlatpak = this.get('path').includes('/flatpak/app/org.videolan.VLC/');

            // Determine executable and initial args
            if (isFlatpak) {
                exe = '/usr/bin/flatpak';
                args.push('run', 'org.videolan.VLC');
            } else {
                exe = path.normalize(this.get('path'));
            }

            // Build args array from player switches
            var switches = getPlayerSwitches(this.get('id')).trim();
            if (switches) {
                args = args.concat(switches.split(/\s+/));
            }

            var subtitle = streamModel.attributes.subFile || '';
            if (subtitle !== '') {
                if (this.get('id') === 'MPlayer OSX Extended') {
                    var dataBuff = fs.readFileSync(subtitle);
                    var detectedEncoding = charsetDetect.detect(dataBuff).encoding;
                    if (detectedEncoding.toLowerCase() === 'utf-8') {
                        args.push('-utf8');
                    }
                }
                var subSwitch = getPlayerSubSwitch(this.get('id')).trim();
                if (subSwitch) {
                    // --sub-file=/path (= glued) vs -sub /path (space separated)
                    if (subSwitch.endsWith('=')) {
                        args.push(subSwitch + subtitle);
                    } else {
                        args.push(subSwitch);
                        args.push(subtitle);
                    }
                } else {
                    args.push(subtitle);
                }
            }

            if (getPlayerFS(this.get('id')) !== '' && Settings.alwaysFullscreen) {
                var fsSwitch = getPlayerFS(this.get('id')).trim();
                if (fsSwitch) {
                    args.push(fsSwitch);
                }
            }

            if (getPlayerFilenameSwitch(this.get('id')) !== '') {
                var videoFile = streamModel.attributes.torrentModel.get('video_file');
                if (videoFile) {
                    var fnSwitch = getPlayerFilenameSwitch(this.get('id')).trim();
                    if (fnSwitch) {
                        // --meta-title=Name (= glued) vs -file-name Name (space separated)
                        if (fnSwitch.endsWith('=')) {
                            args.push(fnSwitch + videoFile.name);
                        } else {
                            args.push(fnSwitch);
                            args.push(videoFile.name);
                        }
                    }
                }
            }

            var urlSwitch = getPlayerUrlSwitch(this.get('id')).trim();
            if (urlSwitch) {
                // -url http://... (space separated)
                args.push(urlSwitch);
            }

            args.push(url);

            win.info('Launching External Player:', exe, args);
            child.execFile(exe, args, function (error, stdout, stderr) {
                if (streamModel.attributes.device.id === 'Bomi') {
                    // don't stop on exit, because Bomi could be already running in background and the command ends while the stream should continue
                    return;
                }
                App.vent.trigger('player:close');
                App.vent.trigger('stream:stop');
                App.vent.trigger('preload:stop');
            });
        }

        pause() {}

        stop() {}

        unpause() {}

        static scan() {
            let searchPaths = []

            let addPath = function (path) {
                if (fs.existsSync(path)) {
                    searchPaths.push(path);
                }
            };

            switch (process.platform) {
                case 'linux':
                    process.env.PATH.split(path.delimiter).forEach(addPath);
                    addPath('/snap/bin');
                    addPath('/var/lib/flatpak/app/org.videolan.VLC/current/active'); //Fedora Flatpak VLC Dir
                    addPath(process.env.HOME + '/.nix-profile/bin'); // NixOS
                    addPath('/run/current-system/sw/bin'); // NixOS
                    break;
                case 'darwin':
                    process.env.PATH.split(path.delimiter).forEach(addPath); //for brew
                    addPath('/Applications');
                    addPath(process.env.HOME + '/Applications');
                    break;
                case 'win32':
                    addPath(process.env.SystemDrive + '\\Program Files\\');
                    addPath(process.env.SystemDrive + '\\Program Files (x86)\\');
                    addPath(process.env.LOCALAPPDATA + '\\Apps\\2.0\\');
                    break;
            }

            var birthtimes = {};

            async.each(searchPaths, function (folderName, pathcb) {
                folderName = path.resolve(folderName);
                win.info('Scanning: ' + folderName);
                var fileStream = readdirp({
                    root: folderName,
                    depth: 3
                });
                fileStream.on('data', function (d) {
                    var app = d.name.replace('.app', '').replace('.exe', '').toLowerCase();
                    var match = _.filter(players, function (v, k) {
                        return k.toLowerCase() === app;
                    });

                    if (match.length) {
                        match = match[0];
                        var birthtime = d.stat.birthtime;
                        var previousBirthTime = birthtimes[match.name];
                        if (!previousBirthTime || birthtime > previousBirthTime) {
                            if (!previousBirthTime) {
                                collection.add(new ExtPlayer({
                                    id: match.name,
                                    type: 'external-' + match.type,
                                    name: match.name,
                                    path: d.fullPath
                                }));
                                win.info('Found External Player: ' + match.name + ' in ' + d.fullParentDir);
                            } else {
                                collection.findWhere({
                                    id: match.name
                                }).set('path', d.fullPath);
                                win.info('Updated External Player: ' + app + ' with more recent version found in ' + d.fullParentDir);
                            }
                            birthtimes[match.name] = birthtime;
                        }
                    }
                });
                fileStream.on('end', function () {
                    pathcb();
                });
            }, function (err) {
                if (err) {
                    win.error('External Player Scan:', err);
                } else {
                    win.info('External Player Scan: Completed');
                }
            });
        }
    }

    App.Device.Loaders.ExtPlayer = ExtPlayer;
})(window.App);
